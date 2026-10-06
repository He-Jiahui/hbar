import { createStore, type StoreApi } from 'zustand/vanilla'
import type { HbarChatSearchRow } from '@hbar/app-react'
import type { SessionSearchScope } from '@hbar/contracts/commands/session-search'

export const WEB_CHAT_SEARCH_LIMITS = Object.freeze({ recent: 8, results: 50, snippets: 3, query: 160 })

export interface WebChatSearchPage {
  readonly rows: readonly HbarChatSearchRow[]
  readonly truncated: boolean
  readonly incompleteReason: 'indexing' | 'scan_cap' | null
}

export interface WebChatSearchPort {
  recent(signal: AbortSignal): Promise<WebChatSearchPage>
  search(query: string, signal: AbortSignal, source?: SessionSearchScope): Promise<WebChatSearchPage>
}

export interface WebChatSearchState {
  readonly open: boolean
  readonly query: string
  readonly source: SessionSearchScope
  readonly status: 'closed' | 'recent' | 'loading' | 'ready' | 'empty' | 'error' | 'disconnected' | 'indexing'
  readonly rows: readonly HbarChatSearchRow[]
  readonly selectedResultId: string | null
  readonly truncated: boolean
  readonly error: string | null
  readonly openingResultId: string | null
  readonly openError: { readonly sessionId: string; readonly message: string } | null
}

export interface WebChatSearchController {
  readonly store: StoreApi<WebChatSearchState>
  bind(hostId: string | null, connected: boolean): void
  open(): void
  close(): void
  setQuery(query: string): void
  setSource(source: SessionSearchScope): void
  compositionStart(): void
  compositionEnd(query: string): void
  move(direction: 'up' | 'down'): void
  select(sessionId: string): void
  openRow(sessionId: string, workspaceId: string, navigate: (row: HbarChatSearchRow) => Promise<void>): Promise<boolean>
  retry(): void
  dispose(): void
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'EXECUTION_FAILED'
}

function validPage(page: WebChatSearchPage, mode: 'recent' | 'search'): boolean {
  if (page.rows.length > (mode === 'recent' ? WEB_CHAT_SEARCH_LIMITS.recent : WEB_CHAT_SEARCH_LIMITS.results))
    return false
  if (page.incompleteReason !== null && page.incompleteReason !== 'indexing' && page.incompleteReason !== 'scan_cap')
    return false
  const ids = new Set<string>()
  for (const row of page.rows) {
    const resultId = row.resultId ?? row.sessionId
    if (!resultId || !row.sessionId || !row.workspaceId || ids.has(resultId) || !Number.isSafeInteger(row.updatedAt))
      return false
    if (row.snippets.length > WEB_CHAT_SEARCH_LIMITS.snippets || row.matchCount < row.snippets.length) return false
    ids.add(resultId)
  }
  return true
}

/** One owner per Host transport. At most two physical reads are outstanding; stale replies never repopulate a new query. */
export function createWebChatSearchController(
  port: WebChatSearchPort,
  schedule: (callback: () => void, delay: number) => () => void = (callback, delay) => {
    const timer = setTimeout(callback, delay)
    return () => clearTimeout(timer)
  },
): WebChatSearchController {
  const store = createStore<WebChatSearchState>(() => ({
    open: false,
    query: '',
    source: 'all',
    status: 'closed',
    rows: [],
    selectedResultId: null,
    truncated: false,
    error: null,
    openingResultId: null,
    openError: null,
  }))
  let hostId: string | null = null
  let connected = false
  let disposed = false
  let composing = false
  let generation = 0
  let cancelTimer: (() => void) | null = null
  let indexingAttempts = 0
  const active = new Set<{ readonly controller: AbortController }>()
  let queued: { readonly query: string; readonly generation: number } | null = null
  let openingRequest: { readonly sessionId: string } | null = null

  const releaseOpeningRequest = () => {
    openingRequest = null
    if (store.getState().openingResultId !== null) store.setState({ openingResultId: null })
  }

  const stop = () => {
    generation++
    cancelTimer?.()
    cancelTimer = null
    queued = null
    for (const request of active) request.controller.abort()
  }
  const current = (target: number, query: string) =>
    !disposed &&
    connected &&
    hostId !== null &&
    store.getState().open &&
    generation === target &&
    store.getState().query.trim() === query

  const dispatch = (query: string, target: number) => {
    if (!current(target, query)) return
    if (active.size >= 2) {
      queued = { query, generation: target }
      return
    }
    const mode = query ? 'search' : 'recent'
    const request = { controller: new AbortController() }
    active.add(request)
    const read = Promise.resolve().then(() =>
      mode === 'recent'
        ? port.recent(request.controller.signal)
        : port.search(query, request.controller.signal, store.getState().source),
    )
    void read
      .then((page) => {
        if (!current(target, query)) return
        if (!validPage(page, mode)) throw { code: 'INVALID_OUTPUT' }
        const status =
          page.incompleteReason === 'indexing'
            ? 'indexing'
            : mode === 'recent'
              ? 'recent'
              : page.rows.length || page.incompleteReason === 'scan_cap'
                ? 'ready'
                : 'empty'
        store.setState({
          status,
          rows: page.rows,
          selectedResultId: page.rows[0] ? (page.rows[0].resultId ?? page.rows[0].sessionId) : null,
          truncated: page.truncated || page.incompleteReason === 'scan_cap',
          error: null,
        })
        if (page.incompleteReason === 'indexing') {
          const delay = Math.min(2_000, 300 * 2 ** Math.min(indexingAttempts++, 3))
          cancelTimer = schedule(() => {
            cancelTimer = null
            if (current(target, query)) beginRead(0, true)
          }, delay)
        } else indexingAttempts = 0
      })
      .catch((error: unknown) => {
        if (current(target, query))
          store.setState({
            status: 'error',
            rows: [],
            selectedResultId: null,
            truncated: false,
            error: errorCode(error),
          })
      })
      .finally(() => {
        active.delete(request)
        const next = queued
        if (next && active.size < 2) {
          queued = null
          dispatch(next.query, next.generation)
        }
      })
  }
  const beginRead = (delay: number, continuingIndex = false) => {
    stop()
    if (!continuingIndex) indexingAttempts = 0
    const state = store.getState()
    if (!state.open) return
    if (!hostId || !connected) {
      store.setState({ status: 'disconnected', rows: [], selectedResultId: null, truncated: false })
      return
    }
    const query = state.query.trim()
    if (!query && state.source !== 'all' && state.source !== 'title') {
      store.setState({ status: 'recent', rows: [], selectedResultId: null, truncated: false, error: null })
      return
    }
    if (query.length > WEB_CHAT_SEARCH_LIMITS.query) {
      store.setState({ status: 'error', rows: [], selectedResultId: null, error: 'QUERY_LIMIT', truncated: false })
      return
    }
    store.setState({ status: 'loading', rows: [], selectedResultId: null, truncated: false, error: null })
    if (composing) return
    const target = generation
    if (delay)
      cancelTimer = schedule(() => {
        cancelTimer = null
        dispatch(query, target)
      }, delay)
    else dispatch(query, target)
  }
  return {
    store,
    bind(nextHostId, nextConnected) {
      if (disposed) return
      const changed = hostId !== nextHostId
      const reconnected = !connected && nextConnected
      hostId = nextHostId
      connected = nextConnected
      if (changed || !nextConnected) {
        stop()
        releaseOpeningRequest()
      }
      if (store.getState().open && (changed || reconnected || !nextConnected)) beginRead(0)
    },
    open() {
      if (disposed || store.getState().open) return
      composing = false
      store.setState({
        open: true,
        query: '',
        source: 'all',
        rows: [],
        selectedResultId: null,
        truncated: false,
        error: null,
        openError: null,
        openingResultId: null,
      })
      beginRead(0)
    },
    close() {
      if (disposed) return
      stop()
      releaseOpeningRequest()
      composing = false
      store.setState({
        open: false,
        query: '',
        status: 'closed',
        rows: [],
        selectedResultId: null,
        truncated: false,
        error: null,
        openError: null,
        openingResultId: null,
      })
    },
    setQuery(query) {
      if (disposed || !store.getState().open) return
      store.setState({ query, openError: null })
      beginRead(query.trim() ? 250 : 0)
    },
    setSource(source) {
      if (disposed || !store.getState().open || store.getState().source === source) return
      store.setState({ source, openError: null })
      beginRead(0)
    },
    compositionStart() {
      if (disposed || !store.getState().open) return
      composing = true
      beginRead(0)
    },
    compositionEnd(query) {
      if (disposed || !store.getState().open) return
      composing = false
      store.setState({ query })
      beginRead(query.trim() ? 250 : 0)
    },
    move(direction) {
      const state = store.getState()
      if (disposed || !state.open || !state.rows.length || !['recent', 'ready'].includes(state.status)) return
      const index = Math.max(
        0,
        state.rows.findIndex((row) => (row.resultId ?? row.sessionId) === state.selectedResultId),
      )
      const next = Math.max(0, Math.min(state.rows.length - 1, index + (direction === 'down' ? 1 : -1)))
      const row = state.rows[next]
      store.setState({ selectedResultId: row ? (row.resultId ?? row.sessionId) : null })
    },
    select(sessionId) {
      const state = store.getState()
      if (
        disposed ||
        !state.open ||
        !['recent', 'ready'].includes(state.status) ||
        !state.rows.some((row) => (row.resultId ?? row.sessionId) === sessionId)
      )
        return
      store.setState({ selectedResultId: sessionId })
    },
    async openRow(sessionId, workspaceId, navigate) {
      const state = store.getState()
      const row = state.rows.find(
        (item) => (item.resultId ?? item.sessionId) === sessionId && item.workspaceId === workspaceId,
      )
      if (
        disposed ||
        !state.open ||
        !['recent', 'ready'].includes(state.status) ||
        !row ||
        state.openingResultId ||
        !connected
      )
        return false
      const target = generation
      const request = { sessionId }
      openingRequest = request
      store.setState({ openingResultId: sessionId, openError: null })
      try {
        await navigate(row)
        if (!current(target, state.query.trim())) return false
        return true
      } catch (error) {
        if (current(target, state.query.trim())) store.setState({ openError: { sessionId, message: errorCode(error) } })
        return false
      } finally {
        if (openingRequest === request) releaseOpeningRequest()
      }
    },
    retry() {
      if (!disposed && store.getState().open) beginRead(0)
    },
    dispose() {
      if (disposed) return
      stop()
      releaseOpeningRequest()
      disposed = true
    },
  }
}
