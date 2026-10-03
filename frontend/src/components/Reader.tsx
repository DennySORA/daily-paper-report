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
  LINK_LABEL,
  SECTION_LABEL,
  bibtex,
  isSafeHttpUrl,
  readingLinks,
  storyTitles,
  type Story,
} from '../data/story'
import { topicLabel } from '../data/topics'
import { formatCompact, formatDay, formatInt, formatTimestamp, utcDate } from '../lib/format'
import { segmentEvidence } from '../lib/text'
import { useLang } from '../state/lang'
import { setPref, setRead, toggleSaved, useLibrary } from '../state/library'
import { CompactScorecard, RankBreakdown, Scorecard } from './Scorecard'
import { Badge, CopyButton, ExternalLink, ICON, ICON_SM, Kbd } from './ui'
import { Prose } from './Prose'

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

/**
 * 摘要 / Summary in the reading language: the Chinese guide written by the
 * pipeline's LLM, or the English abstract. When the reading language has no
 * text yet, the other one is shown and labelled; nothing is machine-translated
 * in the browser.
 */
function Summary({ story }: { story: Story }) {
  const { lang, t } = useLang()
  const { prefs } = useLibrary()
  const own = lang === 'zh' ? story.summaryZh : story.abstract || null
  const other = lang === 'zh' ? story.abstract || null : story.summaryZh
  const fallbackLang = lang === 'zh' ? 'en' : 'zh'
  const shown = own ?? other

  return (
    <Section
      id="summary-title"
      icon={<ScrollText {...ICON_SM} className="text-fg-3" />}
      title={t('摘要', 'Summary')}
      aside={
        own === null && other ? (
          <Badge
            tone="warning"
            title={t(
              '每日 LLM 翻譯尚未產生這篇的中文標題與導讀，先顯示英文摘要。',
              'The source has no English abstract; showing the Chinese guide.',
            )}
          >
            <TriangleAlert {...ICON_SM} />
            {t('中文導讀尚未產生', 'No English abstract')}
          </Badge>
        ) : null
      }
    >
      {shown === null ? (
        <p className="text-meta text-fg-3">
          {t('來源沒有提供摘要。', 'The source has no summary.')}
        </p>
      ) : own !== null ? (
        <Prose text={own} lang={lang} />
      ) : (
        <Prose text={shown} lang={fallbackLang} />
      )}
      {own !== null && other ? (
        <details
          open={prefs.abstractOpen}
          onToggle={(event) => setPref('abstractOpen', event.currentTarget.open)}
          className="group rounded-md border border-line-subtle px-3 py-2"
        >
          <summary className="cursor-pointer text-meta text-fg-3 select-none group-open:mb-2">
            {lang === 'zh' ? '英文原文' : 'Chinese guide (中文導讀)'}
            <span className="ml-2 hidden md:inline">
              <Kbd>E</Kbd>
            </span>
          </summary>
          <Prose text={other} lang={fallbackLang} />
        </details>
      ) : null}
    </Section>
  )
}

function Rationale({ text, textZh }: { text: string; textZh: string | null }) {
  const { lang, t } = useLang()
  const { prefs } = useLibrary()
  const own = lang === 'zh' ? textZh : text || null
  const other = lang === 'zh' ? text || null : textZh
  const fallbackLang = lang === 'zh' ? 'en' : 'zh'
  return (
    <Section
      id="rationale-title"
      icon={<Quote {...ICON_SM} className="text-fg-3" />}
      title={t('評審理由', 'Assessment')}
      aside={
        own === null && other ? (
          <Badge tone="warning">
            <TriangleAlert {...ICON_SM} />
            {t('中文評審欄位尚未提供，顯示原文', 'No English assessment; showing Chinese')}
          </Badge>
        ) : (
          <span className="text-caption text-fg-3">
            {t('LLM 評分理由', 'Written by the scoring LLM')}
          </span>
        )
      }
    >
      <details
        open={prefs.rationaleOpen}
        onToggle={(event) => setPref('rationaleOpen', event.currentTarget.open)}
        className="group"
      >
        <summary className="cursor-pointer text-meta text-fg-3 select-none group-open:mb-2">
          {prefs.rationaleOpen ? t('收合', 'Collapse') : t('展開評審理由', 'Show assessment')}
        </summary>
        <Prose text={own ?? other ?? ''} lang={own ? lang : fallbackLang} />
        {own && other ? (
          <details className="mt-3 rounded-md border border-line-subtle px-3 py-2">
            <summary className="cursor-pointer text-meta text-fg-3 select-none">
              {t('評審原文', 'Chinese assessment (中文評審理由)')}
            </summary>
            <div className="mt-2">
              <Prose text={other} lang={fallbackLang} />
            </div>
          </details>
        ) : null}
      </details>
    </Section>
  )
}

function Evidence({ items }: { items: string[] }) {
  const { t } = useLang()
  return (
    <Section
      id="evidence-title"
      icon={<Quote {...ICON_SM} className="text-fg-3" />}
      title={t('全文證據', 'Evidence')}
      aside={
        <span className="text-caption text-fg-3">
          {t(`${items.length} 則摘錄`, `${items.length} excerpts`)}
        </span>
      }
    >
      <ol className="flex flex-col gap-3" lang="en">
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
    </Section>
  )
}

function Facts({ story }: { story: Story }) {
  const { lang, t } = useLang()
  const ev = story.evaluation
  const rows: Array<[string, ReactNode]> = [
    ['story_id', story.id],
    [t('發表時間', 'Published'), formatTimestamp(story.publishedAt, lang)],
    [t('首次收錄', 'First seen'), formatTimestamp(story.firstSeenAt, lang)],
    [t('收錄來源', 'Collected from'), story.sourceId || t('未知', 'unknown')],
  ]
  if (ev?.model) rows.push([t('評分模型', 'Scoring model'), ev.model])
  if (ev?.promptVersion) rows.push([t('提示版本', 'Prompt version'), ev.promptVersion])
  if (ev?.fulltextSha)
    rows.push([t('全文 SHA-256', 'Full-text SHA-256'), `${ev.fulltextSha.slice(0, 16)}…`])
  if (ev?.tokens?.total_tokens)
    rows.push([
      t('Token 用量', 'Tokens'),
      t(
        `${formatInt(ev.tokens.prompt_tokens, lang)} 輸入 · ${formatInt(ev.tokens.completion_tokens, lang)} 輸出`,
        `${formatInt(ev.tokens.prompt_tokens, lang)} in · ${formatInt(ev.tokens.completion_tokens, lang)} out`,
      ),
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
  markOnOpen,
}: {
  story: Story
  nav: ReaderNav
  topicHref: (key: string) => string
  narrow: boolean
  /** False while the pane only previews the first item nobody has chosen yet. */
  markOnOpen: boolean
}) {
  const { lang, t } = useLang()
  const library = useLibrary()
  const read = story.id in library.read
  const saved = story.id in library.saved

  // An explicitly opened story is marked read after a short dwell, so fast j/k
  // scanning and the automatic first-item preview never mark anything.
  useEffect(() => {
    if (!markOnOpen || story.id in library.read) return
    const timer = window.setTimeout(() => setRead(story.id, true), 1200)
    return () => window.clearTimeout(timer)
    // Only the story identity and the explicit-open state restart the dwell timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.id, markOnOpen])

  const links = readingLinks(story)
  const bib = bibtex(story)
  const ev = story.evaluation
  const { title, subtitle } = storyTitles(story, lang)
  const published = utcDate(story.publishedAt)

  return (
    <article className="@container animate-enter" aria-labelledby="reader-title" key={story.id}>
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-5 pt-5 pb-16 @3xl:px-8 @3xl:pt-6">
        {narrow ? (
          <div className="flex items-center justify-between gap-2">
            <Link to={nav.closeHref} className="btn btn-quiet -ml-2">
              <ArrowLeft {...ICON} />
              {t('返回列表', 'Back to list')}
            </Link>
            <span className="mono text-meta text-fg-3">
              {nav.index + 1} / {nav.total}
            </span>
          </div>
        ) : null}

        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="accent">
              {SECTION_LABEL[story.section][lang]}
              {story.report ? ` #${story.report.rank}` : ` #${story.rank}`}
            </Badge>
            <Badge tone="entity">{KIND_LABEL[story.kind][lang]}</Badge>
            {story.arxivId ? (
              <span className="mono text-meta text-file">{story.arxivId}</span>
            ) : null}
            {story.categories.slice(0, 4).map((category) => (
              <span key={category} className="mono text-meta text-fg-3">
                {category}
              </span>
            ))}
            {published ? (
              <span className="text-meta text-fg-3">
                · {t('發表於', 'published')} {published}
              </span>
            ) : null}
          </div>
          <h1
            id="reader-title"
            tabIndex={-1}
            lang={title === story.titleEn ? 'en' : 'zh-Hant'}
            className="text-title font-semibold text-balance text-fg outline-none"
          >
            {title}
          </h1>
          {subtitle ? (
            <p className="text-heading font-normal text-fg-2" lang="en">
              {subtitle}
            </p>
          ) : null}
          {story.authors.length ? (
            <p className="flex items-start gap-2 text-meta text-fg-2">
              <Users {...ICON_SM} className="mt-[3px] flex-none text-fg-3" />
              <span lang="en">
                {story.authors.slice(0, 12).join(', ')}
                {story.authors.length > 12
                  ? t(
                      ` 等 ${story.authors.length} 位作者`,
                      ` and ${story.authors.length - 12} more`,
                    )
                  : ''}
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
            aria-label={t('閱讀操作', 'Reading actions')}
          >
            {links.map((link) =>
              isSafeHttpUrl(link.href) ? (
                <ExternalLink key={link.href} href={link.href} primary={link.primary}>
                  {LINK_LABEL[link.kind][lang]}
                </ExternalLink>
              ) : null,
            )}
            <button
              type="button"
              className="btn"
              aria-pressed={saved}
              onClick={() => toggleSaved(story)}
              title={t('快捷鍵 S', 'Shortcut S')}
            >
              {saved ? (
                <BookmarkCheck {...ICON_SM} className="text-accent-fg" />
              ) : (
                <BookmarkPlus {...ICON_SM} />
              )}
              {saved ? t('已收藏', 'Saved') : t('收藏', 'Save')}
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              aria-pressed={read}
              onClick={() => setRead(story.id, !read)}
              title={t('快捷鍵 M', 'Shortcut M')}
            >
              {read ? <CircleCheck {...ICON_SM} className="text-fg-2" /> : <Circle {...ICON_SM} />}
              {read ? t('已讀', 'Read') : t('未讀', 'Unread')}
            </button>
            {bib ? <CopyButton text={bib} label="BibTeX" quiet /> : null}
          </div>
        </header>

        <div className="@5xl:hidden">
          <CompactScorecard evaluation={ev} />
        </div>

        <div className="grid grid-cols-1 gap-8 @5xl:grid-cols-[minmax(0,1fr)_300px] @5xl:gap-10">
          <div className="flex max-w-[680px] min-w-0 flex-col gap-8">
            <Summary story={story} />
            {ev && (ev.rationale || ev.rationaleZh) ? (
              <Rationale text={ev.rationale} textZh={ev.rationaleZh} />
            ) : null}
            {ev?.evidence.length ? <Evidence items={ev.evidence} /> : null}
          </div>

          <aside
            className="flex min-w-0 flex-col gap-8 @5xl:sticky @5xl:top-6 @5xl:self-start"
            aria-label={t('評分與資料', 'Scores and facts')}
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
                title={t('主題', 'Topics')}
              >
                <div className="flex flex-wrap gap-1.5">
                  {story.topics.map((topic) => (
                    <Link
                      key={topic.key}
                      to={topicHref(topic.key)}
                      className="chip"
                      title={t(`篩選「${topic.label}」`, `Filter by “${topic.labelEn}”`)}
                    >
                      {topicLabel(topic, lang)}
                    </Link>
                  ))}
                </div>
              </Section>
            ) : null}

            {story.hf ? (
              <Section
                id="model-title"
                icon={<Tag {...ICON_SM} className="text-fg-3" />}
                title={t('模型資訊', 'Model')}
              >
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-meta">
                  <dt className="text-fg-3">{t('模型', 'Model')}</dt>
                  <dd className="mono m-0 break-all text-file">{story.hf.modelId}</dd>
                  {story.hf.pipeline_tag ? (
                    <>
                      <dt className="text-fg-3">{t('任務', 'Task')}</dt>
                      <dd className="mono m-0 text-fg-2">{story.hf.pipeline_tag}</dd>
                    </>
                  ) : null}
                  <dt className="text-fg-3">{t('下載／喜歡', 'Downloads / likes')}</dt>
                  <dd className="mono m-0 text-fg-2">
                    {formatCompact(story.hf.downloads, lang)} /{' '}
                    {formatCompact(story.hf.likes, lang)}
                  </dd>
                </dl>
              </Section>
            ) : null}

            <Section
              id="links-title"
              icon={<Link2 {...ICON_SM} className="text-fg-3" />}
              title={t('來源連結', 'Sources')}
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
              <summary className="cursor-pointer text-meta text-fg-2 select-none">
                {t('機器資訊', 'Machine facts')}
              </summary>
              <div className="mt-2">
                <Facts story={story} />
              </div>
            </details>
          </aside>
        </div>

        {narrow ? (
          <nav
            className="flex items-center justify-between gap-2 border-t border-line-subtle pt-4"
            aria-label={t('上一篇與下一篇', 'Previous and next')}
          >
            {nav.prevHref ? (
              <Link to={nav.prevHref} className="btn">
                <ChevronLeft {...ICON_SM} />
                {t('上一篇', 'Previous')}
              </Link>
            ) : (
              <span />
            )}
            <span className="text-meta text-fg-3">{formatDay(story.date, lang)}</span>
            {nav.nextHref ? (
              <Link to={nav.nextHref} className="btn">
                {t('下一篇', 'Next')}
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
