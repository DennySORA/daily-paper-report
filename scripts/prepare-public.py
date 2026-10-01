"""Finalize the published report data under PUBLIC_DIR/api.

The site shell (index.html, assets) is built and deployed by the frontend
workflow; this step only completes the data it reads:

- Stories still missing Traditional Chinese text get it from the translation
  cache (api/translations_zh.json) in day, daily and report files, exactly as
  the renderer would have injected it.
- api/daily.json gets the list of published days (archive_dates).
- api/reports/index.json exists even before the first weekly report.
- api/catalog.json lists every published day with section counts and the
  entity catalog (reports carry entity ids only).
- api/search.json is the compact index behind site-wide search.
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 1
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SECTIONS = ("top5", "papers", "radar")
SEARCH_TOPIC_LIMIT = 6
SEARCH_AUTHOR_LIMIT = 3


def write_json(path: Path, payload: object, *, indent: int | None = None) -> None:
    """Atomically replace a JSON file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    separators = None if indent else (",", ":")
    text = json.dumps(payload, ensure_ascii=False, indent=indent, separators=separators)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(text + "\n", encoding="utf-8")
    os.replace(temporary, path)


def write_digest(path: Path, payload: object) -> None:
    """Rewrite a digest in the renderer's format (sorted keys, two-space indent)."""
    text = json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=2)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(text + "\n", encoding="utf-8")
    os.replace(temporary, path)


def load_translations(api: Path) -> dict[str, dict[str, Any]]:
    """Cached Traditional Chinese titles and guides keyed by story id."""
    try:
        data = json.loads((api / "translations_zh.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {
        str(key): value
        for key, value in data.items()
        if isinstance(value, dict) and value.get("title_zh")
    }


def fill_translations(
    items: list[dict[str, Any]], translations: dict[str, dict[str, Any]]
) -> int:
    """Add cached title_zh/summary_zh to stories that lack them; never overwrite."""
    filled = 0
    for story in items:
        if story.get("title_zh"):
            continue
        entry = translations.get(str(story.get("story_id")))
        if entry is None:
            continue
        story["title_zh"] = entry["title_zh"]
        if entry.get("summary_zh"):
            story["summary_zh"] = entry["summary_zh"]
        filled += 1
    return filled


def fill_reports(reports_dir: Path, translations: dict[str, dict[str, Any]]) -> int:
    """Fill missing translations in weekly and monthly report recommendations."""
    filled = 0
    for path in sorted(reports_dir.glob("*/*.json")):
        try:
            report = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(report, dict):
            continue
        items = [
            story
            for key in ("recommendations", "blog_recommendations")
            for story in report.get(key) or []
            if isinstance(story, dict)
        ]
        count = fill_translations(items, translations)
        if count:
            write_digest(path, report)
            filled += count
    return filled


def load_days(day_dir: Path) -> list[tuple[str, dict[str, Any]]]:
    """Return (date, digest) pairs for every readable day file, newest first."""
    days: list[tuple[str, dict[str, Any]]] = []
    for path in sorted(day_dir.glob("*.json"), reverse=True):
        if not DATE_RE.match(path.stem):
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            # One damaged archive must not block today's publication.
            sys.stderr.write(f"warning: skipping unreadable day file {path}: {error}\n")
            continue
        if isinstance(payload, dict):
            days.append((path.stem, payload))
    return days


def stories(digest: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    """Section-tagged stories in reading order, model releases last."""
    result = [
        (section, story)
        for section in SECTIONS
        for story in digest.get(section) or []
        if isinstance(story, dict)
    ]
    releases = digest.get("model_releases_by_entity") or {}
    if isinstance(releases, dict):
        for items in releases.values():
            result.extend(
                ("releases", story) for story in items or [] if isinstance(story, dict)
            )
    return result


def day_entry(day: str, digest: dict[str, Any]) -> dict[str, Any]:
    """Per-day counts shown by the archive and the date picker."""
    entries = stories(digest)
    lead = next((story for section, story in entries if section == "top5"), None)
    if lead is None and entries:
        lead = entries[0][1]
    evaluations = [story.get("llm_evaluation") or {} for _, story in entries]
    return {
        "date": day,
        "top5": len(digest.get("top5") or []),
        "papers": len(digest.get("papers") or []),
        "radar": len(digest.get("radar") or []),
        "releases": sum(1 for section, _ in entries if section == "releases"),
        "translated": sum(1 for _, story in entries if story.get("summary_zh")),
        "evaluated": sum(1 for item in evaluations if item),
        "fulltext": sum(
            1 for item in evaluations if item.get("fulltext_status") == "complete"
        ),
        "lead_title": lead.get("title") if lead else None,
        "lead_title_zh": lead.get("title_zh") if lead else None,
    }


def missing_dates(published: list[str]) -> list[str]:
    """Calendar days between the first and last published day with no digest."""
    if not published:
        return []
    present = set(published)
    first = date.fromisoformat(min(published))
    last = date.fromisoformat(max(published))
    gaps: list[str] = []
    current = first
    while current <= last:
        if current.isoformat() not in present:
            gaps.append(current.isoformat())
        current += timedelta(days=1)
    return gaps


def search_rows(days: list[tuple[str, dict[str, Any]]]) -> list[list[Any]]:
    """One row per story, taken from the newest day that listed it."""
    rows: list[list[Any]] = []
    seen: set[str] = set()
    for day, digest in days:
        for section, story in stories(digest):
            story_id = story.get("story_id")
            if not isinstance(story_id, str) or story_id in seen:
                continue
            seen.add(story_id)
            evaluation = story.get("llm_evaluation") or {}
            score = evaluation.get("score")
            link_type = (story.get("primary_link") or {}).get("link_type") or ""
            topics = [t for t in evaluation.get("topics") or [] if isinstance(t, str)]
            authors = [a for a in story.get("authors") or [] if isinstance(a, str)]
            rows.append(
                [
                    story_id,
                    day,
                    section,
                    round(score, 3) if isinstance(score, int | float) else None,
                    story.get("title") or story_id,
                    story.get("title_zh") or None,
                    topics[:SEARCH_TOPIC_LIMIT],
                    authors[:SEARCH_AUTHOR_LIMIT],
                    link_type,
                ]
            )
    return rows


def main() -> None:
    match sys.argv[1:]:
        case [public_dir]:
            root = Path(public_dir).resolve()
        case _:
            raise SystemExit("usage: prepare-public.py PUBLIC_DIR")
    api = root / "api"
    daily = api / "daily.json"
    if not daily.is_file():
        raise SystemExit(f"Refusing to finalize: missing {daily}")

    translations = load_translations(api)
    days = load_days(api / "day")
    filled = 0
    for day, digest in days:
        count = fill_translations([story for _, story in stories(digest)], translations)
        if count:
            write_digest(api / "day" / f"{day}.json", digest)
            filled += count
    filled += fill_reports(api / "reports", translations)
    published = sorted((day for day, _ in days), reverse=True)

    payload = json.loads(daily.read_text(encoding="utf-8"))
    fill_translations([story for _, story in stories(payload)], translations)
    payload["archive_dates"] = published
    write_digest(daily, payload)
    if filled:
        sys.stdout.write(f"Filled {filled} cached translations into published files.\n")

    reports_index = api / "reports" / "index.json"
    if not reports_index.exists():
        write_json(
            reports_index,
            {
                "generated_at": datetime.now(UTC).isoformat(),
                "latest": {"weekly": None, "monthly": None},
                "weekly": [],
                "monthly": [],
            },
            indent=2,
        )

    generated_at = datetime.now(UTC).isoformat()
    write_json(
        api / "catalog.json",
        {
            "schema": SCHEMA_VERSION,
            "generated_at": generated_at,
            "latest_date": published[0] if published else None,
            "days": [day_entry(day, digest) for day, digest in days],
            "missing_dates": missing_dates(published),
            "entities": payload.get("entity_catalog") or {},
        },
    )
    write_json(
        api / "search.json",
        {
            "schema": SCHEMA_VERSION,
            "generated_at": generated_at,
            "rows": search_rows(days),
        },
    )


if __name__ == "__main__":
    main()
