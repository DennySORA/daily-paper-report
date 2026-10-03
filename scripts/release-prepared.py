"""Validate and stage an offline-reviewed release; never collect or call models."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path
from typing import Any


TAG = re.compile(r"([0-9]{4})\.([0-9]{2})\.([0-9]{2})\.([1-9][0-9]*)\Z")
SHA = re.compile(r"[0-9a-f]{40}\Z")
CJK = re.compile(r"[\u3400-\u9fff]")
MIN_GUIDE = 350
MAX_GUIDE = 600
MIN_CHINESE = 100
MIN_RATIONALE_CHINESE = 12
MIN_RATIONALE_LATIN = 20
PRODUCER = "assistant-native-review"
DOMAIN = "paper.dennysora.me"


def validate_tag(tag: str, event: str, ref_type: str) -> None:
    """Reject branches, manual events and malformed calendar-version tags."""
    match = TAG.fullmatch(tag)
    if event != "push" or ref_type != "tag" or not match:
        raise ValueError("Only a YYYY.MM.DD.N tag push can release this site")
    date(*(int(value) for value in match.groups()[:3]))


def git(site: Path, *args: str) -> str:
    """Run a fixed Git subcommand without shell interpolation."""
    result = subprocess.run(  # noqa: S603
        ["git", "-C", str(site), *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def file_bytes(root: Path, relative: str) -> bytes:
    """Read a regular, non-symlink file strictly inside its declared root."""
    path = root / relative
    if root.is_symlink():
        raise ValueError("Payload root cannot be a symlink")
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"Expected a regular payload file: {relative}")
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError(f"Payload escapes its root: {relative}")
    return path.read_bytes()


def blob_sha(data: bytes) -> str:
    """Match Git's object identifier, not a security authentication primitive."""
    return hashlib.sha1(  # noqa: S324
        b"blob " + str(len(data)).encode() + b"\0" + data
    ).hexdigest()


def selected_stories(day: dict[str, Any]) -> list[dict[str, Any]]:
    stories = [
        story for section in ("top5", "papers", "radar") for story in day[section]
    ]
    stories.extend(
        story for group in day["model_releases_by_entity"].values() for story in group
    )
    return stories


def validate_story(story: dict[str, Any]) -> bool:
    """Check published bilingual fields without recomputing a model score."""
    title, summary = story.get("title_zh", ""), story.get("summary_zh", "")
    if not CJK.search(title) or not MIN_GUIDE <= len(summary) <= MAX_GUIDE:
        raise ValueError("Selected entry lacks a validated Chinese title or guide")
    if len(CJK.findall(summary)) < MIN_CHINESE:
        raise ValueError("Selected guide has insufficient Chinese prose")
    card = story.get("llm_evaluation")
    if card is None:
        return False
    if card.get("producer") != PRODUCER or not card.get("rationale"):
        raise ValueError("Selected scorecard lacks native review provenance")
    if len(CJK.findall(card.get("rationale_zh", ""))) < MIN_RATIONALE_CHINESE:
        raise ValueError("Selected scorecard lacks Chinese rationale")
    if len(re.findall(r"[A-Za-z]", card.get("rationale_en", ""))) < MIN_RATIONALE_LATIN:
        raise ValueError("Selected scorecard lacks English rationale")
    return True


def validate_public_data(manifest: dict[str, Any], payload: dict[str, bytes]) -> None:
    day_name = manifest["release_date"]
    day = json.loads(payload[f"api/day/{day_name}.json"])
    audit = json.loads(payload[f"api/review_runs/{day_name}.json"])
    catalog = json.loads(payload["api/catalog.json"])
    json.loads(payload["api/search.json"])
    if day["run_date"] != day_name or audit["producer"] != PRODUCER:
        raise ValueError("Release day or native review audit does not match")
    checks = manifest["validation"]
    stories = selected_stories(day)
    scored = sum(validate_story(story) for story in stories)
    if (
        len(stories) != checks["selected_count"]
        or scored != checks["selected_bilingual_evaluations"]
    ):
        raise ValueError("Selected guide or bilingual scorecard counts differ")
    if (
        audit["candidate_count"] != checks["candidate_count"]
        or audit["evaluated_count"] != checks["evaluated_count"]
    ):
        raise ValueError("Candidate review counts differ")
    if catalog["latest_date"] != manifest["latest_daily_date"]:
        raise ValueError("Catalog latest date differs from the release contract")
    if "api/daily.json" in payload and (
        day_name != manifest["latest_daily_date"]
        or json.loads(payload["api/daily.json"])["run_date"] != day_name
    ):
        raise ValueError("A historical day cannot replace the latest daily report")


def validate_release(root: Path) -> tuple[dict[str, Any], dict[str, bytes]]:
    manifest = json.loads(file_bytes(root, "manifest.json"))
    day_name = manifest["release_date"]
    if date.fromisoformat(day_name).isoformat() != day_name:
        raise ValueError("Release date is not canonical ISO format")
    if (
        manifest["schema"] != 1
        or manifest["branch"] != "gh-pages"
        or not SHA.fullmatch(manifest["baseline_commit"])
    ):
        raise ValueError("Unsupported manifest or baseline")
    allowed = {
        "api/catalog.json",
        "api/search.json",
        f"api/day/{day_name}.json",
        f"api/review_runs/{day_name}.json",
    }
    records = manifest["files"]
    names = [record["path"] for record in records]
    if len(set(names)) != len(names) or set(names) not in (
        allowed,
        allowed | {"api/daily.json"},
    ):
        raise ValueError("Release paths are not the exact public allowlist")
    payload: dict[str, bytes] = {}
    for record in records:
        content = file_bytes(root / "payload", record["path"])
        if (
            len(content) != record["size"]
            or hashlib.sha256(content).hexdigest() != record["sha256"]
            or blob_sha(content) != record["git_blob"]
        ):
            raise ValueError(f"Payload integrity mismatch: {record['path']}")
        payload[record["path"]] = content
    actual = {
        str(path.relative_to(root / "payload"))
        for path in (root / "payload").rglob("*")
        if path.is_file()
    }
    if actual != set(names):
        raise ValueError("Unexpected files in the prepared payload")
    validate_public_data(manifest, payload)
    return manifest, payload


def shell_files(root: Path) -> dict[str, bytes]:
    output = {}
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        name = str(path.relative_to(root))
        if name not in {"index.html", "favicon.svg"} and not name.startswith("assets/"):
            raise ValueError(f"Unexpected shell output: {name}")
        output[name] = file_bytes(root, name)
    if "index.html" not in output:
        raise ValueError("Built shell is missing index.html")
    output["404.html"] = output["index.html"]
    return output


def stage_release(root: Path, site: Path, shell: Path) -> dict[str, Any]:
    """Overlay only approved files on an exact clean baseline; never push."""
    manifest, payload = validate_release(root)
    if git(site, "rev-parse", "HEAD") != manifest["baseline_commit"]:
        raise ValueError(
            "gh-pages changed; prepare a fresh release against the new tip"
        )
    if git(site, "status", "--porcelain"):
        raise ValueError("Refusing to use a dirty Pages checkout")
    cname = file_bytes(site, "CNAME")
    if cname.decode().strip() != DOMAIN:
        raise ValueError("Unexpected Pages custom domain")
    file_bytes(site, ".nojekyll")
    previous_latest = json.loads(file_bytes(site, "api/daily.json"))["run_date"]
    if (
        "api/daily.json" not in payload
        and previous_latest != manifest["latest_daily_date"]
    ):
        raise ValueError("Historical release would use a stale latest report")
    if "api/daily.json" in payload and previous_latest > manifest["release_date"]:
        raise ValueError("Latest report must not move backwards")
    updates = {**payload, **shell_files(shell)}
    for name in updates:
        destination = site / name
        linked = any(
            parent.is_symlink()
            for parent in (destination, *destination.parents)
            if parent.is_relative_to(site)
        )
        if linked or not destination.resolve().is_relative_to(site.resolve()):
            raise ValueError(f"Unsafe destination: {name}")
    for name, content in updates.items():
        destination = site / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)
    git(site, "add", "--", *sorted(updates))
    changed = set(git(site, "diff", "--cached", "--name-only").splitlines())
    if not changed <= set(updates) or file_bytes(site, "CNAME") != cname:
        raise ValueError("Unexpected staged path or custom-domain mutation")
    return {
        "release_date": manifest["release_date"],
        "baseline_commit": manifest["baseline_commit"],
        "changed_paths": sorted(changed),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["validate", "stage"])
    parser.add_argument("--release-dir", type=Path, required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--event", default="push")
    parser.add_argument("--ref-type", default="tag")
    parser.add_argument("--site-dir", type=Path)
    parser.add_argument("--shell-dir", type=Path)
    args = parser.parse_args()
    validate_tag(args.tag, args.event, args.ref_type)
    if args.command == "validate":
        manifest, _ = validate_release(args.release_dir)
        result = {"release_date": manifest["release_date"], "payload_valid": True}
    else:
        if args.site_dir is None or args.shell_dir is None:
            parser.error("stage requires --site-dir and --shell-dir")
        result = stage_release(args.release_dir, args.site_dir, args.shell_dir)
    sys.stdout.write(json.dumps(result, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
