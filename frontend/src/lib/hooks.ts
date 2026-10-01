import { useEffect, useRef, useSyncExternalStore } from 'react'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Desktop shell (side-by-side list and reader) starts at Tailwind's `lg` breakpoint. */
export const useIsNarrow = () => !useMediaQuery('(min-width: 1024px)')

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type
    return !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(type)
  }
  return false
}

export type KeyHandlers = Record<string, (event: KeyboardEvent) => void>

/**
 * Single-key shortcuts for the active view. Ignored while typing, while a modal
 * dialog is open, or with Ctrl/Meta/Alt held, so browser shortcuts keep working.
 */
export function useHotkeys(handlers: KeyHandlers, enabled = true): void {
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (isTypingTarget(event.target)) return
      if (document.querySelector('dialog[open]')) return
      const handler = latest.current[event.key]
      if (!handler) return
      event.preventDefault()
      handler(event)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
