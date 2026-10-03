import { describe, expect, it } from 'vitest'
import {
  cleanReadingText,
  cleanText,
  decodeEntities,
  paragraphs,
  readingBlocks,
  readingSentences,
  segmentEvidence,
} from '../lib/text'

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

describe('reading presentation', () => {
  it('breaks Chinese sentences while preserving decimals, brackets and closing quotes', () => {
    expect(readingSentences('提升至 73.33%（見 Fig. 2）。「結果穩定！」限制仍在。')).toEqual([
      '提升至 73.33%（見 Fig. 2）。',
      '「結果穩定！」',
      '限制仍在。',
    ])
  })
  it('preserves code, links, abbreviations and decimals', () => {
    const text =
      'Dr. Chen et al. use e.g. v1.2, U.S. data, `a。b!?` and https://example.org/a.b?q=x!y (p<0.05).'
    expect(readingSentences(text)).toEqual([text])
    expect(readingSentences('[說明。](https://example.org/a.b) 下一句。')).toEqual([
      '[說明。](https://example.org/a.b) 下一句。',
    ])
  })
  it('renders explicit lists without inventing points or changing numbering', () => {
    expect(
      readingBlocks('背景。方法。\n- 第一點\n- 第二點\n\n3. 第三點\n5. 第五點\n73.33% accuracy'),
    ).toEqual([
      { kind: 'paragraph', text: '背景。' },
      { kind: 'paragraph', text: '方法。' },
      { kind: 'list', ordered: false, items: [{ text: '第一點' }, { text: '第二點' }] },
      {
        kind: 'list',
        ordered: true,
        items: [
          { text: '第三點', value: 3 },
          { text: '第五點', value: 5 },
        ],
      },
      { kind: 'paragraph', text: '73.33% accuracy' },
    ])
    expect(readingBlocks(' \n')).toEqual([])
  })
  it('keeps code boundaries and source strings', () => {
    const source = '<p>比較 `v1.2`。</p><ul><li>第一點</li><li>第二點</li></ul>'
    expect(cleanReadingText(source)).toContain('`v1.2`')
    expect(cleanReadingText(source)).toContain('- 第一點')
    expect(source).toContain('<li>第一點</li>')
  })
})

describe('feed list preservation', () => {
  it('preserves ordered starts and explicit item numbering', () => {
    expect(
      readingBlocks(cleanReadingText('<ol start="3"><li>三</li><li value="5">五</li></ol>')),
    ).toEqual([
      {
        kind: 'list',
        ordered: true,
        items: [
          { text: '三', value: 3 },
          { text: '五', value: 5 },
        ],
      },
    ])
  })
  it('groups adjacent HTML list items and protects HTML code', () => {
    expect(readingBlocks(cleanReadingText('<ul><li>一</li><li>二</li></ul>'))).toEqual([
      { kind: 'list', ordered: false, items: [{ text: '一' }, { text: '二' }] },
    ])
    expect(readingSentences(cleanReadingText('<code>a。b</code>。結束。'))).toEqual([
      '`a。b`。',
      '結束。',
    ])
  })
})

it('preserves literal inline code content through cleaning', () => {
  const code = '`__name__  <b>  a。b`'
  expect(cleanReadingText(`前文 **粗體** ${code}。後文。`)).toBe(`前文 粗體 ${code}。後文。`)
})
