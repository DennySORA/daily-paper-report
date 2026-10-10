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
      if (data.day === '2026-10-09' && count === 48 && !preview && data.info.release_state === 'approved_bounded_release' && data.info.combined_native_reranked === false && data.info.preserved_baseline_count === 45 && data.info.added_native_count === 3 && data.info.added_reviewed_candidate_count === 3 && data.info.preserved_baseline_kind === 'published_verified') {
        text += ' 保留已發布97篇中的Oct9原45篇及既有順序；本批3篇依原規則選3篇，按子集排名追加Papers，48篇未合併重新排名。本次有界更新合計100篇，新增三篇已通過正式採納檢查。首次投稿日Oct8與列表日Oct9分開，精確公告事件未知。The original 45 Oct9 entries of the verified public97 baseline and their section order are preserved; 3 additions are appended to Papers after the unchanged filter selected 3 of 3 reviewed papers, without reranking all 48. This bounded update contains 100 entries; the three additions have passed formal admission checks. First submission on Oct8 is distinct from listing-day membership on Oct9; exact announcement events remain unknown.'
      } else if (data.day === '2026-10-09' && count === 45 && data.info.combined_native_reranked === false && data.info.additions_jointly_reranked === false && data.info.preserved_baseline_count === 40 && data.info.added_native_count === 5 && data.info.added_reviewed_candidate_count === 5 && Array.isArray(data.info.added_subset_counts) && data.info.added_subset_counts.join(',') === '4,1' && data.info.preserved_baseline_kind === 'published_verified' && data.info.preview_only === false) {
        text += ' 保留已發布40篇及既有順序；兩個子集依原規則4選4、1選1，五篇按4＋1既有子集順序追加Papers。45篇及新增五篇均未合併重新排名。首次投稿日Oct8與列表日Oct9分開，精確公告事件未知。The 40 published baseline entries and their section order are preserved; two independently ranked pools selected 4 of 4 and 1 of 1 under the unchanged filter. Five additions are appended to Papers in their established 4+1 subset order, without jointly reranking all 45 or the five additions. First submission on Oct8 is distinct from listing-day membership on Oct9; exact announcement events remain unknown.'
      } else if (data.day === '2026-10-09' && count === 40 && data.info.combined_native_reranked === false && data.info.preserved_baseline_count === 35 && data.info.added_native_count === 5 && data.info.added_reviewed_candidate_count === 5 && data.info.preserved_baseline_kind === 'published_verified' && data.info.preview_only === false) {
        text += ' 保留已發布35篇及既有順序；本批5篇依原規則全數入選，按子集排名追加Papers，40篇未合併重新排名。首次投稿日Oct8與列表日Oct9分開，精確公告事件未知。The 35 published baseline entries and their section order are preserved; 5 additions are appended to Papers in their established subset order after the unchanged filter selected 5 of 5 reviewed papers, without reranking all 40. First submission on Oct8 is distinct from listing-day membership on Oct9; exact announcement events remain unknown.'
      } else if (data.day === '2026-10-08' && count === 44 && data.info.combined_native_reranked === false && data.info.preserved_baseline_count === 37 && data.info.added_native_count === 7 && data.info.added_reviewed_candidate_count === 9 && data.info.preserved_baseline_kind === 'published_approved' && data.info.preview_only === false) {
        text += ' 保留已發布37篇及既有順序；兩個候選子集依原規則6選5、3選2，七篇新增稿按既有子集順序追加Papers。44篇及新增七篇均未合併重新排名。The 37 published baseline entries and their section order are preserved; two separately ranked pools selected 5 of 6 and 2 of 3 under the unchanged filter. Seven additions are appended to Papers in their established subset order, without jointly reranking all 44 or the seven additions.'
      } else if (data.day === '2026-10-08' && count === 37 && data.info.combined_native_reranked === false && data.info.preserved_baseline_count === 33 && data.info.added_native_count === 4 && data.info.added_reviewed_candidate_count === 4 && data.info.preserved_baseline_kind === 'published_approved') {
        text += ' 保留已發布33篇及既有順序；本批4篇依原規則選4篇，按子集排名追加Papers，37篇未合併重新排名。The 33 published baseline entries and their section order are preserved; 4 additions are appended to Papers in their subset order after the unchanged filter selected 4 of 4 reviewed papers, without reranking all 37.'
      } else if (data.day === '2026-10-08' && count === 33 && data.info.combined_native_reranked === false && data.info.preserved_baseline_count === 29 && data.info.added_native_count === 4 && data.info.added_reviewed_candidate_count === 5 && data.info.preserved_baseline_kind === 'published_approved') {
        text += ' 保留已發布29篇及既有順序；本批5篇依原規則選4篇，按子集排名追加Papers，33篇未合併重新排名。The 29 published baseline entries and their section order are preserved; 4 additions are appended to Papers in their subset order after the unchanged filter selected 4 of 5 reviewed papers, without reranking all 33.'
      } else if (data.day === '2026-10-08' && count === 29 && data.info.combined_native_reranked === false && data.info.preserved_baseline_count === 24 && data.info.added_native_count === 5 && data.info.preserved_baseline_kind === 'unpublished_proposed_candidate') {
        text += ' 保留前一候選24篇及既有順序；本批5篇依原規則全數入選，按子集排名追加Papers，29篇未合併重新排名。The 24 entries from the preceding unpublished proposed baseline and their section order are preserved; five additions are appended to Papers in their subset order after the unchanged filter selected all five reviewed papers, without reranking all 29.'
      } else if (data.day === '2026-10-09' && count === 35 && data.info.combined_native_reranked === false && data.info.preserved_baseline_count === 30 && data.info.added_native_count === 5 && data.info.preserved_baseline_kind === 'unpublished_proposed_candidate') {
        text += ' 保留前一候選30篇及既有順序；本批5篇依原規則全數入選，按子集排名追加Papers，35篇未合併重新排名。The 30 entries from the preceding unpublished proposed baseline and their section order are preserved; five additions are appended to Papers in their subset order after the unchanged filter selected all five reviewed papers, without reranking all 35.'
      } else if (data.day === '2026-10-09' && count === 30 && data.info.combined_native_reranked === false && data.info.preserved_baseline_count === 26 && data.info.added_native_count === 4 && data.info.preserved_baseline_kind === 'unpublished_proposed_candidate') {
        text += ' 保留前一候選26篇及既有順序；本批5篇依原規則選4篇，按子集排名追加Papers，30篇未合併重新排名。The 26 entries from the preceding unpublished proposed baseline and their section order are preserved; four additions are appended to Papers in their subset order after the unchanged filter selected four of five reviewed papers, without reranking all 30.'


      } else if (data.day === '2026-10-09' && count === 26 && data.info.combined_native_reranked === false && data.info.preserved_baseline_count === 22 && data.info.added_native_count === 4 && data.info.preserved_baseline_kind === 'unpublished_proposed_candidate') {
        text += ' 保留前一候選22篇及既有順序；新增4篇依本批排名追加Papers，26篇未合併重新排名。The 22 entries from the preceding unpublished proposed baseline and their section order are preserved; four additions are appended to Papers in their subset order, without reranking all 26.'

      } else if (data.day === '2026-10-09' && count === 22 && data.info.combined_native_reranked === false && data.info.preserved_baseline_count === 18 && data.info.added_native_count === 4 && data.info.preserved_baseline_kind === 'unpublished_proposed_candidate') {
        text += ' 保留前一候選18篇及既有順序；新增4篇依本批排名追加Papers，22篇未合併重新排名。The 18 entries from the preceding unpublished proposed baseline and their section order are preserved; four additions are appended to Papers in their subset order, without reranking all 22.'
      } else if (data.day === '2026-10-09' && count === 18 && data.info.combined_native_reranked === false && data.info.preserved_baseline_count === 13 && data.info.added_native_count === 5 && data.info.preserved_baseline_kind === 'unpublished_proposed_candidate') {
        text += ' 保留前一候選13篇及既有順序；新增5篇依本批排名追加Papers，18篇未合併重新排名。The 13 entries from the preceding unpublished proposed baseline and their section order are preserved; five additions are appended to Papers in their subset order, without reranking all 18.'
      } else if (data.day === '2026-10-08' && count === 24 && data.info.combined_native_reranked === false && data.info.preserved_baseline_count === 19 && data.info.added_native_count === 5) {
        text += ' 保留原19篇及既有Top5／Papers／Radar順序；新增5篇依本批排名追加Papers，24篇未合併重新排名。The original 19 entries and Top5/Papers/Radar order are preserved; five additions are appended to Papers in their subset order, without reranking all 24.'
      } else if (data.info.combined_native_reranked === false && data.info.preserved_baseline_count === 14 && data.info.added_native_count === 5) {
        text += ' 保留原14篇及原Top5／Radar順序；新增5篇依本批排名列於Papers，19篇未合併重新排名。The original 14 entries and Top5/Radar order are preserved; five additions appear in Papers in their subset order, without reranking all 19.'
      } else if (data.day === '2026-10-09' && count === 13 && data.info.combined_native_reranked === false && data.info.preserved_baseline_count === 6 && data.info.added_native_count === 7) {
        text += ' 保留原6篇及既有順序；新增7篇依本批排名列於Papers，13篇未合併重新排名。The original six entries and section order are preserved; seven additions appear in Papers in their subset order, without reranking all 13.'
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
