# Daily Paper Report

Daily Paper Report collects AI research and technical news, deduplicates stories,
extracts complete paper text, scores papers with MiMo-V2.6-Pro, writes Traditional Chinese
research guides, and publishes them to a static React reader.

## Runtime architecture

- The data pipeline runs on the Nano server in an ARM64 Docker container.
- Paper scoring (which papers are selected) and report metadata use the `LLM_*`
  settings: `xiaomi/mimo-v2.6-pro` through OpenRouter by default.
- Chinese titles and guides use only the `TRANSLATION_*` settings: DeepSeek's own API
  with `deepseek-v4-flash` in non-thinking JSON mode. Without `TRANSLATION_API_KEY` the
  translation phase is skipped; it never falls back to the scoring provider.
- Full paper text is cached only on the Nano; it is never published or pushed to GitHub.
- GitHub Pages serves `paper.dennysora.me` from `gh-pages`, which has two writers
  with disjoint paths: the Nano publishes validated report data under `api/`
  (`scripts/publish-pages.sh`), and the `Frontend` workflow builds `frontend/` and
  replaces everything else (`.github/workflows/frontend.yml`). Neither force-pushes.
- SQLite and small JSON caches are backed up to the `state` branch.

## Local development

Requirements: Python 3.13, [uv](https://docs.astral.sh/uv/), Node.js 22, and pnpm.

```bash
cp .env.example .env
# Set LLM_API_KEY (scoring) and TRANSLATION_API_KEY (DeepSeek) in .env
uv sync --frozen
uv run pytest
uv run ruff check .
uv run mypy src
cd frontend && pnpm install --frozen-lockfile && pnpm run verify
```

The reader's commands, data contract and design contract are in
[frontend/README.md](frontend/README.md).

Run one UTC digest:

```bash
uv run python main.py run \
  --config config/sources.yaml \
  --entities config/entities.yaml \
  --topics config/topics.yaml \
  --state runtime/data/state.sqlite \
  --out runtime/public \
  --tz UTC \
  --date "$(date -u +%F)" \
  --lookback 24
```

The score cache is versioned. Each entry contains the final score, six scorecard
components, confidence, evidence, matched topics, model/prompt versions, and full-text
provenance hash/status. Translation cache entries are invalidated when the paper content
or prompt changes.

## Nano installation and operation

The target host is `dennysora-nano@192.168.30.100:19845`. From a checked-out copy:

```bash
sudo ./scripts/install-nano.sh
sudoedit /etc/daily-paper-report/daily-paper-report.env
sudo systemctl start daily-paper-report@daily.service
journalctl -u daily-paper-report@daily.service -f
```

If the SSH account cannot run passwordless sudo, place the checkout under
`~/daily-paper-report/app`, then run `scripts/install-nano-user.sh`. This rootless mode uses user cron and a
uv-managed Python 3.13. Its dispatcher wakes every 30 minutes but starts work
only at the exact UTC times below.

Timers use UTC and a shared six-hour lock:

- Daily: every day at 00:00
- Weekly: Monday at 00:30, covering the previous ISO week
- Monthly: day 1 at 01:00, covering the previous month

After each run, `scripts/prepare-public.py` finalizes `api/` (archive dates,
`catalog.json`, `search.json`), `scripts/publish-pages.sh` publishes that data
without the private score/translation caches, and `scripts/publish-state.sh`
snapshots state. Both publishers refuse invalid inputs before pushing.
Chinese titles and guides come from the pipeline's LLM translation phase. After a
daily run, `scripts/translate-missing.py` retries that translation for the last
two days' stories that still lack it (a transient provider error no longer leaves a
day untranslated), and `prepare-public.py` fills cached translations into any
published story that lacks them. Run the tool by hand under the pipeline lock, or
against a private copy and fold the result in with `--merge`. The site
itself deploys from GitHub Actions whenever `frontend/` changes on `main`
(`gh workflow run frontend.yml` redeploys it manually). The Nano requires a
repository-specific SSH deploy key with write access; personal SSH keys must not be copied.

## Storage

Default Nano paths:

```text
/srv/daily-paper-report/app       checked-out application
/srv/daily-paper-report/data      canonical SQLite state
/srv/daily-paper-report/public    generated static site
/srv/daily-paper-report/cache     private extracted full text
/srv/daily-paper-report/backups   rotating SQLite backups
```

See [the recovery guide](docs/RESET-GUIDE.md) for restore and republish procedures.

## Offline assistant reviews

Historical runs can export every recovered candidate for source-bound assistant
scorecards and Traditional Chinese guides without calling a model API. Missing
reviews fail closed; existing ranking and quota rules are retained. See
[the offline review workflow](docs/ASSISTANT-REVIEW.md) for snapshot requirements,
commands, publication checks, and known historical-replay limitations.
