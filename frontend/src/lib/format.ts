import type { Lang } from '../state/library'

const WEEKDAYS: Record<Lang, string[]> = {
  zh: ['日', '一', '二', '三', '四', '五', '六'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
}

const LOCALE: Record<Lang, string> = { zh: 'zh-TW', en: 'en-US' }

/** Report dates are UTC calendar days (YYYY-MM-DD); weekday is computed in UTC. */
export function weekday(date: string, lang: Lang = 'zh'): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? '' : (WEEKDAYS[lang][parsed.getUTCDay()] ?? '')
}

export function formatDay(date: string, lang: Lang = 'zh'): string {
  const day = weekday(date, lang)
  if (!day) return date
  return lang === 'en' ? `${date} (${day})` : `${date}（${day}）`
}

export function formatMonth(month: string, lang: Lang = 'zh'): string {
  const [year, value] = month.split('-')
  if (lang === 'en') {
    const name = new Date(Date.UTC(Number(year), Number(value) - 1, 1)).toLocaleString('en-US', {
      month: 'long',
      timeZone: 'UTC',
    })
    return `${name} ${year}`
  }
  return `${year} 年 ${Number(value)} 月`
}

const dateTimeFormats = new Map<Lang, Intl.DateTimeFormat>()

/** Formats an ISO timestamp in the viewer's local zone, keeping the zone visible. */
export function formatTimestamp(iso: string | null | undefined, lang: Lang = 'zh'): string {
  if (!iso) return lang === 'en' ? 'unknown' : '未知'
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  let format = dateTimeFormats.get(lang)
  if (!format) {
    format = new Intl.DateTimeFormat(LOCALE[lang], {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZoneName: 'short',
    })
    dateTimeFormats.set(lang, format)
  }
  const parts = Object.fromEntries(
    format.formatToParts(parsed).map((part) => [part.type, part.value]),
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
  lang: Lang = 'zh',
): string {
  const unknown = lang === 'en' ? 'unknown' : '未知'
  if (!startIso || !endIso) return unknown
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return unknown
  const minutes = Math.round(ms / 60000)
  if (minutes < 1) return lang === 'en' ? 'under a minute' : '不到 1 分鐘'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (lang === 'en') {
    if (hours === 0) return `${rest} min`
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
  }
  if (hours === 0) return `${rest} 分鐘`
  return rest === 0 ? `${hours} 小時` : `${hours} 小時 ${rest} 分`
}

const integerFormats = new Map<Lang, Intl.NumberFormat>()
const compactFormats = new Map<Lang, Intl.NumberFormat>()

export function formatInt(value: number | null | undefined, lang: Lang = 'zh'): string {
  if (value === null || value === undefined) return '—'
  let format = integerFormats.get(lang)
  if (!format) {
    format = new Intl.NumberFormat(LOCALE[lang])
    integerFormats.set(lang, format)
  }
  return format.format(value)
}

export function formatCompact(value: number | null | undefined, lang: Lang = 'zh'): string {
  if (value === null || value === undefined) return '—'
  let format = compactFormats.get(lang)
  if (!format) {
    format = new Intl.NumberFormat(LOCALE[lang], { notation: 'compact', maximumFractionDigits: 1 })
    compactFormats.set(lang, format)
  }
  return format.format(value)
}

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
