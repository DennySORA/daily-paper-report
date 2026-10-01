import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { route } from '../app/routes'
import type { DayIndex } from '../data/days'
import { formatDay, formatMonth } from '../lib/format'
import { useLang } from '../state/lang'
import { ICON, ICON_SM } from './ui'

const WEEK_HEAD = {
  zh: ['日', '一', '二', '三', '四', '五', '六'],
  en: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
}

function monthCells(month: string): Array<string | null> {
  const [year, value] = month.split('-').map(Number) as [number, number]
  const first = new Date(Date.UTC(year, value - 1, 1))
  const length = new Date(Date.UTC(year, value, 0)).getUTCDate()
  const cells: Array<string | null> = Array.from({ length: first.getUTCDay() }, () => null)
  for (let day = 1; day <= length; day += 1) cells.push(`${month}-${String(day).padStart(2, '0')}`)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

/** Arrow keys move between enabled day links; Home/End jump to the first/last. */
function onGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
  const keys: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
  const links = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-day-link]')]
  const current = links.indexOf(document.activeElement as HTMLElement)
  if (current === -1) return
  let next: number | null = null
  if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = links.length - 1
  else if (event.key in keys) {
    const target = (links[current]?.dataset.day ?? '').slice(0, 10)
    const offset = keys[event.key] ?? 0
    const wanted = new Date(`${target}T00:00:00Z`)
    wanted.setUTCDate(wanted.getUTCDate() + offset)
    const iso = wanted.toISOString().slice(0, 10)
    const exact = links.findIndex((link) => link.dataset.day === iso)
    next =
      exact !== -1
        ? exact
        : offset > 0
          ? links.findIndex((link) => (link.dataset.day ?? '') > iso)
          : links.findLastIndex((link) => (link.dataset.day ?? '') < iso)
  }
  if (next === null || next < 0 || !links[next]) return
  event.preventDefault()
  links[next]?.focus()
}

export function MonthGrid({
  month,
  index,
  current,
  onPick,
  dense = true,
}: {
  month: string
  index: DayIndex
  current: string | null
  onPick?: () => void
  dense?: boolean
}) {
  const { lang, t } = useLang()
  const published = new Set(index.dates)
  return (
    <div role="group" aria-label={formatMonth(month, lang)} onKeyDown={onGridKeyDown}>
      <div className="grid grid-cols-7 gap-1" aria-hidden="true">
        {WEEK_HEAD[lang].map((day, position) => (
          <span key={position} className="text-center text-caption text-fg-3">
            {day}
          </span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {monthCells(month).map((day, position) => {
          if (!day) return <span key={`blank-${position}`} />
          const label = String(Number(day.slice(8)))
          const info = index.info.get(day)
          if (!published.has(day)) {
            const missing = index.missing.has(day)
            return (
              <span
                key={day}
                className={`flex flex-col items-center justify-center rounded-md text-meta ${dense ? 'h-9' : 'h-14'} ${missing ? 'border border-dashed border-line text-fg-disabled' : 'text-fg-disabled/60'}`}
                title={
                  missing
                    ? t(`${formatDay(day, lang)} 沒有日報`, `No digest on ${formatDay(day, lang)}`)
                    : undefined
                }
              >
                <span className="mono">{label}</span>
                {missing && !dense ? <span className="text-caption">{t('缺', 'none')}</span> : null}
                <span className="sr-only">
                  {missing ? t(`${day} 沒有日報`, `no digest on ${day}`) : ''}
                </span>
              </span>
            )
          }
          const isCurrent = day === current
          const evaluated = info ? info.evaluated > 0 : false
          return (
            <Link
              key={day}
              to={route.day(day)}
              onClick={onPick}
              data-day-link
              data-day={day}
              aria-current={isCurrent ? 'date' : undefined}
              aria-label={`${formatDay(day, lang)}${
                info
                  ? t(
                      `，${info.top5 + info.papers + info.radar} 篇`,
                      `, ${info.top5 + info.papers + info.radar} items`,
                    )
                  : ''
              }`}
              className={`flex flex-col items-center justify-center rounded-md border text-meta transition-colors ${dense ? 'h-9' : 'h-14 gap-0.5'} ${
                isCurrent
                  ? 'border-accent-fg bg-selection text-fg'
                  : 'border-line-subtle bg-elevated text-fg-2 hover:border-line-strong hover:bg-overlay hover:text-fg'
              }`}
            >
              <span className="mono">{label}</span>
              {!dense && info ? (
                <span className="mono text-caption text-fg-3">
                  {info.top5 + info.papers + info.radar}
                </span>
              ) : null}
              {dense && info ? (
                <span
                  className={`mt-0.5 size-1 rounded-full ${evaluated ? 'bg-accent-fg' : 'bg-line-strong'}`}
                  aria-hidden="true"
                />
              ) : null}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

/** Date picker opened from the day header; a modal dialog with focus return. */
export function DatePicker({ index, current }: { index: DayIndex; current: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const months = [...new Set(index.dates.map((day) => day.slice(0, 7)))].sort()
  const [month, setMonth] = useState(current.slice(0, 7))
  const position = months.indexOf(month)

  const open = () => {
    setMonth(current.slice(0, 7))
    dialog.current?.showModal()
    requestAnimationFrame(() => {
      const grid = dialog.current
      const target =
        grid?.querySelector<HTMLElement>('[aria-current="date"]') ??
        grid?.querySelector<HTMLElement>('[data-day-link]')
      target?.focus()
    })
  }
  const close = () => dialog.current?.close()
  const { lang, t } = useLang()

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="btn btn-icon"
        onClick={open}
        aria-label={t('選擇日期', 'Choose a date')}
        title={t('選擇日期', 'Choose a date')}
        disabled={index.dates.length === 0}
      >
        <CalendarDays {...ICON} />
      </button>
      <dialog
        ref={dialog}
        className="overlay m-auto w-[min(340px,calc(100vw-32px))] animate-pop p-0"
        aria-labelledby="date-picker-title"
        onClose={() => trigger.current?.focus()}
        onClick={(event) => {
          if (event.target === event.currentTarget) close()
        }}
      >
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="btn btn-quiet btn-icon"
              aria-label={t('上一個月', 'Previous month')}
              disabled={position <= 0}
              onClick={() => months[position - 1] && setMonth(months[position - 1]!)}
            >
              <ChevronLeft {...ICON} />
            </button>
            <h2 id="date-picker-title" className="text-heading font-semibold" aria-live="polite">
              {formatMonth(month, lang)}
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn btn-quiet btn-icon"
                aria-label={t('下一個月', 'Next month')}
                disabled={position === -1 || position >= months.length - 1}
                onClick={() => months[position + 1] && setMonth(months[position + 1]!)}
              >
                <ChevronRight {...ICON} />
              </button>
              <button
                type="button"
                className="btn btn-quiet btn-icon"
                aria-label={t('關閉', 'Close')}
                onClick={close}
              >
                <X {...ICON_SM} />
              </button>
            </div>
          </div>
          <MonthGrid month={month} index={index} current={current} onPick={close} />
          <p className="flex items-center gap-3 text-caption text-fg-3">
            {index.partial ? null : (
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-accent-fg" aria-hidden="true" />
                {t('有 LLM 評分', 'LLM scored')}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <span
                className="size-3 rounded-sm border border-dashed border-line"
                aria-hidden="true"
              />
              {t('缺少日報', 'No digest')}
            </span>
          </p>
        </div>
      </dialog>
    </>
  )
}
