import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import type { ParsedWorkspaceSearchInput } from '@hbar/contracts/workspace-query'
import type {
  NativeCacheStats,
  NativeCommonRequest,
  NativeFindResponse,
  NativeReadRequest,
  NativeReadResponse,
  NativeSearchRequest,
  NativeSearchResponse,
} from '@hbar/local-tools/native-query'
import { WorkspaceQueryRuntime, type NativeWorkspaceQueryAdapter } from '../plugins/local-tools/src/workspace-query'

const emptyStats = (): NativeCacheStats => ({
  contentEntries: 0,
  matchEntries: 0,
  matcherEntries: 0,
  bytes: 0,
  maxBytes: 0,
  contentHits: 0,
  contentMisses: 0,
  matchHits: 0,
  matchMisses: 0,
  bytesRead: 0,
})

class FakeNativeQuery implements NativeWorkspaceQueryAdapter {
  active = 0
  maxActive = 0
  searches = 0
  cancellations = 0
  readonly #pending = new Map<string, { reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>()

  constructor(private readonly delayMs = 30) {}

  search(request: NativeSearchRequest, cancelId: string): Promise<NativeSearchResponse> {
    this.searches += 1
    this.active += 1
    this.maxActive = Math.max(this.maxActive, this.active)
    return new Promise<NativeSearchResponse>((resolveSearch, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(cancelId)
        this.active -= 1
        resolveSearch({
          matches: [],
          truncated: false,
          filesChecked: 0,
          cache: {
            contentHits: 0,
            contentMisses: 0,
            matchHits: 0,
            matchMisses: 0,
            bytesRead: 0,
          },
        })
      }, this.delayMs)
      this.#pending.set(cancelId, {
        timer,
        reject: (error) => {
          this.active -= 1
          reject(error)
        },
      })
      expect(request.workspace).toBeTruthy()
    })
  }

  async find(_request: NativeCommonRequest, _cancelId: string): Promise<NativeFindResponse> {
    return { paths: [], truncated: false, filesChecked: 0 }
  }

  async read(_request: NativeReadRequest, _cancelId: string): Promise<NativeReadResponse> {
    return { text: '', startLine: 1, endLine: 0, totalLines: 0, cacheHit: false }
  }

  cancel(cancelId: string): boolean {
    const pending = this.#pending.get(cancelId)
    if (!pending) return false
    this.#pending.delete(cancelId)
    clearTimeout(pending.timer)
    this.cancellations += 1
    pending.reject(new Error('query cancelled'))
    return true
  }

  invalidate(_absolutePath: string): void {}

  clear(): void {
    for (const id of [...this.#pending.keys()]) this.cancel(id)
  }

  cacheStats(): NativeCacheStats {
    return emptyStats()
  }
}

const input = (pattern: string): ParsedWorkspaceSearchInput => ({
  path: '.',
  include: [],
  exclude: [],
  includeHidden: false,
  limit: 200,
  pattern,
  literal: true,
  caseMode: 'smart',
  beforeContext: 0,
  afterContext: 0,
})

const resolvePath = async (workspace: string, path: string) => resolve(workspace, path)

test('workspace query runtime merges equivalent callers and bounds running and queued work', async () => {
  const native = new FakeNativeQuery(30)
  const runtime = new WorkspaceQueryRuntime([], resolvePath, {
    native,
    maxRunning: 2,
    maxQueued: 1,
    timeoutMs: 1_000,
  })
  const signal = new AbortController().signal
  const duplicateA = runtime.search('C:/workspace', input('same'), signal)
  const duplicateB = runtime.search('C:/workspace', input('same'), signal)
  await Promise.all([duplicateA, duplicateB])
  expect(native.searches).toBe(1)

  const first = runtime.search('C:/workspace', input('one'), signal)
  const second = runtime.search('C:/workspace', input('two'), signal)
  const queued = runtime.search('C:/workspace', input('three'), signal)
  await Bun.sleep(0)
  await expect(runtime.search('C:/workspace', input('four'), signal)).rejects.toMatchObject({ code: 'QUERY_BUSY' })
  await Promise.all([first, second, queued])
  expect(native.maxActive).toBe(2)
  runtime.dispose()
})

test('workspace query runtime cancels unobserved native work and reports timeouts distinctly', async () => {
  const cancelledNative = new FakeNativeQuery(1_000)
  const cancelledRuntime = new WorkspaceQueryRuntime([], resolvePath, {
    native: cancelledNative,
    timeoutMs: 2_000,
  })
  const controller = new AbortController()
  const pending = cancelledRuntime.search('C:/workspace', input('cancel'), controller.signal)
  await Bun.sleep(0)
  controller.abort()
  await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
  expect(cancelledNative.cancellations).toBe(1)
  cancelledRuntime.dispose()

  const timedNative = new FakeNativeQuery(1_000)
  const timedRuntime = new WorkspaceQueryRuntime([], resolvePath, { native: timedNative, timeoutMs: 10 })
  await expect(
    timedRuntime.search('C:/workspace', input('timeout'), new AbortController().signal),
  ).rejects.toMatchObject({ code: 'TIMEOUT' })
  expect(timedNative.cancellations).toBe(1)
  timedRuntime.dispose()
})
