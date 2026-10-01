import { useSyncExternalStore } from 'react'
import type { Story } from '../data/story'

/**
 * Per-viewer reading state kept in this browser only: read marks, saved papers
 * and two display preferences. Storage can be unavailable (private mode,
 * blocked site data); the in-memory copy keeps working for the session.
 */
export interface SavedPaper {
  id: string
  date: string
  savedAt: string
  titleZh: string | null
  titleEn: string
  url: string
  arxivId: string | null
  score: number | null
  authors: string[]
  categories: string[]
  publishedAt: string | null
}

export interface Prefs {
  abstractOpen: boolean
  rationaleOpen: boolean
}

interface LibraryState {
  read: Record<string, number>
  saved: Record<string, SavedPaper>
  prefs: Prefs
}

const KEYS = { read: 'dpr.read.v1', saved: 'dpr.saved.v1', prefs: 'dpr.prefs.v1' } as const
const DEFAULT_PREFS: Prefs = { abstractOpen: false, rationaleOpen: true }

function readKey<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as T) : fallback
  } catch {
    return fallback
  }
}

function writeKey(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: keep the in-memory state for this session.
  }
}

function loadState(): LibraryState {
  if (typeof window === 'undefined') return { read: {}, saved: {}, prefs: DEFAULT_PREFS }
  return {
    read: readKey(KEYS.read, {}),
    saved: readKey(KEYS.saved, {}),
    prefs: { ...DEFAULT_PREFS, ...readKey<Partial<Prefs>>(KEYS.prefs, {}) },
  }
}

let state = loadState()
const listeners = new Set<() => void>()

function emit(next: LibraryState): void {
  state = next
  for (const listener of listeners) listener()
}

function onStorage(event: StorageEvent): void {
  if (event.key === null || (Object.values(KEYS) as string[]).includes(event.key)) emit(loadState())
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener('storage', onStorage)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener('storage', onStorage)
  }
}

export function useLibrary(): LibraryState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  )
}

export function isRead(id: string): boolean {
  return id in state.read
}

export function setRead(id: string, read: boolean): void {
  if (read === id in state.read) return
  const next = { ...state.read }
  if (read) next[id] = Date.now()
  else delete next[id]
  writeKey(KEYS.read, next)
  emit({ ...state, read: next })
}

export function markManyRead(ids: string[]): void {
  const next = { ...state.read }
  const now = Date.now()
  let changed = false
  for (const id of ids) {
    if (!(id in next)) {
      next[id] = now
      changed = true
    }
  }
  if (!changed) return
  writeKey(KEYS.read, next)
  emit({ ...state, read: next })
}

export function toggleSaved(story: Story): boolean {
  const next = { ...state.saved }
  const saving = !(story.id in next)
  if (saving) {
    next[story.id] = {
      id: story.id,
      date: story.date,
      savedAt: new Date().toISOString(),
      titleZh: story.titleZh,
      titleEn: story.titleEn,
      url: story.url,
      arxivId: story.arxivId,
      score: story.evaluation?.score ?? null,
      authors: story.authors.slice(0, 12),
      categories: story.categories.slice(0, 4),
      publishedAt: story.publishedAt,
    }
  } else {
    delete next[story.id]
  }
  writeKey(KEYS.saved, next)
  emit({ ...state, saved: next })
  return saving
}

export function removeSaved(id: string): void {
  if (!(id in state.saved)) return
  const next = { ...state.saved }
  delete next[id]
  writeKey(KEYS.saved, next)
  emit({ ...state, saved: next })
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  const prefs = { ...state.prefs, [key]: value }
  writeKey(KEYS.prefs, prefs)
  emit({ ...state, prefs })
}
