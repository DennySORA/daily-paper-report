// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { HashRouter, MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { routerOptions } from '../app/App'
import { ReaderLayout } from '../components/ReaderLayout'
import { digestGroups } from '../data/story'
import { isRead, setRead } from '../state/library'
import { installDomShims } from './dom'
import { digest, rawStory } from './fixtures'

const IDS = ['arxiv:2609.00001', 'arxiv:2609.00002', 'arxiv:2609.00003', 'arxiv:2609.00004']
const groups = digestGroups(
  digest({
    top5: [rawStory({ story_id: IDS[0]!, title: 'alpha beta' }), rawStory({ story_id: IDS[1]! })],
    papers: [rawStory({ story_id: IDS[2]! }), rawStory({ story_id: IDS[3]! })],
  }),
)

const layout = (
  <Routes>
    <Route
      path="day/:date"
      element={
        <ReaderLayout groups={groups} basePath="/day/2026-09-30" header={null} emptyTitle="empty" />
      }
    />
  </Routes>
)

beforeAll(() => installDomShims(true))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  for (const id of IDS) setRead(id, false)
})

describe('read marking', () => {
  it('never marks the automatic first-item preview, even under the unread filter', () => {
    vi.useFakeTimers()
    render(<MemoryRouter initialEntries={['/day/2026-09-30?u=1']}>{layout}</MemoryRouter>)
    for (let tick = 0; tick < 6; tick += 1) act(() => vi.advanceTimersByTime(1300))
    expect(IDS.filter(isRead)).toEqual([])
  })

  it('marks an explicitly opened story after the dwell and keeps it listed', () => {
    vi.useFakeTimers()
    const { container } = render(
      <MemoryRouter initialEntries={[`/day/2026-09-30?u=1&p=${encodeURIComponent(IDS[2]!)}`]}>
        {layout}
      </MemoryRouter>,
    )
    act(() => vi.advanceTimersByTime(1300))
    expect(IDS.filter(isRead)).toEqual([IDS[2]])
    expect(container.querySelector(`[data-story-id="${IDS[2]}"]`)).not.toBeNull()
  })
})

describe('URL-bound filter input', () => {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  const keystroke = (input: HTMLInputElement, char: string) => {
    setValue.call(input, input.value + char)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }

  it('keeps every keystroke with the app router options', async () => {
    window.location.hash = '#/day/2026-09-30'
    const { container } = render(<HashRouter {...routerOptions}>{layout}</HashRouter>)
    const input = container.querySelector<HTMLInputElement>('input[name="filter"]')!
    await act(async () => {
      keystroke(input, 'a')
      keystroke(input, 'l')
    })
    expect(input.value).toBe('al')
  })
})
