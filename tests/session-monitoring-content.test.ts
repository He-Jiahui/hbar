import { expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError } from '@hbar/commands'
import { usageQueryInputSchema } from '@hbar/contracts/commands/usage'
import { monitoringReport } from './fixtures/session-monitoring-content-data'

const workspace = { id: 'workspace', name: 'Owned workspace', path: 'D:/owned-monitoring', createdAt: 1 }
const sessions = ['original', 'later'].map((id) => ({
  id,
  workspaceId: workspace.id,
  title: id,
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  seq: 0,
}))
function directory() {
  return {
    execute(name: string, raw: unknown) {
      if (name === 'workspace.get') return Promise.resolve(workspace)
      if (name === 'session.get' && raw && typeof raw === 'object' && 'sessionId' in raw)
        return Promise.resolve(sessions.find((item) => item.id === raw.sessionId) ?? null)
      return Promise.resolve({ items: name === 'workspace.list' ? [workspace] : sessions, nextCursor: null })
    },
  }
}
async function settled(runtime: ReturnType<typeof createAppRuntime>) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (runtime.view.state.controls.getSnapshot().status !== 'loading') return
    await Bun.sleep(1)
  }
  throw new Error('Owned session usage did not settle')
}
for (const [count, buckets, valid] of [
  [0, 0, true],
  [1, 1, true],
  [7, 7, true],
  [8, 120, true],
  [9, 500, true],
  [1024, 500, true],
  [1025, 1, false],
  [1, 501, false],
] as const) {
  test(`session monitoring validates original usage model/bucket capacities ${count}/${buckets}`, async () => {
    const runtime = createAppRuntime({
      instanceId: crypto.randomUUID(),
      hostId: 'owned-host',
      directory: directory(),
      surfaces: { canRender: () => true },
      usage: { execute: () => Promise.resolve(monitoringReport('original', count, buckets)) },
    })
    try {
      await runtime.view.commands.execute('app.setSession', { sessionId: 'original' })
      await settled(runtime)
      const state = runtime.view.state.controls.getSnapshot()
      expect(state.sessionId).toBe('original')
      expect(state.errors.usage).toBe(valid ? null : 'INVALID_OUTPUT')
      expect(state.usage?.models.length ?? 0).toBe(valid ? count : 0)
      expect(state.usage?.series.length ?? 0).toBe(valid ? buckets : 0)
    } finally {
      runtime.dispose()
    }
  })
}
test('session monitoring preserves prior reliable facts on read or foreign-output failure and recovers by original target', async () => {
  let failure: 'read' | 'foreign' | undefined
  let count = 1
  const calls: string[] = []
  const runtime = createAppRuntime({
    instanceId: 'owned-monitoring-recovery',
    hostId: 'owned-host',
    directory: directory(),
    surfaces: { canRender: () => true },
    usage: {
      execute: (_name, raw) => {
        const input = usageQueryInputSchema.parse(raw)
        if (input.scope.kind !== 'session') throw new Error('Expected session target')
        calls.push(input.scope.sessionId)
        if (failure === 'read') return Promise.reject(new CommandError('READ_FAILED', 'Owned read failed'))
        return Promise.resolve(monitoringReport(failure === 'foreign' ? 'foreign' : input.scope.sessionId, count))
      },
    },
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: 'original' })
    await settled(runtime)
    const original = runtime.view.state.controls.getSnapshot().usage
    for (const next of ['read', 'foreign'] as const) {
      failure = next
      await runtime.view.commands.execute('sessionControls.refresh', { sessionId: 'original' })
      expect(runtime.view.state.controls.getSnapshot().usage).toBe(original)
      expect(runtime.view.state.controls.getSnapshot().errors.usage).toBe(
        next === 'read' ? 'READ_FAILED' : 'INVALID_OUTPUT',
      )
    }
    failure = undefined
    count = 9
    await runtime.view.commands.execute('sessionControls.refresh', { sessionId: 'original' })
    expect(runtime.view.state.controls.getSnapshot().usage?.models.length).toBe(9)
    expect(runtime.view.state.controls.getSnapshot().errors.usage).toBeNull()
    await expect(
      runtime.view.commands.execute('sessionControls.refresh', { sessionId: 'foreign' }),
    ).rejects.toMatchObject({ code: 'TARGET_CHANGED' })
    expect(new Set(calls)).toEqual(new Set(['original']))
  } finally {
    runtime.dispose()
  }
})
test('session monitoring fences an in-flight refresh, prevents duplicate reads and ignores a late former session', async () => {
  let hold = false
  const gate = Promise.withResolvers<void>()
  const runtime = createAppRuntime({
    instanceId: 'owned-monitoring-race',
    hostId: 'owned-host',
    directory: directory(),
    surfaces: { canRender: () => true },
    usage: {
      async execute(_name, raw) {
        const input = usageQueryInputSchema.parse(raw)
        if (input.scope.kind !== 'session') throw new Error('Expected session target')
        if (hold && input.scope.sessionId === 'original') await gate.promise
        return monitoringReport(input.scope.sessionId, input.scope.sessionId === 'original' ? 1 : 9)
      },
    },
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: 'original' })
    await settled(runtime)
    hold = true
    const refresh = runtime.view.commands.execute('sessionControls.refresh', { sessionId: 'original' })
    await Bun.sleep(0)
    await expect(
      runtime.view.commands.execute('sessionControls.refresh', { sessionId: 'original' }),
    ).rejects.toMatchObject({ code: 'BUSY' })
    await runtime.view.commands.execute('app.setSession', { sessionId: 'later' })
    await settled(runtime)
    gate.resolve()
    await expect(refresh).rejects.toMatchObject({ code: 'TARGET_CHANGED' })
    expect(runtime.view.state.controls.getSnapshot()).toMatchObject({
      sessionId: 'later',
      usage: { scope: { sessionId: 'later' }, models: { length: 9 } },
    })
  } finally {
    gate.resolve()
    runtime.dispose()
  }
})
