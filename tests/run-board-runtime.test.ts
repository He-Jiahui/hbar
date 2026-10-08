import { describe, expect, test } from 'bun:test'
import { CommandRegistry, type CommandExecutor } from '@hbar/commands'
import { createRunBoard } from '../packages/app-runtime/src/run-board'
import { createState } from '../packages/app-runtime/src/state'
import type { NavigationState, SurfaceState } from '../packages/app-runtime/src/types'

const wA = '00000000-0000-0000-0000-000000000001'
const wB = '00000000-0000-0000-0000-000000000002'
const sA = '00000000-0000-0000-0000-000000000011'
const sB = '00000000-0000-0000-0000-000000000012'
const runId = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const item = (n: number, workspaceId = wA, sessionId = sA) => ({
  run: {
    id: runId(n),
    sessionId,
    workspaceName: workspaceId,
    sessionTitle: sessionId,
    requestId: runId(n + 1000),
    modelId: runId(2000),
    status: 'running' as const,
    createdAt: n,
    startedAt: n,
    endedAt: null,
    error: null,
  },
  workspaceName: workspaceId,
  sessionTitle: sessionId,
  plan: null,
  usage: null,
})
const page = (
  workspaceId: string,
  sessionId: string | null,
  items: readonly ReturnType<typeof item>[],
  nextCursor: unknown = null,
) => ({
  workspaceId,
  sessionId,
  workspaceName: workspaceId,
  sessionTitle: sessionId,
  revision: 1,
  observedAt: 1,
  items,
  nextCursor,
})
function setup(port: CommandExecutor) {
  const navigation = createState<NavigationState>(
    { workspaceId: wB, sessionId: sB, status: 'idle', error: null },
    () => {},
  )
  const surfaces = createState<SurfaceState>(
    { panels: {}, windows: {}, focusedPanelId: null, focusedWindowId: null },
    () => {},
  )
  const local = new CommandRegistry()
  const board = createRunBoard(
    local,
    port,
    navigation.reader,
    surfaces.reader,
    () => {},
    () => false,
  )
  return { navigation, surfaces, local, board }
}
const panel = (
  instanceId: string,
  workspaceId: string,
  sessionId: string | null,
  binding: 'pinned' | 'followActive' = 'pinned',
) => ({ instanceId, panelId: 'run-board', workspaceId, sessionId, binding, params: {} })

describe('run board runtime panel targeting', () => {
  test('duplicate run IDs and foreign session records cannot become actionable board rows', async () => {
    for (const invalid of [page(wA, sA, [item(1), item(1)]), page(wA, sA, [item(1, wA, sB)])]) {
      const runtime = setup({ execute: () => Promise.resolve(invalid) })
      runtime.surfaces.replace({ ...runtime.surfaces.reader.getSnapshot(), panels: { a: panel('a', wA, sA) } })
      try {
        await expect(runtime.board.refresh({ instanceId: 'a' })).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
        expect(runtime.board.reader.getSnapshot().items).toHaveLength(0)
      } finally {
        runtime.board.dispose()
      }
    }
  })
  test('foreign or duplicate subsequent pages preserve the original rows and cursor for an explicit retry', async () => {
    const original = page(wA, sA, [item(1)], { revision: 1, createdAt: 1, runId: runId(1) })
    for (const invalid of [
      page(wB, sA, [item(2)]),
      page(wA, sB, [item(2, wA, sB)]),
      page(wA, sA, [item(2), item(2)]),
    ]) {
      let reads = 0
      const runtime = setup({ execute: () => Promise.resolve(++reads === 1 ? original : invalid) })
      runtime.surfaces.replace({ ...runtime.surfaces.reader.getSnapshot(), panels: { a: panel('a', wA, sA) } })
      try {
        await runtime.board.refresh({ instanceId: 'a' })
        await expect(runtime.board.loadMore({ instanceId: 'a' })).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
        expect(runtime.board.reader.getSnapshot()).toMatchObject({
          status: 'error',
          items: original.items,
          nextCursor: original.nextCursor,
        })
      } finally {
        runtime.board.dispose()
      }
    }
  })
  test('a repeated load-more cannot dispatch a second concurrent read', async () => {
    const original = page(wA, sA, [item(1)], { revision: 1, createdAt: 1, runId: runId(1) })
    let reads = 0
    let release: ((value: unknown) => void) | undefined
    const runtime = setup({
      execute: () => {
        reads++
        return reads === 1
          ? Promise.resolve(original)
          : reads === 2
            ? new Promise((resolve) => {
                release = resolve
              })
            : Promise.resolve(page(wA, sA, [item(2)]))
      },
    })
    runtime.surfaces.replace({ ...runtime.surfaces.reader.getSnapshot(), panels: { a: panel('a', wA, sA) } })
    let pending: Promise<unknown> | undefined
    try {
      await runtime.board.refresh({ instanceId: 'a' })
      pending = runtime.board.loadMore({ instanceId: 'a' })
      await expect(runtime.board.loadMore({ instanceId: 'a' })).rejects.toMatchObject({ code: 'BUSY' })
      expect(reads).toBe(2)
    } finally {
      release?.(page(wA, sA, [item(2)]))
      await pending?.catch(() => undefined)
      runtime.board.dispose()
    }
  })
  test('pinned target stays on A while active navigation is B', async () => {
    const calls: unknown[] = []
    const runtime = setup({
      execute: (_name, input) => {
        calls.push(input)
        return Promise.resolve(page(wA, sA, [item(1, wA, sA)]))
      },
    })
    runtime.surfaces.replace({ ...runtime.surfaces.reader.getSnapshot(), panels: { a: panel('a', wA, sA) } })
    await runtime.board.refresh({ instanceId: 'a' })
    expect(calls[0]).toMatchObject({ workspaceId: wA, sessionId: sA })
    expect(runtime.board.reader.getSnapshot().workspaceId).toBe(wA)
  })
  test('workspace-only pinned target does not borrow active B session', async () => {
    const calls: unknown[] = []
    const runtime = setup({
      execute: (_name, input) => {
        calls.push(input)
        return Promise.resolve(page(wA, null, [item(2, wA, sA)]))
      },
    })
    runtime.surfaces.replace({ ...runtime.surfaces.reader.getSnapshot(), panels: { a: panel('a', wA, null) } })
    await runtime.board.refresh({ instanceId: 'a' })
    expect(calls[0]).toMatchObject({ workspaceId: wA })
    expect(calls[0]).not.toHaveProperty('sessionId')
  })
  test('closed panel late response cannot publish', async () => {
    let resolve: ((value: unknown) => void) | undefined
    const runtime = setup({
      execute: () =>
        new Promise((r) => {
          resolve = r
        }),
    })
    runtime.surfaces.replace({ ...runtime.surfaces.reader.getSnapshot(), panels: { a: panel('a', wA, sA) } })
    const pending = runtime.board.refresh({ instanceId: 'a' })
    runtime.surfaces.replace({ ...runtime.surfaces.reader.getSnapshot(), panels: {} })
    resolve?.(page(wA, sA, [item(3)]))
    await expect(pending).rejects.toBeDefined()
    expect(runtime.board.reader.getSnapshot().status).toBe('idle')
  })
})
