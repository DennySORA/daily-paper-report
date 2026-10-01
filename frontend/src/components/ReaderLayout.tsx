import {
  ChevronLeft,
  ChevronRight,
  ListFilter,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import {
  SORT_LABEL,
  applyFilter,
  flatten,
  isFiltered,
  parseFilter,
  topicCounts,
  type SortKey,
} from '../data/filter'
import { useChromeInert } from '../app/chrome'
import {
  SECTION_LABEL,
  isSafeHttpUrl,
  readingLinks,
  type SectionKey,
  type Story,
  type StoryGroup,
} from '../data/story'
import { topicInfo, topicLabel } from '../data/topics'
import { useHotkeys, useIsNarrow } from '../lib/hooks'
import { useLang } from '../state/lang'
import { setPref, setRead, toggleSaved, useLibrary } from '../state/library'
import { Reader } from './Reader'
import { StoryList } from './StoryList'
import { ICON, ICON_SM, StateMessage } from './ui'

export interface ReaderLayoutProps {
  groups: StoryGroup[]
  basePath: string
  header: ReactNode
  status?: ReactNode
  /** Previous / next document (day or report) for the [ and ] shortcuts. */
  prevDocHref?: string | null
  nextDocHref?: string | null
  emptyTitle: string
  emptyBody?: ReactNode
}

const PARAM_KEYS = ['s', 't', 'q', 'u', 'sort'] as const

export function ReaderLayout({
  groups,
  basePath,
  header,
  status,
  prevDocHref,
  nextDocHref,
  emptyTitle,
  emptyBody,
}: ReaderLayoutProps) {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const narrow = useIsNarrow()
  const library = useLibrary()
  const { lang, t } = useLang()
  const listCollapsed = !narrow && library.prefs.listCollapsed
  const filterInput = useRef<HTMLInputElement>(null)
  const readerScroll = useRef<HTMLDivElement>(null)

  const sections = useMemo(
    () => groups.filter((group) => group.stories.length > 0).map((group) => group.section),
    [groups],
  )
  const filter = parseFilter(params, sections)
  const requestedId = params.get('p')
  const all = useMemo(() => flatten(groups), [groups])
  const byId = useMemo(() => new Map(all.map((story) => [story.id, story])), [all])
  const visibleGroups = useMemo(
    () => applyFilter(groups, filter, library.read, requestedId),
    // filter is derived from params; list it by value
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, params, library.read, requestedId],
  )
  const visible = useMemo(() => flatten(visibleGroups), [visibleGroups])
  const topics = useMemo(() => topicCounts(groups), [groups])

  const selectedId = requestedId ?? (narrow ? null : (visible[0]?.id ?? null))
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null
  const index = selected ? visible.findIndex((story) => story.id === selected.id) : -1

  const hrefWith = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
    }
    const query = next.toString()
    return query ? `${basePath}?${query}` : basePath
  }
  const hrefFor = (story: Story) => hrefWith({ p: story.id })
  const closeHref = hrefWith({ p: null })

  const setFilter = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
    }
    setParams(next, { replace: true })
  }

  // Each newly opened story starts at the top of the reading pane.
  useEffect(() => {
    readerScroll.current?.scrollTo({ top: 0 })
  }, [selectedId])

  // On narrow screens the reader is a full-screen layer over the list.
  const overlayOpen = narrow && selected !== null
  useChromeInert(overlayOpen)
  useEffect(() => {
    if (!overlayOpen) return
    const root = document.documentElement
    const previous = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      root.style.overflow = previous
    }
  }, [overlayOpen])

  // Move focus into the reading layer when it opens, and back to the row when it closes.
  const lastOverlayId = useRef<string | null>(null)
  useEffect(() => {
    if (overlayOpen) {
      lastOverlayId.current = selectedId
      document.getElementById('reader-title')?.focus({ preventScroll: true })
      return
    }
    const id = lastOverlayId.current
    lastOverlayId.current = null
    if (id) document.querySelector<HTMLElement>(`[data-story-id="${CSS.escape(id)}"]`)?.focus()
  }, [overlayOpen, selectedId])

  const move = (delta: number) => {
    if (visible.length === 0) return
    const from = index === -1 ? (delta > 0 ? -1 : visible.length) : index
    const target = visible[Math.min(visible.length - 1, Math.max(0, from + delta))]
    if (target && target.id !== selectedId) navigate(hrefFor(target), { replace: !narrow })
  }

  const openLink = (which: 'primary' | 'pdf') => {
    if (!selected) return
    const links = readingLinks(selected)
    const link = which === 'pdf' ? links.find((item) => item.kind === 'pdf') : links[0]
    if (link && isSafeHttpUrl(link.href)) window.open(link.href, '_blank', 'noopener,noreferrer')
  }

  const sectionKeys: Array<SectionKey | 'all'> = ['all', ...sections]
  useHotkeys({
    j: () => move(1),
    k: () => move(-1),
    o: () => openLink('primary'),
    p: () => openLink('pdf'),
    s: () => selected && toggleSaved(selected),
    m: () => selected && setRead(selected.id, !(selected.id in library.read)),
    e: () => setPref('abstractOpen', !library.prefs.abstractOpen),
    f: () => !narrow && setPref('listCollapsed', !library.prefs.listCollapsed),
    u: () => setFilter({ u: filter.unreadOnly ? null : '1' }),
    '/': () => filterInput.current?.focus(),
    '[': () => prevDocHref && navigate(prevDocHref),
    ']': () => nextDocHref && navigate(nextDocHref),
    Escape: () => overlayOpen && navigate(closeHref),
    ...Object.fromEntries(
      sectionKeys.map((key, position) => [
        String(position + 1),
        () => setFilter({ s: key === 'all' ? null : key, p: null }),
      ]),
    ),
  })

  const total = all.length
  const shown = visible.length
  const readCount = all.filter((story) => story.id in library.read).length
  const filtered = isFiltered(filter) || filter.section !== 'all'
  const activeTopic = topics.find((topic) => topic.key === filter.topic)
  const activeTopicLabel = activeTopic ? topicLabel(activeTopic, lang) : null

  const listPanel = (
    <div className="flex min-h-0 min-w-0 flex-col lg:overflow-hidden lg:rounded-lg lg:border lg:border-line lg:bg-surface lg:shadow-edge">
      <div className="flex flex-col gap-2 border-b border-line-subtle px-3 pt-3 pb-2.5">
        <fieldset className="segmented self-start">
          <legend className="sr-only">{t('區段', 'Section')}</legend>
          {sectionKeys.map((key, position) => {
            const count =
              key === 'all'
                ? total
                : (groups.find((group) => group.section === key)?.stories.length ?? 0)
            return (
              <label
                key={key}
                className="segment"
                title={t(`快捷鍵 ${position + 1}`, `Shortcut ${position + 1}`)}
              >
                <input
                  type="radio"
                  name="section"
                  checked={filter.section === key}
                  onChange={() => setFilter({ s: key === 'all' ? null : key, p: null })}
                />
                {key === 'all' ? t('全部', 'All') : SECTION_LABEL[key][lang]}
                <span className="mono text-fg-3">{count}</span>
              </label>
            )
          })}
        </fieldset>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex min-w-[150px] flex-1 items-center">
            <span className="sr-only">{t('在此清單中篩選', 'Filter this list')}</span>
            <Search {...ICON_SM} className="pointer-events-none absolute left-2.5 text-fg-3" />
            <input
              ref={filterInput}
              name="filter"
              className="input w-full pl-8"
              type="search"
              placeholder={t('篩選標題、作者、主題', 'Filter titles, authors, topics')}
              value={filter.query}
              onChange={(event) => setFilter({ q: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Escape') event.currentTarget.blur()
              }}
            />
          </label>
          <label className="flex items-center">
            <span className="sr-only">{t('主題', 'Topic')}</span>
            <select
              name="topic"
              className="input max-w-[180px]"
              value={filter.topic ?? ''}
              onChange={(event) => setFilter({ t: event.target.value || null })}
            >
              <option value="">{t('全部主題', 'All topics')}</option>
              {filter.topic && !topics.slice(0, 40).some((topic) => topic.key === filter.topic) ? (
                <option value={filter.topic}>{topicLabel(topicInfo(filter.topic), lang)}</option>
              ) : null}
              {topics.slice(0, 40).map((topic) => (
                <option key={topic.key} value={topic.key}>
                  {topicLabel(topic, lang)} ({topic.count})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-fg-3">
          <label
            className="flex cursor-pointer items-center gap-1.5 text-meta text-fg-2"
            title={t('快捷鍵 U', 'Shortcut U')}
          >
            <input
              type="checkbox"
              name="unread"
              className="size-3.5 accent-accent"
              checked={filter.unreadOnly}
              onChange={(event) => setFilter({ u: event.target.checked ? '1' : null })}
            />
            {t('只看未讀', 'Unread only')}
          </label>
          <span className="mono" aria-live="polite">
            {t(
              `顯示 ${shown} / ${total} · 已讀 ${readCount}`,
              `${shown} / ${total} shown · ${readCount} read`,
            )}
          </span>
          {filtered ? (
            <Link
              to={hrefWith(Object.fromEntries(PARAM_KEYS.map((key) => [key, null])))}
              replace
              className="inline-flex items-center gap-1 text-meta text-accent-fg hover:underline"
            >
              <X {...ICON_SM} />
              {t('清除篩選', 'Clear filters')}
            </Link>
          ) : null}
          <label className="ml-auto flex items-center gap-1.5 text-meta text-fg-3">
            {t('排序', 'Sort')}
            <select
              name="sort"
              className="input h-7 min-h-7 py-0 text-meta"
              value={filter.sort}
              onChange={(event) =>
                setFilter({ sort: event.target.value === 'rank' ? null : event.target.value })
              }
            >
              {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABEL[key][lang]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="scroll-region min-h-0 flex-1 max-lg:overflow-visible">
        {total === 0 ? (
          <StateMessage title={emptyTitle}>{emptyBody}</StateMessage>
        ) : shown === 0 ? (
          <StateMessage
            title={t('沒有符合篩選條件的項目', 'Nothing matches these filters')}
            actions={
              <Link
                to={hrefWith(Object.fromEntries(PARAM_KEYS.map((key) => [key, null])))}
                replace
                className="btn"
              >
                <ListFilter {...ICON_SM} />
                {t('清除篩選', 'Clear filters')}
              </Link>
            }
          >
            {activeTopicLabel
              ? t(`主題「${activeTopicLabel}」`, `Topic “${activeTopicLabel}” `)
              : null}
            {filter.query ? t(`關鍵字「${filter.query}」`, `Keyword “${filter.query}” `) : null}
            {filter.unreadOnly ? t('（僅未讀）', '(unread only)') : null}
          </StateMessage>
        ) : (
          <StoryList
            groups={visibleGroups}
            selectedId={selectedId}
            hrefFor={hrefFor}
            readIds={library.read}
            savedIds={library.saved}
            showHeaders={filter.section === 'all' && filter.sort === 'rank'}
            replaceHistory={!narrow}
            lang={lang}
          />
        )}
      </div>
    </div>
  )

  const position = index >= 0 ? `${index + 1} / ${visible.length}` : `— / ${visible.length}`
  const prevHref = index > 0 && visible[index - 1] ? hrefFor(visible[index - 1]!) : null
  const nextHref = index >= 0 && visible[index + 1] ? hrefFor(visible[index + 1]!) : null

  const readerBody = selected ? (
    <Reader
      story={selected}
      narrow={narrow}
      markOnOpen={requestedId !== null}
      topicHref={(key) => hrefWith({ t: key, p: null, s: null })}
      nav={{
        index,
        total: visible.length,
        prevHref,
        nextHref,
        closeHref,
      }}
    />
  ) : requestedId ? (
    <StateMessage
      title={t('找不到這個項目', 'Item not found')}
      actions={
        <Link to={closeHref} replace className="btn">
          {t('回到清單', 'Back to the list')}
        </Link>
      }
    >
      <p className="mono break-all text-meta text-fg-3">{requestedId}</p>
      <p>{t('它可能不屬於這份日報或報告。', 'It may not belong to this digest or report.')}</p>
    </StateMessage>
  ) : (
    <StateMessage
      title={t('從清單選擇一篇開始閱讀', 'Pick an item from the list to start reading')}
    >
      {t('使用', 'Use')} <kbd className="kbd">J</kbd> <kbd className="kbd">K</kbd>{' '}
      {t('在清單中移動。', 'to move through the list.')}
    </StateMessage>
  )

  const readerToolbar = (
    <div className="flex h-10 flex-none items-center gap-2 border-b border-line-subtle px-2">
      <button
        type="button"
        className="btn btn-quiet h-7 min-h-7 text-meta"
        aria-pressed={listCollapsed}
        onClick={() => setPref('listCollapsed', !listCollapsed)}
        title={t('快捷鍵 F', 'Shortcut F')}
      >
        {listCollapsed ? <PanelLeftOpen {...ICON_SM} /> : <PanelLeftClose {...ICON_SM} />}
        {listCollapsed ? t('顯示清單', 'Show list') : t('收起清單', 'Hide list')}
      </button>
      <span className="mono ml-auto text-caption text-fg-3" aria-live="polite">
        {position}
      </span>
      {prevHref ? (
        <Link
          to={prevHref}
          replace
          className="btn btn-quiet btn-icon h-7 min-h-7"
          aria-label={t('上一篇', 'Previous')}
          title={t('上一篇（K）', 'Previous (K)')}
        >
          <ChevronLeft {...ICON} />
        </Link>
      ) : (
        <button
          type="button"
          className="btn btn-quiet btn-icon h-7 min-h-7"
          disabled
          aria-label={t('沒有上一篇', 'No previous item')}
        >
          <ChevronLeft {...ICON} />
        </button>
      )}
      {nextHref ? (
        <Link
          to={nextHref}
          replace
          className="btn btn-quiet btn-icon h-7 min-h-7"
          aria-label={t('下一篇', 'Next')}
          title={t('下一篇（J）', 'Next (J)')}
        >
          <ChevronRight {...ICON} />
        </Link>
      ) : (
        <button
          type="button"
          className="btn btn-quiet btn-icon h-7 min-h-7"
          disabled
          aria-label={t('沒有下一篇', 'No next item')}
        >
          <ChevronRight {...ICON} />
        </button>
      )}
    </div>
  )

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {header}
      {narrow ? (
        <>
          <div inert={overlayOpen} className="flex min-w-0 flex-col">
            {listPanel}
          </div>
          {overlayOpen ? (
            <div
              ref={readerScroll}
              className="fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-surface"
              role="dialog"
              aria-modal="true"
              aria-labelledby="reader-title"
            >
              {readerBody}
            </div>
          ) : null}
        </>
      ) : (
        <div
          className={`grid min-h-0 flex-1 gap-2 px-2 pb-2 ${
            listCollapsed
              ? 'grid-cols-[minmax(0,1fr)]'
              : 'grid-cols-[clamp(320px,30vw,420px)_minmax(0,1fr)]'
          }`}
        >
          {listCollapsed ? null : listPanel}
          <div
            className="panel-raised flex min-h-0 flex-col"
            aria-label={t('閱讀窗格', 'Reading pane')}
            role="region"
          >
            {readerToolbar}
            <div ref={readerScroll} className="scroll-region min-h-0 flex-1">
              {readerBody}
            </div>
          </div>
        </div>
      )}
      {status && !narrow ? status : null}
    </div>
  )
}
