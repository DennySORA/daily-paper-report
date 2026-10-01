"""Translate published stories that still have no Traditional Chinese text.

Uses the application's TranslationProcessor, so prompt, model, retries and the
cache format match the daily pipeline. Stories whose full text is in the
private full-text cache are translated from it one per request; the rest use
their abstract and are batched. Only stories with no cache entry at all are
sent to the API. New entries land in PUBLIC_DIR/api/translations_zh.json, and
scripts/prepare-public.py fills them into the published files.

Run it while holding the pipeline lock, or against a private copy of api/ and
merge the result later:

    translate-missing.py PUBLIC_DIR [--fulltext-cache DIR] [--since DATE]
    translate-missing.py --merge FROM_CACHE INTO_CACHE

LLM_TRANSLATION_CONCURRENCY controls parallel requests (default 1).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SECTIONS = ("top5", "papers", "radar")


def missing_stories(day_dir: Path, since: str | None) -> list[dict[str, Any]]:
    """Stories without title_zh in any day file, newest day first, deduplicated."""
    found: dict[str, dict[str, Any]] = {}
    translated: set[str] = set()
    for path in sorted(day_dir.glob("*.json"), reverse=True):
        if since and path.stem < since:
            continue
        try:
            digest = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        for section in SECTIONS:
            for story in digest.get(section) or []:
                story_id = story.get("story_id") if isinstance(story, dict) else None
                if not isinstance(story_id, str):
                    continue
                if story.get("title_zh"):
                    translated.add(story_id)
                elif story_id not in found and story.get("title"):
                    found[story_id] = {
                        "story_id": story_id,
                        "title": story["title"],
                        "summary": story.get("summary") or "",
                    }
    return [story for story_id, story in found.items() if story_id not in translated]


def attach_fulltext(story: dict[str, Any], cache_dir: Path) -> bool:
    """Attach the cached full text exactly as the pipeline's translation phase does."""
    key = hashlib.sha256(story["story_id"].encode()).hexdigest()
    metadata_path = cache_dir / f"{key}.json"
    text_path = cache_dir / f"{key}.txt"
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        text = text_path.read_text(encoding="utf-8")
    except (OSError, json.JSONDecodeError):
        return False
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    if (
        metadata.get("story_id") != story["story_id"]
        or metadata.get("sha256") != digest
    ):
        return False
    story["fulltext"] = text
    story["fulltext_sha256"] = digest
    story["fulltext_status"] = str(metadata.get("status", "complete"))
    return True


def load_cache(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def merge(source: Path, target: Path) -> int:
    """Add entries from source that target lacks; existing target entries win."""
    incoming = load_cache(source)
    current = load_cache(target)
    added = 0
    for story_id, entry in incoming.items():
        if (
            isinstance(entry, dict)
            and entry.get("title_zh")
            and story_id not in current
        ):
            current[story_id] = entry
            added += 1
    if added:
        temporary = target.with_name(f".{target.name}.tmp")
        temporary.write_text(
            json.dumps(current, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        os.replace(temporary, target)
    return added


def translate(
    public_dir: Path, fulltext_cache: Path | None, since: str | None, *, dry_run: bool
) -> None:
    sys.path.insert(0, str(ROOT))
    from src.features.llm.factory import create_llm_client  # noqa: PLC0415
    from src.features.translation.processor import TranslationProcessor  # noqa: PLC0415
    from src.settings.app import get_settings  # noqa: PLC0415

    cache_path = public_dir / "api" / "translations_zh.json"
    cached = load_cache(cache_path)
    pending = [
        story
        for story in missing_stories(public_dir / "api" / "day", since)
        if story["story_id"] not in cached
    ]
    with_text = [
        story
        for story in pending
        if fulltext_cache is not None and attach_fulltext(story, fulltext_cache)
    ]
    abstract_only = [story for story in pending if "fulltext" not in story]
    sys.stdout.write(
        f"Untranslated: {len(pending)} ({len(with_text)} with full text, "
        f"{len(abstract_only)} from the abstract)\n"
    )
    if not pending or dry_run:
        return

    settings = get_settings()
    if not settings.translation_api_key:
        raise SystemExit("TRANSLATION_API_KEY is not configured for the application.")
    client = create_llm_client(
        api_key=settings.translation_api_key,
        model=settings.translation_model,
        max_tokens=settings.llm_max_tokens,
        base_url=settings.translation_base_url,
    )
    processor = TranslationProcessor(client=client, output_dir=public_dir)
    # Full papers go one per request; abstracts are short enough to batch.
    for batch_size, group in (("1", with_text), ("8", abstract_only)):
        if group:
            os.environ["LLM_TRANSLATION_BATCH_SIZE"] = batch_size
            processor.translate(group)

    done = load_cache(cache_path)
    translated = sum(1 for story in pending if story["story_id"] in done)
    sys.stdout.write(f"Translated now: {translated} of {len(pending)}\n")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Translate published stories without Traditional Chinese text."
    )
    parser.add_argument("public_dir", nargs="?", type=Path)
    parser.add_argument("--fulltext-cache", type=Path, default=None)
    parser.add_argument(
        "--since", default=None, help="Only days on or after YYYY-MM-DD"
    )
    parser.add_argument("--merge", nargs=2, type=Path, metavar=("FROM", "INTO"))
    parser.add_argument("--dry-run", action="store_true", help="Only count stories")
    args = parser.parse_args()

    if args.merge:
        added = merge(*args.merge)
        sys.stdout.write(f"Merged {added} new translations.\n")
        return
    if args.public_dir is None:
        parser.error("PUBLIC_DIR is required unless --merge is used")
    translate(
        args.public_dir.resolve(), args.fulltext_cache, args.since, dry_run=args.dry_run
    )


if __name__ == "__main__":
    main()
