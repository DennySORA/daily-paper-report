const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** Report dates are UTC calendar days (YYYY-MM-DD); weekday is computed in UTC. */
export function weekday(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? '' : (WEEKDAYS[parsed.getUTCDay()] ?? '')
}

export function formatDay(date: string): string {
  const day = weekday(date)
  return day ? `${date}（${day}）` : date
}

export function formatMonth(month: string): string {
  const [year, value] = month.split('-')
  return `${year} 年 ${Number(value)} 月`
}

const dateTimeFormat = new Intl.DateTimeFormat('zh-TW', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZoneName: 'short',
})

/** Formats an ISO timestamp in the viewer's local zone, keeping the zone visible. */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '未知'
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  const parts = Object.fromEntries(
    dateTimeFormat.formatToParts(parsed).map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} ${parts.timeZoneName ?? ''}`.trim()
}

/** Calendar date of an ISO timestamp in UTC, matching the pipeline's date keys. */
export function utcDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

export function formatDuration(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): string {
  if (!startIso || !endIso) return '未知'
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '未知'
  const minutes = Math.round(ms / 60000)
  if (minutes < 1) return '不到 1 分鐘'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} 分鐘`
  return rest === 0 ? `${hours} 小時` : `${hours} 小時 ${rest} 分`
}

const integer = new Intl.NumberFormat('zh-TW')
const compact = new Intl.NumberFormat('zh-TW', { notation: 'compact', maximumFractionDigits: 1 })

export const formatInt = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : integer.format(value)

export const formatCompact = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : compact.format(value)

export const formatScore = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(2)

export function addDays(date: string, delta: number): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  parsed.setUTCDate(parsed.getUTCDate() + delta)
  return parsed.toISOString().slice(0, 10)
}

/** Every calendar day from `first` to `last` inclusive (UTC). */
export function daysBetween(first: string, last: string): string[] {
  const days: string[] = []
  for (let day = first; day <= last && days.length < 4000; day = addDays(day, 1)) days.push(day)
  return days
}
