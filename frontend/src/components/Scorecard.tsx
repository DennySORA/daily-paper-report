import { FileText, Gauge } from 'lucide-react'
import { COMPONENT_HINT, COMPONENT_LABEL, type Evaluation } from '../data/story'
import type { RankScores } from '../data/types'
import { formatInt, formatScore } from '../lib/format'
import { useLang } from '../state/lang'
import { Badge, ICON_SM, Meter } from './ui'

const RANK_LABEL: Array<[keyof RankScores, string, string]> = [
  ['llm_relevance_score', 'LLM 相關性', 'LLM relevance'],
  ['topic_score', '主題', 'Topics'],
  ['tier_score', '來源層級', 'Source tier'],
  ['kind_score', '類型', 'Kind'],
  ['entity_score', '機構／人物', 'Entities'],
  ['recency_score', '新近度', 'Recency'],
  ['cross_source_score', '跨來源', 'Cross-source'],
  ['citation_score', '引用', 'Citations'],
  ['semantic_score', '語意', 'Semantic'],
]

/** The ranker's rule-based score parts behind the list order. */
export function RankBreakdown({ rankScores }: { rankScores: RankScores }) {
  const { t } = useLang()
  return (
    <details className="group rounded-md border border-line-subtle bg-sunken/60 px-3 py-2">
      <summary className="cursor-pointer text-meta text-fg-2 select-none">
        {t('排序分數組成', 'Ranking score')}{' '}
        <span className="mono text-fg-3">
          {t('總分', 'total')} {formatScore(rankScores.total_score)}
        </span>
      </summary>
      <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
        {RANK_LABEL.filter(([key]) => (rankScores[key] ?? 0) !== 0).map(([key, zh, en]) => (
          <div key={key} className="contents">
            <dt className="text-meta text-fg-3">{t(zh, en)}</dt>
            <dd className="mono m-0 text-right text-meta text-fg-2">
              {formatScore(rankScores[key])}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

export function FulltextBadge({ status }: { status: Evaluation['fulltext'] }) {
  const { t } = useLang()
  if (status === 'complete')
    return (
      <Badge tone="success" title={t('評分依據為論文全文', 'Scored from the full paper')}>
        <FileText {...ICON_SM} />
        {t('全文評估', 'Full text')}
      </Badge>
    )
  if (status === 'abstract_only')
    return (
      <Badge
        tone="warning"
        title={t('僅取得摘要，評分可信度較低', 'Only the abstract was available; lower confidence')}
      >
        <FileText {...ICON_SM} />
        {t('僅摘要評估', 'Abstract only')}
      </Badge>
    )
  return <Badge>{t('評估依據未知', 'Basis unknown')}</Badge>
}

/** The paper scorecard: overall LLM score plus the six rubric dimensions as one-hue meters. */
export function Scorecard({
  evaluation,
  rankScores,
}: {
  evaluation: Evaluation | null
  rankScores: RankScores | null
}) {
  const { lang, t } = useLang()
  if (!evaluation) {
    return (
      <section aria-labelledby="scorecard-title" className="flex flex-col gap-2">
        <h2 id="scorecard-title" className="flex items-center gap-2 text-heading font-semibold">
          <Gauge {...ICON_SM} className="text-fg-3" />
          {t('評分卡', 'Scorecard')}
        </h2>
        <p className="text-meta text-fg-3">
          {t(
            '這篇未經 LLM 評分（早期日報或評分階段未涵蓋）。排序依來源、主題與新近度等規則分數。',
            'Not scored by the LLM (an early digest or outside the scoring phase). It is ranked by rule-based source, topic and recency scores.',
          )}
        </p>
        {rankScores?.total_score !== undefined ? (
          <p className="mono text-meta text-fg-2">
            {t('規則總分', 'Rule score')} {formatScore(rankScores.total_score)}
          </p>
        ) : null}
      </section>
    )
  }

  const total = evaluation.tokens?.total_tokens
  return (
    <section aria-labelledby="scorecard-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="scorecard-title" className="flex items-center gap-2 text-heading font-semibold">
          <Gauge {...ICON_SM} className="text-fg-3" />
          {t('評分卡', 'Scorecard')}
        </h2>
        <FulltextBadge status={evaluation.fulltext} />
      </div>

      <div className="flex items-end gap-4">
        <div className="flex flex-col">
          <span className="text-caption text-fg-3">{t('綜合分數', 'Overall')}</span>
          <span className="text-display font-semibold text-fg">
            {formatScore(evaluation.score)}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1 pb-2">
          <Meter value={evaluation.score} className="h-2" />
          <span className="mono text-caption text-fg-3">
            {t('信心', 'confidence')} {formatScore(evaluation.confidence)}
            {total ? ` · ${formatInt(total, lang)} tokens` : ''}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5">
        {evaluation.components.map((component) => (
          <div key={component.key} className="contents">
            <dt className="text-meta text-fg-2" title={COMPONENT_HINT[component.key][lang]}>
              {COMPONENT_LABEL[component.key][lang]}
            </dt>
            <dd className="m-0">
              <Meter value={component.value} className="h-1.5" />
            </dd>
            <dd className="mono m-0 text-right text-meta text-fg">
              {formatScore(component.value)}
            </dd>
          </div>
        ))}
      </dl>

      {rankScores ? <RankBreakdown rankScores={rankScores} /> : null}
    </section>
  )
}

/** One-glance score strip shown under the title when the reading pane is narrow. */
export function CompactScorecard({ evaluation }: { evaluation: Evaluation | null }) {
  const { lang, t } = useLang()
  if (!evaluation) {
    return (
      <p className="flex items-center gap-2 text-meta text-fg-3">
        <Gauge {...ICON_SM} />
        {t('未經 LLM 評分', 'Not scored by the LLM')}
      </p>
    )
  }
  return (
    <section
      aria-labelledby="scorecard-compact-title"
      className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border border-line-subtle bg-sunken/60 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)]"
    >
      <div className="flex items-center gap-3 sm:flex-col sm:items-start sm:justify-center sm:gap-1">
        <h2 id="scorecard-compact-title" className="text-caption text-fg-3">
          {t('綜合分數', 'Overall')}
        </h2>
        <span className="text-display font-semibold text-fg">{formatScore(evaluation.score)}</span>
        <FulltextBadge status={evaluation.fulltext} />
      </div>
      <dl className="grid grid-cols-2 gap-x-5 gap-y-2 self-center md:grid-cols-3">
        {evaluation.components.map((component) => (
          <div key={component.key} className="flex min-w-0 flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <dt
                className="truncate text-caption text-fg-2"
                title={COMPONENT_HINT[component.key][lang]}
              >
                {COMPONENT_LABEL[component.key][lang]}
              </dt>
              <dd className="mono m-0 text-caption text-fg">{formatScore(component.value)}</dd>
            </div>
            <Meter value={component.value} className="h-1" />
          </div>
        ))}
      </dl>
    </section>
  )
}
