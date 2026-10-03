"""Tests for full-paper acquisition, compaction, and cache provenance."""

import hashlib
import io
import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import httpx
import pytest
from pypdf import PdfWriter
from pypdf.generic import (
    ArrayObject,
    DecodedStreamObject,
    DictionaryObject,
    NameObject,
    TextStringObject,
)

from src.features.config.schemas.base import LinkType
from src.features.fulltext.models import FullTextDocument, FullTextStatus
from src.features.fulltext.service import (
    FullTextRateLimitedError,
    FullTextService,
    _build_document,
    _retry_after_seconds,
)
from src.features.store.models import DateConfidence, Item
from src.linker.models import Story, StoryLink


def _story() -> Story:
    item = Item(
        url="https://arxiv.org/abs/2401.00001",
        source_id="arxiv",
        tier=0,
        kind="paper",
        title="Paper",
        content_hash="hash",
        raw_json=json.dumps({"abstract_snippet": "A useful abstract."}),
        date_confidence=DateConfidence.HIGH,
    )
    link = StoryLink(
        url=item.url,
        link_type=LinkType.ARXIV,
        source_id=item.source_id,
        tier=0,
        title=item.title,
    )
    return Story(
        story_id="arxiv:2401.00001",
        title="Paper",
        primary_link=link,
        links=[link],
        raw_items=[item],
        arxiv_id="2401.00001",
    )


@patch("src.features.fulltext.service.httpx.get")
def test_arxiv_html_is_cached(mock_get: MagicMock, tmp_path: Path) -> None:
    mock_get.return_value = MagicMock(
        content=b"x" * 1000,
        text="<article><h1>Method</h1><p>" + ("evidence " * 200) + "</p></article>",
    )
    mock_get.return_value.raise_for_status.return_value = None
    service = FullTextService(tmp_path)
    first = service.load_for_story(_story())
    second = service.load_for_story(_story())
    assert first.status == FullTextStatus.COMPLETE
    assert first.sha256 == second.sha256
    assert mock_get.call_count == 1


@patch("src.features.fulltext.service.httpx.get")
@patch("src.features.fulltext.service.httpx.stream")
def test_failed_sources_degrade_to_abstract(
    mock_stream: MagicMock, mock_get: MagicMock, tmp_path: Path
) -> None:
    mock_get.side_effect = ValueError("no html")
    mock_stream.side_effect = ValueError("no pdf")
    document = FullTextService(tmp_path).load_for_story(_story())
    assert document.status == FullTextStatus.ABSTRACT_ONLY
    assert document.confidence_multiplier == 0.85
    assert "useful abstract" in document.text


@patch("src.features.fulltext.service.time.sleep")
def test_load_for_stories_throttles_between_fetches(
    mock_sleep: MagicMock, tmp_path: Path
) -> None:
    service = FullTextService(tmp_path)
    document = FullTextDocument(
        story_id="arxiv:2401.00001",
        text="abstract",
        status=FullTextStatus.ABSTRACT_ONLY,
        source_url=None,
        source_format="abstract",
        sha256="hash",
    )
    with patch.object(service, "load_for_story", return_value=document):
        service.load_for_stories([_story(), _story()])
    assert mock_sleep.call_count == 1


def test_oversized_document_is_compacted() -> None:
    document = _build_document(
        "story",
        "method " * 400_000,
        source_url="https://arxiv.org/html/1",
        source_format="html",
        page_count=0,
    )
    assert document.status == FullTextStatus.COMPACTED
    assert len(document.text) < 1_800_000


def test_rate_limit_honors_server_wait_and_does_not_degrade(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    clock = [1000.0]
    waits = []

    def sleep(seconds: float) -> None:
        waits.append(seconds)
        clock[0] += seconds

    monkeypatch.setattr("src.features.fulltext.service.time.time", lambda: clock[0])
    monkeypatch.setattr("src.features.fulltext.service.time.sleep", sleep)
    request = httpx.Request("GET", "https://arxiv.org/html/2401.00001")
    error = httpx.HTTPStatusError(
        "Rate limited",
        request=request,
        response=httpx.Response(429, headers={"Retry-After": "240"}, request=request),
    )
    service = FullTextService(tmp_path)
    with patch.object(
        service, "_extract_html", side_effect=[error, ("evidence " * 200, 0)]
    ) as extract:
        document = service.load_for_story(_story())
    assert document.status == FullTextStatus.COMPLETE
    assert extract.call_count == 2
    assert sum(waits) >= 240
    assert max(waits) <= 30


def test_exhausted_rate_limit_saves_resume_deadline_without_abstract_cache(
    tmp_path: Path,
) -> None:
    request = httpx.Request("GET", "https://arxiv.org/html/2401.00001")
    error = httpx.HTTPStatusError(
        "Rate limited", request=request, response=httpx.Response(429, request=request)
    )
    service = FullTextService(tmp_path)
    with (
        patch.object(service, "_wait_for_saved_cooldown"),
        patch.object(service, "_extract_html", side_effect=error),
        pytest.raises(FullTextRateLimitedError),
    ):
        service.load_for_story(_story())
    assert (tmp_path / "_rate_limit.json").exists()
    assert not list(tmp_path.glob("*.txt"))
    assert not service._is_cached(_story())


@pytest.mark.parametrize("value", [None, "invalid", "nan", "inf"])
def test_invalid_retry_after_uses_safe_default(value: str | None) -> None:
    assert _retry_after_seconds(value) == 120.0


@pytest.mark.parametrize(
    ("raw", "expected", "pairs", "lost"),
    [
        (
            "Normal 臺灣 \U0001d447 \ufffd text",
            "Normal 臺灣 \U0001d447 \ufffd text",
            0,
            0,
        ),
        ("a\ud835\udc47z", "a\U0001d447z", 1, 0),
        ("a\ud835z", "a\ufffdz", 0, 1),
        ("a\udc47z", "a\ufffdz", 0, 1),
        (
            "A\ud835B\ud835\udc47\ud835C\ud835\ud835D\ud835",
            "A\ufffdB\U0001d447\ufffdC\ufffd\ufffdD\ufffd",
            1,
            5,
        ),
    ],
)
def test_unicode_extraction_repair_is_loss_aware(
    raw: str, expected: str, pairs: int, lost: int, tmp_path: Path
) -> None:
    service = FullTextService(tmp_path)
    with patch.object(service, "_extract_with_cooldown", return_value=(raw, 2)):
        document = service.load_for_story(_story())
    assert document.sha256 == hashlib.sha256(document.text.encode("utf-8")).hexdigest()
    if lost:
        assert document.status == FullTextStatus.PARTIAL
        assert document.confidence_multiplier == 0.92
        assert document.text.startswith(expected + "\n\n[Extraction note:")
        assert f"{lost} unpaired Unicode surrogate code unit(s)" in document.text
    else:
        assert document.status == FullTextStatus.COMPLETE
        assert document.text == expected
    audits = list(tmp_path.glob("*.unicode.json"))
    if pairs or lost:
        assert len(audits) == 1
        audit_bytes = audits[0].read_bytes()
        assert audit_bytes.isascii()
        audit = json.loads(audit_bytes)
        preserved = bytes.fromhex(audit["original_text_utf8_surrogatepass_hex"])
        assert preserved.decode("utf-8", errors="surrogatepass") == raw
        assert audit["original_text_characters"] == len(raw)
        assert (
            audit["original_text_sha256_surrogatepass"]
            == hashlib.sha256(raw.encode("utf-8", errors="surrogatepass")).hexdigest()
        )
        assert audit["valid_pairs_combined"] == pairs
        assert audit["unpaired_units_replaced"] == lost
        assert audit["surrogate_code_units"] == 2 * pairs + lost
        assert (
            audit["repaired_text_sha256"]
            == hashlib.sha256(expected.encode("utf-8")).hexdigest()
        )
    else:
        assert audits == []
    assert service.load_for_story(_story()) == document


def test_unicode_repair_preserves_abstract_fallback_provenance(tmp_path: Path) -> None:
    story = _story()
    raw = "An abstract with an invalid glyph: \ud835."
    item = story.raw_items[0].model_copy(
        update={"raw_json": json.dumps({"abstract_snippet": raw})}
    )
    story = story.model_copy(update={"raw_items": [item]})
    service = FullTextService(tmp_path)
    with patch.object(
        service, "_extract_with_cooldown", side_effect=ValueError("absent")
    ):
        document = service.load_for_story(story)
    assert document.status == FullTextStatus.ABSTRACT_ONLY
    assert document.confidence_multiplier == 0.85
    assert "\ufffd" in document.text
    audit = json.loads(next(tmp_path.glob("*.unicode.json")).read_bytes())
    original = bytes.fromhex(audit["original_text_utf8_surrogatepass_hex"])
    assert original.decode("utf-8", errors="surrogatepass") == raw
    assert audit["unpaired_units_replaced"] == 1


def _pdf_with_contentless_page(auxiliary: str | None = None) -> bytes:
    writer = PdfWriter()
    for _ in range(2):
        page = writer.add_blank_page(width=612, height=792)
        stream = DecodedStreamObject()
        stream.set_data(
            b"BT /F1 12 Tf 10 700 Td (" + b"Readable evidence. " * 80 + b") Tj ET"
        )
        page[NameObject("/Contents")] = writer._add_object(stream)
        page[NameObject("/Resources")] = DictionaryObject(
            {
                NameObject("/Font"): DictionaryObject(
                    {
                        NameObject("/F1"): DictionaryObject(
                            {
                                NameObject("/Type"): NameObject("/Font"),
                                NameObject("/Subtype"): NameObject("/Type1"),
                                NameObject("/BaseFont"): NameObject("/Helvetica"),
                            }
                        )
                    }
                )
            }
        )
    blank = writer.add_blank_page(width=612, height=792)
    if auxiliary == "annotation":
        blank[NameObject("/Annots")] = ArrayObject(
            [
                DictionaryObject(
                    {
                        NameObject("/Subtype"): NameObject("/Text"),
                        NameObject("/Contents"): TextStringObject(
                            "Potentially readable annotation"
                        ),
                    }
                )
            ]
        )
    elif auxiliary == "xobject":
        blank[NameObject("/Resources")] = DictionaryObject(
            {
                NameObject("/XObject"): DictionaryObject(
                    {NameObject("/Unresolved"): DictionaryObject()}
                )
            }
        )
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


@pytest.mark.parametrize("auxiliary", [None, "annotation", "xobject"])
def test_pdf_missing_contents_is_blank_only_without_auxiliary_data(
    tmp_path: Path,
    auxiliary: str | None,
) -> None:
    response = MagicMock()
    response.headers = {}
    response.iter_bytes.return_value = [_pdf_with_contentless_page(auxiliary)]
    with patch("src.features.fulltext.service.httpx.stream") as stream:
        stream.return_value.__enter__.return_value = response
        text, pages = FullTextService(tmp_path)._extract_pdf(
            "https://example.com/paper.pdf"
        )
    assert pages == 3
    assert "--- Page 1 ---" in text and "--- Page 2 ---" in text
    assert text.count("Readable evidence.") == 160
    document = _build_document(
        "paper", text, source_url=None, source_format="pdf", page_count=pages
    )
    if auxiliary:
        assert "[Extraction note: 1 page(s) unavailable.]" in text
        assert document.status == FullTextStatus.PARTIAL
    else:
        assert "[Extraction note:" not in text
        assert document.status == FullTextStatus.COMPLETE


def test_pdf_nonblank_keyerror_is_not_assumed_blank(tmp_path: Path) -> None:
    response = MagicMock()
    response.headers = {}
    response.iter_bytes.return_value = [_pdf_with_contentless_page()]
    with patch("src.features.fulltext.service.httpx.stream") as stream:
        stream.return_value.__enter__.return_value = response
        with (
            patch(
                "pypdf._page.PageObject.extract_text", side_effect=KeyError("/Broken")
            ),
            pytest.raises(KeyError, match="/Broken"),
        ):
            FullTextService(tmp_path)._extract_pdf("https://example.com/paper.pdf")
