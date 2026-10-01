/** jsdom gaps used by the reader components; `desktop` matches the 1024px layout query. */
export function installDomShims(desktop = true): void {
  window.matchMedia = ((query: string) => ({
    matches: desktop && query.includes('min-width: 1024px'),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  const scope = globalThis as unknown as { CSS?: { escape?: (value: string) => string } }
  scope.CSS ??= {}
  scope.CSS.escape ??= (value: string) => value.replace(/["\\]/g, '\\$&')
  Element.prototype.scrollIntoView = () => {}
  Element.prototype.scrollTo = (() => {}) as typeof Element.prototype.scrollTo
}
