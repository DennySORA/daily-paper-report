"""Execute the real Pages polling block against a local fake gh executable."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import textwrap
import unittest
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
COMMIT = "a" * 40
OTHER = "b" * 40
FAKE_GH = """#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
root = Path(os.environ["FAKE_API_ROOT"])
case = json.loads((root / "case.json").read_text())
args = sys.argv[1:]
with (root / "calls.jsonl").open("a") as log:
    log.write(json.dumps(args) + "\\n")
if "POST" in args:
    raise SystemExit(23 if case.get("request_failure") else 0)
if any(arg.endswith("/git/ref/heads/gh-pages") for arg in args):
    if case.get("tip_failure"):
        raise SystemExit(25)
    print(case["tip"])
elif any(arg.endswith("/pages/builds/latest") for arg in args):
    if case.get("get_failure"):
        raise SystemExit(24)
    state = root / "poll-count"
    index = int(state.read_text()) if state.exists() else 0
    state.write_text(str(index + 1))
    builds = case["builds"]
    print(json.dumps(builds[min(index, len(builds) - 1)]))
else:
    raise SystemExit("Unexpected fake gh call")
"""


@dataclass
class PollResult:
    returncode: int
    stdout: str
    stderr: str
    poll_count: int


def polling_script(workflow: str) -> str:
    last_step = workflow.split("      - name: Request and verify the Pages build\n", 1)[
        1
    ]
    return textwrap.dedent(last_step.split("        run: |\n", 1)[1])


class PagesPollTests(unittest.TestCase):
    def run_case(self, case: dict, script: str | None = None) -> PollResult:
        self.assertIsNotNone(shutil.which("jq"), "The CI runner must provide jq")
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "case.json").write_text(json.dumps(case))
            binary = root / "bin"
            binary.mkdir()
            for name, body in (("gh", FAKE_GH), ("sleep", "#!/bin/sh\nexit 0\n")):
                path = binary / name
                path.write_text(body)
                path.chmod(0o700)
            environment = {
                **os.environ,
                "PATH": str(binary) + os.pathsep + os.environ["PATH"],
                "FAKE_API_ROOT": str(root),
                "REPOSITORY": "DennySORA/daily-paper-report",
                "PAGES_COMMIT": COMMIT,
                "GH_TOKEN": "fake-test-token",
            }
            if script is None:
                script = polling_script(
                    (ROOT / ".github/workflows/frontend.yml").read_text()
                )
            process = subprocess.run(  # noqa: S603
                ["bash", "-c", script],
                env=environment,
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
            count_path = root / "poll-count"
            return PollResult(
                process.returncode,
                process.stdout,
                process.stderr,
                int(count_path.read_text()) if count_path.exists() else 0,
            )

    def test_matching_built_commit_and_current_tip_succeed(self) -> None:
        result = self.run_case(
            {"tip": COMMIT, "builds": [{"commit": COMMIT, "status": "built"}]}
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Pages published " + COMMIT, result.stdout)

    def test_superseded_tip_must_not_report_success(self) -> None:
        result = self.run_case(
            {"tip": OTHER, "builds": [{"commit": COMMIT, "status": "built"}]}
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("superseded", result.stderr)
        self.assertNotIn("Pages published", result.stdout)

    def test_stale_latest_response_waits_for_requested_commit(self) -> None:
        result = self.run_case(
            {
                "tip": COMMIT,
                "builds": [
                    {"commit": OTHER, "status": "built"},
                    {"commit": COMMIT, "status": "built"},
                ],
            }
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Pages published " + COMMIT, result.stdout)
        self.assertEqual(result.poll_count, 2)

    def test_request_api_failure_is_not_a_warning_success(self) -> None:
        result = self.run_case({"tip": COMMIT, "builds": [], "request_failure": True})
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("Pages published", result.stdout)

    def test_requested_commit_build_error_fails(self) -> None:
        result = self.run_case(
            {"tip": COMMIT, "builds": [{"commit": COMMIT, "status": "errored"}]}
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("Pages published", result.stdout)

    def test_permanently_stale_or_queued_build_has_bounded_timeout(self) -> None:
        for build in (
            {"commit": OTHER, "status": "built"},
            {"commit": COMMIT, "status": "queued"},
        ):
            with self.subTest(build=build):
                result = self.run_case({"tip": COMMIT, "builds": [build]})
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.poll_count, 40)
                self.assertIn("did not finish", result.stderr)
                self.assertNotIn("Pages published", result.stdout)

    def test_latest_build_get_failure_stops(self) -> None:
        result = self.run_case({"tip": COMMIT, "builds": [], "get_failure": True})
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("Pages published", result.stdout)

    def test_tip_lookup_failure_stops(self) -> None:
        result = self.run_case(
            {
                "tip": COMMIT,
                "builds": [{"commit": COMMIT, "status": "built"}],
                "tip_failure": True,
            }
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("Pages published", result.stdout)


if __name__ == "__main__":
    unittest.main()
