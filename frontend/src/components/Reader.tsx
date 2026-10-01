import {
  ArrowLeft,
  BookmarkCheck,
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleCheck,
  Link2,
  Quote,
  ScrollText,
  Tag,
  TriangleAlert,
  Users,
} from 'lucide-react'
import { Link } from 'react-router'
import { useEffect, type ReactNode } from 'react'
import {
  KIND_LABEL,
  SECTION_LABEL,
  bibtex,
  isSafeHttpUrl,
  readingLinks,
  type Story,
} from '../data/story'
import { formatCompact, formatDay, formatInt, formatTimestamp, utcDate } from '../lib/format'
import { paragraphs, segmentEvidence } from '../lib/text'
import { setPref, setRead, toggleSaved, useLibrary } from '../state/library'
import { CompactScorecard, RankBreakdown, Scorecard } from './Scorecard'
import { Badge, CopyButton, ExternalLink, ICON, ICON_SM, Kbd } from './ui'

export interface ReaderNav {
  index: number
  total: number
  prevHref: string | null
  nextHref: string | null
  closeHref: string
}

function Section({
  id,
  icon,
  title,
  children,
  aside,
}: {
  id: string
  icon: ReactNode
  title: string
  children: ReactNode
  aside?: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="flex items-center gap-2 text-heading font-semibold">
          {icon}
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Evidence({ items }: { items: string[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {items.map((item, index) => (
        <li key={index} className="grid grid-cols-[24px_minmax(0,1fr)] gap-2">
          <span className="mono pt-0.5 text-caption text-fg-3">
            {String(index + 1).padStart(2, '0')}
          </span>
          <p className="prose-en text-ui">
            {segmentEvidence(item).map((segment, part) =>
              segment.kind === 'link' && isSafeHttpUrl(segment.value) ? (
                <a
                  key={part}
                  href={segment.value}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-info underline underline-offset-2"
                >
                  {segment.value}
                </a>
              ) : segment.kind === 'ref' ? (
                <span key={part} className="mono rounded-sm bg-sunken px-1 text-meta text-file">
                  {segment.value}
                </span>
              ) : (
                <span key={part}>{segment.value}</span>
              ),
            )}
          </p>
        </li>
      ))}
    </ol>
  )
}

function Facts({ story }: { story: Story }) {
  const ev = story.evaluation
  const rows: Array<[string, ReactNode]> = [
    ['story_id', story.id],
    ['發表時間', formatTimestamp(story.publishedAt)],
    ['首次收錄', formatTimestamp(story.firstSeenAt)],
    ['收錄來源', story.sourceId || '未知'],
  ]
  if (ev?.model) rows.push(['評分模型', ev.model])
  if (ev?.promptVersion) rows.push(['提示版本', ev.promptVersion])
  if (ev?.fulltextSha) rows.push(['全文 SHA-256', `${ev.fulltextSha.slice(0, 16)}…`])
  if (ev?.tokens?.total_tokens)
    rows.push([
      'Token 用量',
      `${formatInt(ev.tokens.prompt_tokens)} 輸入 · ${formatInt(ev.tokens.completion_tokens)} 輸出`,
    ])
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-meta">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-fg-3">{label}</dt>
          <dd className="mono m-0 break-all text-fg-2">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Reader({
  story,
  nav,
  topicHref,
  narrow,
}: {
  story: Story
  nav: ReaderNav
  topicHref: (key: string) => string
  narrow: boolean
}) {
  const library = useLibrary()
  const read = story.id in library.read
  const saved = story.id in library.saved

  // Opening a story marks it read after a short dwell, so fast j/k scanning does not.
  useEffect(() => {
    if (story.id in library.read) return
    const timer = window.setTimeout(() => setRead(story.id, true), 1200)
    return () => window.clearTimeout(timer)
    // Only the story identity restarts the dwell timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.id])

  const links = readingLinks(story)
  const bib = bibtex(story)
  const ev = story.evaluation
  const primaryTitle = story.titleZh ?? story.titleEn
  const published = utcDate(story.publishedAt)

  return (
    <article className="@container animate-enter" aria-labelledby="reader-title" key={story.id}>
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-5 pt-5 pb-16 @3xl:px-8 @3xl:pt-7">
        {narrow ? (
          <div className="flex items-center justify-between gap-2">
            <Link to={nav.closeHref} className="btn btn-quiet -ml-2">
              <ArrowLeft {...ICON} />
              返回列表
            </Link>
            <span className="mono text-meta text-fg-3">
              {nav.index + 1} / {nav.total}
            </span>
          </div>
        ) : null}

        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="accent">
              {SECTION_LABEL[story.section]}
              {story.report ? ` #${story.report.rank}` : ` #${story.rank}`}
            </Badge>
            <Badge tone="entity">{KIND_LABEL[story.kind]}</Badge>
            {story.arxivId ? (
              <span className="mono text-meta text-file">{story.arxivId}</span>
            ) : null}
            {story.categories.slice(0, 4).map((category) => (
              <span key={category} className="mono text-meta text-fg-3">
                {category}
              </span>
            ))}
            {published ? <span className="text-meta text-fg-3">· 發表於 {published}</span> : null}
          </div>
          <h1
            id="reader-title"
            tabIndex={-1}
            className="text-title font-semibold text-balance text-fg outline-none"
          >
            {primaryTitle}
          </h1>
          {story.titleZh ? (
            <p className="text-heading font-normal text-fg-2" lang="en">
              {story.titleEn}
            </p>
          ) : null}
          {story.authors.length ? (
            <p className="flex items-start gap-2 text-meta text-fg-2">
              <Users {...ICON_SM} className="mt-[3px] flex-none text-fg-3" />
              <span lang="en">
                {story.authors.slice(0, 12).join(', ')}
                {story.authors.length > 12 ? ` 等 ${story.authors.length} 位作者` : ''}
              </span>
            </p>
          ) : null}
          {story.entities.length || story.group ? (
            <div className="flex flex-wrap gap-1.5">
              {story.group ? <Badge tone="entity">{story.group}</Badge> : null}
              {story.entities.map((entity) => (
                <Badge key={entity.id} tone="entity">
                  {entity.name}
                </Badge>
              ))}
            </div>
          ) : null}

          <div
            className="flex flex-wrap items-center gap-2 pt-1"
            role="group"
            aria-label="閱讀操作"
          >
            {links.map((link) =>
              isSafeHttpUrl(link.href) ? (
                <ExternalLink key={link.href} href={link.href} primary={link.primary}>
                  {link.label}
                </ExternalLink>
              ) : null,
            )}
            <button
              type="button"
              className="btn"
              aria-pressed={saved}
              onClick={() => toggleSaved(story)}
              title="快捷鍵 S"
            >
              {saved ? (
                <BookmarkCheck {...ICON_SM} className="text-accent-fg" />
              ) : (
                <BookmarkPlus {...ICON_SM} />
              )}
              {saved ? '已收藏' : '收藏'}
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              aria-pressed={read}
              onClick={() => setRead(story.id, !read)}
              title="快捷鍵 M"
            >
              {read ? <CircleCheck {...ICON_SM} className="text-fg-2" /> : <Circle {...ICON_SM} />}
              {read ? '已讀' : '未讀'}
            </button>
            {bib ? <CopyButton text={bib} label="BibTeX" quiet /> : null}
          </div>
        </header>

        <div className="@5xl:hidden">
          <CompactScorecard evaluation={ev} />
        </div>

        <div className="grid grid-cols-1 gap-8 @5xl:grid-cols-[minmax(0,1fr)_300px] @5xl:gap-10">
          <div className="flex min-w-0 max-w-[680px] flex-col gap-8">
            {story.summaryZh ? (
              <Section
                id="guide-title"
                icon={<ScrollText {...ICON_SM} className="text-fg-3" />}
                title="中文導讀"
              >
                <div className="prose-zh">
                  {paragraphs(story.summaryZh).map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </div>
              </Section>
            ) : (
              <Section
                id="guide-title"
                icon={<ScrollText {...ICON_SM} className="text-fg-3" />}
                title="英文摘要"
                aside={
                  <Badge tone="warning" title="翻譯階段未產生這篇的中文導讀">
                    <TriangleAlert {...ICON_SM} />
                    尚無中文導讀
                  </Badge>
                }
              >
                {story.abstract ? (
                  <div className="prose-en" lang="en">
                    {paragraphs(story.abstract).map((paragraph, index) => (
                      <p key={index} className="mb-3 last:mb-0">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-meta text-fg-3">來源沒有提供摘要。</p>
                )}
              </Section>
            )}

            {ev?.rationale ? (
              <Section
                id="rationale-title"
                icon={<Quote {...ICON_SM} className="text-fg-3" />}
                title="評審理由"
                aside={<span className="text-caption text-fg-3">LLM 依評分標準撰寫（英文）</span>}
              >
                <details
                  open={library.prefs.rationaleOpen}
                  onToggle={(event) => setPref('rationaleOpen', event.currentTarget.open)}
                  className="group"
                >
                  <summary className="cursor-pointer text-meta text-fg-3 select-none group-open:mb-2">
                    {library.prefs.rationaleOpen ? '收合' : '展開評審理由'}
                  </summary>
                  <p className="prose-en" lang="en">
                    {ev.rationale}
                  </p>
                </details>
              </Section>
            ) : null}

            {ev?.evidence.length ? (
              <Section
                id="evidence-title"
                icon={<Quote {...ICON_SM} className="text-fg-3" />}
                title="全文證據"
                aside={<span className="text-caption text-fg-3">{ev.evidence.length} 則摘錄</span>}
              >
                <Evidence items={ev.evidence} />
              </Section>
            ) : null}

            {story.summaryZh && story.abstract ? (
              <Section
                id="abstract-title"
                icon={<ScrollText {...ICON_SM} className="text-fg-3" />}
                title="英文摘要"
              >
                <details
                  open={library.prefs.abstractOpen}
                  onToggle={(event) => setPref('abstractOpen', event.currentTarget.open)}
                  className="group"
                >
                  <summary className="cursor-pointer text-meta text-fg-3 select-none group-open:mb-2">
                    {library.prefs.abstractOpen ? '收合' : '展開英文摘要'}
                    <span className="ml-2 hidden md:inline">
                      <Kbd>E</Kbd>
                    </span>
                  </summary>
                  <div className="prose-en" lang="en">
                    {paragraphs(story.abstract).map((paragraph, index) => (
                      <p key={index} className="mb-3 last:mb-0">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </details>
              </Section>
            ) : null}
          </div>

          <aside
            className="flex min-w-0 flex-col gap-8 @5xl:sticky @5xl:top-6 @5xl:self-start"
            aria-label="評分與資料"
          >
            <div className="hidden @5xl:block">
              <Scorecard evaluation={ev} rankScores={story.rankScores} />
            </div>
            {story.rankScores ? (
              <div className="@5xl:hidden">
                <RankBreakdown rankScores={story.rankScores} />
              </div>
            ) : null}

            {story.topics.length ? (
              <Section
                id="topics-title"
                icon={<Tag {...ICON_SM} className="text-fg-3" />}
                title="主題"
              >
                <div className="flex flex-wrap gap-1.5">
                  {story.topics.map((topic) => (
                    <Link
                      key={topic.key}
                      to={topicHref(topic.key)}
                      className="chip"
                      title={`篩選「${topic.label}」`}
                    >
                      {topic.label}
                    </Link>
                  ))}
                </div>
              </Section>
            ) : null}

            {story.hf ? (
              <Section
                id="model-title"
                icon={<Tag {...ICON_SM} className="text-fg-3" />}
                title="模型資訊"
              >
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-meta">
                  <dt className="text-fg-3">模型</dt>
                  <dd className="mono m-0 break-all text-file">{story.hf.modelId}</dd>
                  {story.hf.pipeline_tag ? (
                    <>
                      <dt className="text-fg-3">任務</dt>
                      <dd className="mono m-0 text-fg-2">{story.hf.pipeline_tag}</dd>
                    </>
                  ) : null}
                  <dt className="text-fg-3">下載／喜歡</dt>
                  <dd className="mono m-0 text-fg-2">
                    {formatCompact(story.hf.downloads)} / {formatCompact(story.hf.likes)}
                  </dd>
                </dl>
              </Section>
            ) : null}

            <Section
              id="links-title"
              icon={<Link2 {...ICON_SM} className="text-fg-3" />}
              title="來源連結"
            >
              <ul className="flex flex-col gap-1.5">
                {story.links.map((link) =>
                  isSafeHttpUrl(link.url) ? (
                    <li
                      key={`${link.source_id}-${link.url}`}
                      className="flex min-w-0 items-baseline gap-2 text-meta"
                    >
                      <span className="mono flex-none text-fg-3">{link.source_id}</span>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 truncate text-info underline-offset-2 hover:underline"
                        title={link.url}
                      >
                        {link.url.replace(/^https?:\/\//, '')}
                      </a>
                    </li>
                  ) : null,
                )}
              </ul>
            </Section>

            <details className="rounded-md border border-line-subtle bg-sunken/60 px-3 py-2">
              <summary className="cursor-pointer text-meta text-fg-2 select-none">機器資訊</summary>
              <div className="mt-2">
                <Facts story={story} />
              </div>
            </details>
          </aside>
        </div>

        {narrow ? (
          <nav
            className="flex items-center justify-between gap-2 border-t border-line-subtle pt-4"
            aria-label="上一篇與下一篇"
          >
            {nav.prevHref ? (
              <Link to={nav.prevHref} className="btn">
                <ChevronLeft {...ICON_SM} />
                上一篇
              </Link>
            ) : (
              <span />
            )}
            <span className="text-meta text-fg-3">{formatDay(story.date)}</span>
            {nav.nextHref ? (
              <Link to={nav.nextHref} className="btn">
                下一篇
                <ChevronRight {...ICON_SM} />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </div>
    </article>
  )
}
