import { Bookmark, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { route, storyHref } from '../app/routes'
import { CopyButton, ICON, ICON_SM, Meter, StateMessage } from '../components/ui'
import { formatScore } from '../lib/format'
import { bibtex } from '../data/story'
import { removeSaved, useLibrary } from '../state/library'
import { useLang } from '../state/lang'

export function SavedView() {
  const library = useLibrary()
  const { lang, t } = useLang()
  const saved = Object.values(library.saved).sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  const bib = saved
    .map(bibtex)
    .filter((entry): entry is string => entry !== null)
    .join('\n\n')

  return (
    <div className="scroll-region flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-3 px-4 pt-3 pb-3 lg:px-3">
        <Bookmark {...ICON} className="text-fg-3" />
        <h1 id="view-title" tabIndex={-1} className="text-title font-semibold outline-none">
          {t('收藏', 'Saved')}
        </h1>
        <span className="text-meta text-fg-3">
          {t(
            `${saved.length} 篇 · 只儲存在這個瀏覽器`,
            `${saved.length} papers · stored in this browser only`,
          )}
        </span>
        {bib ? (
          <span className="ml-auto">
            <CopyButton text={bib} label={t('複製全部 BibTeX', 'Copy all BibTeX')} />
          </span>
        ) : null}
      </header>
      <div className="px-2 pb-4">
        <div className="panel max-w-[1100px]">
          {saved.length === 0 ? (
            <StateMessage
              title={t('還沒有收藏的論文', 'No saved papers yet')}
              actions={
                <Link to={route.latest()} className="btn">
                  {t('前往最新日報', 'Go to the latest digest')}
                </Link>
              }
            >
              {t('在閱讀窗格按「收藏」或快捷鍵', 'Press Save in the reading pane, or')}{' '}
              <kbd className="kbd">S</kbd>
              {t('，之後就能在這裡找到。', ', to find papers here later.')}
            </StateMessage>
          ) : (
            <ul className="flex flex-col gap-0.5 p-1.5">
              {saved.map((paper) => (
                <li key={paper.id} className="flex items-center gap-1">
                  <Link
                    to={storyHref(paper.date, paper.id)}
                    className="row grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] gap-4 px-3 py-2.5"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-ui font-medium text-fg">
                        {lang === 'en' ? paper.titleEn : (paper.titleZh ?? paper.titleEn)}
                      </span>
                      {lang === 'zh' && paper.titleZh ? (
                        <span className="truncate text-meta text-fg-3" lang="en">
                          {paper.titleEn}
                        </span>
                      ) : null}
                      <span className="mono text-caption text-fg-3">
                        {paper.arxivId ?? paper.id} · {t('收藏於', 'saved')}{' '}
                        {paper.savedAt.slice(0, 10)}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <span className="mono text-meta text-fg-2">{paper.date}</span>
                      {paper.score !== null ? (
                        <span className="flex items-center gap-1.5">
                          <Meter value={paper.score} className="h-1 w-8" />
                          <span className="mono text-caption text-fg-2">
                            {formatScore(paper.score)}
                          </span>
                        </span>
                      ) : null}
                    </span>
                  </Link>
                  <button
                    type="button"
                    className="btn btn-quiet btn-icon"
                    aria-label={t(
                      `移除收藏：${paper.titleZh ?? paper.titleEn}`,
                      `Remove from saved: ${paper.titleEn}`,
                    )}
                    title={t('移除收藏', 'Remove from saved')}
                    onClick={() => removeSaved(paper.id)}
                  >
                    <Trash2 {...ICON_SM} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
