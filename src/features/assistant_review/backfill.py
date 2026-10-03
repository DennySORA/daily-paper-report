"""Export a missing report day without inventing a historical execution."""

import sqlite3
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from src.features.assistant_review.validation import digest_file, read_object
from src.features.assistant_review.workflow import (
    _check_config,
    load_config,
    source_key,
    validate_day,
    write_object,
)
from src.features.store.models import Item
from src.linker import StoryLinker


def export_backfill_day(
    workspace: Path, state: Path, day: str, coverage_path: Path
) -> None:
    """Use the original UTC backfill day window and current ranking-time rule.

    Coverage must explicitly describe reconstructed sources and unavailable
    historical observations. No fabricated original run or empty archive is
    produced. Existing exported days and all source-bound reviews are preserved.
    """
    validate_day(day)
    if date.fromisoformat(day) > datetime.now(UTC).date():
        raise ValueError("Cannot backfill a future day")
    manifest_path = workspace / "manifest.json"
    manifest = read_object(manifest_path)
    _check_config(manifest)
    coverage = read_object(coverage_path)
    if coverage.get("date") != day or not coverage.get("ready_for_review"):
        raise ValueError("Historical source coverage is not ready for review")
    if day in manifest["dates"]:
        entry = manifest["dates"][day]
        if entry.get("coverage_sha256") == digest_file(coverage_path) and entry.get(
            "state_sha256"
        ) == digest_file(state):
            return
        raise ValueError("Refusing to replace an already exported report day")
    start = datetime.combine(date.fromisoformat(day), datetime.min.time(), UTC)
    end = start + timedelta(days=1)
    with sqlite3.connect(state.resolve().as_uri() + "?mode=ro", uri=True) as conn:
        conn.row_factory = sqlite3.Row
        if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("Backfill state failed SQLite integrity check")
        rows = conn.execute(
            "SELECT * FROM items WHERE published_at >= ? AND published_at < ? "
            "ORDER BY published_at DESC",
            (start.isoformat(), end.isoformat()),
        ).fetchall()
    if not rows:
        raise ValueError("No captured items; do not invent an empty completed day")
    config = load_config()
    items = [Item.model_validate(dict(row)) for row in rows]
    result = StoryLinker(
        run_id=f"assistant-backfill-{day}",
        entities_config=config.entities,
        topics_config=config.topics,
    ).link_items(items)
    keys = []
    for story in result.stories:
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
        manifest["candidates"][key]["dates"].append(day)
    manifest["dates"][day] = {
        "phase": "historical_backfill",
        "keys": keys,
        "original_run_info": None,
        "original_sources_status": coverage.get("sources_status", []),
        "source_status_observed_at": coverage.get("observed_at"),
        "state_sha256": digest_file(state),
        "coverage_sha256": digest_file(coverage_path),
        "coverage": coverage,
        "recovered_items_count": len(items),
        "ranking_anchor": datetime.now(UTC).isoformat(),
        "publication_window": {"start": start.isoformat(), "end": end.isoformat()},
    }
    write_object(manifest_path, manifest)
