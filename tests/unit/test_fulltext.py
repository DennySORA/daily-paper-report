"""Tests for full-paper acquisition, compaction, and cache provenance."""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import httpx
import pytest

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
