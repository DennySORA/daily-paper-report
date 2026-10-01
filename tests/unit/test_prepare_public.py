"""Tests for the translation filling in scripts/prepare-public.py."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType

import pytest


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "prepare-public.py"


def _load_script() -> ModuleType:
    spec = importlib.util.spec_from_file_location("prepare_public", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _story(story_id: str, **translation: str) -> dict[str, str]:
    return {"story_id": story_id, "title": f"Title {story_id}", **translation}


def _write(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def _run(public: Path, monkeypatch: pytest.MonkeyPatch) -> dict[str, object]:
    monkeypatch.setattr(sys, "argv", ["prepare-public.py", str(public)])
    _load_script().main()
    return json.loads(
        (public / "api" / "day" / "2026-06-30.json").read_text(encoding="utf-8")
    )


@pytest.fixture
def public(tmp_path: Path) -> Path:
    (tmp_path / "api" / "day").mkdir(parents=True)
    return tmp_path


def test_story_listed_again_reuses_its_translation_from_another_day(
    public: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    api = public / "api"
    later = {"papers": [_story("arxiv:1"), _story("arxiv:2")]}
    _write(
        api / "day" / "2026-06-29.json",
        {"papers": [_story("arxiv:1", title_zh="論文一", summary_zh="導讀一")]},
    )
    _write(api / "day" / "2026-06-30.json", later)
    _write(api / "daily.json", later)
    _write(api / "translations_zh.json", {"arxiv:2": {"title_zh": "論文二"}})

    papers = _run(public, monkeypatch)["papers"]

    assert papers == [
        _story("arxiv:1", title_zh="論文一", summary_zh="導讀一"),
        _story("arxiv:2", title_zh="論文二"),
    ]
    search = json.loads((api / "search.json").read_text(encoding="utf-8"))
    assert [row[5] for row in search["rows"]] == ["論文一", "論文二"]


def test_cache_wins_and_existing_translations_are_kept(
    public: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    api = public / "api"
    later = {
        "top5": [_story("arxiv:1")],
        "papers": [_story("arxiv:2", title_zh="原有標題", summary_zh="原有導讀")],
    }
    _write(
        api / "day" / "2026-06-29.json",
        {
            "papers": [
                _story("arxiv:1", title_zh="舊標題", summary_zh="舊導讀"),
                _story("arxiv:2", title_zh="另一天", summary_zh="另一天導讀"),
            ]
        },
    )
    _write(api / "day" / "2026-06-30.json", later)
    _write(api / "daily.json", later)
    _write(
        api / "translations_zh.json",
        {"arxiv:1": {"title_zh": "快取標題", "summary_zh": "快取導讀"}},
    )

    day = _run(public, monkeypatch)

    assert day["top5"] == [
        _story("arxiv:1", title_zh="快取標題", summary_zh="快取導讀")
    ]
    assert day["papers"] == [
        _story("arxiv:2", title_zh="原有標題", summary_zh="原有導讀")
    ]
