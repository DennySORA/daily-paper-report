import { CalendarRange, ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useParams } from 'react-router'
import { route } from '../app/routes'
import { ReaderLayout } from '../components/ReaderLayout'
import { Badge, ErrorMessage, ICON, ICON_SM, LoadingRows, StateMessage } from '../components/ui'
import { NotFoundError, safeReportPath, useCatalog, useReport, useReportIndex } from '../data/api'
import { reportGroups } from '../data/story'
import type { ReportDigest, ReportIndex, ReportIndexEntry, ReportType } from '../data/types'
import { formatInt, formatTimestamp } from '../lib/format'
import { paragraphs } from '../lib/text'
import { useLang } from '../state/lang'

const TYPE_LABEL: Record<ReportType, { zh: string; en: string }> = {
  weekly: { zh: '週報', en: 'Weekly' },
  monthly: { zh: '月報', en: 'Monthly' },
}

const reportHref = (type: ReportType, period: string) =>
  type === 'weekly' ? route.weekly(period) : route.monthly(period)

function siblings(index: ReportIndex | null, type: ReportType, period: string) {
  const entries = [...(index?.[type] ?? [])].sort((a, b) => a.period_id.localeCompare(b.period_id))
  const position = entries.findIndex((entry) => entry.period_id === period)
  return {
    older: position > 0 ? (entries[position - 1]?.period_id ?? null) : null,
    newer:
      position !== -1 && position < entries.length - 1
        ? (entries[position + 1]?.period_id ?? null)
        : null,
  }
}

function Coverage({ covered, missing }: { covered: number; missing: string[] }) {
  const { t } = useLang()
  if (missing.length === 0) return <Badge tone="success">{t('資料完整', 'Complete')}</Badge>
  return (
    <Badge tone="warning" title={missing.join(', ')}>
      <TriangleAlert {...ICON_SM} />
      {t(
        `缺 ${missing.length} 天${covered ? `（涵蓋 ${covered} 天）` : ''}`,
        `${missing.length} days missing${covered ? ` (${covered} covered)` : ''}`,
      )}
    </Badge>
  )
}

function ReportHeader({
  report,
  type,
  period,
  index,
}: {
  report: ReportDigest | null
  type: ReportType
  period: string
  index: ReportIndex | null
}) {
  const { lang, t } = useLang()
  const { older, newer } = siblings(index, type, period)
  const label = TYPE_LABEL[type][lang]
  // Report titles and summaries are written in Chinese by the report LLM.
  const title = report?.title ?? `${label} ${period}`
  const summary = report?.summary ?? null

  return (
    <header className="flex flex-col gap-2 px-4 pt-3 pb-3 lg:px-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge tone="accent">{label}</Badge>
        <span className="mono text-meta text-fg-2">{period}</span>
        {report ? (
          <span className="mono text-meta text-fg-3">
            {report.period_start} – {report.period_end}
          </span>
        ) : null}
        {report ? (
          <Coverage covered={report.covered_dates.length} missing={report.missing_dates} />
        ) : null}
        <nav
          className="ml-auto flex items-center gap-1"
          aria-label={t(`${label}切換`, `${label} navigation`)}
        >
          {older ? (
            <Link
              to={reportHref(type, older)}
              className="btn btn-icon"
              aria-label={t(`上一期：${older}`, `Previous: ${older}`)}
              title={t('上一期（[）', 'Previous ([)')}
            >
              <ChevronLeft {...ICON} />
            </Link>
          ) : (
            <button
              type="button"
              className="btn btn-icon"
              disabled
              aria-label={t('沒有更早的報告', 'No earlier report')}
            >
              <ChevronLeft {...ICON} />
            </button>
          )}
          {newer ? (
            <Link
              to={reportHref(type, newer)}
              className="btn btn-icon"
              aria-label={t(`下一期：${newer}`, `Next: ${newer}`)}
              title={t('下一期（]）', 'Next (])')}
            >
              <ChevronRight {...ICON} />
            </Link>
          ) : (
            <button
              type="button"
              className="btn btn-icon"
              disabled
              aria-label={t('沒有更新的報告', 'No later report')}
            >
              <ChevronRight {...ICON} />
            </button>
          )}
          <Link to={route.reports()} className="btn btn-quiet">
            {t('全部報告', 'All reports')}
          </Link>
        </nav>
      </div>
      <h1
        id="view-title"
        tabIndex={-1}
        lang={report ? 'zh-Hant' : undefined}
        className="text-title font-semibold text-balance outline-none"
      >
        {title}
      </h1>
      {summary ? (
        <details className="group max-w-[860px]">
          <summary className="cursor-pointer text-meta text-fg-3 select-none">
            {t('本期摘要', 'Summary')}
          </summary>
          <div className="prose-zh mt-1 text-ui" lang="zh-Hant">
            {paragraphs(summary).map((paragraph, position) => (
              <p key={position}>{paragraph}</p>
            ))}
          </div>
        </details>
      ) : null}
    </header>
  )
}

export function ReportView({ type }: { type: ReportType }) {
  const { period = '' } = useParams()
  const { lang, t } = useLang()
  const path = safeReportPath(type, period)
  const [doc, retry] = useReport(path)
  const [indexDoc] = useReportIndex()
  const index = indexDoc.status === 'ready' ? indexDoc.data : null
  const report = doc.status === 'ready' ? doc.data : null
  const [catalog] = useCatalog()
  const entities = catalog.status === 'ready' ? catalog.data.entities : undefined
  const groups = useMemo(() => (report ? reportGroups(report, entities) : []), [report, entities])
  const { older, newer } = siblings(index, type, period)
  const label = TYPE_LABEL[type][lang]
  const header = <ReportHeader report={report} type={type} period={period} index={index} />

  if (path === null || (doc.status === 'error' && doc.error instanceof NotFoundError)) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <StateMessage
          title={t(`找不到${label} ${period}`, `${label} report ${period} not found`)}
          actions={
            <Link to={route.reports()} className="btn">
              {t('查看全部報告', 'See all reports')}
            </Link>
          }
        />
      </div>
    )
  }
  if (doc.status === 'error') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <ErrorMessage error={doc.error} onRetry={retry} what={t('報告', 'the report')} />
      </div>
    )
  }
  if (!report) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <LoadingRows label={t('載入報告中', 'Loading the report')} />
      </div>
    )
  }

  return (
    <ReaderLayout
      key={`${type}-${period}`}
      groups={groups}
      basePath={reportHref(type, period)}
      header={header}
      status={
        <footer className="flex h-[26px] flex-none items-center gap-4 border-t border-line-subtle bg-canvas px-3 text-caption text-fg-3">
          <span className="mono">
            {t('產生於', 'Generated')} {formatTimestamp(report.generated_at, lang)}
          </span>
          <span className="mono">
            {t(
              `考量 ${formatInt(report.stories_considered, lang)} 則論文 · ${formatInt(report.blog_stories_considered, lang)} 則文章`,
              `${formatInt(report.stories_considered, lang)} papers · ${formatInt(report.blog_stories_considered, lang)} articles considered`,
            )}
          </span>
        </footer>
      }
      prevDocHref={older ? reportHref(type, older) : null}
      nextDocHref={newer ? reportHref(type, newer) : null}
      emptyTitle={t('本期沒有推薦項目', 'No recommendations in this period')}
      emptyBody={
        report.missing_dates.length
          ? t(
              `這段期間有 ${report.missing_dates.length} 天缺少日報，無法彙整推薦。`,
              `${report.missing_dates.length} days in this period have no digest to draw from.`,
            )
          : t(
              '這段期間沒有符合條件的論文或文章。',
              'No papers or articles qualified in this period.',
            )
      }
    />
  )
}

function ReportRow({ entry }: { entry: ReportIndexEntry }) {
  const { t } = useLang()
  return (
    <li>
      <Link
        to={reportHref(entry.report_type, entry.period_id)}
        className="row grid grid-cols-[minmax(0,1fr)] gap-1 px-4 py-3 sm:grid-cols-[112px_minmax(0,1fr)_auto] sm:gap-4"
      >
        <span className="flex flex-col">
          <span className="mono text-ui text-fg">{entry.period_id}</span>
          <span className="mono text-caption text-fg-3">
            {entry.period_start.slice(5)} – {entry.period_end.slice(5)}
          </span>
        </span>
        <span className="flex min-w-0 flex-col gap-1" lang="zh-Hant">
          <span className="text-ui font-medium text-fg">{entry.title}</span>
          {entry.summary ? (
            <span className="line-clamp-2 text-meta text-fg-3">{entry.summary}</span>
          ) : null}
        </span>
        <span className="flex flex-wrap items-start gap-1.5 sm:flex-col sm:items-end">
          <span className="mono text-meta text-fg-2">
            {t(
              `${entry.recommendation_count} 論文 · ${entry.blog_recommendation_count} 文章`,
              `${entry.recommendation_count} papers · ${entry.blog_recommendation_count} articles`,
            )}
          </span>
          {entry.missing_dates.length ? (
            <Badge tone="warning">
              {t(
                `缺 ${entry.missing_dates.length} 天`,
                `${entry.missing_dates.length} days missing`,
              )}
            </Badge>
          ) : null}
        </span>
      </Link>
    </li>
  )
}

export function ReportsIndexView() {
  const { lang, t } = useLang()
  const [doc, retry] = useReportIndex()
  return (
    <div className="scroll-region flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-3 px-4 pt-3 pb-3 lg:px-3">
        <CalendarRange {...ICON} className="text-fg-3" />
        <h1 id="view-title" tabIndex={-1} className="text-title font-semibold outline-none">
          {t('週報與月報', 'Weekly and monthly reports')}
        </h1>
        {doc.status === 'ready' ? (
          <span className="text-meta text-fg-3">
            {t(
              `${doc.data.weekly.length} 份週報 · ${doc.data.monthly.length} 份月報`,
              `${doc.data.weekly.length} weekly · ${doc.data.monthly.length} monthly`,
            )}
          </span>
        ) : null}
      </header>
      {doc.status === 'loading' ? (
        <LoadingRows label={t('載入報告索引中', 'Loading the report index')} />
      ) : null}
      {doc.status === 'error' ? (
        <ErrorMessage error={doc.error} onRetry={retry} what={t('報告索引', 'the report index')} />
      ) : null}
      {doc.status === 'ready' ? (
        <div className="grid grid-cols-1 gap-2 px-2 pb-4 xl:grid-cols-2">
          {(['monthly', 'weekly'] as const).map((type) => {
            const entries = [...doc.data[type]].sort((a, b) =>
              b.period_id.localeCompare(a.period_id),
            )
            return (
              <section
                key={type}
                className="panel flex min-h-0 flex-col"
                aria-labelledby={`reports-${type}`}
              >
                <h2
                  id={`reports-${type}`}
                  className="flex items-baseline gap-2 border-b border-line-subtle px-4 py-2.5 text-heading font-semibold"
                >
                  {TYPE_LABEL[type][lang]}
                  <span className="mono text-meta font-normal text-fg-3">{entries.length}</span>
                </h2>
                {entries.length ? (
                  <ul className="flex flex-col gap-0.5 p-1.5">
                    {entries.map((entry) => (
                      <ReportRow key={entry.period_id} entry={entry} />
                    ))}
                  </ul>
                ) : (
                  <StateMessage
                    title={t(
                      `還沒有${TYPE_LABEL[type].zh}`,
                      `No ${TYPE_LABEL[type].en.toLowerCase()} reports yet`,
                    )}
                  />
                )}
              </section>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
