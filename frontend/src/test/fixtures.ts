import type { DailyDigest, RawStory } from '../data/types'

/** Synthetic fixtures shaped like the published JSON; not real report data. */
export function rawStory(overrides: Partial<RawStory> & { story_id: string }): RawStory {
  return {
    title: `Title ${overrides.story_id}`,
    primary_link: {
      url: `https://arxiv.org/abs/${overrides.story_id.replace('arxiv:', '')}`,
      link_type: 'arxiv',
      source_id: 'arxiv-cs-cl',
      tier: 1,
      title: 'x',
    },
    ...overrides,
  }
}

export function digest(partial: Partial<DailyDigest> = {}): DailyDigest {
  return {
    run_id: 'fixture',
    run_date: '2026-09-30',
    generated_at: '2026-09-30T12:00:00+00:00',
    top5: [],
    papers: [],
    radar: [],
    model_releases_by_entity: {},
    sources_status: [],
    run_info: {
      run_id: 'fixture',
      started_at: '2026-09-30T02:00:00+00:00',
      finished_at: '2026-09-30T04:30:00+00:00',
      success: true,
      error_summary: null,
      items_total: 10,
      stories_total: 5,
    },
    ...partial,
  }
}
