/* One-off Oct 3 partial-release notice; no content or layout replacement. */
(() => {
  'use strict'
  const day = '2026-10-03'
  const id = 'oct3-partial-release-notice'
  let coverage = { coverage_status: 'partial', reviewed_selected_count: 23 }
  let requested = false

  function onDay() {
    const route = location.hash ? location.hash.slice(1) : location.pathname
    return route.split('?')[0].replace(/\.html$/, '').replace(/\/$/, '') === `/day/${day}`
  }

  function update() {
    let notice = document.getElementById(id)
    if (!onDay() || coverage.coverage_status !== 'partial') {
      if (notice) notice.remove()
      return
    }
    if (!requested) {
      requested = true
      fetch(`/api/day/${day}.json`, { credentials: 'omit' })
        .then((response) => {
          if (!response.ok) throw new Error('Coverage metadata unavailable')
          return response.json()
        })
        .then((digest) => {
          if (digest.run_date === day && digest.run_info) {
            coverage = digest.run_info
            update()
          }
        })
        .catch(() => {}) // Retain the approved partial notice if metadata is unavailable.
    }
    const header = document.getElementById('view-title')?.closest('header')
    if (!header) return
    if (notice && !header.contains(notice)) {
      notice.remove()
      notice = null
    }
    if (!notice) {
      notice = document.createElement('div')
      notice.id = id
      notice.setAttribute('role', 'status')
      notice.style.cssText = 'flex-basis:100%;min-width:0;padding:6px 8px;border:1px solid #aa8449;border-radius:6px;color:#f5d596;background:#272219;font-size:12px;line-height:1.5;overflow-wrap:anywhere;'
      header.appendChild(notice)
    }
    const count = Number.isInteger(coverage.reviewed_selected_count) ? coverage.reviewed_selected_count : 23
    const text = `部分版本：已核對 ${count} 筆，來源持續補齊。Partial release: ${count} verified entries; source coverage is still being completed.`
    if (notice.textContent !== text) notice.textContent = text
  }

  new MutationObserver(update).observe(document.body, { childList: true, subtree: true })
  addEventListener('hashchange', update)
  addEventListener('popstate', update)
  update()
})()
