import { CommandError, createCommandClient } from '@hbar/commands'
import { runFileChangesCommands } from '@hbar/contracts/commands/run-file-changes'
import {
  runFileChangeDiffSchema,
  runFileChangesPageSchema,
  type RunFileChangesPage,
  type RunFileChangeDiff,
} from '@hbar/contracts/run-file-changes'
import { createState } from './state'
import type { CommandExecutor } from '@hbar/commands'

export const MAX_FILE_CHANGE_REVIEWS = 32
export const runFileChangeReviewKey = (sessionId: string, runId: string): string => JSON.stringify([sessionId, runId])
export interface RunFileChangeReview {
  readonly expanded: boolean
  readonly action: 'files' | 'diff' | 'undo' | null
  readonly page: RunFileChangesPage | null
  readonly cursors: readonly (string | null)[]
  readonly pageIndex: number
  readonly selectedPath: string | null
  readonly diff: RunFileChangeDiff | null
  readonly error: string | null
  readonly failedAction: 'files' | 'diff' | 'undo' | null
}
export const EMPTY_FILE_CHANGE_REVIEW: RunFileChangeReview = Object.freeze({
  expanded: false,
  action: null,
  page: null,
  cursors: [null],
  pageIndex: 0,
  selectedPath: null,
  diff: null,
  error: null,
  failedAction: null,
})
export interface RunFileChangesState {
  readonly available: boolean
  readonly entries: Readonly<Record<string, RunFileChangeReview>>
  readonly rejected: { readonly key: string; readonly action: 'files' | 'diff' | 'undo' } | null
}
export function createRunFileChanges(files: CommandExecutor | undefined, onSubscriberError: (error: unknown) => void) {
  const state = createState<RunFileChangesState>(
    { available: Boolean(files), entries: {}, rejected: null },
    onSubscriberError,
  )
  const client = files ? createCommandClient(runFileChangesCommands, files) : null
  const pending = new Map<string, AbortController>()
  let disposed = false
  const entry = (key: string) => state.reader.getSnapshot().entries[key] ?? EMPTY_FILE_CHANGE_REVIEW
  const put = (key: string, next: RunFileChangeReview) => {
    if (disposed) return
    const current = state.reader.getSnapshot()
    const entries = { ...current.entries, [key]: next }
    const keys = Object.keys(entries)
    while (keys.length > MAX_FILE_CHANGE_REVIEWS) {
      const oldest = keys.find((candidate) => candidate !== key && entries[candidate]?.action !== 'undo')
      if (!oldest) break
      keys.splice(keys.indexOf(oldest), 1)
      if (oldest && oldest !== key) {
        pending.get(oldest)?.abort()
        pending.delete(oldest)
        delete entries[oldest]
      }
    }
    state.replace({ ...current, entries, rejected: current.rejected?.key === key ? null : current.rejected })
  }
  const request = async (
    sessionId: string,
    runId: string,
    action: NonNullable<RunFileChangeReview['action']>,
    operation: (signal: AbortSignal) => Promise<Partial<RunFileChangeReview>>,
    initial: Partial<RunFileChangeReview> = {},
  ): Promise<boolean> => {
    const key = runFileChangeReviewKey(sessionId, runId)
    if (disposed || entry(key).action === 'undo') return false
    if (pending.size >= MAX_FILE_CHANGE_REVIEWS && !pending.has(key)) {
      state.replace({ ...state.reader.getSnapshot(), rejected: { key, action } })
      return false
    }
    pending.get(key)?.abort()
    const controller = new AbortController()
    pending.set(key, controller)
    put(key, { ...entry(key), ...initial, action, error: null, failedAction: null })
    try {
      if (!client) throw new CommandError('CAPABILITY_UNAVAILABLE', 'File change review is unavailable')
      const result = await operation(controller.signal)
      if (disposed || pending.get(key) !== controller) return false
      put(key, { ...entry(key), ...result, action: null, error: null, failedAction: null })
      return true
    } catch (error) {
      if (disposed || pending.get(key) !== controller) return false
      const code =
        error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'EXECUTION_FAILED'
      put(key, { ...entry(key), action: null, error: code, failedAction: action })
      return false
    } finally {
      if (pending.get(key) === controller) pending.delete(key)
    }
  }
  const assertTarget = (target: { sessionId: string; runId: string }, sessionId: string, runId: string) => {
    if (target.sessionId !== sessionId || target.runId !== runId)
      throw new CommandError('INVALID_OUTPUT', 'Review belongs to another Run')
  }
  const readFiles = (sessionId: string, runId: string, direction: 'expand' | 'next' | 'previous' = 'expand') => {
    const key = runFileChangeReviewKey(sessionId, runId),
      current = entry(key)
    const pageIndex =
      direction === 'expand' ? 0 : direction === 'next' ? current.pageIndex + 1 : Math.max(0, current.pageIndex - 1)
    const after = direction === 'next' ? current.page?.nextCursor : current.cursors[pageIndex]
    if (direction === 'next' && !after) return Promise.resolve(false)
    return request(
      sessionId,
      runId,
      'files',
      async (signal) => {
        if (!client) throw new CommandError('CAPABILITY_UNAVAILABLE', 'File change review is unavailable')
        const page = runFileChangesPageSchema.parse(
          await client.execute('run.fileChanges', { sessionId, runId, ...(after ? { after } : {}) }, { signal }),
        )
        assertTarget(page, sessionId, runId)
        if (
          new Set(page.items.map((file) => file.path)).size !== page.items.length ||
          (page.nextCursor !== null && (page.nextCursor === after || page.nextCursor !== page.items.at(-1)?.path))
        )
          throw new CommandError('INVALID_OUTPUT', 'File page has no forward cursor')
        return {
          expanded: true,
          page,
          pageIndex,
          cursors: [...current.cursors.slice(0, pageIndex), after ?? null],
          selectedPath: null,
          diff: null,
        }
      },
      { expanded: true },
    )
  }
  const readDiff = (sessionId: string, runId: string, path: string, offset = 0) =>
    request(
      sessionId,
      runId,
      'diff',
      async (signal) => {
        if (!client) throw new CommandError('CAPABILITY_UNAVAILABLE', 'File change review is unavailable')
        const diff = runFileChangeDiffSchema.parse(
          await client.execute('run.fileChangeDiff', { sessionId, runId, path, offset }, { signal }),
        )
        assertTarget(diff, sessionId, runId)
        if (diff.path !== path || diff.offset !== offset)
          throw new CommandError('INVALID_OUTPUT', 'File difference belongs to another page')
        return { selectedPath: path, diff }
      },
      {
        selectedPath: path,
        diff:
          entry(runFileChangeReviewKey(sessionId, runId)).selectedPath === path
            ? entry(runFileChangeReviewKey(sessionId, runId)).diff
            : null,
      },
    )
  return {
    reader: state.reader,
    readFiles,
    readDiff,
    collapse(sessionId: string, runId: string) {
      const key = runFileChangeReviewKey(sessionId, runId)
      if (entry(key).action === 'undo') return
      pending.get(key)?.abort()
      pending.delete(key)
      put(key, { ...EMPTY_FILE_CHANGE_REVIEW })
    },
    closeDiff(sessionId: string, runId: string) {
      const key = runFileChangeReviewKey(sessionId, runId)
      if (entry(key).action === 'undo') return
      pending.get(key)?.abort()
      pending.delete(key)
      put(key, { ...entry(key), selectedPath: null, diff: null, action: null, error: null, failedAction: null })
    },
    undo: (sessionId: string, runId: string) =>
      request(sessionId, runId, 'undo', async (signal) => {
        if (!client) throw new CommandError('CAPABILITY_UNAVAILABLE', 'File change undo is unavailable')
        const page = runFileChangesPageSchema.parse(
          await client.execute('run.undoFileChanges', { sessionId, runId }, { signal }),
        )
        assertTarget(page, sessionId, runId)
        if (!page.summary?.undoneAt) throw new CommandError('INVALID_OUTPUT', 'Undo did not return a completed receipt')
        return { page, pageIndex: 0, cursors: [null] }
      }),
    release(sessionId: string, runId: string) {
      const key = runFileChangeReviewKey(sessionId, runId)
      // An in-flight mutation retains its result until the Host acknowledgement; no optimistic success.
      if (entry(key).action === 'undo') return
      pending.get(key)?.abort()
      pending.delete(key)
      const current = state.reader.getSnapshot(),
        entries = { ...current.entries }
      delete entries[key]
      if (!disposed) state.replace({ ...current, entries })
    },
    dispose() {
      disposed = true
      for (const controller of pending.values()) controller.abort()
      pending.clear()
      state.dispose()
    },
  }
}
