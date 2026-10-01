import {
  Activity,
  Archive,
  Bookmark,
  CalendarRange,
  FileCode,
  Keyboard,
  Menu,
  Newspaper,
  Search,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { CommandPalette } from '../components/CommandPalette'
import { ChromeInertContext } from './chrome'
import { ShortcutsDialog } from '../components/ShortcutsDialog'
import { ICON, ICON_SM, Kbd } from '../components/ui'
import { isTypingTarget } from '../lib/hooks'
import { useLibrary } from '../state/library'
import { route } from './routes'

const REPO_URL = 'https://github.com/DennySORA/daily-paper-report'

interface NavEntry {
  to: string
  label: string
  icon: ReactNode
  /** Extra path prefixes that keep this entry current. */
  match: (pathname: string) => boolean
}

const NAV: NavEntry[] = [
  {
    to: route.latest(),
    label: '日報',
    icon: <Newspaper {...ICON} />,
    match: (path) => path === '/' || path.startsWith('/day/'),
  },
  {
    to: route.archive(),
    label: '封存',
    icon: <Archive {...ICON} />,
    match: (path) => path === '/archive',
  },
  {
    to: route.reports(),
    label: '週報與月報',
    icon: <CalendarRange {...ICON} />,
    match: (path) =>
      path === '/reports' || path.startsWith('/weekly/') || path.startsWith('/monthly/'),
  },
  {
    to: route.search(),
    label: '搜尋',
    icon: <Search {...ICON} />,
    match: (path) => path === '/search',
  },
  {
    to: route.saved(),
    label: '收藏',
    icon: <Bookmark {...ICON} />,
    match: (path) => path === '/saved',
  },
  {
    to: route.sources(),
    label: '來源狀態',
    icon: <Activity {...ICON} />,
    match: (path) => path === '/sources',
  },
]

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

function NavItems({ compact, onNavigate }: { compact: boolean; onNavigate?: () => void }) {
  const { pathname } = useLocation()
  const library = useLibrary()
  const savedCount = Object.keys(library.saved).length
  return (
    <ul className="flex flex-col gap-0.5">
      {NAV.map((entry) => {
        const current = entry.match(pathname)
        return (
          <li key={entry.to}>
            <Link
              to={entry.to}
              onClick={onNavigate}
              aria-current={current ? 'page' : undefined}
              className={`nav-item ${compact ? 'justify-center px-0' : ''}`}
              title={compact ? entry.label : undefined}
            >
              <span className={current ? 'text-accent-fg' : 'text-fg-3'}>{entry.icon}</span>
              <span className={compact ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{entry.label}</span>
              {!compact && entry.to === route.saved() && savedCount ? (
                <span className="mono text-caption text-fg-3">{savedCount}</span>
              ) : null}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [chromeInert, setChromeInert] = useState(false)
  const drawer = useRef<HTMLDialogElement>(null)
  const firstPath = useRef(location.pathname)

  // Global shortcuts: ⌘K / Ctrl+K opens the palette, ? opens the shortcut list.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (
        event.key === '?' &&
        !isTypingTarget(event.target) &&
        !document.querySelector('dialog[open]')
      ) {
        event.preventDefault()
        setShortcutsOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // After a view switch (not a selection change), move focus to the new view's title.
  useEffect(() => {
    if (location.pathname === firstPath.current) return
    firstPath.current = location.pathname
    const active = document.activeElement
    if (active && active !== document.body && !active.closest('nav')) return
    document.getElementById('view-title')?.focus({ preventScroll: true })
  }, [location.pathname])

  useEffect(() => {
    const element = drawer.current
    if (!element) return
    if (drawerOpen && !element.open) element.showModal()
    if (!drawerOpen && element.open) element.close()
  }, [drawerOpen])

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:min-h-0">
      <button
        type="button"
        inert={chromeInert}
        className="sr-only-focusable btn btn-primary fixed top-2 left-2 z-50"
        onClick={() => document.getElementById('main')?.focus()}
      >
        跳到主要內容
      </button>
      <header
        inert={chromeInert}
        className="sticky top-0 z-30 flex h-12 flex-none items-center gap-3 border-b border-line-subtle bg-canvas/95 px-3"
      >
        <button
          type="button"
          className="btn btn-quiet btn-icon lg:hidden"
          aria-label="開啟導覽選單"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu {...ICON} />
        </button>
        <Link
          to={route.latest()}
          className="flex flex-none items-center gap-2 text-fg no-underline"
        >
          <img src="/favicon.svg" alt="" width={24} height={24} className="rounded-md" />
          <span className="text-heading font-semibold">論文日報</span>
        </Link>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="ml-auto flex h-8 min-w-0 items-center gap-2 rounded-md border border-line bg-sunken px-2.5 text-meta text-fg-3 transition-colors hover:border-line-strong hover:text-fg-2 sm:w-[min(420px,40vw)] lg:mx-auto"
          aria-label="開啟指令面板與搜尋"
        >
          <Search {...ICON_SM} />
          <span className="hidden truncate sm:inline">搜尋論文、日期或指令</span>
          <span className="ml-auto hidden gap-0.5 sm:flex">
            <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
        <div className="flex flex-none items-center gap-1">
          <button
            type="button"
            className="btn btn-quiet btn-icon max-sm:hidden"
            aria-label="鍵盤快捷鍵"
            title="鍵盤快捷鍵（?）"
            onClick={() => setShortcutsOpen(true)}
          >
            <Keyboard {...ICON} />
          </button>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-quiet btn-icon"
            aria-label="原始碼（GitHub，在新分頁開啟）"
            title="原始碼"
          >
            <FileCode {...ICON} />
          </a>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav
          inert={chromeInert}
          aria-label="主要導覽"
          className="hidden flex-none flex-col justify-between border-r border-line-subtle bg-canvas py-2 lg:flex lg:w-14 lg:px-1.5 xl:w-[200px] xl:px-2"
        >
          <div className="hidden xl:block">
            <NavItems compact={false} />
          </div>
          <div className="xl:hidden">
            <NavItems compact />
          </div>
          <p className="hidden px-2 text-caption text-fg-3 xl:block">
            按 <Kbd>?</Kbd> 查看快捷鍵
          </p>
        </nav>
        <main id="main" className="flex min-h-0 min-w-0 flex-1 flex-col" tabIndex={-1}>
          <ChromeInertContext value={setChromeInert}>{children}</ChromeInertContext>
        </main>
      </div>

      <dialog
        ref={drawer}
        className="overlay my-0 mr-auto ml-0 h-dvh max-h-dvh w-[min(280px,85vw)] rounded-none rounded-r-xl p-0"
        aria-label="導覽選單"
        onClose={() => setDrawerOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setDrawerOpen(false)
        }}
      >
        <div className="flex h-full flex-col gap-3 p-3">
          <div className="flex items-center justify-between">
            <span className="text-heading font-semibold">論文日報</span>
            <button
              type="button"
              className="btn btn-quiet btn-icon"
              aria-label="關閉選單"
              onClick={() => setDrawerOpen(false)}
            >
              <X {...ICON_SM} />
            </button>
          </div>
          <nav aria-label="主要導覽">
            <NavItems compact={false} onNavigate={() => setDrawerOpen(false)} />
          </nav>
        </div>
      </dialog>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onShowShortcuts={() => setShortcutsOpen(true)}
      />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  )
}
