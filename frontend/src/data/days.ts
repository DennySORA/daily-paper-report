import { useMemo } from 'react'
import { daysBetween } from '../lib/format'
import { paths, useCatalog, useDoc } from './api'
import type { CatalogDay, DailyDigest } from './types'

export interface DayIndex {
  status: 'loading' | 'ready' | 'error'
  /** Published days, newest first. */
  dates: string[]
  info: Map<string, CatalogDay>
  latest: string | null
  missing: Set<string>
  /** True when only the date list from daily.json is available (no per-day counts). */
  partial: boolean
}

/**
 * Published-day index. Prefers api/catalog.json (per-day counts); falls back to
 * the archive_dates list inside api/daily.json when the catalog is unavailable.
 */
export function useDayIndex(): DayIndex {
  const [catalog] = useCatalog()
  // daily.json is only needed for its archive_dates when the catalog is missing.
  const [latest] = useDoc<DailyDigest>(catalog.status === 'error' ? paths.latest : null)

  return useMemo<DayIndex>(() => {
    if (catalog.status === 'ready') {
      const days = [...catalog.data.days].sort((a, b) => b.date.localeCompare(a.date))
      return {
        status: 'ready',
        dates: days.map((day) => day.date),
        info: new Map(days.map((day) => [day.date, day])),
        latest: catalog.data.latest_date ?? days[0]?.date ?? null,
        missing: new Set(catalog.data.missing_dates),
        partial: false,
      }
    }
    if (catalog.status === 'error' && latest.status === 'ready') {
      const dates = [...new Set([...(latest.data.archive_dates ?? []), latest.data.run_date])].sort(
        (a, b) => b.localeCompare(a),
      )
      const present = new Set(dates)
      const first = dates[dates.length - 1]
      const last = dates[0]
      const missing =
        first && last
          ? new Set(daysBetween(first, last).filter((day) => !present.has(day)))
          : new Set<string>()
      return {
        status: 'ready',
        dates,
        info: new Map(),
        latest: last ?? null,
        missing,
        partial: true,
      }
    }
    const failed = catalog.status === 'error' && latest.status === 'error'
    return {
      status: failed ? 'error' : 'loading',
      dates: [],
      info: new Map(),
      latest: null,
      missing: new Set(),
      partial: true,
    }
  }, [catalog, latest])
}

/** Neighbouring published days (older / newer) of `date`. */
export function neighbours(
  dates: string[],
  date: string,
): { older: string | null; newer: string | null } {
  let older: string | null = null
  let newer: string | null = null
  for (const day of dates) {
    if (day < date && (older === null || day > older)) older = day
    if (day > date && (newer === null || day < newer)) newer = day
  }
  return { older, newer }
}
