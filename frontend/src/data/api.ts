import { useCallback, useEffect, useState } from 'react'
import type { Catalog, DailyDigest, ReportDigest, ReportIndex, ReportType } from './types'

export class NotFoundError extends Error {
  constructor(readonly path: string) {
    super(`找不到資料：${path}`)
    this.name = 'NotFoundError'
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
  ) {
    super(`伺服器回應 ${status}：${path}`)
    this.name = 'HttpError'
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const PERIOD_RE = /^\d{4}-(W\d{2}|\d{2})$/

/** One shared request per resource; failed requests are evicted so retry refetches. */
const cache = new Map<string, Promise<unknown>>()

function load<T>(path: string, revalidate: boolean): Promise<T> {
  const cached = cache.get(path)
  if (cached) return cached as Promise<T>
  const request = fetch(`/${path}`, { cache: revalidate ? 'no-cache' : 'default' }).then(
    async (response) => {
      if (response.status === 404) throw new NotFoundError(path)
      if (!response.ok) throw new HttpError(response.status, path)
      return (await response.json()) as T
    },
  )
  cache.set(path, request)
  request.catch(() => cache.delete(path))
  return request
}

export function evict(path: string): void {
  cache.delete(path)
}

export const paths = {
  latest: 'api/daily.json',
  catalog: 'api/catalog.json',
  search: 'api/search.json',
  reports: 'api/reports/index.json',
}

/** Latest-pointer documents revalidate; dated documents use normal HTTP caching. */
const REVALIDATED = new Set([paths.latest, paths.catalog, paths.search, paths.reports])

export function fetchDoc<T>(path: string): Promise<T> {
  return load<T>(path, REVALIDATED.has(path))
}

export type Resource<T> =
  { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: Error }

const LOADING = { status: 'loading' } as const

interface Settled<T> {
  key: string
  state: Resource<T>
}

/**
 * Loads one document for the current key. Late results from a previous key are
 * ignored, and `retry` evicts the failed entry before requesting it again.
 */
export function useDoc<T>(path: string | null): [Resource<T>, () => void] {
  const [nonce, setNonce] = useState(0)
  const key = path === null ? '' : `${path}#${nonce}`
  const [settled, setSettled] = useState<Settled<T> | null>(null)

  useEffect(() => {
    if (path === null) return
    let active = true
    fetchDoc<T>(path).then(
      (data) => active && setSettled({ key, state: { status: 'ready', data } }),
      (error: unknown) =>
        active &&
        setSettled({
          key,
          state: {
            status: 'error',
            error: error instanceof Error ? error : new Error(String(error)),
          },
        }),
    )
    return () => {
      active = false
    }
  }, [path, key])

  const retry = useCallback(() => {
    if (path === null) return
    evict(path)
    setNonce((value) => value + 1)
  }, [path])

  if (path === null) return [LOADING, retry]
  return [settled?.key === key ? settled.state : LOADING, retry]
}

export const useLatestDigest = () => useDoc<DailyDigest>(paths.latest)
export const useCatalog = () => useDoc<Catalog>(paths.catalog)
export const useReportIndex = () => useDoc<ReportIndex>(paths.reports)
export const useReport = (path: string | null) => useDoc<ReportDigest>(path)

export function safeDayPath(date: string | undefined): string | null {
  if (!date) return paths.latest
  return DATE_RE.test(date) ? `api/day/${date}.json` : null
}

export function safeReportPath(type: ReportType, period: string | undefined): string | null {
  return period && PERIOD_RE.test(period) ? `api/reports/${type}/${period}.json` : null
}

export const isIsoDate = (value: string | undefined | null): value is string =>
  !!value && DATE_RE.test(value)
