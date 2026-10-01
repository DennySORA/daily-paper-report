"""Tests for translation data models and cache."""

from __future__ import annotations

import json
import sys
import threading
from pathlib import Path
from typing import Any

import pytest

from src.features.translation.models import (
    CURRENT_TRANSLATION_PROMPT_VERSION,
    TranslationCache,
    TranslationEntry,
)


class TestTranslationEntry:
    """Tests for TranslationEntry dataclass."""

    def test_create_entry(self) -> None:
        entry = TranslationEntry(
            story_id="story-1",
            title_zh="\u6e2c\u8a66\u6a19\u984c",
            summary_zh="\u6e2c\u8a66\u6458\u8981",
        )
        assert entry.story_id == "story-1"
        assert entry.title_zh == "\u6e2c\u8a66\u6a19\u984c"
        assert entry.summary_zh == "\u6e2c\u8a66\u6458\u8981"

    def test_to_dict(self) -> None:
        entry = TranslationEntry(
            story_id="story-1",
            title_zh="\u6e2c\u8a66\u6a19\u984c",
            summary_zh="\u6e2c\u8a66\u6458\u8981",
        )
        result = entry.to_dict()
        assert result == {
            "story_id": "story-1",
            "title_zh": "\u6e2c\u8a66\u6a19\u984c",
            "summary_zh": "\u6e2c\u8a66\u6458\u8981",
            "prompt_version": CURRENT_TRANSLATION_PROMPT_VERSION,
            "fulltext_sha256": "",
            "model": "",
        }

    def test_from_dict(self) -> None:
        data = {
            "story_id": "story-1",
            "title_zh": "\u6e2c\u8a66\u6a19\u984c",
            "summary_zh": "\u6e2c\u8a66\u6458\u8981",
        }
        entry = TranslationEntry.from_dict(data)
        assert entry.story_id == "story-1"
        assert entry.title_zh == "\u6e2c\u8a66\u6a19\u984c"
        assert entry.summary_zh == "\u6e2c\u8a66\u6458\u8981"
        assert entry.prompt_version == ""

    def test_from_dict_with_prompt_version(self) -> None:
        data = {
            "story_id": "story-1",
            "title_zh": "\u6e2c\u8a66\u6a19\u984c",
            "summary_zh": "\u6e2c\u8a66\u6458\u8981",
            "prompt_version": CURRENT_TRANSLATION_PROMPT_VERSION,
        }
        entry = TranslationEntry.from_dict(data)
        assert entry.prompt_version == CURRENT_TRANSLATION_PROMPT_VERSION

    def test_from_dict_missing_summary(self) -> None:
        data = {"story_id": "story-1", "title_zh": "\u6a19\u984c"}
        entry = TranslationEntry.from_dict(data)
        assert entry.summary_zh == ""

    def test_frozen(self) -> None:
        entry = TranslationEntry(story_id="s1", title_zh="t", summary_zh="s")
        with pytest.raises(AttributeError):
            entry.title_zh = "new"  # type: ignore[misc]


class TestTranslationCache:
    """Tests for TranslationCache persistence."""

    def test_load_nonexistent_file(self, tmp_path: Path) -> None:
        cache = TranslationCache(tmp_path / "missing.json")
        cache.load()
        assert len(cache.entries) == 0

    def test_save_and_load_roundtrip(self, tmp_path: Path) -> None:
        cache_path = tmp_path / "api" / "translations_zh.json"
        cache = TranslationCache(cache_path)

        entry = TranslationEntry(
            story_id="story-1",
            title_zh="\u6e2c\u8a66",
            summary_zh="\u6458\u8981",
        )
        cache.put(entry)
        cache.save()

        # Load into fresh cache
        cache2 = TranslationCache(cache_path)
        cache2.load()
        assert cache2.has("story-1")
        assert cache2.is_current("story-1")
        loaded = cache2.get("story-1")
        assert loaded is not None
        assert loaded.title_zh == "\u6e2c\u8a66"
        assert loaded.summary_zh == "\u6458\u8981"

    def test_has_and_get(self, tmp_path: Path) -> None:
        cache = TranslationCache(tmp_path / "cache.json")
        assert not cache.has("story-1")
        assert cache.get("story-1") is None

        entry = TranslationEntry(story_id="story-1", title_zh="t", summary_zh="s")
        cache.put(entry)
        assert cache.has("story-1")
        assert cache.is_current("story-1")
        assert cache.get("story-1") == entry

    def test_old_cache_entry_is_not_current(self, tmp_path: Path) -> None:
        cache_path = tmp_path / "cache.json"
        cache_path.write_text(
            json.dumps(
                {
                    "story-1": {
                        "story_id": "story-1",
                        "title_zh": "\u820a\u6a19\u984c",
                        "summary_zh": "\u77ed\u6458\u8981",
                    }
                },
                ensure_ascii=False,
            )
        )

        cache = TranslationCache(cache_path)
        cache.load()

        assert cache.has("story-1")
        assert not cache.is_current("story-1")

    def test_load_corrupt_file(self, tmp_path: Path) -> None:
        cache_path = tmp_path / "bad.json"
        cache_path.write_text("not valid json{{{")

        cache = TranslationCache(cache_path)
        cache.load()
        assert len(cache.entries) == 0

    def test_save_creates_parent_dirs(self, tmp_path: Path) -> None:
        cache_path = tmp_path / "deep" / "nested" / "cache.json"
        cache = TranslationCache(cache_path)
        cache.put(TranslationEntry(story_id="s1", title_zh="t", summary_zh=""))
        cache.save()
        assert cache_path.exists()

    def test_unicode_preservation(self, tmp_path: Path) -> None:
        cache_path = tmp_path / "cache.json"
        cache = TranslationCache(cache_path)
        entry = TranslationEntry(
            story_id="s1",
            title_zh="\u57fa\u65bc Transformer \u7684\u65b0\u578b\u591a\u6a21\u614b\u5b78\u7fd2\u67b6\u69cb",
            summary_zh="\u672c\u6587\u63d0\u51fa\u4e86\u4e00\u7a2e\u65b0\u7684 multi-modal \u67b6\u69cb",
        )
        cache.put(entry)
        cache.save()

        raw = json.loads(cache_path.read_text(encoding="utf-8"))
        assert "\u57fa\u65bc" in raw["s1"]["title_zh"]

    def test_save_while_workers_put(self, tmp_path: Path) -> None:
        """Concurrent translation workers may add entries during a save."""
        cache_path = tmp_path / "cache.json"
        cache = TranslationCache(cache_path)
        for index in range(2000):
            cache.put(
                TranslationEntry(story_id=f"seed-{index}", title_zh="t", summary_zh="s")
            )

        def worker(prefix: str) -> None:
            for index in range(3000):
                cache.put(
                    TranslationEntry(
                        story_id=f"{prefix}-{index}", title_zh="t", summary_zh="s"
                    )
                )

        interval = sys.getswitchinterval()
        sys.setswitchinterval(1e-6)
        try:
            threads = [
                threading.Thread(target=worker, args=(f"w{n}",)) for n in range(4)
            ]
            for thread in threads:
                thread.start()
            while any(thread.is_alive() for thread in threads):
                cache.save()
            for thread in threads:
                thread.join()
        finally:
            sys.setswitchinterval(interval)
        cache.save()

        saved = json.loads(cache_path.read_text(encoding="utf-8"))
        assert len(saved) == len(cache.entries) == 2000 + 4 * 3000

    def test_failed_save_keeps_previous_file(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """An interrupted save never leaves a truncated cache behind."""
        cache_path = tmp_path / "cache.json"
        cache = TranslationCache(cache_path)
        cache.put(TranslationEntry(story_id="s1", title_zh="t", summary_zh="s"))
        cache.save()
        before = cache_path.read_text(encoding="utf-8")

        def broken_dump(obj: object, fp: Any, **kwargs: object) -> None:
            fp.write('{"s1": {"title_zh": "t')
            raise OSError("disk full")

        cache.put(TranslationEntry(story_id="s2", title_zh="t2", summary_zh="s2"))
        monkeypatch.setattr("src.features.translation.models.json.dump", broken_dump)
        with pytest.raises(OSError, match="disk full"):
            cache.save()

        assert cache_path.read_text(encoding="utf-8") == before
        assert [path.name for path in tmp_path.iterdir()] == ["cache.json"]
