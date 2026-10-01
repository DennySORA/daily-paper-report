import { BookmarkCheck } from 'lucide-react'
import { memo, useEffect, useRef } from 'react'
import { Link } from 'react-router'
import {
  KIND_LABEL,
  SECTION_HINT,
  SECTION_LABEL,
  storyTitles,
  type Story,
  type StoryGroup,
} from '../data/story'
import { topicLabel } from '../data/topics'
import type { Lang } from '../state/library'
import { formatScore } from '../lib/format'
import { ICON_SM, Meter } from './ui'

interface RowProps {
  story: Story
  href: string
  selected: boolean
  read: boolean
  saved: boolean
  replace: boolean
  lang: Lang
}

const StoryRow = memo(function StoryRow({
  story,
  href,
  selected,
  read,
  saved,
  replace,
  lang,
}: RowProps) {
  const score = story.evaluation?.score ?? null
  const { title, subtitle } = storyTitles(story, lang)
  const t = (zh: string, en: string) => (lang === 'en' ? en : zh)
  return (
    <li>
      <Link
        to={href}
        replace={replace}
        className="row grid grid-cols-[28px_minmax(0,1fr)] gap-x-2 px-3 py-2.5"
        aria-current={selected ? 'true' : undefined}
        data-story-id={story.id}
      >
        <span className="flex flex-col items-center gap-1.5 pt-[3px]">
          <span className="mono text-caption text-fg-3">{String(story.rank).padStart(2, '0')}</span>
          {read ? (
            <span className="sr-only">{t('已讀', 'read')}</span>
          ) : (
            <span className="size-1.5 rounded-full bg-accent-fg" title={t('未讀', 'Unread')}>
              <span className="sr-only">{t('未讀', 'unread')}</span>
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span
            className={`line-clamp-2 text-ui ${read && !selected ? 'text-fg-2' : 'font-medium text-fg'}`}
            lang={title === story.titleEn ? 'en' : 'zh-Hant'}
          >
            {title}
          </span>
          {subtitle ? (
            <span className="truncate text-meta text-fg-3" lang="en">
              {subtitle}
            </span>
          ) : null}
          <span className="flex min-w-0 items-center gap-2 text-caption text-fg-3">
            {score !== null ? (
              <span
                className="flex flex-none items-center gap-1.5"
                title={t('LLM 綜合分數', 'LLM overall score')}
              >
                <Meter value={score} className="h-1 w-8" />
                <span className="mono text-fg-2">{formatScore(score)}</span>
              </span>
            ) : (
              <span className="flex-none" title={t('未經 LLM 評分', 'Not scored by the LLM')}>
                {t('未評分', 'Unscored')}
              </span>
            )}
            <span className="flex-none text-entity">
              {story.group ?? KIND_LABEL[story.kind][lang]}
            </span>
            {story.topics[0] ? (
              <span className="min-w-0 truncate">{topicLabel(story.topics[0], lang)}</span>
            ) : null}
            {saved ? (
              <span className="ml-auto flex-none text-accent-fg">
                <BookmarkCheck {...ICON_SM} />
                <span className="sr-only">{t('已收藏', 'saved')}</span>
              </span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  )
})

export function StoryList({
  groups,
  selectedId,
  hrefFor,
  readIds,
  savedIds,
  showHeaders,
  replaceHistory,
  lang,
}: {
  groups: StoryGroup[]
  selectedId: string | null
  hrefFor: (story: Story) => string
  readIds: Record<string, number>
  savedIds: Record<string, unknown>
  showHeaders: boolean
  replaceHistory: boolean
  lang: Lang
}) {
  const listRef = useRef<HTMLDivElement>(null)

  // Keep the selected row visible after keyboard navigation or deep links.
  useEffect(() => {
    if (!selectedId) return
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-story-id="${CSS.escape(selectedId)}"]`,
    )
    row?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  return (
    <div ref={listRef} className="flex flex-col pb-4">
      {groups.map((group) =>
        group.stories.length ? (
          <section key={group.section} aria-labelledby={`group-${group.section}`}>
            {showHeaders ? (
              <h2
                id={`group-${group.section}`}
                className="sticky top-0 z-10 flex items-baseline gap-2 border-b border-line-subtle bg-surface/95 px-4 py-1.5 text-meta font-semibold text-fg-2"
              >
                {SECTION_LABEL[group.section][lang]}
                <span className="mono font-normal text-fg-3">{group.stories.length}</span>
                <span className="ml-auto font-normal text-fg-3">
                  {SECTION_HINT[group.section][lang]}
                </span>
              </h2>
            ) : (
              <h2 id={`group-${group.section}`} className="sr-only">
                {SECTION_LABEL[group.section][lang]}
              </h2>
            )}
            <ul className="flex flex-col gap-0.5 px-1.5 pt-1">
              {group.stories.map((story) => (
                <StoryRow
                  key={story.id}
                  story={story}
                  href={hrefFor(story)}
                  selected={story.id === selectedId}
                  read={story.id in readIds}
                  saved={story.id in savedIds}
                  replace={replaceHistory}
                  lang={lang}
                />
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  )
}
