"""Offline tests for release-branch and prepared-data publication guards."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "release_prepared", ROOT / "scripts" / "release-prepared.py"
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Cannot load release helper")
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)
BASE = "a" * 40
DAY = "2026-09-30"


class PreparedReleaseTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.packet = self.root / "release"
        self.site = self.root / "site"
        self.shell = self.root / "shell"
        story = {
            "story_id": "paper:test",
            "title_zh": "測試論文",
            "summary_zh": "研究" * 200,
            "llm_evaluation": {
                "producer": "assistant-native-review",
                "rationale": "An original evidence-based English assessment.",
                "rationale_en": "An original evidence-based English assessment.",
                "rationale_zh": "這是保留原始證據與限制的繁體中文評分說明。",
            },
        }
        self.objects = {
            f"api/day/{DAY}.json": {
                "run_date": DAY,
                "top5": [story],
                "papers": [],
                "radar": [],
                "model_releases_by_entity": {},
            },
            f"api/review_runs/{DAY}.json": {
                "producer": "assistant-native-review",
                "candidate_count": 3,
                "evaluated_count": 2,
            },
            "api/catalog.json": {"latest_date": "2026-10-02"},
            "api/search.json": {"rows": []},
        }
        self.manifest = {
            "schema": 1,
            "branch": "gh-pages",
            "release_date": DAY,
            "latest_daily_date": "2026-10-02",
            "baseline_commit": BASE,
            "validation": {
                "candidate_count": 3,
                "evaluated_count": 2,
                "selected_count": 1,
                "selected_bilingual_evaluations": 1,
            },
        }
        self.write_packet()
        self.write(self.site, "CNAME", b"paper.dennysora.me\n")
        self.write(self.site, ".nojekyll", b"")
        self.write(self.site, "api/daily.json", b'{"run_date":"2026-10-02"}')
        self.write(self.site, "api/day/2026-09-29.json", b"original history")
        self.write(self.site, "assets/old.js", b"old cached shell")
        self.write(self.shell, "index.html", b"<html>new shell</html>")
        self.write(self.shell, "favicon.svg", b"<svg/>")
        self.write(self.shell, "assets/new.js", b"new shell")
        self.added: set[str] = set()
        self.head = BASE

    @staticmethod
    def write(root: Path, name: str, content: bytes) -> None:
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)

    def write_packet(self) -> None:
        rows = []
        for name, value in self.objects.items():
            content = json.dumps(value, ensure_ascii=False).encode()
            self.write(self.packet / "payload", name, content)
            rows.append(
                {
                    "path": name,
                    "size": len(content),
                    "sha256": hashlib.sha256(content).hexdigest(),
                    "git_blob": release.blob_sha(content),
                }
            )
        self.manifest["files"] = rows
        self.write(self.packet, "manifest.json", json.dumps(self.manifest).encode())

    def fake_git(self, site: Path, *args: str) -> str:
        self.assertEqual(site, self.site)
        if args == ("rev-parse", "HEAD"):
            return self.head
        if args == ("status", "--porcelain"):
            return ""
        if args[:2] == ("add", "--"):
            self.added = set(args[2:])
            return ""
        if args == ("diff", "--cached", "--name-only"):
            return "\n".join(sorted(self.added))
        raise AssertionError(f"Unexpected Git operation: {args}")

    def test_release_branch_push_is_valid(self) -> None:
        release.validate_trigger("release", "push", "branch")

    def test_other_refs_and_events_are_rejected(self) -> None:
        for name in (
            "main",
            "release/extra",
            "refs/heads/release",
            "2026.10.04.1",
        ):
            with self.subTest(name=name), self.assertRaises(ValueError):
                release.validate_trigger(name, "push", "branch")
        for event, kind in (
            ("push", "tag"),
            ("pull_request", "branch"),
            ("workflow_dispatch", "branch"),
            ("schedule", "branch"),
        ):
            with self.subTest(event=event), self.assertRaises(ValueError):
                release.validate_trigger("release", event, kind)

    def test_payload_hash_mismatch(self) -> None:
        self.write(self.packet / "payload", "api/search.json", b"tampered")
        with self.assertRaisesRegex(ValueError, "integrity"):
            release.validate_release(self.packet)

    def test_private_or_unexpected_payload_is_rejected(self) -> None:
        self.write(self.packet / "payload", "fulltext/paper.txt", b"private input")
        with self.assertRaisesRegex(ValueError, "Unexpected files"):
            release.validate_release(self.packet)

    def test_missing_translation_rejected_even_with_fresh_hashes(self) -> None:
        self.objects[f"api/day/{DAY}.json"]["top5"][0]["llm_evaluation"].pop(
            "rationale_en"
        )
        self.write_packet()
        with self.assertRaisesRegex(ValueError, "English rationale"):
            release.validate_release(self.packet)

    def test_stale_base_stops_before_any_write(self) -> None:
        before = (self.site / "api/daily.json").read_bytes()
        self.head = "b" * 40
        with (
            patch.object(release, "git", side_effect=self.fake_git),
            self.assertRaisesRegex(ValueError, "gh-pages changed"),
        ):
            release.stage_release(self.packet, self.site, self.shell)
        self.assertFalse((self.site / f"api/day/{DAY}.json").exists())
        self.assertEqual((self.site / "api/daily.json").read_bytes(), before)

    def test_identical_published_packet_and_shell_replay_without_writes(self) -> None:
        with patch.object(release, "git", side_effect=self.fake_git):
            release.stage_release(self.packet, self.site, self.shell)
        self.head = "b" * 40
        self.added.clear()
        with patch.object(release, "git", side_effect=self.fake_git):
            result = release.stage_release(self.packet, self.site, self.shell)
        self.assertTrue(result["already_published"])
        self.assertEqual(result["baseline_commit"], self.head)
        self.assertEqual(result["changed_paths"], [])
        self.assertEqual(self.added, set())

    def test_replay_requires_identical_data_and_shell(self) -> None:
        for changed in ("api/search.json", "index.html", "assets/new.js"):
            with self.subTest(changed=changed):
                self.head = BASE
                with patch.object(release, "git", side_effect=self.fake_git):
                    release.stage_release(self.packet, self.site, self.shell)
                self.write(self.site, changed, b"different published version")
                self.head = "b" * 40
                self.added.clear()
                with (
                    patch.object(release, "git", side_effect=self.fake_git),
                    self.assertRaisesRegex(ValueError, "gh-pages changed"),
                ):
                    release.stage_release(self.packet, self.site, self.shell)
                self.assertEqual(self.added, set())
                self.assertEqual(
                    (self.site / changed).read_bytes(), b"different published version"
                )

    def test_stage_preserves_history_domain_and_latest(self) -> None:
        with patch.object(release, "git", side_effect=self.fake_git):
            result = release.stage_release(self.packet, self.site, self.shell)
        self.assertEqual((self.site / "CNAME").read_bytes(), b"paper.dennysora.me\n")
        self.assertEqual(
            (self.site / "api/day/2026-09-29.json").read_bytes(), b"original history"
        )
        self.assertEqual(
            json.loads((self.site / "api/daily.json").read_text())["run_date"],
            "2026-10-02",
        )
        self.assertEqual(
            (self.site / "assets/old.js").read_bytes(), b"old cached shell"
        )
        self.assertEqual(
            (self.site / "404.html").read_bytes(),
            (self.shell / "index.html").read_bytes(),
        )
        self.assertNotIn("CNAME", result["changed_paths"])
        self.assertNotIn("api/daily.json", self.added)

    def test_shell_must_not_smuggle_data(self) -> None:
        self.write(self.shell, "api/daily.json", b"wrong data")
        with (
            patch.object(release, "git", side_effect=self.fake_git),
            self.assertRaisesRegex(ValueError, "Unexpected shell"),
        ):
            release.stage_release(self.packet, self.site, self.shell)
        self.assertFalse((self.site / f"api/day/{DAY}.json").exists())

    def test_payload_symlink_is_rejected(self) -> None:
        path = self.packet / "payload/api/search.json"
        path.unlink()
        path.symlink_to(self.site / "api/daily.json")
        with self.assertRaisesRegex(ValueError, "regular payload"):
            release.validate_release(self.packet)

    def test_dirty_checkout_stops_before_writes(self) -> None:
        with (
            patch.object(release, "git", side_effect=[BASE, " M CNAME"]),
            self.assertRaisesRegex(ValueError, "dirty Pages checkout"),
        ):
            release.stage_release(self.packet, self.site, self.shell)
        self.assertFalse((self.site / f"api/day/{DAY}.json").exists())

    def test_wrong_or_missing_custom_domain_stops_before_writes(self) -> None:
        for value in (b"wrong.example\n", None):
            with self.subTest(value=value):
                cname = self.site / "CNAME"
                if value is None:
                    cname.unlink()
                else:
                    cname.write_bytes(value)
                with (
                    patch.object(release, "git", side_effect=self.fake_git),
                    self.assertRaises(ValueError),
                ):
                    release.stage_release(self.packet, self.site, self.shell)
                self.assertFalse((self.site / f"api/day/{DAY}.json").exists())

    def test_missing_nojekyll_stops_before_writes(self) -> None:
        (self.site / ".nojekyll").unlink()
        with (
            patch.object(release, "git", side_effect=self.fake_git),
            self.assertRaisesRegex(ValueError, "regular payload"),
        ):
            release.stage_release(self.packet, self.site, self.shell)
        self.assertFalse((self.site / f"api/day/{DAY}.json").exists())

    def test_historical_latest_mismatch_stops_before_writes(self) -> None:
        self.write(self.site, "api/daily.json", b'{"run_date":"2026-10-03"}')
        with (
            patch.object(release, "git", side_effect=self.fake_git),
            self.assertRaisesRegex(ValueError, "stale latest"),
        ):
            release.stage_release(self.packet, self.site, self.shell)
        self.assertFalse((self.site / f"api/day/{DAY}.json").exists())

    def test_optional_daily_cannot_regress_latest(self) -> None:
        self.objects["api/daily.json"] = {"run_date": DAY}
        self.objects["api/catalog.json"]["latest_date"] = DAY
        self.manifest["latest_daily_date"] = DAY
        self.write_packet()
        with (
            patch.object(release, "git", side_effect=self.fake_git),
            self.assertRaisesRegex(ValueError, "must not move backwards"),
        ):
            release.stage_release(self.packet, self.site, self.shell)
        self.assertEqual(
            json.loads((self.site / "api/daily.json").read_text())["run_date"],
            "2026-10-02",
        )

    def test_destination_directory_symlink_is_rejected(self) -> None:
        destination = self.site / "api/review_runs"
        elsewhere = self.site / "untouched"
        elsewhere.mkdir()
        destination.symlink_to(elsewhere, target_is_directory=True)
        with (
            patch.object(release, "git", side_effect=self.fake_git),
            self.assertRaisesRegex(ValueError, "Unsafe destination"),
        ):
            release.stage_release(self.packet, self.site, self.shell)
        self.assertEqual(list(elsewhere.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
