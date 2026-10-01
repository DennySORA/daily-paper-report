# Daily Paper Report

Daily Paper Report collects AI research and technical news, deduplicates stories,
extracts complete paper text, scores papers with DeepSeek, writes Traditional Chinese
research guides, and publishes them to a static React reader.

## Runtime architecture

- The data pipeline runs on the Nano server in an ARM64 Docker container.
- `deepseek-v4-flash` is the only LLM and uses its 1M-token context window.
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
# Set DEEPSEEK_API_KEY in .env
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
`prepare-public.py` also fills Traditional Chinese text from the translation cache
into any published story that lacks it; `scripts/translate-missing.py` translates
the stories that have no cached translation yet (run it under the pipeline lock or
against a private copy and merge with `--merge`). The site
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
