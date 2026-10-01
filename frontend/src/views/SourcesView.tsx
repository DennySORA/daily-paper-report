import { Activity, CircleAlert, CircleCheck, Minus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { route } from '../app/routes'
import {
  Badge,
  ErrorMessage,
  ICON,
  ICON_SM,
  LoadingRows,
  StateMessage,
  type Tone,
} from '../components/ui'
import { NotFoundError, isIsoDate, paths, safeDayPath, useDoc } from '../data/api'
import type { DailyDigest, SourceStatus } from '../data/types'
import { formatDay, formatDuration, formatInt, formatTimestamp } from '../lib/format'

function sourceState(source: SourceStatus): { tone: Tone; label: string; order: number } {
  if (source.status.includes('FAIL')) return { tone: 'danger', label: '失敗', order: 0 }
  if (source.status === 'HAS_UPDATE') return { tone: 'success', label: '有新內容', order: 1 }
  if (source.status === 'NO_UPDATE') return { tone: 'neutral', label: '無變更', order: 2 }
  return { tone: 'warning', label: source.status, order: 1 }
}

const METHOD_LABEL: Record<string, string> = {
  rss_atom: 'RSS／Atom',
  arxiv_api: 'arXiv API',
  hf_org: 'Hugging Face 機構',
  hf_daily_papers: 'HF Daily Papers',
  html_list: 'HTML 清單',
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption text-fg-3">{label}</dt>
      <dd className="m-0 text-ui text-fg">{children}</dd>
    </div>
  )
}

export function SourcesView() {
  const [params] = useSearchParams()
  const requested = params.get('date')
  const path = isIsoDate(requested) ? safeDayPath(requested) : paths.latest
  const [doc, retry] = useDoc<DailyDigest>(path)

  const digest = doc.status === 'ready' ? doc.data : null
  const sources = digest
    ? [...digest.sources_status].sort(
        (a, b) =>
          sourceState(a).order - sourceState(b).order ||
          b.items_new - a.items_new ||
          a.name.localeCompare(b.name),
      )
    : []
  const failed = sources.filter((source) => sourceState(source).tone === 'danger').length
  const updated = sources.filter((source) => source.status === 'HAS_UPDATE').length

  return (
    <div className="scroll-region flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-3 px-4 pt-3 pb-3 lg:px-3">
        <Activity {...ICON} className="text-fg-3" />
        <h1 id="view-title" tabIndex={-1} className="text-title font-semibold outline-none">
          來源狀態
        </h1>
        {digest ? (
          <Link
            to={route.day(digest.run_date)}
            className="text-meta text-accent-fg hover:underline"
          >
            {formatDay(digest.run_date)} 的執行
          </Link>
        ) : null}
      </header>

      {doc.status === 'loading' ? <LoadingRows label="載入執行紀錄中" /> : null}
      {doc.status === 'error' ? (
        doc.error instanceof NotFoundError ? (
          <StateMessage title={`${requested ?? ''} 沒有執行紀錄`} />
        ) : (
          <ErrorMessage error={doc.error} onRetry={retry} what="執行紀錄" />
        )
      ) : null}

      {digest ? (
        <div className="flex flex-col gap-2 px-2 pb-4">
          <section className="panel p-4" aria-label="執行摘要">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 xl:grid-cols-6">
              <Fact label="結果">
                <span className="inline-flex items-center gap-1.5">
                  {digest.run_info.success ? (
                    <CircleCheck {...ICON_SM} className="text-success" />
                  ) : (
                    <CircleAlert {...ICON_SM} className="text-danger" />
                  )}
                  {digest.run_info.success ? '成功' : '失敗'}
                </span>
              </Fact>
              <Fact label="開始">
                <span className="mono text-meta">
                  {formatTimestamp(digest.run_info.started_at)}
                </span>
              </Fact>
              <Fact label="耗時">
                {formatDuration(digest.run_info.started_at, digest.run_info.finished_at)}
              </Fact>
              <Fact label="收集項目">
                <span className="mono">{formatInt(digest.run_info.items_total)}</span>
              </Fact>
              <Fact label="合併故事">
                <span className="mono">{formatInt(digest.run_info.stories_total)}</span>
              </Fact>
              <Fact label="來源">
                <span className="mono">
                  {sources.length} · 有新內容 {updated}
                  {failed ? <span className="text-danger"> · 失敗 {failed}</span> : null}
                </span>
              </Fact>
            </dl>
            {digest.run_info.error_summary ? (
              <p className="mono mt-3 rounded-md bg-sunken px-3 py-2 text-meta break-all text-danger">
                {digest.run_info.error_summary}
              </p>
            ) : null}
          </section>

          <section className="panel overflow-hidden" aria-labelledby="sources-table-title">
            <h2
              id="sources-table-title"
              className="border-b border-line-subtle px-4 py-2.5 text-heading font-semibold"
            >
              各來源抓取結果
            </h2>
            <div
              className="overflow-x-auto"
              role="region"
              aria-label="來源表格（可水平捲動）"
              tabIndex={0}
            >
              <table className="w-full min-w-[760px] border-collapse text-meta">
                <thead>
                  <tr className="bg-sunken text-left text-caption text-fg-3">
                    <th scope="col" className="px-4 py-2 font-medium">
                      來源
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      狀態
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      方式
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      新增／更新
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      最新項目
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      說明
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((source) => {
                    const state = sourceState(source)
                    return (
                      <tr
                        key={source.source_id}
                        className="border-t border-line-subtle align-top hover:bg-elevated"
                      >
                        <th scope="row" className="px-4 py-2 text-left font-normal">
                          <span className="block text-fg">{source.name}</span>
                          <span className="mono block text-caption text-fg-3">
                            {source.source_id} · tier {source.tier}
                          </span>
                        </th>
                        <td className="px-3 py-2">
                          <Badge tone={state.tone}>
                            {state.tone === 'danger' ? (
                              <CircleAlert {...ICON_SM} />
                            ) : state.tone === 'success' ? (
                              <CircleCheck {...ICON_SM} />
                            ) : (
                              <Minus {...ICON_SM} />
                            )}
                            {state.label}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-fg-2">
                          {METHOD_LABEL[source.method] ?? source.method}
                        </td>
                        <td className="mono px-3 py-2 text-right text-fg-2">
                          {source.items_new} / {source.items_updated}
                        </td>
                        <td className="mono px-3 py-2 whitespace-nowrap text-fg-3">
                          {source.newest_item_date ? source.newest_item_date.slice(0, 10) : '—'}
                        </td>
                        <td className="px-4 py-2 text-fg-3">
                          <span className="block" lang="en">
                            {source.reason_text}
                          </span>
                          {source.remediation_hint ? (
                            <span className="block text-warning" lang="en">
                              {source.remediation_hint}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
