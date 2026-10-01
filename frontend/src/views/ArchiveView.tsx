import { Archive, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { route } from '../app/routes'
import { MonthGrid } from '../components/Calendar'
import { ICON, ICON_SM, LoadingRows, StateMessage } from '../components/ui'
import { useDayIndex } from '../data/days'
import { formatDay, formatMonth } from '../lib/format'

export function ArchiveView() {
  const index = useDayIndex()
  const months = [...new Set([...index.dates, ...index.missing].map((day) => day.slice(0, 7)))]
    .sort()
    .reverse()

  return (
    <div className="scroll-region flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-3 px-4 pt-3 pb-3 lg:px-3">
        <Archive {...ICON} className="text-fg-3" />
        <h1 id="view-title" tabIndex={-1} className="text-title font-semibold outline-none">
          封存
        </h1>
        {index.status === 'ready' ? (
          <span className="text-meta text-fg-3">
            {index.dates.length} 份日報
            {index.missing.size ? (
              <span className="text-warning"> · 缺 {index.missing.size} 天</span>
            ) : null}
          </span>
        ) : null}
      </header>

      {index.status === 'loading' ? <LoadingRows label="載入日報清單中" /> : null}
      {index.status === 'error' ? (
        <StateMessage icon="error" title="無法載入日報清單">
          請稍後重新整理頁面。
        </StateMessage>
      ) : null}

      <div className="grid grid-cols-1 gap-2 px-2 pb-4 md:grid-cols-2 2xl:grid-cols-3">
        {months.map((month) => {
          const days = index.dates.filter((day) => day.startsWith(month))
          const missing = [...index.missing].filter((day) => day.startsWith(month)).sort()
          return (
            <section
              key={month}
              className="panel flex flex-col gap-3 p-4"
              aria-labelledby={`month-${month}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 id={`month-${month}`} className="text-heading font-semibold">
                  {formatMonth(month)}
                </h2>
                <span className="text-meta text-fg-3">
                  {days.length} 份
                  {missing.length ? (
                    <span className="text-warning"> · 缺 {missing.length} 天</span>
                  ) : null}
                </span>
              </div>
              <MonthGrid month={month} index={index} current={null} dense={false} />
              {index.partial ? null : (
                <ol className="flex flex-col gap-1 border-t border-line-subtle pt-3">
                  {days.map((day) => {
                    const info = index.info.get(day)
                    const lead = info?.lead_title_zh ?? info?.lead_title
                    return (
                      <li key={day}>
                        <Link
                          to={route.day(day)}
                          className="row grid grid-cols-[96px_minmax(0,1fr)] gap-3 px-2 py-1.5 text-meta"
                        >
                          <span className="mono text-fg-2">{formatDay(day).slice(5)}</span>
                          <span className="truncate text-fg-3">{lead ?? '—'}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ol>
              )}
              {missing.length ? (
                <p className="flex items-start gap-1.5 text-caption text-fg-3">
                  <TriangleAlert {...ICON_SM} className="mt-0.5 flex-none text-warning" />
                  <span>
                    缺少日報：
                    <span className="mono">{missing.map((day) => day.slice(5)).join('、')}</span>
                  </span>
                </p>
              ) : null}
            </section>
          )
        })}
      </div>
    </div>
  )
}
