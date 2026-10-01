/**
 * URL contract. The site is static on GitHub Pages and the Nano publishes new
 * days without rebuilding the site, so views live in the hash:
 *
 *   #/                        latest digest
 *   #/day/2026-09-30          one day        ?p=<story_id>&s=<section>&t=<topic>&q=&u=1&sort=
 *   #/archive                 calendar of published days
 *   #/reports                 weekly and monthly reports
 *   #/weekly/2026-W39         one weekly report   ?p=&s=
 *   #/monthly/2026-09         one monthly report  ?p=&s=
 *   #/search?q=               every published story
 *   #/saved                   papers saved in this browser
 *   #/sources                 latest run and source health
 */

export const route = {
  latest: () => '/',
  day: (date: string) => `/day/${date}`,
  archive: () => '/archive',
  reports: () => '/reports',
  weekly: (period: string) => `/weekly/${period}`,
  monthly: (period: string) => `/monthly/${period}`,
  search: (query?: string) => (query ? `/search?q=${encodeURIComponent(query)}` : '/search'),
  saved: () => '/saved',
  sources: () => '/sources',
}

/** Day view link that opens one story. */
export function storyHref(date: string, storyId: string): string {
  return `${route.day(date)}?p=${encodeURIComponent(storyId)}`
}

/**
 * Maps addresses of the previous site (served by 404.html once those files are
 * gone) to the matching hash route. Returns null for unknown paths.
 */
export function legacyRoute(pathname: string): string | null {
  const path = pathname
    .replace(/\/index\.html$/, '/')
    .replace(/\.html$/, '')
    .replace(/\/+$/, '')
  if (path === '' || path === '/') return '/'
  let match = /^\/day\/(\d{4}-\d{2}-\d{2})$/.exec(path)
  if (match?.[1]) return route.day(match[1])
  match = /^\/reports\/weekly\/(\d{4}-W\d{2})$/.exec(path)
  if (match?.[1]) return route.weekly(match[1])
  match = /^\/reports\/monthly\/(\d{4}-\d{2})$/.exec(path)
  if (match?.[1]) return route.monthly(match[1])
  if (path === '/reports') return route.reports()
  if (path === '/archive') return route.archive()
  if (path === '/sources' || path === '/status') return route.sources()
  return null
}
