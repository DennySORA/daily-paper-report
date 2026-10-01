import { describe, expect, it } from 'vitest'
import { cleanText, decodeEntities, paragraphs, segmentEvidence } from '../lib/text'

describe('cleanText', () => {
  it('strips tags, decodes entities and Markdown emphasis', () => {
    const input =
      '🤖 ModelScope&nbsp;&nbsp;| We are **excited** to <b>open</b>-source &lt;model&gt; &#x4e2d;'
    expect(cleanText(input)).toBe('🤖 ModelScope | We are excited to open-source <model> 中')
  })

  it('keeps line structure from block elements', () => {
    expect(cleanText('<pre style="x">line one\n\n\n\nline two</pre>')).toBe('line one\n\nline two')
  })

  it('returns an empty string for missing values', () => {
    expect(cleanText(null)).toBe('')
    expect(cleanText(undefined)).toBe('')
  })

  it('keeps comparison operators in prose', () => {
    expect(cleanText('loss <1% on GLUE while giving >3x speedups (p<0.05, n>100)')).toBe(
      'loss <1% on GLUE while giving >3x speedups (p<0.05, n>100)',
    )
    expect(cleanText('延遲 <10ms，準確率提升至 >90%')).toBe('延遲 <10ms，準確率提升至 >90%')
    expect(cleanText('<span class="x">kept</span><!-- note -->')).toBe('kept')
  })

  it('leaves unknown entities untouched', () => {
    expect(decodeEntities('&unknown; &amp;')).toBe('&unknown; &')
  })
})

describe('paragraphs', () => {
  it('splits on line breaks and drops blanks', () => {
    expect(paragraphs('一。\n\n二。\n三。')).toEqual(['一。', '二。', '三。'])
  })
})

describe('segmentEvidence', () => {
  it('marks section references and links', () => {
    const segments = segmentEvidence(
      '§5.2 / Table 1: wins 33 of 36; code at https://github.com/org/repo/. Appendix B.2–B.4 lists configs.',
    )
    expect(
      segments.filter((segment) => segment.kind === 'ref').map((segment) => segment.value),
    ).toEqual(['§5.2', 'Table 1', 'Appendix B.2–B.4'])
    expect(segments.find((segment) => segment.kind === 'link')?.value).toBe(
      'https://github.com/org/repo/',
    )
    expect(segments.map((segment) => segment.value).join('')).toContain('wins 33 of 36')
  })
})
