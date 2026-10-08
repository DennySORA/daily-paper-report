"""Feedparser UTC tuples must not depend on the host's local timezone."""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
PROBE = """
import json
import time
from datetime import UTC, datetime

import feedparser

from src.collectors.arxiv.rss import ArxivRssCollector
from src.collectors.rss_atom import RssAtomCollector

# Only this disposable subprocess's timezone changes. The parent and host do not.
time.tzset()
expected = datetime(2026, 10, 8, 0, 43, 37, tzinfo=UTC)
later = datetime(2026, 10, 8, 1, 43, 37, tzinfo=UTC)
utc_tuple = expected.utctimetuple()
later_tuple = later.utctimetuple()
invalid = (999999, 10, 8, 0, 43, 37, 3, 281, 0)
cases = []
for date in ('2026-10-08T00:43:37Z', '2026-10-08T09:43:37+09:00',
             '2026-10-07T19:43:37-05:00'):
    atom = ('<feed xmlns="http://www.w3.org/2005/Atom"><entry>'
            '<title>Timezone boundary</title><published>' + date +
            '</published></entry></feed>')
    cases.append(('atom-' + date, feedparser.parse(atom).entries[0], expected, 'high'))
for date in ('Thu, 08 Oct 2026 00:43:37 GMT', 'Thu, 08 Oct 2026 09:43:37 +0900',
             'Wed, 07 Oct 2026 19:43:37 -0500'):
    rss = ('<rss version="2.0"><channel><item><title>Timezone boundary</title>'
           '<pubDate>' + date + '</pubDate></item></channel></rss>')
    cases.append(('rss-' + date, feedparser.parse(rss).entries[0], expected, 'high'))
cases.extend([
    ('published-before-updated', {'published_parsed': utc_tuple,
      'updated_parsed': later_tuple}, expected, 'high'),
    ('updated-tuple-before-published-string', {'updated_parsed': utc_tuple,
      'published': 'Thu, 08 Oct 2026 01:43:37 GMT'}, expected, 'medium'),
    ('invalid-published-tuple-falls-back', {'published_parsed': invalid,
      'updated_parsed': utc_tuple}, expected, 'medium'),
    ('published-string-before-updated-string', {'published_parsed': invalid,
      'updated_parsed': invalid, 'published': 'Thu, 08 Oct 2026 09:43:37 +0900',
      'updated': 'Thu, 08 Oct 2026 01:43:37 GMT'}, expected, 'high'),
    ('invalid-published-string-falls-back', {'published': 'invalid',
      'updated': 'Wed, 07 Oct 2026 19:43:37 -0500'}, expected, 'medium'),
    ('no-date', {}, None, 'low'),
    ('all-invalid', {'published_parsed': invalid, 'updated_parsed': invalid,
      'published': 'invalid', 'updated': 'invalid'}, None, 'low'),
])
results = []
for collector in (RssAtomCollector(), ArxivRssCollector()):
    for name, raw_entry, wanted_date, wanted_confidence in cases:
        value, confidence = collector._extract_date(feedparser.FeedParserDict(raw_entry))
        assert value == wanted_date, (type(collector).__name__, name, value, wanted_date)
        assert confidence.value == wanted_confidence, (name, confidence)
        results.append({'collector': type(collector).__name__, 'case': name,
                        'utc': value.isoformat() if value else None,
                        'confidence': confidence.value})
print(json.dumps(results))
"""


@pytest.mark.parametrize("timezone", ["UTC0", "JST-9", "EST5"])
def test_feed_date_extraction_is_timezone_independent(timezone: str) -> None:
    """Both collectors preserve exact UTC dates and existing fallback priority."""
    result = subprocess.run(  # noqa: S603
        [sys.executable, "-c", PROBE],
        cwd=ROOT,
        env={**os.environ, "TZ": timezone, "PYTHONDONTWRITEBYTECODE": "1"},
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    cases = json.loads(result.stdout)
    assert len(cases) == 26
    assert {case["collector"] for case in cases} == {
        "RssAtomCollector",
        "ArxivRssCollector",
    }
