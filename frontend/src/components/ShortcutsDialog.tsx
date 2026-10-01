import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { ICON_SM, Kbd } from './ui'

const GROUPS: Array<{ title: string; items: Array<[keys: string[], label: string]> }> = [
  {
    title: '閱讀',
    items: [
      [['J'], '下一篇'],
      [['K'], '上一篇'],
      [['O'], '開啟原文／arXiv'],
      [['P'], '開啟 PDF'],
      [['S'], '收藏或取消收藏'],
      [['M'], '標記已讀／未讀'],
      [['E'], '展開或收合英文摘要'],
    ],
  },
  {
    title: '清單',
    items: [
      [['1', '…', '5'], '切換區段（全部、精選、論文…）'],
      [['U'], '只看未讀'],
      [['/'], '篩選目前清單'],
      [['[', ']'], '前一份／後一份日報或報告'],
    ],
  },
  {
    title: '全域',
    items: [
      [['⌘', 'K'], '指令面板與全站搜尋（Windows／Linux 為 Ctrl K）'],
      [['?'], '顯示這份說明'],
      [['Esc'], '關閉面板或返回清單'],
    ],
  },
]

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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
          鍵盤快捷鍵
        </h2>
        <button
          type="button"
          className="btn btn-quiet btn-icon"
          aria-label="關閉"
          onClick={onClose}
        >
          <X {...ICON_SM} />
        </button>
      </div>
      <div className="grid gap-5 p-4 sm:grid-cols-2">
        {GROUPS.map((group) => (
          <section
            key={group.title}
            aria-labelledby={`keys-${group.title}`}
            className="flex flex-col gap-2"
          >
            <h3 id={`keys-${group.title}`} className="text-caption font-semibold text-fg-3">
              {group.title}
            </h3>
            <dl className="flex flex-col gap-1.5">
              {group.items.map(([keys, label]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt className="text-meta text-fg-2">{label}</dt>
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
