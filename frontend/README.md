# Frontend

The reader for [paper.dennysora.me](https://paper.dennysora.me): a static React
site that reads the report data the Nano pipeline publishes under `api/`.

Stack: React 19, React Router 8 (`HashRouter`), Tailwind CSS 4, Vite 8,
TypeScript 6, Vitest, pnpm 11 (pinned in `package.json`).

## Commands

```bash
pnpm install --frozen-lockfile
pnpm run dev                       # proxies /api to the live site
DPR_DATA_DIR=/path/to/public pnpm run dev   # serves a local public/ (with api/) instead
pnpm run verify                    # typecheck, lint, format check, tests, build
```

`DPR_DATA_DIR` must point at a directory that contains `api/`, for example a
pipeline `runtime/public` after `scripts/prepare-public.py` has run.

## Data contract

| File                                                            | Writer                      | Used for                                 |
| --------------------------------------------------------------- | --------------------------- | ---------------------------------------- |
| `api/daily.json`                                                | renderer                    | Latest digest (`#/`), source status      |
| `api/day/YYYY-MM-DD.json`                                       | renderer                    | One day's digest                         |
| `api/catalog.json`                                              | `scripts/prepare-public.py` | Day list, counts, gaps, entity names     |
| `api/search.json`                                               | `scripts/prepare-public.py` | Site-wide search and the command palette |
| `api/reports/index.json`, `api/reports/{weekly,monthly}/*.json` | report command              | Weekly and monthly reports               |

`src/data/types.ts` mirrors these shapes. Missing optional fields degrade
visibly (no translation, no LLM score, no catalog) instead of failing.

## URLs

Views live in the hash because new days are published without rebuilding the
site: `#/`, `#/day/<date>`, `#/archive`, `#/reports`, `#/weekly/<id>`,
`#/monthly/<id>`, `#/search?q=`, `#/saved`, `#/sources`. Reader state is in the
query (`p` story, `s` section, `t` topic, `q` filter, `u=1` unread, `sort`).
`404.html` is the same page and maps addresses of the previous site
(`/day/<date>.html`, `/reports/weekly/<id>.html`, …) to these routes.

## Deployment

`.github/workflows/frontend.yml` verifies every change under `frontend/` and,
on `main`, replaces the site shell on `gh-pages` (everything except `api/`).
The Nano's `scripts/publish-pages.sh` replaces only `api/`. Neither writer
force-pushes; both retry on a rejected fast-forward.

## Design contract

- **Task**: read the daily AI-paper digest in Traditional Chinese, triage by
  LLM scorecard, keep a reading list, revisit days and periodic reports.
- **Composition**: workbench reader — top bar with the command palette and
  the language switch, primary navigation (200 px, or a 56 px rail below
  1280 px and whenever it is collapsed with `B`), ranked list (320–420 px,
  hidden with `F` for full-width reading) and a raised reading pane with its
  own toolbar. Below 1024 px the list is the page and the reader opens as a
  full-screen layer with back/forward navigation.
- **Languages** (requested by the owner): the interface and the reading
  language switch between Traditional Chinese and English, stored in
  `dpr.prefs.v1`. Strings sit next to their component as `t(zh, en)`; there
  is no i18n package or key catalogue. 摘要／Summary shows the Chinese guide
  or the English abstract for the chosen language, with the other one behind
  a disclosure (`E`). Text that only exists in the other language (missing
  guides, LLM assessment, evidence, report summaries) can be translated
  on-device through the browser Translator API, labelled as such; browsers
  without it say so instead.
- **Signatures**: the six-dimension scorecard (compact strip under the title,
  sticky side panel when the pane is wider than 1024 px); keyboard triage
  (`J`/`K`/`O`/`P`/`S`/`M`/`E`, `1–5`, `[`/`]`, `F`, `B`, `?`); `⌘K` palette that
  jumps to dates, views and any published story.
- **Typography**: system sans with PingFang TC / Noto Sans TC; Chinese guide
  at 16/28 px capped at 680 px; English text 15/26 px; mono only for ids,
  scores, dates and shortcuts.
- **Palette** (dark only, tokens in `src/styles/index.css`): blue for actions
  and the score meters, violet for entity/type, teal for arXiv ids and paper
  section references, green/amber/coral only for observed states (full-text
  evaluation, missing translation or days, failed sources).
- **Material**: one raised region (reading pane), panel inner edges, opaque
  overlays; no glow, blur or decorative motion.
- **Motion**: 140 ms colour transitions, 180 ms reader entrance, 150 ms
  dialog pop; `prefers-reduced-motion` removes them.
- **States**: loading rows, empty day, filtered-to-nothing, missing day with
  neighbours, missing story id, fetch error with retry, missing translation,
  missing evaluation, missing search index, storage unavailable.
- **Reading state**: read marks, saved papers, language, collapsed panels and
  disclosure preferences stay in this browser's `localStorage` (`dpr.*.v1`).
