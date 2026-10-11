/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const stylesheet = readFileSync(new URL('../styles/index.css', import.meta.url), 'utf8')

// CSS ownership contracts, not a substitute for browser/touch verification.
// Mobile pages grow with the document; only the desktop shell has a fixed height.
describe('responsive scroll regions', () => {
  it('does not trap document scrolling in an unconstrained mobile region', () => {
    const base = stylesheet.match(/\.scroll-region\s*\{([^{}]*)\}/)?.[1] ?? ''

    expect(base).toContain('min-block-size: 0')
    expect(base).not.toMatch(/overflow\s*:/)
    expect(base).not.toMatch(/overscroll-behavior\s*:/)
    expect(base).not.toMatch(/scrollbar-gutter\s*:/)
  })

  it('retains contained pane scrolling at the desktop shell breakpoint', () => {
    const desktop = stylesheet.match(
      /@media\s*\(width >= 64rem\)\s*\{\s*\.scroll-region\s*\{([^{}]*)\}/,
    )?.[1]

    expect(desktop).toBeDefined()
    expect(desktop).toContain('overflow: auto')
    expect(desktop).toContain('overscroll-behavior: contain')
    expect(desktop).toContain('scrollbar-gutter: stable')
  })
})
