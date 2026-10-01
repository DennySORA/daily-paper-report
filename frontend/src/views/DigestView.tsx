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
import { useLang } from '../state/lang'

function DayHeader({
  date,
  index,
  stories,
}: {
  date: string | null
  index: DayIndex
  stories: Story[]
}) {
  const { lang, t } = useLang()
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
          {shown ? formatDay(shown, lang) : t('日報', 'Daily digest')}
        </h1>
        {isLatest ? <Badge tone="accent">{t('最新', 'Latest')}</Badge> : null}
      </div>
      <nav className="flex items-center gap-1" aria-label={t('日期切換', 'Change date')}>
        {older ? (
          <Link
            to={route.day(older)}
            className="btn btn-icon"
            aria-label={t(`前一天：${older}`, `Previous day: ${older}`)}
            title={t('前一天（[）', 'Previous day ([)')}
          >
            <ChevronLeft {...ICON} />
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-icon"
            disabled
            aria-label={t('沒有更早的日報', 'No earlier digest')}
          >
            <ChevronLeft {...ICON} />
          </button>
        )}
        {shown ? <DatePicker index={index} current={shown} /> : null}
        {newer ? (
          <Link
            to={route.day(newer)}
            className="btn btn-icon"
            aria-label={t(`後一天：${newer}`, `Next day: ${newer}`)}
            title={t('後一天（]）', 'Next day (])')}
          >
            <ChevronRight {...ICON} />
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-icon"
            disabled
            aria-label={t('沒有更新的日報', 'No later digest')}
          >
            <ChevronRight {...ICON} />
          </button>
        )}
        {!isLatest && index.latest ? (
          <Link to={route.latest()} className="btn btn-quiet">
            {t('回到最新', 'Latest')}
          </Link>
        ) : null}
      </nav>
      {stories.length ? (
        <dl className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-meta">
          <div className="flex items-center gap-1.5">
            <dt className="text-fg-3">{t('中文導讀', 'Chinese guides')}</dt>
            <dd
              className={`mono m-0 ${translated < stories.length ? 'text-warning' : 'text-fg-2'}`}
            >
              {translated}/{stories.length}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="text-fg-3">{t('LLM 評分', 'LLM scored')}</dt>
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
  const { lang, t } = useLang()
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
        {run.success ? t('產生成功', 'Run succeeded') : t('產生失敗', 'Run failed')}
      </span>
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <Clock {...ICON_SM} />
        <span className="mono">{formatTimestamp(digest.generated_at, lang)}</span>
        <span>
          · {t('執行', 'took')} {formatDuration(run.started_at, run.finished_at, lang)}
        </span>
      </span>
      <span className="mono hidden whitespace-nowrap xl:inline">
        {t(
          `${formatInt(run.items_total, lang)} 項目 · ${formatInt(run.stories_total, lang)} 則故事`,
          `${formatInt(run.items_total, lang)} items · ${formatInt(run.stories_total, lang)} stories`,
        )}
      </span>
      <Link
        to={`${route.sources()}?date=${digest.run_date}`}
        className="ml-auto whitespace-nowrap hover:text-fg"
      >
        {t('來源', 'Sources')} {digest.sources_status.length}
        {failed ? (
          <span className="text-danger">
            {' '}
            · {t('失敗', 'failed')} {failed}
          </span>
        ) : null}
      </Link>
    </footer>
  )
}

export function DigestView() {
  const { date } = useParams()
  const path = safeDayPath(date)
  const [doc, retry] = useDoc<DailyDigest>(path)
  const index = useDayIndex()
  const { t } = useLang()
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
          title={
            date
              ? t(`${date} 沒有日報`, `No digest for ${date}`)
              : t('找不到日報', 'Digest not found')
          }
          actions={
            <>
              {older ? (
                <Link to={route.day(older)} className="btn">
                  {t('前一份：', 'Previous: ')}
                  {older}
                </Link>
              ) : null}
              {newer ? (
                <Link to={route.day(newer)} className="btn">
                  {t('後一份：', 'Next: ')}
                  {newer}
                </Link>
              ) : null}
              <Link to={route.archive()} className="btn btn-quiet">
                {t('查看封存', 'Open the archive')}
              </Link>
            </>
          }
        >
          {date && index.missing.has(date) ? (
            <p className="flex items-center gap-1.5">
              <TriangleAlert {...ICON_SM} className="text-warning" />
              {t('這一天的管線沒有產生資料。', 'The pipeline produced no data that day.')}
            </p>
          ) : (
            <p>
              {t('這個日期不在已發布的日報中。', 'This date is not among the published digests.')}
            </p>
          )}
        </StateMessage>
      </div>
    )
  }

  if (doc.status === 'error') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <ErrorMessage error={doc.error} onRetry={retry} what={t('日報', 'the digest')} />
      </div>
    )
  }

  if (!digest) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <LoadingRows label={t('載入日報中', 'Loading the digest')} />
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
      emptyTitle={t('這份日報沒有任何項目', 'This digest has no items')}
      emptyBody={t(
        '管線當天可能沒有收集到新的論文或文章。',
        'The pipeline may not have collected new papers or articles that day.',
      )}
    />
  )
}
