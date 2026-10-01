import { BookmarkCheck } from 'lucide-react'
import { memo, useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { KIND_LABEL, SECTION_HINT, SECTION_LABEL, type Story, type StoryGroup } from '../data/story'
import { formatScore } from '../lib/format'
import { ICON_SM, Meter } from './ui'

interface RowProps {
  story: Story
  href: string
  selected: boolean
  read: boolean
  saved: boolean
  replace: boolean
}

const StoryRow = memo(function StoryRow({ story, href, selected, read, saved, replace }: RowProps) {
  const score = story.evaluation?.score ?? null
  const title = story.titleZh ?? story.titleEn
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
            <span className="sr-only">已讀</span>
          ) : (
            <span className="size-1.5 rounded-full bg-accent-fg" title="未讀">
              <span className="sr-only">未讀</span>
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span
            className={`line-clamp-2 text-ui ${read && !selected ? 'text-fg-2' : 'font-medium text-fg'}`}
          >
            {title}
          </span>
          {story.titleZh ? (
            <span className="truncate text-meta text-fg-3" lang="en">
              {story.titleEn}
            </span>
          ) : null}
          <span className="flex min-w-0 items-center gap-2 text-caption text-fg-3">
            {score !== null ? (
              <span className="flex flex-none items-center gap-1.5" title="LLM 綜合分數">
                <Meter value={score} className="h-1 w-8" />
                <span className="mono text-fg-2">{formatScore(score)}</span>
              </span>
            ) : (
              <span className="flex-none" title="未經 LLM 評分">
                未評分
              </span>
            )}
            <span className="flex-none text-entity">{story.group ?? KIND_LABEL[story.kind]}</span>
            {story.topics[0] ? (
              <span className="min-w-0 truncate">{story.topics[0].label}</span>
            ) : null}
            {saved ? (
              <span className="ml-auto flex-none text-accent-fg">
                <BookmarkCheck {...ICON_SM} />
                <span className="sr-only">已收藏</span>
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
}: {
  groups: StoryGroup[]
  selectedId: string | null
  hrefFor: (story: Story) => string
  readIds: Record<string, number>
  savedIds: Record<string, unknown>
  showHeaders: boolean
  replaceHistory: boolean
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
                {SECTION_LABEL[group.section]}
                <span className="mono font-normal text-fg-3">{group.stories.length}</span>
                <span className="ml-auto font-normal text-fg-3">{SECTION_HINT[group.section]}</span>
              </h2>
            ) : (
              <h2 id={`group-${group.section}`} className="sr-only">
                {SECTION_LABEL[group.section]}
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
                />
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  )
}
