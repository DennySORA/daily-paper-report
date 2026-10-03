"""Validate source-bound assistant scorecards before ranking or publication."""

from __future__ import annotations

import hashlib
import json
import math
import re
from pathlib import Path
from typing import Any

from src.features.fulltext.models import CONFIDENCE_MULTIPLIERS, FullTextStatus
from src.features.llm.processor import _COMPONENT_WEIGHTS, _weighted_score
from src.features.llm.prompts import CURRENT_SCORING_PROMPT_VERSION
from src.features.translation.models import TranslationEntry


PRODUCER = "assistant-native-review"
MIN_GUIDE_CHARS = 350
MAX_GUIDE_CHARS = 600
_MIN_CJK_GUIDE_CHARS = 100
_MIN_CJK_RATIONALE_CHARS = 10
_MIN_LATIN_RATIONALE_CHARS = 20
_CJK = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff]")


def read_object(path: Path) -> dict[str, Any]:
    """Read an object, rejecting malformed or non-object interchange files."""
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise TypeError(f"Expected JSON object: {path.name}")
    return value


def digest_file(path: Path) -> str:
    """Bind reviews to the exact exported request bytes."""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_review(request_path: Path, review_path: Path) -> dict[str, Any]:
    """Require complete, finite components and matching source provenance.

    This checks integrity and completeness, not whether a human or assistant
    genuinely read the paper. That remains an explicit review responsibility.
    """
    request = read_object(request_path)
    review = read_object(review_path)
    if request.get("skip"):
        raise ValueError("A skipped candidate cannot receive a scorecard")
    for field, expected in (
        ("key", request["key"]),
        ("id", request["story_id"]),
        ("producer", PRODUCER),
        ("request_sha256", digest_file(request_path)),
    ):
        if review.get(field) != expected:
            raise ValueError(f"Review {field} does not match exported request")
    document = request.get("document") or {}
    content_hash = document.get("sha256", "")
    if review.get("fulltext_sha256") != content_hash:
        raise ValueError("Review fulltext hash does not match exported source")
    if (
        document
        and hashlib.sha256(document["text"].encode()).hexdigest() != content_hash
    ):
        raise ValueError("Exported document text does not match its hash")
    components = _validate_components_and_evidence(review)
    confidence = (
        CONFIDENCE_MULTIPLIERS[FullTextStatus(document["status"])] if document else 1.0
    )
    return {
        "score": _weighted_score(components) * confidence,
        "components": components,
        "confidence": confidence,
        "rationale": review["rationale"],
        "topics": review["topics"],
        "evidence": review["evidence"],
        "fulltext_status": document.get("status", "abstract_only"),
        "fulltext_sha256": content_hash,
        "token_usage": {},
        "prompt_version": CURRENT_SCORING_PROMPT_VERSION,
        "model": PRODUCER,
        "producer": PRODUCER,
        "request_sha256": review["request_sha256"],
    }


def _validate_components_and_evidence(review: dict[str, Any]) -> dict[str, float]:
    components = review.get("components")
    if not isinstance(components, dict) or set(components) != set(_COMPONENT_WEIGHTS):
        raise ValueError("All six rubric components are required")
    for value in components.values():
        if (
            isinstance(value, bool)
            or not isinstance(value, int | float)
            or not math.isfinite(value)
            or not 0 <= value <= 1
        ):
            raise ValueError("Components must be finite numbers from zero to one")
    for field in ("rationale", "evidence"):
        if not review.get(field):
            raise ValueError(f"Review must contain {field}")
    if not isinstance(review["rationale"], str):
        raise TypeError("Review rationale must be text")
    if not review["rationale"].strip():
        raise ValueError("Review rationale cannot be whitespace")
    for field in ("evidence", "topics"):
        values = review.get(field)
        if not isinstance(values, list) or any(
            not isinstance(x, str) or not x.strip() for x in values
        ):
            raise ValueError(f"Review {field} must be a list of strings")
    return components


def validate_guide(
    request_path: Path, review_path: Path, guide_path: Path | None = None
) -> TranslationEntry:
    """Validate a Chinese guide against the same reviewed source."""
    request = read_object(request_path)
    if not request.get("skip"):
        validate_review(request_path, review_path)
    guide = read_object(guide_path or review_path)
    for field, expected in (
        ("id", request["story_id"]),
        ("request_sha256", digest_file(request_path)),
        ("producer", PRODUCER),
    ):
        if guide.get(field) != expected:
            raise ValueError(f"Guide {field} does not match exported request")
    title, summary = guide.get("title_zh"), guide.get("summary_zh")
    if not isinstance(title, str) or not title.strip():
        raise ValueError("Selected story requires a Chinese title")
    if (
        not isinstance(summary, str)
        or not MIN_GUIDE_CHARS <= len(summary) <= MAX_GUIDE_CHARS
    ):
        raise ValueError("Selected story requires a 350–600 character Chinese guide")
    if not _CJK.search(title) or len(_CJK.findall(summary)) < _MIN_CJK_GUIDE_CHARS:
        raise ValueError(
            "Chinese title and substantial Chinese guide text are required"
        )
    content_hash = (request.get("document") or {}).get("sha256", "")
    if guide.get("fulltext_sha256") != content_hash:
        raise ValueError("Guide fulltext hash does not match exported source")
    return TranslationEntry(
        story_id=request["story_id"],
        title_zh=title,
        summary_zh=summary,
        fulltext_sha256=content_hash,
        model=PRODUCER,
    )


def validate_rationale_translation(
    request_path: Path,
    review_path: Path,
    translation_path: Path | None = None,
    *,
    language: str = "zh",
) -> str:
    """Require faithful-review translation provenance without invalidating scores.

    A companion translation binds both the source request and the English
    rationale. Embedded translations already share the original review object.
    Semantic translation fidelity remains the native reviewer's responsibility.
    """
    validate_review(request_path, review_path)
    review = read_object(review_path)
    translated = read_object(translation_path) if translation_path else review
    if translation_path:
        for field in ("id", "producer", "request_sha256", "fulltext_sha256"):
            if translated.get(field) != review.get(field):
                raise ValueError(f"Rationale translation {field} differs from review")
        expected = hashlib.sha256(review["rationale"].encode()).hexdigest()
        if translated.get("rationale_sha256") != expected:
            raise ValueError("Rationale translation does not match original rationale")
    if language == "en":
        text = translated.get("rationale_en")
        if text is None and _is_english_rationale(review["rationale"]):
            text = review["rationale"]
        if not isinstance(text, str) or not _is_english_rationale(text):
            raise ValueError("Selected evaluation requires an English rationale")
        return text
    if language != "zh":
        raise ValueError("Unsupported rationale translation language")
    text = translated.get("rationale_zh")
    if not isinstance(text, str) or len(_CJK.findall(text)) < _MIN_CJK_RATIONALE_CHARS:
        raise ValueError("Selected evaluation requires a Chinese rationale")
    return text


def _is_english_rationale(text: str) -> bool:
    """Allow technical CJK names while rejecting a Chinese-only English field."""
    latin = len(re.findall(r"[A-Za-z]", text))
    cjk = len(_CJK.findall(text))
    return latin >= _MIN_LATIN_RATIONALE_CHARS and latin > cjk * 2
