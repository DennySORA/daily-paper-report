"""Export and replay historical runs using source-bound offline reviews.

This module never constructs an external model client. Source collection is
recovered from an immutable state snapshot, not reconstructed from selected
papers or current feeds. Full text uses the original extraction service.
"""

from __future__ import annotations

import hashlib
import json
import math
import sqlite3
import time
from dataclasses import asdict
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from src.cli.digest import _collect_ranker_stories
from src.features.assistant_review.validation import (
    PRODUCER,
    digest_file,
    read_object,
    validate_guide,
    validate_rationale_translation,
    validate_review,
)
from src.features.config.effective import EffectiveConfig
from src.features.config.loader import ConfigLoader
from src.features.fulltext import FullTextService
from src.features.fulltext.models import FullTextDocument, FullTextStatus
from src.features.llm.processor import LlmRelevanceProcessor
from src.features.llm.prompts import SYSTEM_INSTRUCTION, build_batch_prompt
from src.features.store.models import Item
from src.linker import StoryLinker
from src.linker.models import Story
from src.ranker import StoryRanker
from src.ranker.models import RankerResult
from src.renderer import RunInfo, SourceStatus
from src.renderer.json_renderer import JsonRenderer


_REQUEST_INTERVAL = 3.0
_SHA256_LENGTH = 64


def write_object(path: Path, value: object) -> None:
    """Atomically persist an interchange object."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    temporary.replace(path)


def load_config() -> EffectiveConfig:
    """Use unchanged repository collection, linking, scoring and quota settings."""
    return ConfigLoader("assistant-review").load(
        sources_path=Path("config/sources.yaml"),
        entities_path=Path("config/entities.yaml"),
        topics_path=Path("config/topics.yaml"),
    )


def config_hashes() -> dict[str, str]:
    """Freeze configured rules; never reuse reviews across a rule change."""
    return {
        name: digest_file(Path("config") / name)
        for name in ("sources.yaml", "entities.yaml", "topics.yaml")
    }


def _check_config(manifest: dict[str, Any]) -> None:
    if manifest.get("config_sha256") != config_hashes():
        raise ValueError("Configuration changed or is not bound to this export")


def source_key(story: Story) -> str:
    """Share review only when story identity and original source content match."""
    semantic = {
        "story_id": story.story_id,
        "title": story.title,
        "raw": [
            {"source_id": i.source_id, "raw_json": i.raw_json} for i in story.raw_items
        ],
    }
    return hashlib.sha256(json.dumps(semantic, sort_keys=True).encode()).hexdigest()


def validate_day(day: str) -> None:
    """Keep archive-derived dates from becoming arbitrary output paths."""
    if date.fromisoformat(day).isoformat() != day:
        raise ValueError("Expected canonical YYYY-MM-DD date")


def infer_ranking_anchor(archive: dict[str, Any], decay: float) -> str:
    """Recover original rank time from archived non-model recency components."""
    stories = [
        *archive.get("top5", []),
        *archive.get("papers", []),
        *archive.get("radar", []),
    ]
    for group in archive.get("model_releases_by_entity", {}).values():
        stories.extend(group)
    estimates = []
    for story in stories:
        score = story.get("scores", {}).get("recency_score")
        published = story.get("published_at")
        if decay > 0 and published and isinstance(score, int | float) and score > 0:
            estimates.append(
                datetime.fromisoformat(published)
                + timedelta(days=-math.log(score) / decay)
            )
    if not estimates:
        return str(archive["run_info"]["finished_at"])
    if any(value != estimates[0] for value in estimates):
        raise ValueError(
            "Archived recency components do not share one ranking timestamp"
        )
    return estimates[0].isoformat()


def export_snapshot(workspace: Path, state: Path, archive: Path) -> None:
    """Export ALL linked candidates from one historical post-run snapshot.

    The snapshot must correspond to the archived run. The original 24-hour
    publication cutoff is reused, and any story-count mismatch fails closed.
    A raw snapshot has no per-source observation count; archived collection
    counts are preserved as historical provenance, never claimed as recollection.
    """
    config = load_config()
    manifest_path = workspace / "manifest.json"
    manifest = (
        read_object(manifest_path)
        if manifest_path.exists()
        else {
            "version": 1,
            "dates": {},
            "candidates": {},
        }
    )
    if "config_sha256" not in manifest:
        manifest["config_sha256"] = config_hashes()
    _check_config(manifest)
    digest = read_object(archive)
    day = digest["run_date"]
    validate_day(day)
    info = digest["run_info"]
    cutoff = datetime.fromisoformat(info["started_at"]) - timedelta(hours=24)
    with sqlite3.connect(state.resolve().as_uri() + "?mode=ro", uri=True) as connection:
        connection.row_factory = sqlite3.Row
        if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("Historical state failed SQLite integrity check")
        rows = connection.execute(
            "SELECT * FROM items WHERE published_at > ? ORDER BY published_at DESC",
            (cutoff.isoformat(),),
        ).fetchall()
    items = [Item.model_validate(dict(row)) for row in rows]
    linked = StoryLinker(
        run_id="assistant-review",
        entities_config=config.entities,
        topics_config=config.topics,
    ).link_items(items)
    if len(linked.stories) != info["stories_total"]:
        raise ValueError("Recovered candidate count differs from archived run")
    keys = []
    for story in linked.stories:
        key = source_key(story)
        keys.append(key)
        if key not in manifest["candidates"]:
            manifest["candidates"][key] = {
                "story_id": story.story_id,
                "title": story.title,
                "dates": [],
            }
            write_object(
                workspace / "candidates" / f"{key}.json", story.model_dump(mode="json")
            )
        if day not in manifest["candidates"][key]["dates"]:
            manifest["candidates"][key]["dates"].append(day)
    entry = {
        "keys": keys,
        "original_run_info": info,
        "state_sha256": digest_file(state),
        "archive_sha256": digest_file(archive),
        "original_sources_status": digest.get("sources_status", []),
        "recovered_items_count": len(items),
        "ranking_anchor": infer_ranking_anchor(
            digest, config.topics.scoring.recency_decay_factor
        ),
    }
    old = manifest["dates"].get(day)
    if old is not None and old != entry:
        raise ValueError(
            "Refusing to replace an exported day with different provenance"
        )
    manifest["dates"][day] = entry
    write_object(manifest_path, manifest)


def fetch_requests(workspace: Path) -> None:
    """Resume source extraction and export original full-paper scoring prompts."""
    manifest = read_object(workspace / "manifest.json")
    _check_config(manifest)
    config = load_config()
    service = FullTextService(workspace / "fulltext")
    previous: float | None = None
    for key in manifest["candidates"]:
        path = workspace / "requests" / f"{key}.json"
        if path.exists():
            continue
        story = _load_story(workspace, key)
        if not (story.arxiv_id or LlmRelevanceProcessor._has_abstract(story)):
            write_object(
                path,
                {
                    "key": key,
                    "story_id": story.story_id,
                    "skip": "original_evaluatable_filter",
                },
            )
            continue
        if previous is not None:
            time.sleep(max(0.0, _REQUEST_INTERVAL - (time.monotonic() - previous)))
        previous = time.monotonic()
        documents = service.load_for_stories([story])
        document = documents.get(story.story_id)
        write_object(
            path,
            {
                "key": key,
                "story_id": story.story_id,
                "title": story.title,
                "document": asdict(document) if document else None,
                "system_instruction": SYSTEM_INSTRUCTION,
                "prompt": build_batch_prompt(
                    [story], list(config.topics.topics), documents
                ),
            },
        )


def _load_story(workspace: Path, key: str) -> Story:
    if len(key) != _SHA256_LENGTH or any(c not in "0123456789abcdef" for c in key):
        raise ValueError("Invalid candidate key")
    story = Story.model_validate_json(
        (workspace / "candidates" / f"{key}.json").read_text()
    )
    if source_key(story) != key:
        raise ValueError("Candidate source content changed after export")
    return story


def rank_day(
    workspace: Path, day: str
) -> tuple[RankerResult, dict[str, Any], dict[str, str]]:
    """Require every evaluatable candidate before unchanged ranking and quotas."""
    validate_day(day)
    manifest = read_object(workspace / "manifest.json")
    _check_config(manifest)
    entry = manifest["dates"][day]
    config = load_config()
    stories, scorecards, keys_by_id = [], {}, {}
    for key in entry["keys"]:
        story = _load_story(workspace, key)
        stories.append(story)
        keys_by_id[story.story_id] = key
        request_path = workspace / "requests" / f"{key}.json"
        request = read_object(request_path)
        if request.get("skip"):
            if story.arxiv_id or LlmRelevanceProcessor._has_abstract(story):
                raise ValueError("Evaluatable candidate cannot be skipped")
            continue
        if request["key"] != key or request["story_id"] != story.story_id:
            raise ValueError("Request does not match candidate")
        raw_doc = request.get("document")
        documents = {}
        if raw_doc:
            raw_doc = dict(raw_doc)
            raw_doc["status"] = FullTextStatus(raw_doc["status"])
            document = FullTextDocument(**raw_doc)
            if document.story_id != story.story_id:
                raise ValueError("Document belongs to another story")
            documents[story.story_id] = document
        expected_prompt = build_batch_prompt(
            [story], list(config.topics.topics), documents
        )
        if (
            request.get("prompt") != expected_prompt
            or request.get("system_instruction") != SYSTEM_INSTRUCTION
        ):
            raise ValueError(
                "Request does not use the original rubric and candidate source"
            )
        scorecards[story.story_id] = validate_review(
            request_path, workspace / "reviews" / f"{key}.json"
        )
    result = StoryRanker(
        run_id=f"assistant-review-{day}",
        topics_config=config.topics,
        entities_config=config.entities,
        now=datetime.fromisoformat(_ranking_anchor(entry)),
        llm_scores={sid: value["score"] for sid, value in scorecards.items()},
    ).rank_stories(stories)
    write_object(
        workspace / "selected" / f"{day}.json",
        {
            "date": day,
            "keys": [keys_by_id[s.story_id] for s in _collect_ranker_stories(result)],
            "historical_ranking_anchor": _ranking_anchor(entry),
        },
    )
    return result, scorecards, keys_by_id


def _ranking_anchor(entry: dict[str, Any]) -> str:
    """Use the explicit frozen anchor, or the original archived run fallback."""
    if entry.get("ranking_anchor"):
        return str(entry["ranking_anchor"])
    return str(entry["original_run_info"]["finished_at"])


def render_day(workspace: Path, day: str, output: Path) -> None:
    """Render only after complete candidate scoring and selected bilingual checks."""
    started_at = datetime.now(UTC)
    result, cards, keys = rank_day(workspace, day)
    config = load_config()
    translations: dict[str, object] = {}
    for story in _collect_ranker_stories(result):
        key = keys[story.story_id]
        request = workspace / "requests" / f"{key}.json"
        review = workspace / "reviews" / f"{key}.json"
        guide = workspace / "guides" / f"{key}.json"
        translations[story.story_id] = validate_guide(
            request, review, guide if guide.exists() else None
        )
        if story.story_id in cards:
            rationale = workspace / "rationales" / f"{key}.json"
            cards[story.story_id]["rationale_zh"] = validate_rationale_translation(
                request, review, rationale if rationale.exists() else None
            )
            cards[story.story_id]["rationale_en"] = validate_rationale_translation(
                request,
                review,
                rationale if rationale.exists() else None,
                language="en",
            )
        if story.arxiv_id and not story.to_json_dict().get("summary"):
            raise ValueError("Selected story lacks original-language source summary")
    manifest = read_object(workspace / "manifest.json")
    entry = manifest["dates"][day]
    original = entry.get("original_run_info")
    observed_at = (
        original["finished_at"] if original else entry.get("source_status_observed_at")
    )
    # Separate staging output protects the live/history tree if any gate fails.
    cache = output / "api" / "llm_scores.json"
    previous_cache = (
        read_object(cache) if cache.exists() else {"version": 2, "entries": {}}
    )
    merged = dict(previous_cache.get("entries", {}))
    for sid, card in cards.items():
        if day >= str(merged.get(sid, {}).get("review_date", "")):
            merged[sid] = {**card, "review_date": day}
    dates = sorted(
        {p.stem for p in (output / "api" / "day").glob("*.json")} | {day}, reverse=True
    )
    JsonRenderer(
        run_id=f"assistant-review-{day}",
        output_dir=output,
        entity_configs=list(config.entities.entities),
        translations=translations,
        llm_evaluations=cards,
    ).render(
        ranker_output=result.output,
        sources_status=[
            SourceStatus.model_validate(s)
            for s in entry.get("original_sources_status", [])
        ],
        run_info=RunInfo(
            run_id=f"assistant-review-{day}",
            started_at=started_at,
            finished_at=datetime.now(UTC),
            success=True,
            items_total=entry.get("recovered_items_count", len(keys)),
            stories_total=len(keys),
        ),
        run_date=day,
        archive_dates=dates,
        skip_daily_json=True,
    )

    write_object(cache, {**previous_cache, "version": 2, "entries": merged})
    write_object(
        output / "api" / "review_runs" / f"{day}.json",
        {
            "producer": PRODUCER,
            "phase": entry.get("phase", "historical_replay"),
            "replay_started_at": started_at.isoformat(),
            "replay_finished_at": datetime.now(UTC).isoformat(),
            "original_run_info": original,
            "source_status_observed_at": observed_at,
            "candidate_count": len(keys),
            "evaluated_count": len(cards),
            "source_snapshot_sha256": entry["state_sha256"],
            "archive_sha256": entry.get("archive_sha256"),
            "configuration_sha256": manifest["config_sha256"],
            "ranking_anchor": _ranking_anchor(entry),
            "coverage": entry.get("coverage"),
            "identity_migration": entry.get("identity_migration"),
        },
    )
