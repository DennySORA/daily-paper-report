import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock,
  TriangleAlert,
} from 'lucide-react'
import { useMemo } from 'react'
import { Link, useParams } from 'react-router'
import { route } from '../app/routes'
import { DatePicker } from '../components/Calendar'
import { ReaderLayout } from '../components/ReaderLayout'
import { Badge, ErrorMessage, ICON, ICON_SM, LoadingRows, StateMessage } from '../components/ui'
import { NotFoundError, safeDayPath, useDoc } from '../data/api'
import { neighbours, useDayIndex, type DayIndex } from '../data/days'
import { flatten } from '../data/filter'
import { digestGroups, type Story } from '../data/story'
import type { DailyDigest } from '../data/types'
import { formatDay, formatDuration, formatInt, formatTimestamp } from '../lib/format'

function DayHeader({
  date,
  index,
  stories,
}: {
  date: string | null
  index: DayIndex
  stories: Story[]
}) {
  const shown = date ?? index.latest
  const { older, newer } = shown ? neighbours(index.dates, shown) : { older: null, newer: null }
  const isLatest = shown !== null && shown === index.latest
  const translated = stories.filter((story) => story.summaryZh).length
  const evaluated = stories.filter((story) => story.evaluation).length

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3 pb-3 lg:px-3">
      <div className="flex min-w-0 items-center gap-2">
        <h1
          id="view-title"
          tabIndex={-1}
          className="text-title font-semibold whitespace-nowrap outline-none"
        >
          {shown ? formatDay(shown) : '日報'}
        </h1>
        {isLatest ? <Badge tone="accent">最新</Badge> : null}
      </div>
      <nav className="flex items-center gap-1" aria-label="日期切換">
        {older ? (
          <Link
            to={route.day(older)}
            className="btn btn-icon"
            aria-label={`前一天：${older}`}
            title="前一天（[）"
          >
            <ChevronLeft {...ICON} />
          </Link>
        ) : (
          <button type="button" className="btn btn-icon" disabled aria-label="沒有更早的日報">
            <ChevronLeft {...ICON} />
          </button>
        )}
        {shown ? <DatePicker index={index} current={shown} /> : null}
        {newer ? (
          <Link
            to={route.day(newer)}
            className="btn btn-icon"
            aria-label={`後一天：${newer}`}
            title="後一天（]）"
          >
            <ChevronRight {...ICON} />
          </Link>
        ) : (
          <button type="button" className="btn btn-icon" disabled aria-label="沒有更新的日報">
            <ChevronRight {...ICON} />
          </button>
        )}
        {!isLatest && index.latest ? (
          <Link to={route.latest()} className="btn btn-quiet">
            回到最新
          </Link>
        ) : null}
      </nav>
      {stories.length ? (
        <dl className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-meta">
          <div className="flex items-center gap-1.5">
            <dt className="text-fg-3">中文導讀</dt>
            <dd
              className={`mono m-0 ${translated < stories.length ? 'text-warning' : 'text-fg-2'}`}
            >
              {translated}/{stories.length}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="text-fg-3">LLM 評分</dt>
            <dd className="mono m-0 text-fg-2">
              {evaluated}/{stories.length}
            </dd>
          </div>
        </dl>
      ) : null}
    </header>
  )
}

function RunStatus({ digest }: { digest: DailyDigest }) {
  const run = digest.run_info
  const failed = digest.sources_status.filter((source) => source.status.includes('FAIL')).length
  return (
    <footer className="flex h-[26px] flex-none items-center gap-4 overflow-hidden border-t border-line-subtle bg-canvas px-3 text-caption text-fg-3">
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        {run.success ? (
          <CircleCheck {...ICON_SM} className="text-success" />
        ) : (
          <CircleAlert {...ICON_SM} className="text-danger" />
        )}
        {run.success ? '產生成功' : '產生失敗'}
      </span>
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <Clock {...ICON_SM} />
        <span className="mono">{formatTimestamp(digest.generated_at)}</span>
        <span>· 執行 {formatDuration(run.started_at, run.finished_at)}</span>
      </span>
      <span className="mono hidden whitespace-nowrap xl:inline">
        {formatInt(run.items_total)} 項目 · {formatInt(run.stories_total)} 則故事
      </span>
      <Link
        to={`${route.sources()}?date=${digest.run_date}`}
        className="ml-auto whitespace-nowrap hover:text-fg"
      >
        來源 {digest.sources_status.length}
        {failed ? <span className="text-danger"> · 失敗 {failed}</span> : null}
      </Link>
    </footer>
  )
}

export function DigestView() {
  const { date } = useParams()
  const path = safeDayPath(date)
  const [doc, retry] = useDoc<DailyDigest>(path)
  const index = useDayIndex()
  const digest = doc.status === 'ready' ? doc.data : null
  const groups = useMemo(() => (digest ? digestGroups(digest) : []), [digest])
  const shown = date ?? digest?.run_date ?? null
  const { older, newer } = shown ? neighbours(index.dates, shown) : { older: null, newer: null }

  const stories = useMemo(() => flatten(groups), [groups])
  const header = <DayHeader date={shown} index={index} stories={stories} />

  if (path === null || (doc.status === 'error' && doc.error instanceof NotFoundError)) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <StateMessage
          icon="empty"
          title={date ? `${date} 沒有日報` : '找不到日報'}
          actions={
            <>
              {older ? (
                <Link to={route.day(older)} className="btn">
                  前一份：{older}
                </Link>
              ) : null}
              {newer ? (
                <Link to={route.day(newer)} className="btn">
                  後一份：{newer}
                </Link>
              ) : null}
              <Link to={route.archive()} className="btn btn-quiet">
                查看封存
              </Link>
            </>
          }
        >
          {date && index.missing.has(date) ? (
            <p className="flex items-center gap-1.5">
              <TriangleAlert {...ICON_SM} className="text-warning" />
              這一天的管線沒有產生資料。
            </p>
          ) : (
            <p>這個日期不在已發布的日報中。</p>
          )}
        </StateMessage>
      </div>
    )
  }

  if (doc.status === 'error') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <ErrorMessage error={doc.error} onRetry={retry} what="日報" />
      </div>
    )
  }

  if (!digest) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <LoadingRows label="載入日報中" />
      </div>
    )
  }

  return (
    <ReaderLayout
      key={digest.run_date}
      groups={groups}
      basePath={date ? route.day(date) : route.latest()}
      header={header}
      status={<RunStatus digest={digest} />}
      prevDocHref={older ? route.day(older) : null}
      nextDocHref={newer ? route.day(newer) : null}
      emptyTitle="這份日報沒有任何項目"
      emptyBody="管線當天可能沒有收集到新的論文或文章。"
    />
  )
}
