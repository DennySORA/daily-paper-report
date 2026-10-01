import {
  Archive,
  Bookmark,
  CalendarDays,
  CalendarRange,
  CornerDownLeft,
  FileText,
  Keyboard,
  Newspaper,
  Search,
  Activity,
} from 'lucide-react'
import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router'
import { route, storyHref } from '../app/routes'
import { paths, useDoc } from '../data/api'
import { useDayIndex } from '../data/days'
import { searchStories, type SearchHit } from '../data/search'
import type { SearchIndex } from '../data/types'
import { formatDay } from '../lib/format'
import { ICON_SM, Kbd } from './ui'

interface Command {
  id: string
  group: string
  label: string
  detail?: string
  icon: ReactNode
  run: () => void
}

/** Matches "0930", "09-30", "9/30" or a full ISO date against published days. */
function matchDates(query: string, dates: string[]): string[] {
  const cleaned = query.trim()
  const full = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(cleaned)
  if (full) {
    const iso = `${full[1]}-${full[2]!.padStart(2, '0')}-${full[3]!.padStart(2, '0')}`
    return dates.filter((day) => day === iso)
  }
  const short =
    /^(\d{1,2})[-/.]?(\d{2})$/.exec(cleaned) ?? /^(\d{1,2})[-/.](\d{1,2})$/.exec(cleaned)
  if (!short) return []
  const suffix = `-${short[1]!.padStart(2, '0')}-${short[2]!.padStart(2, '0')}`
  return dates.filter((day) => day.endsWith(suffix)).slice(0, 4)
}

export function CommandPalette({
  open,
  onClose,
  onShowShortcuts,
}: {
  open: boolean
  onClose: () => void
  onShowShortcuts: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()
  const navigate = useNavigate()
  const index = useDayIndex()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  // The story index is requested only while the palette is open; later opens hit the cache.
  const [searchDoc] = useDoc<SearchIndex>(open ? paths.search : null)
  const searchIndex = searchDoc.status === 'ready' ? searchDoc.data : null
  const indexState = !open ? 'idle' : searchDoc.status === 'error' ? 'missing' : searchDoc.status
  const deferred = useDeferredValue(query)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) {
      element.showModal()
      input.current?.focus()
    }
    if (!open && element.open) element.close()
  }, [open])

  const go = (to: string) => () => {
    onClose()
    navigate(to)
  }

  const commands = useMemo<Command[]>(() => {
    const term = deferred.trim().toLowerCase()
    const views: Command[] = [
      {
        id: 'v-latest',
        group: '前往',
        label: '最新日報',
        icon: <Newspaper {...ICON_SM} />,
        run: go(route.latest()),
      },
      {
        id: 'v-archive',
        group: '前往',
        label: '封存',
        detail: '依月份瀏覽每日日報',
        icon: <Archive {...ICON_SM} />,
        run: go(route.archive()),
      },
      {
        id: 'v-reports',
        group: '前往',
        label: '週報與月報',
        icon: <CalendarRange {...ICON_SM} />,
        run: go(route.reports()),
      },
      {
        id: 'v-saved',
        group: '前往',
        label: '收藏',
        icon: <Bookmark {...ICON_SM} />,
        run: go(route.saved()),
      },
      {
        id: 'v-sources',
        group: '前往',
        label: '來源狀態',
        icon: <Activity {...ICON_SM} />,
        run: go(route.sources()),
      },
      {
        id: 'v-keys',
        group: '前往',
        label: '鍵盤快捷鍵',
        icon: <Keyboard {...ICON_SM} />,
        run: () => {
          onClose()
          onShowShortcuts()
        },
      },
    ]
    if (!term) return views
    const matchedViews = views.filter((command) =>
      `${command.label} ${command.detail ?? ''}`.toLowerCase().includes(term),
    )
    const dates: Command[] = matchDates(deferred, index.dates).map((day) => ({
      id: `d-${day}`,
      group: '日期',
      label: formatDay(day),
      icon: <CalendarDays {...ICON_SM} />,
      run: go(route.day(day)),
    }))
    const hits: SearchHit[] = searchIndex ? searchStories(searchIndex, deferred, 30) : []
    const stories: Command[] = hits.map((hit) => ({
      id: `s-${hit.id}`,
      group: '論文與文章',
      label: hit.titleZh ?? hit.title,
      detail: `${hit.date}${hit.titleZh ? ` · ${hit.title}` : ''}`,
      icon: <FileText {...ICON_SM} />,
      run: go(storyHref(hit.date, hit.id)),
    }))
    const searchAll: Command = {
      id: 'search-all',
      group: '搜尋',
      label: `在全部內容中搜尋「${deferred.trim()}」`,
      icon: <Search {...ICON_SM} />,
      run: go(route.search(deferred.trim())),
    }
    return [...dates, ...matchedViews, ...stories, searchAll]
    // go/onClose are stable for the palette's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferred, index.dates, searchIndex])

  const current = Math.min(active, Math.max(0, commands.length - 1))

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((current + 1) % Math.max(1, commands.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current - 1 + commands.length) % Math.max(1, commands.length))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      commands[current]?.run()
    }
  }

  useEffect(() => {
    document.getElementById(`${listId}-${current}`)?.scrollIntoView({ block: 'nearest' })
  }, [current, listId])

  let lastGroup = ''
  return (
    <dialog
      ref={dialog}
      className="overlay mx-auto mt-[12vh] mb-auto w-[min(640px,calc(100vw-24px))] animate-pop p-0"
      aria-label="指令面板"
      onClose={() => {
        setQuery('')
        setActive(0)
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="flex items-center gap-2 border-b border-line px-3">
        <Search size={18} strokeWidth={1.75} aria-hidden className="flex-none text-fg-3" />
        <input
          ref={input}
          name="command"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={commands.length ? `${listId}-${current}` : undefined}
          aria-autocomplete="list"
          aria-label="搜尋論文、日期或指令"
          className="h-12 min-w-0 flex-1 bg-transparent text-heading text-fg outline-none placeholder:text-fg-3"
          placeholder="搜尋論文、日期（例如 0930）或指令…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
        />
        <Kbd>Esc</Kbd>
      </div>
      <ul
        id={listId}
        role="listbox"
        aria-label="結果"
        className="max-h-[min(420px,60vh)] overflow-y-auto p-1.5"
      >
        {commands.map((command, position) => {
          const header = command.group !== lastGroup ? command.group : null
          lastGroup = command.group
          return (
            <li key={command.id} role="presentation">
              {header ? (
                <div role="presentation" className="px-2.5 pt-2 pb-1 text-caption text-fg-3">
                  {header}
                </div>
              ) : null}
              <div
                id={`${listId}-${position}`}
                role="option"
                aria-selected={position === current}
                className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 ${position === current ? 'bg-selection text-fg' : 'text-fg-2 hover:bg-elevated'}`}
                onMouseMove={() => position !== current && setActive(position)}
                onClick={() => command.run()}
              >
                <span className="flex-none text-fg-3">{command.icon}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-ui">{command.label}</span>
                  {command.detail ? (
                    <span className="truncate text-caption text-fg-3">{command.detail}</span>
                  ) : null}
                </span>
                {position === current ? (
                  <CornerDownLeft {...ICON_SM} className="flex-none text-fg-3" />
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
      <div className="flex items-center gap-3 border-t border-line px-3 py-2 text-caption text-fg-3">
        <span>
          <Kbd>↑</Kbd> <Kbd>↓</Kbd> 選擇
        </span>
        <span>
          <Kbd>Enter</Kbd> 開啟
        </span>
        <span className="ml-auto" aria-live="polite">
          {indexState === 'loading'
            ? '正在載入論文索引…'
            : indexState === 'missing'
              ? '論文索引尚未產生'
              : null}
        </span>
      </div>
    </dialog>
  )
}
