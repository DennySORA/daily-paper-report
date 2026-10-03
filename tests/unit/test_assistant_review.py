"""Offline assistant reviews must not bypass source or completeness checks."""

import hashlib
import json
from pathlib import Path
from typing import Any

import pytest

from src.features.assistant_review.validation import (
    PRODUCER,
    digest_file,
    validate_guide,
    validate_rationale_translation,
    validate_review,
)
from src.features.assistant_review.workflow import write_object
from src.features.llm.processor import _COMPONENT_WEIGHTS, _weighted_score


def artifacts(tmp_path: Path) -> tuple[Path, Path, dict[str, Any]]:
    text = "Abstract\nA controlled language-agent experiment."
    request = {
        "key": "a" * 64,
        "story_id": "arxiv:2609.1",
        "document": {
            "text": text,
            "status": "abstract_only",
            "sha256": hashlib.sha256(text.encode()).hexdigest(),
        },
    }
    request_path, review_path = tmp_path / "request.json", tmp_path / "review.json"
    write_object(request_path, request)
    review = {
        "key": request["key"],
        "id": request["story_id"],
        "producer": PRODUCER,
        "request_sha256": digest_file(request_path),
        "fulltext_sha256": request["document"]["sha256"],
        "components": dict.fromkeys(_COMPONENT_WEIGHTS, 0.8),
        "score": 0.01,
        "rationale": "Abstract evidence only; uncertainty remains.",
        "topics": ["agents"],
        "evidence": ["Abstract: controlled language-agent experiment."],
        "title_zh": "語言代理實驗",
        "summary_zh": "本文提供有限的摘要證據。" * 35,
    }
    write_object(review_path, review)
    return request_path, review_path, review


def test_preserves_original_weighted_score_and_confidence(tmp_path: Path) -> None:
    request, review, value = artifacts(tmp_path)
    card = validate_review(request, review)
    assert card["score"] == pytest.approx(_weighted_score(value["components"]) * 0.85)
    assert card["score"] != value["score"]
    assert card["model"] == PRODUCER
    assert card["token_usage"] == {}


def test_scope_cap_is_not_silently_added(tmp_path: Path) -> None:
    request, review, value = artifacts(tmp_path)
    value["out_of_scope"] = True
    value["score"] = 0.2
    write_object(review, value)
    # Existing parser recomputes from components, ignoring overall score.
    assert validate_review(request, review)["score"] == pytest.approx(0.68)


@pytest.mark.parametrize(
    "field,value",
    [
        ("id", "wrong"),
        ("producer", "old-api-cache"),
        ("key", "other"),
        ("request_sha256", "wrong"),
        ("fulltext_sha256", "wrong"),
        ("rationale", ""),
        ("evidence", []),
        ("topics", "not-a-list"),
    ],
)
def test_rejects_unbound_or_incomplete_reviews(
    tmp_path: Path, field: str, value: Any
) -> None:
    request, review, payload = artifacts(tmp_path)
    payload[field] = value
    write_object(review, payload)
    with pytest.raises(ValueError):
        validate_review(request, review)


@pytest.mark.parametrize("value", [-0.1, 1.1, True, float("nan"), float("inf"), "0.8"])
def test_rejects_invalid_components(tmp_path: Path, value: Any) -> None:
    request, review, payload = artifacts(tmp_path)
    payload["components"]["rigor"] = value
    write_object(review, payload)
    with pytest.raises(ValueError):
        validate_review(request, review)


def test_rejects_missing_component(tmp_path: Path) -> None:
    request, review, payload = artifacts(tmp_path)
    del payload["components"]["novelty"]
    write_object(review, payload)
    with pytest.raises(ValueError, match="six"):
        validate_review(request, review)


def test_rejects_changed_source_bytes(tmp_path: Path) -> None:
    request, review, _ = artifacts(tmp_path)
    request.write_text(request.read_text() + "\n")
    with pytest.raises(ValueError, match="request_sha256"):
        validate_review(request, review)


def test_rejects_tampered_document_hash(tmp_path: Path) -> None:
    request, review, payload = artifacts(tmp_path)
    source = json.loads(request.read_text())
    source["document"]["text"] = "changed"
    write_object(request, source)
    payload["request_sha256"] = digest_file(request)
    write_object(review, payload)
    with pytest.raises(ValueError, match="document text"):
        validate_review(request, review)


def test_guide_has_source_provenance_and_bounded_length(tmp_path: Path) -> None:
    request, review, _ = artifacts(tmp_path)
    result = validate_guide(request, review)
    assert 350 <= len(result.summary_zh) <= 600
    assert result.model == PRODUCER


@pytest.mark.parametrize("length", [0, 349, 601])
def test_rejects_wrong_guide_length(tmp_path: Path, length: int) -> None:
    request, review, payload = artifacts(tmp_path)
    payload["summary_zh"] = "中" * length
    write_object(review, payload)
    with pytest.raises(ValueError, match="350"):
        validate_guide(request, review)


def test_missing_review_is_not_an_api_or_cached_fallback(tmp_path: Path) -> None:
    request, review, _ = artifacts(tmp_path)
    review.unlink()
    with pytest.raises(FileNotFoundError):
        validate_review(request, review)


def test_rank_day_rejects_missing_candidate_instead_of_using_old_cache(
    tmp_path: Path,
) -> None:
    from src.features.assistant_review.workflow import (
        config_hashes,
        rank_day,
        source_key,
    )
    from src.features.config.schemas.base import LinkType
    from src.features.store.models import Item
    from src.linker.models import Story, StoryLink

    item = Item(
        url="https://arxiv.org/abs/2609.00001",
        source_id="test",
        tier=1,
        kind="paper",
        title="Language agents",
        content_hash="abc",
        raw_json=json.dumps({"summary": "A language-agent study."}),
    )
    link = StoryLink(url=item.url, source_id="test", tier=1, link_type=LinkType.ARXIV)
    story = Story(
        story_id="arxiv:2609.00001",
        title=item.title,
        primary_link=link,
        links=[link],
        arxiv_id="2609.00001",
        raw_items=[item],
    )
    key = source_key(story)
    write_object(tmp_path / "candidates" / f"{key}.json", story.model_dump(mode="json"))
    write_object(
        tmp_path / "manifest.json",
        {
            "config_sha256": config_hashes(),
            "dates": {"2026-09-29": {"keys": [key]}},
        },
    )
    # Old API scores must never fill in an absent assistant request/review.
    write_object(
        tmp_path / "api" / "llm_scores.json",
        {
            "version": 2,
            "entries": {story.story_id: {"score": 1.0}},
        },
    )
    with pytest.raises(FileNotFoundError):
        rank_day(tmp_path, "2026-09-29")


def test_config_change_fails_before_ranking(tmp_path: Path) -> None:
    from src.features.assistant_review.workflow import rank_day

    write_object(tmp_path / "manifest.json", {"config_sha256": {}, "dates": {}})
    with pytest.raises(ValueError, match="Configuration"):
        rank_day(tmp_path, "2026-09-29")


@pytest.mark.parametrize(
    "field,value",
    [
        ("rationale", "   \n"),
        ("evidence", ["\t"]),
        ("title_zh", "English only"),
        ("summary_zh", "English " * 50),
    ],
)
def test_rejects_whitespace_and_non_chinese_guides(
    tmp_path: Path, field: str, value: Any
) -> None:
    request, review, payload = artifacts(tmp_path)
    payload[field] = value
    write_object(review, payload)
    with pytest.raises(ValueError):
        validate_guide(request, review)


def test_explicit_per_day_scorecards_override_shared_cache(tmp_path: Path) -> None:
    from src.renderer.json_renderer import JsonRenderer

    write_object(
        tmp_path / "api" / "llm_scores.json",
        {
            "version": 2,
            "entries": {"same-id": {"score": 0.9}},
        },
    )
    renderer = JsonRenderer(
        "replay", tmp_path, llm_evaluations={"same-id": {"score": 0.3}}
    )
    assert renderer._llm_evaluations["same-id"]["score"] == 0.3
    assert JsonRenderer("normal", tmp_path)._llm_evaluations["same-id"]["score"] == 0.9


def test_replay_preserves_cache_history_source_status_and_provenance(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from src.features.assistant_review import workflow
    from src.ranker.models import RankerOutput, RankerResult

    workspace, output = tmp_path / "work", tmp_path / "out"
    original = {
        "run_id": "original-api-run",
        "started_at": "2026-09-29T02:00:00+00:00",
        "finished_at": "2026-09-29T04:00:00+00:00",
        "items_total": 100,
        "stories_total": 20,
        "success": True,
    }
    status = {"source_id": "arxiv", "status": "HAS_UPDATE", "items_new": 20}
    write_object(
        workspace / "manifest.json",
        {
            "config_sha256": workflow.config_hashes(),
            "dates": {
                "2026-09-29": {
                    "original_run_info": original,
                    "original_sources_status": [status],
                    "recovered_items_count": 20,
                    "state_sha256": "state-hash",
                    "archive_sha256": "archive-hash",
                },
            },
        },
    )
    write_object(
        output / "api" / "llm_scores.json",
        {
            "version": 2,
            "entries": {
                "history": {"score": 0.2},
                "same-id": {"score": 0.9, "review_date": "2026-10-02"},
            },
        },
    )
    ranked = RankerResult(
        output=RankerOutput(output_checksum="test"),
        stories_in=0,
        stories_out=0,
        dropped_total=0,
    )
    monkeypatch.setattr(
        workflow, "rank_day", lambda *_: (ranked, {"same-id": {"score": 0.3}}, {})
    )
    workflow.render_day(workspace, "2026-09-29", output)
    cache = json.loads((output / "api" / "llm_scores.json").read_text())["entries"]
    assert cache["history"]["score"] == 0.2
    assert cache["same-id"]["score"] == 0.9
    day = json.loads((output / "api" / "day" / "2026-09-29.json").read_text())
    assert day["run_info"]["run_id"] == "assistant-review-2026-09-29"
    assert day["run_info"]["started_at"] != original["started_at"]
    assert day["sources_status"][0]["source_id"] == "arxiv"
    provenance = json.loads(
        (output / "api" / "review_runs" / "2026-09-29.json").read_text()
    )
    assert provenance["original_run_info"] == original
    assert provenance["source_snapshot_sha256"] == "state-hash"


def test_recovers_original_ranking_anchor_without_old_model_scores() -> None:
    import math
    from datetime import UTC, datetime, timedelta

    from src.features.assistant_review.workflow import infer_ranking_anchor

    anchor = datetime(2026, 9, 29, 2, 58, 15, 258519, tzinfo=UTC)
    stories = []
    for hours in (2, 5, 12):
        published = anchor - timedelta(hours=hours)
        stories.append(
            {
                "published_at": published.isoformat(),
                "scores": {
                    "recency_score": math.exp(-0.1 * hours / 24),
                    "llm_raw_score": 0.99,
                },
            }
        )
    archive = {"top5": stories, "run_info": {"finished_at": "2026-09-29T04:00:00Z"}}
    assert infer_ranking_anchor(archive, 0.1) == anchor.isoformat()
    stories[0]["scores"]["recency_score"] = 0.5
    with pytest.raises(ValueError, match="ranking timestamp"):
        infer_ranking_anchor(archive, 0.1)


@pytest.mark.parametrize(
    "day", ["../escape", "20260929", "2026-02-30", "/outside/2026-09-29"]
)
def test_rejects_noncanonical_archive_dates(day: str) -> None:
    from src.features.assistant_review.workflow import validate_day

    with pytest.raises(ValueError):
        validate_day(day)


def test_rationale_translation_preserves_original_score_review(tmp_path: Path) -> None:
    request, review, value = artifacts(tmp_path)
    original_bytes = review.read_bytes()
    with pytest.raises(ValueError, match="Chinese rationale"):
        validate_rationale_translation(request, review)
    sidecar = tmp_path / "rationale.json"
    translated = {
        field: value[field]
        for field in ("id", "producer", "request_sha256", "fulltext_sha256")
    }
    translated.update(
        rationale_sha256=hashlib.sha256(value["rationale"].encode()).hexdigest(),
        rationale_zh="僅有摘要層級的證據；研究結論仍存在不確定性。",
    )
    write_object(sidecar, translated)
    assert validate_rationale_translation(request, review, sidecar).startswith("僅有")
    assert review.read_bytes() == original_bytes
    value["rationale"] = "A changed assessment."
    write_object(review, value)
    with pytest.raises(ValueError, match="English rationale"):
        validate_rationale_translation(request, review, sidecar)


def test_embedded_chinese_rationale_is_accepted(tmp_path: Path) -> None:
    request, review, value = artifacts(tmp_path)
    value["rationale_zh"] = "僅有摘要層級的證據；研究結論仍存在不確定性。"
    write_object(review, value)
    assert validate_rationale_translation(request, review) == value["rationale_zh"]


def test_rationale_translation_rejects_another_source(tmp_path: Path) -> None:
    request, review, value = artifacts(tmp_path)
    value["request_sha256"] = "another-request"
    path = tmp_path / "rationale.json"
    write_object(path, value)
    with pytest.raises(ValueError, match="request_sha256"):
        validate_rationale_translation(request, review, path)


def test_missing_day_export_uses_exact_window_and_keeps_existing_reviews(
    tmp_path: Path,
) -> None:
    from datetime import UTC, datetime

    from src.features.assistant_review.backfill import export_backfill_day
    from src.features.assistant_review.workflow import config_hashes
    from src.features.store.models import Item
    from src.features.store.store import StateStore

    state = tmp_path / "state.sqlite"
    with StateStore(state) as store:
        for number, timestamp in enumerate(
            ["2020-08-10T23:59:59", "2020-08-11T00:00:00", "2020-08-12T00:00:00"]
        ):
            store.upsert_item(
                Item(
                    url=f"https://example.com/{number}",
                    source_id="test",
                    tier=1,
                    kind="paper",
                    title=f"Language agent experiment {number}",
                    content_hash=str(number),
                    published_at=datetime.fromisoformat(timestamp).replace(tzinfo=UTC),
                    raw_json=json.dumps({"summary": f"Separate experiment {number}"}),
                )
            )
    write_object(
        tmp_path / "manifest.json",
        {"config_sha256": config_hashes(), "dates": {}, "candidates": {}},
    )
    coverage = tmp_path / "coverage.json"
    write_object(
        coverage,
        {
            "date": "2020-08-11",
            "ready_for_review": True,
            "limitations": ["Historical feeds are not fully reconstructable."],
        },
    )
    export_backfill_day(tmp_path, state, "2020-08-11", coverage)
    manifest_before = (tmp_path / "manifest.json").read_bytes()
    manifest = json.loads(manifest_before)
    entry = manifest["dates"]["2020-08-11"]
    assert entry["recovered_items_count"] == 1
    assert len(entry["keys"]) == 1
    assert entry["original_run_info"] is None
    assert entry["phase"] == "historical_backfill"
    assert entry["coverage"]["limitations"]
    export_backfill_day(tmp_path, state, "2020-08-11", coverage)
    assert (tmp_path / "manifest.json").read_bytes() == manifest_before
    write_object(coverage, {"date": "2020-08-12", "ready_for_review": False})
    with pytest.raises(ValueError, match="not ready"):
        export_backfill_day(tmp_path, state, "2020-08-12", coverage)
    write_object(coverage, {"date": "2020-08-13", "ready_for_review": True})
    with pytest.raises(ValueError, match="empty completed day"):
        export_backfill_day(tmp_path, state, "2020-08-13", coverage)
