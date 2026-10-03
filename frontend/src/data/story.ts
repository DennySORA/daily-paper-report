import { cleanReadingText, cleanText } from '../lib/text'
import { normalizeTopics, type TopicInfo } from './topics'
import {
  COMPONENT_KEYS,
  type ComponentKey,
  type DailyDigest,
  type EntityInfo,
  type HfMetadata,
  type RankScores,
  type RawLink,
  type RawStory,
  type ReportDigest,
  type TokenUsage,
} from './types'

export type SectionKey = 'top5' | 'papers' | 'radar' | 'releases' | 'recommendations' | 'blogs'

type Bilingual = { zh: string; en: string }

export const SECTION_LABEL: Record<SectionKey, Bilingual> = {
  top5: { zh: '精選', en: 'Top 5' },
  papers: { zh: '論文', en: 'Papers' },
  radar: { zh: '雷達', en: 'Radar' },
  releases: { zh: '模型發布', en: 'Models' },
  recommendations: { zh: '論文推薦', en: 'Papers' },
  blogs: { zh: '技術文章', en: 'Articles' },
}

export const SECTION_HINT: Record<SectionKey, Bilingual> = {
  top5: { zh: '當日必讀', en: 'Must read' },
  papers: { zh: '依綜合分數排序', en: 'By overall score' },
  radar: { zh: '值得追蹤', en: 'Worth watching' },
  releases: { zh: '依機構分組', en: 'By organization' },
  recommendations: { zh: '期間精選論文', en: 'Picked papers' },
  blogs: { zh: '期間精選文章', en: 'Picked articles' },
}

export type StoryKind = 'paper' | 'blog' | 'model' | 'release' | 'link'

export const KIND_LABEL: Record<StoryKind, Bilingual> = {
  paper: { zh: 'arXiv', en: 'arXiv' },
  blog: { zh: '文章', en: 'Article' },
  model: { zh: '模型', en: 'Model' },
  release: { zh: '版本發布', en: 'Release' },
  link: { zh: '連結', en: 'Link' },
}

export const COMPONENT_LABEL: Record<ComponentKey, Bilingual> = {
  preference_relevance: { zh: '偏好相關', en: 'Relevance' },
  novelty: { zh: '新穎性', en: 'Novelty' },
  rigor: { zh: '嚴謹度', en: 'Rigor' },
  evidence_strength: { zh: '證據強度', en: 'Evidence' },
  generalizability: { zh: '可推廣性', en: 'Generality' },
  reproducibility: { zh: '可重現性', en: 'Reproducibility' },
}

export const COMPONENT_HINT: Record<ComponentKey, Bilingual> = {
  preference_relevance: {
    zh: '與關注主題（LLM、代理、安全等）的契合程度',
    en: 'Fit with the tracked topics (LLMs, agents, safety, …)',
  },
  novelty: { zh: '方法或發現相對既有研究的新意', en: 'How new the method or finding is' },
  rigor: {
    zh: '基線、消融、統計與實驗設計的完整性',
    en: 'Baselines, ablations, statistics and experimental design',
  },
  evidence_strength: {
    zh: '結論是否有量化結果與對照支持',
    en: 'Whether claims are backed by quantified, controlled results',
  },
  generalizability: {
    zh: '結論在模型、資料與情境間的適用範圍',
    en: 'How far results carry across models, data and settings',
  },
  reproducibility: {
    zh: '程式碼、資料與超參數的公開程度',
    en: 'Availability of code, data and hyperparameters',
  },
}

export interface Evaluation {
  score: number | null
  components: Array<{ key: ComponentKey; value: number | null }>
  confidence: number | null
  rationale: string
  rationaleZh: string | null
  evidence: string[]
  fulltext: 'complete' | 'abstract_only' | 'unknown'
  model: string | null
  promptVersion: string | null
  fulltextSha: string | null
  tokens: TokenUsage | null
}

export interface Story {
  id: string
  section: SectionKey
  /** 1-based position inside its section. */
  rank: number
  /** Day (YYYY-MM-DD) whose digest listed the story. */
  date: string
  group: string | null
  kind: StoryKind
  titleZh: string | null
  titleEn: string
  summaryZh: string | null
  abstract: string
  url: string
  arxivId: string | null
  links: RawLink[]
  authors: string[]
  categories: string[]
  entities: Array<{ id: string; name: string; type: string }>
  topics: TopicInfo[]
  publishedAt: string | null
  firstSeenAt: string | null
  sourceId: string
  evaluation: Evaluation | null
  rankScores: RankScores | null
  hf: (HfMetadata & { modelId: string }) | null
  report: {
    rank: number
    score: number | null
    sourceDate: string | null
    sourceSection: string | null
  } | null
}

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

function kindOf(raw: RawStory): StoryKind {
  const type = raw.primary_link?.link_type
  if (raw.arxiv_id) return 'paper'
  if (raw.hf_model_id) return 'model'
  if (raw.github_release_url) return 'release'
  if (type === 'arxiv') return 'paper'
  if (type === 'huggingface') return 'model'
  if (type === 'github') return 'release'
  if (type === 'blog') return 'blog'
  return 'link'
}

function evaluationOf(raw: RawStory): Evaluation | null {
  const ev = raw.llm_evaluation
  if (!ev) return null
  const status = ev.fulltext_status
  return {
    score: num(ev.score),
    components: COMPONENT_KEYS.map((key) => ({ key, value: num(ev.components?.[key]) })),
    confidence: num(ev.confidence),
    rationale: cleanReadingText(ev.rationale),
    rationaleZh: cleanReadingText(ev.rationale_zh) || null,
    evidence: (ev.evidence ?? []).map((item) => cleanText(item)).filter(Boolean),
    fulltext: status === 'complete' || status === 'abstract_only' ? status : 'unknown',
    model: ev.model || null,
    promptVersion: ev.prompt_version || null,
    fulltextSha: ev.fulltext_sha256 || null,
    tokens: ev.token_usage ?? null,
  }
}

export function toStory(
  raw: RawStory,
  section: SectionKey,
  rank: number,
  date: string,
  catalog: Record<string, EntityInfo> = {},
  group: string | null = null,
): Story {
  const titleZh = cleanText(raw.title_zh) || null
  const summaryZh = cleanReadingText(raw.summary_zh) || null
  const evaluation = evaluationOf(raw)
  return {
    id: raw.story_id,
    section,
    rank,
    date,
    group,
    kind: kindOf(raw),
    titleZh,
    titleEn: cleanText(raw.title) || raw.story_id,
    summaryZh,
    abstract: cleanReadingText(raw.summary),
    url: raw.primary_link?.url ?? '',
    arxivId: raw.arxiv_id ?? null,
    links: raw.links?.length ? raw.links : raw.primary_link ? [raw.primary_link] : [],
    authors: raw.authors ?? [],
    categories: raw.categories ?? [],
    entities: (raw.entities ?? []).map((id) => ({
      id,
      name: catalog[id]?.name ?? id,
      type: catalog[id]?.type ?? 'organization',
    })),
    topics: normalizeTopics(raw.llm_evaluation?.topics),
    publishedAt: raw.published_at ?? null,
    firstSeenAt: raw.first_seen_at ?? null,
    sourceId: raw.primary_link?.source_id ?? '',
    evaluation,
    rankScores: raw.scores ?? null,
    hf: raw.hf_model_id ? { ...(raw.hf_metadata ?? {}), modelId: raw.hf_model_id } : null,
    report:
      raw.report_rank !== undefined
        ? {
            rank: raw.report_rank,
            score: num(raw.report_score),
            sourceDate: raw.report_source_date ?? null,
            sourceSection: raw.report_source_section ?? null,
          }
        : null,
  }
}

export interface StoryGroup {
  section: SectionKey
  stories: Story[]
}

/** Flattens a daily digest into reading order: 精選, 論文, 雷達, 模型發布. */
export function digestGroups(digest: DailyDigest): StoryGroup[] {
  const date = digest.run_date
  const catalog = digest.entity_catalog ?? {}
  const build = (items: RawStory[] | undefined, section: SectionKey) =>
    (items ?? []).map((raw, index) => toStory(raw, section, index + 1, date, catalog))
  const releases: Story[] = []
  for (const [entity, items] of Object.entries(digest.model_releases_by_entity ?? {})) {
    for (const raw of items) {
      const name = catalog[entity]?.name ?? (entity === 'other' ? 'Other' : entity)
      releases.push(toStory(raw, 'releases', releases.length + 1, date, catalog, name))
    }
  }
  return [
    { section: 'top5', stories: build(digest.top5, 'top5') },
    { section: 'papers', stories: build(digest.papers, 'papers') },
    { section: 'radar', stories: build(digest.radar, 'radar') },
    { section: 'releases', stories: releases },
  ]
}

export function reportGroups(
  report: ReportDigest,
  entities: Record<string, EntityInfo> = {},
): StoryGroup[] {
  const build = (items: RawStory[] | undefined, section: SectionKey) =>
    (items ?? []).map((raw, index) =>
      toStory(
        raw,
        section,
        raw.report_rank ?? index + 1,
        raw.report_source_date ?? report.period_end,
        entities,
      ),
    )
  return [
    { section: 'recommendations', stories: build(report.recommendations, 'recommendations') },
    { section: 'blogs', stories: build(report.blog_recommendations, 'blogs') },
  ]
}

export type LinkKind = 'arxiv' | 'pdf' | 'html' | 'huggingface' | 'source'

export const LINK_LABEL: Record<LinkKind, Bilingual> = {
  arxiv: { zh: '開啟 arXiv', en: 'Open arXiv' },
  pdf: { zh: 'PDF', en: 'PDF' },
  html: { zh: 'HTML 全文', en: 'HTML' },
  huggingface: { zh: '開啟 Hugging Face', en: 'Open Hugging Face' },
  source: { zh: '開啟原文', en: 'Open source' },
}

export interface PaperLink {
  kind: LinkKind
  href: string
  primary?: boolean
}

/** Reading links: arXiv pages for papers, the canonical source link otherwise. */
export function readingLinks(story: Story): PaperLink[] {
  if (story.arxivId) {
    const id = encodeURIComponent(story.arxivId)
    return [
      { kind: 'arxiv', href: `https://arxiv.org/abs/${id}`, primary: true },
      { kind: 'pdf', href: `https://arxiv.org/pdf/${id}` },
      { kind: 'html', href: `https://arxiv.org/html/${id}` },
    ]
  }
  if (story.hf) return [{ kind: 'huggingface', href: story.url, primary: true }]
  return story.url ? [{ kind: 'source', href: story.url, primary: true }] : []
}

/** Title in the reading language, with the other language as a subtitle when useful. */
export function storyTitles(
  story: Story,
  lang: 'zh' | 'en',
): { title: string; subtitle: string | null } {
  if (lang === 'en') return { title: story.titleEn, subtitle: null }
  return story.titleZh
    ? { title: story.titleZh, subtitle: story.titleEn }
    : { title: story.titleEn, subtitle: null }
}

export type BibSource = Pick<
  Story,
  'titleEn' | 'authors' | 'arxivId' | 'categories' | 'publishedAt' | 'date'
>

/** BibTeX for arXiv papers, built only from published metadata. */
export function bibtex(story: BibSource): string | null {
  if (!story.arxivId) return null
  const year = (story.publishedAt ?? story.date).slice(0, 4)
  const first =
    story.authors[0]
      ?.split(/\s+/)
      .pop()
      ?.replace(/[^A-Za-z]/g, '') || 'arxiv'
  const key = `${first.toLowerCase()}${year}_${story.arxivId.replace(/[^0-9a-z]/gi, '')}`
  const escape = (value: string) => value.replace(/[{}]/g, '')
  const lines = [
    `@misc{${key},`,
    `  title = {${escape(story.titleEn)}},`,
    story.authors.length ? `  author = {${escape(story.authors.join(' and '))}},` : null,
    `  year = {${year}},`,
    `  eprint = {${story.arxivId}},`,
    '  archivePrefix = {arXiv},',
    story.categories[0] ? `  primaryClass = {${story.categories[0]}},` : null,
    `  url = {https://arxiv.org/abs/${story.arxivId}},`,
    '}',
  ]
  return lines.filter((line): line is string => line !== null).join('\n')
}

export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}
