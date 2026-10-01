import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useLang } from '../state/lang'
import { ICON_SM, Kbd } from './ui'

type Item = [keys: string[], zh: string, en: string]

const GROUPS: Array<{ zh: string; en: string; items: Item[] }> = [
  {
    zh: '閱讀',
    en: 'Reading',
    items: [
      [['J'], '下一篇', 'Next item'],
      [['K'], '上一篇', 'Previous item'],
      [['O'], '開啟原文／arXiv', 'Open the source or arXiv'],
      [['P'], '開啟 PDF', 'Open the PDF'],
      [['S'], '收藏或取消收藏', 'Save or unsave'],
      [['M'], '標記已讀／未讀', 'Mark read or unread'],
      [['E'], '展開或收合另一語言的摘要', 'Show or hide the other-language summary'],
    ],
  },
  {
    zh: '清單與版面',
    en: 'List and layout',
    items: [
      [['1', '…', '5'], '切換區段（全部、精選、論文…）', 'Switch section (all, top 5, papers…)'],
      [['U'], '只看未讀', 'Unread only'],
      [['/'], '篩選目前清單', 'Filter the current list'],
      [['[', ']'], '前一份／後一份日報或報告', 'Previous or next digest or report'],
      [['F'], '收起或顯示清單', 'Hide or show the list'],
      [['B'], '收合或展開側欄', 'Collapse or expand the sidebar'],
    ],
  },
  {
    zh: '全域',
    en: 'Global',
    items: [
      [
        ['⌘', 'K'],
        '指令面板與全站搜尋（Windows／Linux 為 Ctrl K）',
        'Command palette and search (Ctrl K on Windows/Linux)',
      ],
      [['?'], '顯示這份說明', 'Show this list'],
      [['Esc'], '關閉面板或返回清單', 'Close a panel or go back to the list'],
    ],
  },
]

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang, t } = useLang()
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return (
    <dialog
      ref={dialog}
      className="overlay m-auto w-[min(560px,calc(100vw-24px))] animate-pop p-0"
      aria-labelledby="shortcuts-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 id="shortcuts-title" className="text-heading font-semibold">
          {t('鍵盤快捷鍵', 'Keyboard shortcuts')}
        </h2>
        <button
          type="button"
          className="btn btn-quiet btn-icon"
          aria-label={t('關閉', 'Close')}
          onClick={onClose}
        >
          <X {...ICON_SM} />
        </button>
      </div>
      <div className="grid gap-5 p-4 sm:grid-cols-2">
        {GROUPS.map((group) => (
          <section
            key={group.en}
            aria-labelledby={`keys-${group.en}`}
            className="flex flex-col gap-2"
          >
            <h3 id={`keys-${group.en}`} className="text-caption font-semibold text-fg-3">
              {group[lang]}
            </h3>
            <dl className="flex flex-col gap-1.5">
              {group.items.map(([keys, zh, en]) => (
                <div key={en} className="flex items-center justify-between gap-3">
                  <dt className="text-meta text-fg-2">{lang === 'en' ? en : zh}</dt>
                  <dd className="m-0 flex flex-none gap-1">
                    {keys.map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  )
}
