import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import type { ParsedWorkspaceSearchInput } from '@hbar/contracts/workspace-query'
import type { NativeCacheStats, NativeSearchRequest, NativeSearchResponse } from '@hbar/local-tools/native-query'
import { WorkspaceQueryRuntime, type NativeWorkspaceQueryAdapter } from '../plugins/local-tools/src/workspace-query'

function deferred<Value>() {
  let finish: (value: Value) => void = () => {
    throw new Error('Deferred not initialized')
  }
  const promise = new Promise<Value>((resolveValue) => {
    finish = resolveValue
  })
  return { promise, resolve: (value: Value) => finish(value) }
}
const stats: NativeCacheStats = {
  contentEntries: 0,
  matchEntries: 0,
  matcherEntries: 0,
  globEntries: 0,
  lineIndexEntries: 0,
  lineIndexBytes: 0,
  bytes: 0,
  maxBytes: 0,
  contentHits: 0,
  contentMisses: 0,
  matchHits: 0,
  matchMisses: 0,
  bytesRead: 0,
}
const response: NativeSearchResponse = {
  matches: [],
  truncated: false,
  filesChecked: 0,
  cache: { contentHits: 0, contentMisses: 0, matchHits: 0, matchMisses: 0, bytesRead: 0 },
}
const input = (pattern: string): ParsedWorkspaceSearchInput => ({
  path: '.',
  include: [],
  exclude: [],
  includeHidden: false,
  limit: 20,
  from_index: 0,
  fully_scan: false,
  pattern,
  literal: true,
  caseMode: 'smart',
  beforeContext: 0,
  afterContext: 0,
})

function controlled() {
  const started = deferred<void>()
  const cancelled = deferred<void>()
  const terminal = deferred<'success' | 'failure'>()
  const ids: string[] = []
  const cancellations: string[] = []
  let clears = 0
  const native: NativeWorkspaceQueryAdapter = {
    async search(_request: NativeSearchRequest, id: string) {
      ids.push(id)
      started.resolve()
      if ((await terminal.promise) === 'failure') throw new Error('controlled native failure')
      return response
    },
    find: () => Promise.reject(new Error('Unexpected find')),
    read: () => Promise.reject(new Error('Unexpected range read')),
    cancel(id) {
      cancellations.push(id)
      cancelled.resolve()
      return true
    },
    invalidate() {},
    clear() {
      clears++
    },
    cacheStats: () => stats,
  }
  const runtime = new WorkspaceQueryRuntime([], (workspace, path) => Promise.resolve(resolve(workspace, path)), {
    native,
    maxRunning: 1,
    maxQueued: 2,
    timeoutMs: 10000,
  })
  return { runtime, started, cancelled, terminal, ids, cancellations, clears: () => clears }
}

test('queued abort releases only undispatched query; running abort remains counted until controlled native Promise settles', async () => {
  const f = controlled()
  const first = new AbortController()
  const second = new AbortController()
  const running = f.runtime.search('C:/workspace', input('running'), first.signal)
  const runningOutcome = running.then(
    (value) => value,
    (error: unknown) => error,
  )
  const accepted: Promise<unknown>[] = [runningOutcome]
  try {
    await f.started.promise
    expect(f.runtime.idleRequests()).toBe(1)
    const waiting = f.runtime.search('C:/workspace', input('waiting'), second.signal)
    const waitingOutcome = waiting.then(
      (value) => value,
      (error: unknown) => error,
    )
    accepted.push(waitingOutcome)
    // Complete asynchronous path admission before observing queue occupancy, not a performance threshold.
    await new Promise<void>((done) => {
      setTimeout(done, 0)
    })
    expect(f.runtime.idleRequests()).toBe(2)
    expect(f.ids).toHaveLength(1)
    second.abort(new DOMException('Queued fixture cancellation', 'AbortError'))
    expect(await waitingOutcome).toMatchObject({ code: 'CANCELLED' })
    expect(f.runtime.idleRequests()).toBe(1)
    expect(f.cancellations).toEqual([])
    first.abort(new DOMException('Running fixture cancellation', 'AbortError'))
    expect(await runningOutcome).toMatchObject({ code: 'CANCELLED' })
    await f.cancelled.promise
    expect(f.cancellations).toEqual(f.ids)
    expect(f.runtime.idleRequests()).toBe(1)
    f.runtime.dispose()
    expect(f.clears()).toBe(1)
    expect(f.runtime.idleRequests()).toBe(1)
    f.terminal.resolve('failure')
    await new Promise<void>((done) => {
      setTimeout(done, 0)
    })
    expect(f.runtime.idleRequests()).toBe(0)
  } finally {
    f.terminal.resolve('failure')
    await Promise.allSettled(accepted)
    f.runtime.dispose()
  }
}, 20000)

test('shared successful query is one physical admission and becomes idle only after native success', async () => {
  const f = controlled()
  const signal = new AbortController().signal
  const first = f.runtime.search('C:/workspace', input('same'), signal)
  const second = f.runtime.search('C:/workspace', input('same'), signal)
  void first.catch(() => undefined)
  void second.catch(() => undefined)
  try {
    await f.started.promise
    await new Promise<void>((done) => {
      setTimeout(done, 0)
    })
    expect(f.runtime.idleRequests()).toBe(1)
    expect(f.ids).toHaveLength(1)
    f.terminal.resolve('success')
    const results = await Promise.all([first, second])
    expect(results[0]).toEqual(results[1])
    expect(results[0]?.matches).toEqual([])
    await new Promise<void>((done) => {
      setTimeout(done, 0)
    })
    expect(f.runtime.idleRequests()).toBe(0)
    expect(f.cancellations).toEqual([])
  } finally {
    f.terminal.resolve('success')
    await Promise.allSettled([first, second])
    f.runtime.dispose()
  }
}, 20000)

test('running timeout requests native cancel but retains physical admission until native rejection', async () => {
  const started = deferred<void>()
  const cancelled = deferred<void>()
  const terminal = deferred<void>()
  let settled = false
  const native: NativeWorkspaceQueryAdapter = {
    async search() {
      started.resolve()
      await terminal.promise
      throw new Error('controlled timed out native operation')
    },
    find: () => Promise.reject(new Error('Unexpected find')),
    read: () => Promise.reject(new Error('Unexpected read')),
    cancel() {
      cancelled.resolve()
      return true
    },
    invalidate() {},
    clear() {},
    cacheStats: () => stats,
  }
  const runtime = new WorkspaceQueryRuntime([], (workspace, path) => Promise.resolve(resolve(workspace, path)), {
    native,
    timeoutMs: 20,
  })
  const accepted = runtime.search('C:/workspace', input('timeout'), new AbortController().signal)
  const outcome = accepted.then(
    (value) => {
      settled = true
      return value
    },
    (error: unknown) => {
      settled = true
      return error
    },
  )
  try {
    await started.promise
    await cancelled.promise
    expect(settled).toBe(false)
    expect(runtime.idleRequests()).toBe(1)
    terminal.resolve()
    expect(await outcome).toMatchObject({ code: 'TIMEOUT' })
    await new Promise<void>((done) => {
      setTimeout(done, 0)
    })
    expect(runtime.idleRequests()).toBe(0)
  } finally {
    terminal.resolve()
    await outcome
    runtime.dispose()
  }
}, 20000)
