/* Data-bound partial coverage notice; preserves the approved October 3 fallback. */
(() => {
  'use strict'
  const id = 'oct3-partial-release-notice'
  const cache = new Map()
  const requested = new Set()

  function routeTarget() {
    const route = (location.hash ? location.hash.slice(1) : location.pathname)
      .split('?')[0].replace(/\.html$/, '').replace(/\/$/, '')
    if (route === '' || route === '/index') return { path: '/api/daily.json', day: null }
    const match = /^\/day\/(\d{4}-\d{2}-\d{2})$/.exec(route)
    return match ? { path: `/api/day/${match[1]}.json`, day: match[1] } : null
  }

  function update() {
    const target = routeTarget()
    let notice = document.getElementById(id)
    if (!target) {
      if (notice) notice.remove()
      return
    }
    if (!requested.has(target.path)) {
      requested.add(target.path)
      fetch(target.path, { credentials: 'omit' })
        .then((response) => {
          if (!response.ok) throw new Error('Coverage metadata unavailable')
          return response.json()
        })
        .then((digest) => {
          if (typeof digest.run_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(digest.run_date) &&
              (!target.day || digest.run_date === target.day) && digest.run_info) {
            cache.set(target.path, { day: digest.run_date, info: digest.run_info })
            update()
          }
        })
        .catch(() => {})
    }
    const fallback = target.day === '2026-10-03'
      ? { day: target.day, info: { coverage_status: 'partial', reviewed_selected_count: 23 } }
      : null
    const data = cache.get(target.path) || fallback
    if (!data || data.info.coverage_status !== 'partial') {
      if (notice) notice.remove()
      return
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
    const count = Number.isInteger(data.info.reviewed_selected_count) && data.info.reviewed_selected_count >= 0
      ? data.info.reviewed_selected_count : '—'
    const preview = data.info.preview_only === true
    let text = preview
      ? `部分候選預覽：${data.day}，${count} 筆，尚未發布。Partial candidate preview: ${data.day}, ${count} entries, unpublished.`
      : `部分版本：已核對 ${count} 筆，來源持續補齊。Partial release: ${count} verified entries; source coverage is still being completed.`
    if (data.day !== '2026-10-03') {
      if (data.info.combined_native_reranked === false && data.info.preserved_baseline_count === 14 && data.info.added_native_count === 5) {
        text += ' 保留原14篇及原Top5／Radar順序；新增5篇依本批排名列於Papers，19篇未合併重新排名。The original 14 entries and Top5/Radar order are preserved; five additions appear in Papers in their subset order, without reranking all 19.'
      } else {
        text += ' 排名僅限此子集。Ranking covers this subset only.'
      }
      text += ' 全日總數與涵蓋率未知。Full-day totals and coverage are unknown.'
      if (Number.isInteger(data.info.calendar_date_only_count) && data.info.calendar_date_only_count > 0) {
        text += ` ${data.info.calendar_date_only_count} 筆僅確認出版者日曆日期，時間、時區及 UTC 日歸屬未知。${data.info.calendar_date_only_count} entries have publisher calendar dates only; time, timezone and UTC-day membership are unknown.`
      }
      if (data.info.source_collection_cutoff_utc === null) {
        text += ' 來源收集截止時間未知。Source collection cutoff is unknown.'
      }
    }
    if (notice.textContent !== text) notice.textContent = text
  }

  new MutationObserver(update).observe(document.body, { childList: true, subtree: true })
  addEventListener('hashchange', update)
  addEventListener('popstate', update)
  update()
})()
