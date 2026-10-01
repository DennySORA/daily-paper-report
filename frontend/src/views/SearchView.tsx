import { Search } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useRef } from 'react'
import { Link, useSearchParams } from 'react-router'
import { storyHref } from '../app/routes'
import { ErrorMessage, ICON, LoadingRows, Meter, StateMessage } from '../components/ui'
import { NotFoundError, paths, useDoc } from '../data/api'
import { searchStories } from '../data/search'
import { SECTION_LABEL, type SectionKey } from '../data/story'
import { topicInfo } from '../data/topics'
import type { SearchIndex } from '../data/types'
import { formatInt, formatScore } from '../lib/format'
import { useLibrary } from '../state/library'

const RESULT_LIMIT = 500
const KIND_FILTER = { all: '全部類型', arxiv: 'arXiv 論文', blog: '文章' } as const
type KindFilter = keyof typeof KIND_FILTER

export function SearchView() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const kind = (params.get('k') as KindFilter | null) ?? 'all'
  const zhOnly = params.get('zh') === '1'
  const deferred = useDeferredValue(query)
  const [doc, retry] = useDoc<SearchIndex>(paths.search)
  const library = useLibrary()
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
  }, [])

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (!value) next.delete(key)
      else next.set(key, value)
    }
    setParams(next, { replace: true })
  }

  const hits = useMemo(() => {
    if (doc.status !== 'ready') return []
    // Filter every match first, then cap, so a narrow filter still finds older items.
    return searchStories(doc.data, deferred, Number.POSITIVE_INFINITY).filter(
      (hit) =>
        (kind === 'all' ||
          (kind === 'arxiv' ? hit.linkType === 'arxiv' : hit.linkType !== 'arxiv')) &&
        (!zhOnly || hit.titleZh),
    )
  }, [doc, deferred, kind, zhOnly])

  return (
    <div className="scroll-region flex min-h-0 flex-1 flex-col">
      <header className="flex flex-col gap-3 px-4 pt-3 pb-3 lg:px-3">
        <div className="flex items-center gap-3">
          <Search {...ICON} className="text-fg-3" />
          <h1 id="view-title" tabIndex={-1} className="text-title font-semibold outline-none">
            搜尋
          </h1>
          {doc.status === 'ready' ? (
            <span className="text-meta text-fg-3">{formatInt(doc.data.rows.length)} 篇已收錄</span>
          ) : null}
        </div>
        <div className="flex max-w-[880px] flex-wrap items-center gap-2">
          <label className="relative flex min-w-[240px] flex-1 items-center">
            <span className="sr-only">搜尋關鍵字</span>
            <Search
              size={16}
              strokeWidth={1.75}
              aria-hidden
              className="pointer-events-none absolute left-3 text-fg-3"
            />
            <input
              ref={input}
              name="q"
              type="search"
              className="input h-10 w-full pl-9 text-heading"
              placeholder="標題、主題、作者或 arXiv 編號（以空白分隔多個關鍵字）"
              value={query}
              onChange={(event) => update({ q: event.target.value })}
            />
          </label>
          <label className="flex items-center">
            <span className="sr-only">類型</span>
            <select
              name="kind"
              className="input h-10"
              value={kind}
              onChange={(event) =>
                update({ k: event.target.value === 'all' ? null : event.target.value })
              }
            >
              {(Object.keys(KIND_FILTER) as KindFilter[]).map((key) => (
                <option key={key} value={key}>
                  {KIND_FILTER[key]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-meta text-fg-2">
            <input
              type="checkbox"
              name="zh"
              className="size-3.5 accent-accent"
              checked={zhOnly}
              onChange={(event) => update({ zh: event.target.checked ? '1' : null })}
            />
            只看有中文導讀
          </label>
        </div>
      </header>

      <div className="px-2 pb-4">
        <div className="panel max-w-[1100px]">
          {doc.status === 'loading' ? <LoadingRows label="載入搜尋索引中" count={5} /> : null}
          {doc.status === 'error' ? (
            doc.error instanceof NotFoundError ? (
              <StateMessage title="搜尋索引尚未產生">
                索引會在下一次資料發布時建立。目前可在各日報清單中使用篩選。
              </StateMessage>
            ) : (
              <ErrorMessage error={doc.error} onRetry={retry} what="搜尋索引" />
            )
          ) : null}
          {doc.status === 'ready' && !deferred.trim() ? (
            <StateMessage title="輸入關鍵字開始搜尋">
              例如：<span className="mono">agent memory</span>、<span className="mono">推理</span>、
              <span className="mono">2609.38149</span>
            </StateMessage>
          ) : null}
          {doc.status === 'ready' && deferred.trim() ? (
            hits.length ? (
              <>
                <p
                  className="border-b border-line-subtle px-4 py-2 text-meta text-fg-3"
                  aria-live="polite"
                >
                  {hits.length > RESULT_LIMIT
                    ? `${hits.length} 筆結果，顯示前 ${RESULT_LIMIT} 筆`
                    : `${hits.length} 筆結果`}
                </p>
                <ol className="flex flex-col gap-0.5 p-1.5">
                  {hits.slice(0, RESULT_LIMIT).map((hit) => (
                    <li key={hit.id}>
                      <Link
                        to={storyHref(hit.date, hit.id)}
                        className="row grid grid-cols-[minmax(0,1fr)] gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4"
                      >
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span
                            className={`text-ui ${hit.id in library.read ? 'text-fg-2' : 'font-medium text-fg'}`}
                          >
                            {hit.titleZh ?? hit.title}
                          </span>
                          {hit.titleZh ? (
                            <span className="truncate text-meta text-fg-3" lang="en">
                              {hit.title}
                            </span>
                          ) : null}
                          <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-caption text-fg-3">
                            <span className="text-entity">
                              {SECTION_LABEL[hit.section as SectionKey] ?? hit.section}
                            </span>
                            {hit.topics.slice(0, 3).map((topic) => (
                              <span key={topic}>{topicInfo(topic).label}</span>
                            ))}
                            {hit.authors[0] ? (
                              <span lang="en">{hit.authors.join(', ')}</span>
                            ) : null}
                          </span>
                        </span>
                        <span className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
                          <span className="mono text-meta text-fg-2">{hit.date}</span>
                          {hit.score !== null ? (
                            <span className="flex items-center gap-1.5">
                              <Meter value={hit.score} className="h-1 w-8" />
                              <span className="mono text-caption text-fg-2">
                                {formatScore(hit.score)}
                              </span>
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <StateMessage title={`沒有符合「${deferred}」的結果`}>
                試著減少關鍵字，或改用英文標題中的詞彙。
              </StateMessage>
            )
          ) : null}
        </div>
      </div>
    </div>
  )
}
