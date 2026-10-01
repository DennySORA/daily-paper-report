#!/usr/bin/env bash
# Publish validated report data (api/) to the gh-pages branch.
# The site shell next to it (index.html, 404.html, assets/) is owned by
# .github/workflows/frontend.yml; this script never modifies those paths.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLIC_DIR="${PUBLIC_DIR:-${ROOT_DIR}/runtime/public}"
REMOTE_URL="${REMOTE_URL:-git@github.com:DennySORA/daily-paper-report.git}"
PAGES_BRANCH="${PAGES_BRANCH:-gh-pages}"
DOMAIN="${PAGES_DOMAIN:-paper.dennysora.me}"
DEPLOY_KEY="${DEPLOY_KEY:-/etc/daily-paper-report/github_deploy_key}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
# Pipeline caches kept in PUBLIC_DIR/api that the site never reads; the state
# branch backs them up (scripts/publish-state.sh).
PRIVATE_CACHES=(llm_scores.json translations_zh.json)
if test -f "${DEPLOY_KEY}"; then
  export GIT_SSH_COMMAND="ssh -i ${DEPLOY_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
fi

"${PYTHON_BIN}" - "${PUBLIC_DIR}" <<'PY'
import json
import sys
from pathlib import Path

api = Path(sys.argv[1]).resolve() / "api"
required = [
    api / "daily.json",
    api / "catalog.json",
    api / "search.json",
    api / "reports" / "index.json",
]
missing = [str(path) for path in required if not path.is_file()]
if missing:
    raise SystemExit(
        "Refusing to publish; missing: "
        + ", ".join(missing)
        + " (run scripts/prepare-public.py first)"
    )
for path in required:
    json.loads(path.read_text(encoding="utf-8"))
for forbidden in (".env", "state.sqlite", "fulltext", "backups"):
    if any(path.name == forbidden for path in api.rglob("*")):
        raise SystemExit(f"Refusing to publish forbidden artifact: {forbidden}")
PY

TEMP_DIR="$(mktemp -d)"
cleanup() { rm -rf -- "${TEMP_DIR}"; }
trap cleanup EXIT

git -C "${TEMP_DIR}" init -q
git -C "${TEMP_DIR}" remote add origin "${REMOTE_URL}"
git -C "${TEMP_DIR}" config user.name "daily-paper-report-nano"
git -C "${TEMP_DIR}" config user.email "daily-paper-report-nano@users.noreply.github.com"

# The frontend workflow can push between our fetch and push. A rejected
# fast-forward rebuilds the data commit on the new tip; nothing is forced.
for attempt in 1 2 3 4 5; do
  if git -C "${TEMP_DIR}" fetch -q --depth=1 origin "${PAGES_BRANCH}" 2>/dev/null; then
    git -C "${TEMP_DIR}" checkout -q -B "${PAGES_BRANCH}" FETCH_HEAD
  else
    git -C "${TEMP_DIR}" checkout -q --orphan "${PAGES_BRANCH}"
  fi

  rm -rf -- "${TEMP_DIR}/api"
  mkdir -p "${TEMP_DIR}/api"
  cp -R "${PUBLIC_DIR}/api/." "${TEMP_DIR}/api/"
  for cache in "${PRIVATE_CACHES[@]}"; do
    rm -f -- "${TEMP_DIR}/api/${cache}"
  done
  : > "${TEMP_DIR}/.nojekyll"
  printf '%s\n' "${DOMAIN}" > "${TEMP_DIR}/CNAME"

  git -C "${TEMP_DIR}" add -A -- api .nojekyll CNAME
  if git -C "${TEMP_DIR}" diff --cached --quiet; then
    echo "Pages data unchanged."
    exit 0
  fi
  git -C "${TEMP_DIR}" commit -q -m "chore(pages): publish data $(date -u +%F)"
  if git -C "${TEMP_DIR}" push -q origin "HEAD:${PAGES_BRANCH}"; then
    echo "Published report data to ${PAGES_BRANCH} (attempt ${attempt})."
    exit 0
  fi
  echo "Push to ${PAGES_BRANCH} rejected; retrying on the latest tip." >&2
  sleep $((attempt * 5))
done

echo "Could not publish report data to ${PAGES_BRANCH} after 5 attempts." >&2
exit 1
