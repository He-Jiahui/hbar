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
const item = (n: number, workspaceId = wA, sessionId = sA) => ({ run: { id: runId(n), sessionId, workspaceName: workspaceId, sessionTitle: sessionId, requestId: runId(n + 1000), modelId: runId(2000), status: 'running' as const, createdAt: n, startedAt: n, endedAt: null, error: null }, workspaceName: workspaceId, sessionTitle: sessionId, plan: null, usage: null })
const page = (workspaceId: string, sessionId: string | null, items: readonly ReturnType<typeof item>[], nextCursor: unknown = null) => ({ workspaceId, sessionId, workspaceName: workspaceId, sessionTitle: sessionId, revision: 1, observedAt: 1, items, nextCursor })
function setup(port: CommandExecutor) {
  const navigation = createState<NavigationState>({ workspaceId: wB, sessionId: sB, status: 'idle', error: null }, () => {})
  const surfaces = createState<SurfaceState>({ panels: {}, windows: {}, focusedPanelId: null, focusedWindowId: null }, () => {})
  const local = new CommandRegistry()
  const board = createRunBoard(local, port, navigation.reader, surfaces.reader, () => {}, () => false)
  return { navigation, surfaces, local, board }
}
const panel = (instanceId: string, workspaceId: string, sessionId: string | null, binding: 'pinned' | 'followActive' = 'pinned') => ({ instanceId, panelId: 'run-board', workspaceId, sessionId, binding, params: {} })

describe('run board runtime panel targeting', () => {
  test('pinned target stays on A while active navigation is B', async () => {
    const calls: unknown[] = []
    const runtime = setup({ execute: (_name, input) => { calls.push(input); return Promise.resolve(page(wA, sA, [item(1, wA, sA)])) } })
    runtime.surfaces.replace({ ...runtime.surfaces.reader.getSnapshot(), panels: { a: panel('a', wA, sA) } })
    await runtime.board.refresh({ instanceId: 'a' })
    expect(calls[0]).toMatchObject({ workspaceId: wA, sessionId: sA })
    expect(runtime.board.reader.getSnapshot().workspaceId).toBe(wA)
  })
  test('workspace-only pinned target does not borrow active B session', async () => {
    const calls: unknown[] = []
    const runtime = setup({ execute: (_name, input) => { calls.push(input); return Promise.resolve(page(wA, null, [item(2, wA, sA)])) } })
    runtime.surfaces.replace({ ...runtime.surfaces.reader.getSnapshot(), panels: { a: panel('a', wA, null) } })
    await runtime.board.refresh({ instanceId: 'a' })
    expect(calls[0]).toMatchObject({ workspaceId: wA })
    expect(calls[0]).not.toHaveProperty('sessionId')
  })
  test('closed panel late response cannot publish', async () => {
    let resolve: ((value: unknown) => void) | undefined
    const runtime = setup({ execute: () => new Promise((r) => { resolve = r }) })
    runtime.surfaces.replace({ ...runtime.surfaces.reader.getSnapshot(), panels: { a: panel('a', wA, sA) } })
    const pending = runtime.board.refresh({ instanceId: 'a' })
    runtime.surfaces.replace({ ...runtime.surfaces.reader.getSnapshot(), panels: {} })
    resolve?.(page(wA, sA, [item(3)]))
    await expect(pending).rejects.toBeDefined()
    expect(runtime.board.reader.getSnapshot().status).toBe('idle')
  })
})
