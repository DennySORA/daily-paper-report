/**
 * Published data contract. These shapes mirror the JSON written by the Python
 * pipeline (src/renderer/json_renderer.py, src/reports/) and by
 * scripts/prepare-public.py. Every field the pipeline may omit is optional.
 */

export interface RawLink {
  url: string
  link_type: string
  source_id: string
  tier: number
  title: string
}

export const COMPONENT_KEYS = [
  'preference_relevance',
  'novelty',
  'rigor',
  'evidence_strength',
  'generalizability',
  'reproducibility',
] as const

export type ComponentKey = (typeof COMPONENT_KEYS)[number]

export interface TokenUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  prompt_cache_hit_tokens?: number
  prompt_cache_miss_tokens?: number
}

export interface LlmEvaluation {
  score?: number
  components?: Partial<Record<ComponentKey, number>>
  confidence?: number
  rationale?: string
  rationale_zh?: string | null
  evidence?: string[]
  topics?: string[]
  fulltext_status?: string
  fulltext_sha256?: string
  model?: string
  prompt_version?: string
  token_usage?: TokenUsage
}

export interface RankScores {
  total_score?: number
  llm_raw_score?: number
  llm_relevance_score?: number
  topic_score?: number
  tier_score?: number
  kind_score?: number
  recency_score?: number
  entity_score?: number
  citation_score?: number
  cross_source_score?: number
  semantic_score?: number
}

export interface HfMetadata {
  downloads?: number
  likes?: number
  pipeline_tag?: string
}

export interface RawStory {
  story_id: string
  title: string
  title_zh?: string | null
  summary?: string | null
  summary_zh?: string | null
  primary_link: RawLink
  links?: RawLink[]
  entities?: string[]
  section?: string | null
  published_at?: string | null
  first_seen_at?: string | null
  arxiv_id?: string | null
  hf_model_id?: string | null
  github_release_url?: string | null
  item_count?: number
  authors?: string[]
  categories?: string[]
  source_name?: string | null
  hf_metadata?: HfMetadata | null
  scores?: RankScores
  llm_evaluation?: LlmEvaluation
  report_rank?: number
  report_score?: number
  report_source_date?: string
  report_source_section?: string
  published_local_date?: string
}

export interface SourceStatus {
  source_id: string
  name: string
  tier: number
  method: string
  status: string
  reason_code: string
  reason_text: string
  remediation_hint: string | null
  newest_item_date: string | null
  last_fetch_status_code: number | null
  items_new: number
  items_updated: number
  category: string
}

export interface RunInfo {
  run_id: string
  started_at: string
  finished_at: string | null
  success: boolean
  error_summary: string | null
  items_total: number
  stories_total: number
}

export interface EntityInfo {
  name: string
  type: string
}

export interface DailyDigest {
  run_id: string
  run_date: string
  generated_at: string
  top5: RawStory[]
  papers: RawStory[]
  radar: RawStory[]
  model_releases_by_entity: Record<string, RawStory[]>
  sources_status: SourceStatus[]
  run_info: RunInfo
  archive_dates?: string[]
  entity_catalog?: Record<string, EntityInfo>
}

export type ReportType = 'weekly' | 'monthly'

export interface ReportIndexEntry {
  report_type: ReportType
  period_id: string
  title: string
  summary?: string | null
  period_start: string
  period_end: string
  generated_at: string
  path: string
  recommendation_count: number
  blog_recommendation_count: number
  missing_dates: string[]
}

export interface ReportIndex {
  generated_at: string
  latest: Partial<Record<ReportType, string | null>>
  weekly: ReportIndexEntry[]
  monthly: ReportIndexEntry[]
}

export interface ReportDigest {
  report_type: ReportType
  period_id: string
  title: string
  summary?: string | null
  timezone: string
  period_start: string
  period_end: string
  generated_at: string
  covered_dates: string[]
  missing_dates: string[]
  items_considered: number
  stories_considered: number
  recommendations: RawStory[]
  blog_items_considered: number
  blog_stories_considered: number
  blog_recommendations: RawStory[]
}

/** api/catalog.json, written by scripts/prepare-public.py. */
export interface CatalogDay {
  date: string
  top5: number
  papers: number
  radar: number
  releases: number
  translated: number
  evaluated: number
  fulltext: number
  lead_title: string | null
  lead_title_zh: string | null
}

export interface Catalog {
  schema: number
  generated_at: string
  latest_date: string | null
  days: CatalogDay[]
  missing_dates: string[]
  entities?: Record<string, EntityInfo>
}

/**
 * api/search.json rows, written by scripts/prepare-public.py:
 * [story_id, date, section, llm_score|null, title, title_zh|null, topics, authors, link_type]
 */
export type SearchRow = [
  string,
  string,
  string,
  number | null,
  string,
  string | null,
  string[],
  string[],
  string,
]

export interface SearchIndex {
  schema: number
  generated_at: string
  rows: SearchRow[]
}
