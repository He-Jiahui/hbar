import { createState } from './state'

export const CONVERSATION_FIND_LIMITS = Object.freeze({
  query: 256,
  matches: 1_000,
  rows: 1_000,
  segments: 4_096,
  characters: 8_000_000,
})

/** A host projection of readable conversation text, never tools, composer text or a second history fetch. */
export interface ConversationFindSource {
  readonly scopeId: string
  readonly rows: readonly {
    readonly id: string
    readonly segments: readonly { readonly id: string; readonly text: string }[]
  }[]
  readonly history: 'complete' | 'older' | 'limit' | 'failed'
}

export interface ConversationFindMatch {
  readonly rowId: string
  readonly segmentId: string
  /** UTF-16 offsets in the original projected text, including case-insensitive Unicode matches. */
  readonly start: number
  readonly end: number
}

export interface ConversationFindState {
  readonly status: 'closed' | 'idle' | 'searching' | 'ready' | 'failed'
  readonly scopeId: string | null
  readonly query: string
  readonly matches: readonly ConversationFindMatch[]
  readonly activeIndex: number
  /** Only explicit navigation or a changed target advances this, not unrelated streaming text. */
  readonly navigationRevision: number
  readonly truncated: boolean
  readonly history: ConversationFindSource['history']
  readonly error: 'INVALID_SOURCE' | 'QUERY_LIMIT' | null
}

interface CapturedSource {
  readonly scopeId: string
  readonly rows: ConversationFindSource['rows']
  readonly history: ConversationFindSource['history']
  readonly truncated: boolean
}

function captureSource(source: ConversationFindSource): CapturedSource | null {
  if (!source.scopeId || source.scopeId.length > 1_024) return null
  const rows: Array<ConversationFindSource['rows'][number]> = []
  const rowIds = new Set<string>()
  let characters = 0
  let segmentCount = 0
  let truncated = source.rows.length > CONVERSATION_FIND_LIMITS.rows
  for (const row of source.rows.slice(0, CONVERSATION_FIND_LIMITS.rows)) {
    if (!row.id || row.id.length > 1_024 || rowIds.has(row.id)) return null
    rowIds.add(row.id)
    const segments: Array<{ readonly id: string; readonly text: string }> = []
    const segmentIds = new Set<string>()
    for (const segment of row.segments) {
      if (segmentCount === CONVERSATION_FIND_LIMITS.segments || characters === CONVERSATION_FIND_LIMITS.characters) {
        truncated = true
        break
      }
      if (!segment.id || segment.id.length > 1_024 || segmentIds.has(segment.id)) return null
      segmentIds.add(segment.id)
      segmentCount++
      const available = CONVERSATION_FIND_LIMITS.characters - characters
      const text = segment.text.slice(0, available)
      characters += text.length
      if (text.length !== segment.text.length) truncated = true
      segments.push({ id: segment.id, text })
    }
    rows.push({ id: row.id, segments })
    if (segmentCount === CONVERSATION_FIND_LIMITS.segments || characters === CONVERSATION_FIND_LIMITS.characters) {
      if (rows.length < source.rows.length) truncated = true
      break
    }
  }
  return { scopeId: source.scopeId, rows, history: source.history, truncated }
}

/** Escaped literal Unicode matching preserves original offsets; lowercasing can expand characters and corrupt them. */
function find(source: CapturedSource, query: string) {
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu')
  const matches: ConversationFindMatch[] = []
  for (const row of source.rows) {
    for (const segment of row.segments) {
      pattern.lastIndex = 0
      for (let match = pattern.exec(segment.text); match; match = pattern.exec(segment.text)) {
        if (matches.length === CONVERSATION_FIND_LIMITS.matches) return { matches, truncated: true }
        matches.push({ rowId: row.id, segmentId: segment.id, start: match.index, end: match.index + match[0].length })
      }
    }
  }
  return { matches, truncated: source.truncated }
}

function sameMatch(left: ConversationFindMatch | undefined, right: ConversationFindMatch | undefined) {
  return (
    left?.rowId === right?.rowId &&
    left?.segmentId === right?.segmentId &&
    left?.start === right?.start &&
    left?.end === right?.end
  )
}

/** Local read-only ViewModel. It owns the query and bounded derived index, but no Host, DOM, Run or persistence port. */
export function createConversationFind(
  options: {
    readonly schedule?: ((callback: () => void, delay: number) => () => void) | undefined
    readonly onSubscriberError?: ((error: unknown) => void) | undefined
  } = {},
) {
  const state = createState<ConversationFindState>(
    {
      status: 'closed',
      scopeId: null,
      query: '',
      matches: [],
      activeIndex: -1,
      navigationRevision: 0,
      truncated: false,
      history: 'complete',
      error: null,
    },
    options.onSubscriberError ?? (() => {}),
  )
  const schedule =
    options.schedule ??
    ((callback, delay) => {
      const timer = setTimeout(callback, delay)
      return () => clearTimeout(timer)
    })
  let source: CapturedSource | null = null
  let invalidSource = false
  let disposed = false
  let generation = 0
  let cancel: (() => void) | null = null
  let pending = false
  let preferred: ConversationFindMatch | undefined
  const stop = () => {
    generation++
    cancel?.()
    cancel = null
    pending = false
  }
  const refresh = (delay: number, preserve: boolean, coalesce = false) => {
    if (!coalesce || !pending) stop()
    if (!preserve) preferred = undefined
    const expected = generation
    const current = state.reader.getSnapshot()
    if (disposed || current.status === 'closed') return
    const query = current.query.trim()
    const error = invalidSource
      ? 'INVALID_SOURCE'
      : current.query.length > CONVERSATION_FIND_LIMITS.query
        ? 'QUERY_LIMIT'
        : null
    const reset: Pick<ConversationFindState, 'matches' | 'activeIndex' | 'truncated' | 'error'> = {
      matches: [],
      activeIndex: -1,
      truncated: source?.truncated ?? false,
      error,
    }
    if (error || !source || !query) {
      stop()
      preferred = undefined
      state.replace({ ...current, ...reset, status: error ? 'failed' : 'idle' })
      return
    }
    // No stale count or old Next target remains actionable while a new query is pending.
    state.replace({ ...current, ...reset, status: 'searching' })
    if (generation !== expected || disposed) return
    if (pending) return
    pending = true
    const scheduled = schedule(() => {
      if (disposed || generation !== expected || !pending || !source) return
      pending = false
      cancel = null
      const previous = preferred
      const result = find(source, query)
      const previousIndex = previous ? result.matches.findIndex((match) => sameMatch(match, previous)) : -1
      const activeIndex = previousIndex >= 0 ? previousIndex : result.matches.length ? 0 : -1
      const selected = result.matches[activeIndex]
      preferred = selected
      state.replace({
        ...state.reader.getSnapshot(),
        ...result,
        activeIndex,
        navigationRevision: current.navigationRevision + (preserve && sameMatch(previous, selected) ? 0 : 1),
        status: 'ready',
        error: null,
      })
    }, delay)
    if (generation === expected && pending && !disposed) cancel = scheduled
    else scheduled()
  }
  const publishClosed = () => {
    stop()
    preferred = undefined
    const current = state.reader.getSnapshot()
    state.replace({
      ...current,
      status: 'closed',
      query: '',
      matches: [],
      activeIndex: -1,
      truncated: false,
      error: null,
    })
  }
  const close = () => {
    if (!disposed) publishClosed()
  }
  return {
    reader: state.reader,
    setSource(next: ConversationFindSource | null) {
      if (disposed) return
      const current = state.reader.getSnapshot()
      source = next ? captureSource(next) : null
      invalidSource = next !== null && source === null
      const scopeId = source?.scopeId ?? null
      const changedScope = current.scopeId !== scopeId
      state.replace({
        ...current,
        scopeId,
        history: source?.history ?? 'complete',
        status: current.status === 'closed' ? 'closed' : 'searching',
        matches: [],
        activeIndex: -1,
      })
      if (!next) close()
      else refresh(80, !changedScope, !changedScope)
    },
    open(scopeId: string): boolean {
      if (disposed || !source || source.scopeId !== scopeId) return false
      const current = state.reader.getSnapshot()
      if (current.status !== 'closed') return true
      state.replace({ ...current, status: 'idle' })
      return true
    },
    setQuery(scopeId: string, query: string): boolean {
      const current = state.reader.getSnapshot()
      if (disposed || current.status === 'closed' || current.scopeId !== scopeId) return false
      state.replace({
        ...current,
        query: query.slice(0, CONVERSATION_FIND_LIMITS.query + 1),
        status: 'searching',
        matches: [],
        activeIndex: -1,
      })
      refresh(250, false)
      return true
    },
    step(scopeId: string, direction: 1 | -1): boolean {
      const current = state.reader.getSnapshot()
      if (disposed || current.scopeId !== scopeId || current.status !== 'ready' || !current.matches.length) return false
      const activeIndex = (current.activeIndex + direction + current.matches.length) % current.matches.length
      preferred = current.matches[activeIndex]
      state.replace({
        ...current,
        activeIndex,
        navigationRevision: current.navigationRevision + 1,
      })
      return true
    },
    close,
    dispose() {
      if (disposed) return
      disposed = true
      publishClosed()
      source = null
      state.dispose()
    },
  }
}
