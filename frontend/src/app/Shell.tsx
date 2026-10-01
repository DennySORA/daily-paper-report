import {
  Activity,
  Archive,
  Bookmark,
  CalendarRange,
  FileCode,
  Keyboard,
  Menu,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { CommandPalette } from '../components/CommandPalette'
import { ShortcutsDialog } from '../components/ShortcutsDialog'
import { ICON, ICON_SM, Kbd } from '../components/ui'
import { isTypingTarget } from '../lib/hooks'
import { LANG_TAG, setLang, useLang } from '../state/lang'
import { setPref, useLibrary, type Lang } from '../state/library'
import { ChromeInertContext } from './chrome'
import { route } from './routes'

const REPO_URL = 'https://github.com/DennySORA/daily-paper-report'

interface NavEntry {
  to: string
  zh: string
  en: string
  icon: ReactNode
  match: (pathname: string) => boolean
}

const NAV: NavEntry[] = [
  {
    to: route.latest(),
    zh: '日報',
    en: 'Daily',
    icon: <Newspaper {...ICON} />,
    match: (path) => path === '/' || path.startsWith('/day/'),
  },
  {
    to: route.archive(),
    zh: '封存',
    en: 'Archive',
    icon: <Archive {...ICON} />,
    match: (path) => path === '/archive',
  },
  {
    to: route.reports(),
    zh: '週報與月報',
    en: 'Reports',
    icon: <CalendarRange {...ICON} />,
    match: (path) =>
      path === '/reports' || path.startsWith('/weekly/') || path.startsWith('/monthly/'),
  },
  {
    to: route.search(),
    zh: '搜尋',
    en: 'Search',
    icon: <Search {...ICON} />,
    match: (path) => path === '/search',
  },
  {
    to: route.saved(),
    zh: '收藏',
    en: 'Saved',
    icon: <Bookmark {...ICON} />,
    match: (path) => path === '/saved',
  },
  {
    to: route.sources(),
    zh: '來源狀態',
    en: 'Sources',
    icon: <Activity {...ICON} />,
    match: (path) => path === '/sources',
  },
]

export const BRAND = { zh: '論文日報', en: 'Paper Daily' }

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

function NavItems({ compact, onNavigate }: { compact: boolean; onNavigate?: () => void }) {
  const { pathname } = useLocation()
  const { lang } = useLang()
  const library = useLibrary()
  const savedCount = Object.keys(library.saved).length
  return (
    <ul className="flex flex-col gap-0.5">
      {NAV.map((entry) => {
        const current = entry.match(pathname)
        const label = entry[lang]
        return (
          <li key={entry.to}>
            <Link
              to={entry.to}
              onClick={onNavigate}
              aria-current={current ? 'page' : undefined}
              className={`nav-item ${compact ? 'justify-center px-0' : ''}`}
              title={compact ? label : undefined}
            >
              <span className={current ? 'text-accent-fg' : 'text-fg-3'}>{entry.icon}</span>
              <span className={compact ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{label}</span>
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

/** Interface and reading language: a two-option radio group. */
function LanguageSwitch() {
  const { lang, t } = useLang()
  const options: Array<[Lang, string, string]> = [
    ['zh', '中文', '繁體中文'],
    ['en', 'EN', 'English'],
  ]
  return (
    <fieldset className="segmented flex-none">
      <legend className="sr-only">{t('介面與閱讀語言', 'Interface and reading language')}</legend>
      {options.map(([value, short, full]) => (
        <label key={value} className="segment px-2" title={full}>
          <input
            type="radio"
            name="lang"
            checked={lang === value}
            onChange={() => setLang(value)}
            lang={LANG_TAG[value]}
          />
          <span lang={LANG_TAG[value]} aria-hidden="true">
            {short}
          </span>
          <span className="sr-only" lang={LANG_TAG[value]}>
            {full}
          </span>
        </label>
      ))}
    </fieldset>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { lang, t } = useLang()
  const navCollapsed = useLibrary().prefs.navCollapsed
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [chromeInert, setChromeInert] = useState(false)
  const drawer = useRef<HTMLDialogElement>(null)
  const firstPath = useRef(location.pathname)

  // The document language and title follow the chosen language.
  useEffect(() => {
    document.documentElement.lang = LANG_TAG[lang]
    document.title = BRAND[lang]
  }, [lang])

  // Global shortcuts: ⌘K / Ctrl+K opens the palette, ? the shortcut list, B the sidebar.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target) || document.querySelector('dialog[open]')) return
      if (event.key === '?') {
        event.preventDefault()
        setShortcutsOpen(true)
      } else if (event.key === 'b') {
        event.preventDefault()
        setPref('navCollapsed', !navCollapsed)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navCollapsed])

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

  // Expanded below 1280 px only when chosen; collapsed always shows the icon rail.
  const wide = !navCollapsed
  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:min-h-0">
      <button
        type="button"
        inert={chromeInert}
        className="sr-only-focusable btn btn-primary fixed top-2 left-2 z-50"
        onClick={() => document.getElementById('main')?.focus()}
      >
        {t('跳到主要內容', 'Skip to content')}
      </button>
      <header
        inert={chromeInert}
        className="sticky top-0 z-30 flex h-12 flex-none items-center gap-3 border-b border-line-subtle bg-canvas/95 px-3"
      >
        <button
          type="button"
          className="btn btn-quiet btn-icon lg:hidden"
          aria-label={t('開啟導覽選單', 'Open navigation')}
          onClick={() => setDrawerOpen(true)}
        >
          <Menu {...ICON} />
        </button>
        <Link
          to={route.latest()}
          className="flex flex-none items-center gap-2 text-fg no-underline"
        >
          <img src="/favicon.svg" alt="" width={24} height={24} className="rounded-md" />
          <span className="text-heading font-semibold max-sm:hidden">{BRAND[lang]}</span>
        </Link>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="ml-auto flex h-8 min-w-0 items-center gap-2 rounded-md border border-line bg-sunken px-2.5 text-meta text-fg-3 transition-colors hover:border-line-strong hover:text-fg-2 sm:w-[min(420px,36vw)] lg:mx-auto"
          aria-label={t('開啟指令面板與搜尋', 'Open the command palette and search')}
        >
          <Search {...ICON_SM} />
          <span className="hidden truncate sm:inline">
            {t('搜尋論文、日期或指令', 'Search papers, dates or commands')}
          </span>
          <span className="ml-auto hidden gap-0.5 sm:flex">
            <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
        <div className="flex flex-none items-center gap-1">
          <LanguageSwitch />
          <button
            type="button"
            className="btn btn-quiet btn-icon max-sm:hidden"
            aria-label={t('鍵盤快捷鍵', 'Keyboard shortcuts')}
            title={t('鍵盤快捷鍵（?）', 'Keyboard shortcuts (?)')}
            onClick={() => setShortcutsOpen(true)}
          >
            <Keyboard {...ICON} />
          </button>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-quiet btn-icon max-sm:hidden"
            aria-label={t(
              '原始碼（GitHub，在新分頁開啟）',
              'Source code (GitHub, opens in a new tab)',
            )}
            title={t('原始碼', 'Source code')}
          >
            <FileCode {...ICON} />
          </a>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav
          inert={chromeInert}
          aria-label={t('主要導覽', 'Main navigation')}
          className={`hidden flex-none flex-col justify-between border-r border-line-subtle bg-canvas py-2 lg:flex lg:w-14 lg:px-1.5 ${
            wide ? 'xl:w-[200px] xl:px-2' : ''
          }`}
        >
          <div className={wide ? 'hidden xl:block' : 'hidden'}>
            <NavItems compact={false} />
          </div>
          <div className={wide ? 'xl:hidden' : ''}>
            <NavItems compact />
          </div>
          <div className="flex flex-col gap-2">
            {/* The rail is always compact below 1280 px; the toggle matters from there up. */}
            <button
              type="button"
              className={`nav-item hidden w-full xl:flex ${wide ? '' : 'justify-center px-0'}`}
              aria-pressed={!wide}
              onClick={() => setPref('navCollapsed', wide)}
              title={
                wide
                  ? t('收合側欄（B）', 'Collapse sidebar (B)')
                  : t('展開側欄（B）', 'Expand sidebar (B)')
              }
            >
              <span className="text-fg-3">
                {wide ? <PanelLeftClose {...ICON} /> : <PanelLeftOpen {...ICON} />}
              </span>
              <span className={wide ? '' : 'sr-only'}>
                {wide ? t('收合側欄', 'Collapse sidebar') : t('展開側欄', 'Expand sidebar')}
              </span>
            </button>
            {wide ? (
              <p className="hidden px-2 text-caption text-fg-3 xl:block">
                {t('按', 'Press')} <Kbd>?</Kbd> {t('查看快捷鍵', 'for shortcuts')}
              </p>
            ) : null}
          </div>
        </nav>
        <main id="main" className="flex min-h-0 min-w-0 flex-1 flex-col" tabIndex={-1}>
          <ChromeInertContext value={setChromeInert}>{children}</ChromeInertContext>
        </main>
      </div>

      <dialog
        ref={drawer}
        className="overlay my-0 mr-auto ml-0 h-dvh max-h-dvh w-[min(280px,85vw)] rounded-none rounded-r-xl p-0"
        aria-label={t('導覽選單', 'Navigation')}
        onClose={() => setDrawerOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setDrawerOpen(false)
        }}
      >
        <div className="flex h-full flex-col gap-3 p-3">
          <div className="flex items-center justify-between">
            <span className="text-heading font-semibold">{BRAND[lang]}</span>
            <button
              type="button"
              className="btn btn-quiet btn-icon"
              aria-label={t('關閉選單', 'Close navigation')}
              onClick={() => setDrawerOpen(false)}
            >
              <X {...ICON_SM} />
            </button>
          </div>
          <nav aria-label={t('主要導覽', 'Main navigation')}>
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
