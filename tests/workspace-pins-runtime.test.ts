import { expect, test } from 'bun:test'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import {
  createAppRuntime,
  MAX_PINNED_WORKSPACES,
  sortPinnedWorkspaces,
  type ClientPersistencePort,
} from '@hbar/app-runtime'
import type { Workspace } from '@hbar/contracts/directory'

const workspace = (id: string, name = id): Workspace => ({ id, name, path: `D:/projects/${id}`, createdAt: 1 })

function fixture(saved?: unknown) {
  const records = new Map<string, unknown>()
  if (saved !== undefined) records.set('hbar:pin-host:preferences', saved)
  const projects = new Map([
    ['a', workspace('a', 'Same')],
    ['b', workspace('b', 'Same')],
  ])
  const requests: string[] = []
  let failWrite = false
  let loseWriteResult = false
  let losePlainResult = false
  let inFlight = 0
  let peak = 0
  let readGate: Promise<void> | null = null
  let failRead = false
  const persistence: ClientPersistencePort = {
    read(key) {
      return Promise.resolve(records.get(key) ?? null)
    },
    write(key, value) {
      if (failWrite) return Promise.reject(new CommandError('PERSISTENCE_FAILED', 'Disk refused'))
      records.set(key, value)
      if (losePlainResult) return Promise.reject(new Error('Connection closed after preference write'))
      return loseWriteResult ? Promise.reject(new CommandError('RESULT_UNKNOWN', 'Response lost')) : Promise.resolve()
    },
    remove(key) {
      records.delete(key)
      return Promise.resolve()
    },
  }
  const directory: CommandExecutor = {
    async execute(name, value) {
      const input = value as { workspaceId?: string; after?: string }
      if (name === 'workspace.list')
        return input.after === 'evict' || input.after === 'evict2'
          ? {
              items: Array.from({ length: 100 }, (_, index) => workspace(`${input.after}-${index}`)),
              nextCursor: input.after === 'evict' ? 'evict2' : null,
            }
          : { items: input.after ? [projects.get('b')] : [projects.get('a')], nextCursor: input.after ? null : 'a' }
      if (name === 'workspace.get') {
        requests.push(input.workspaceId!)
        inFlight++
        peak = Math.max(peak, inFlight)
        if (readGate) await readGate
        await Bun.sleep(0)
        inFlight--
        if (failRead) throw new CommandError('CONNECTION_CLOSED', 'Offline')
        return projects.get(input.workspaceId!) ?? null
      }
      if (name === 'session.get') return null
      if (name === 'session.list') return { items: [], nextCursor: null }
      throw new Error(`Unexpected directory query: ${name}`)
    },
  }
  const create = () => createAppRuntime({ instanceId: crypto.randomUUID(), hostId: 'pin-host', directory, persistence })
  return {
    projects,
    records,
    requests,
    create,
    setWriteFailure: (failed: boolean) => {
      failWrite = failed
    },
    setLostResult: (lost: boolean) => {
      loseWriteResult = lost
    },
    setPlainLostResult: (lost: boolean) => {
      losePlainResult = lost
    },
    setReadGate: (gate: Promise<void> | null) => {
      readGate = gate
    },
    setReadFailure: (failed: boolean) => {
      failRead = failed
    },
    peak: () => peak,
  }
}

async function waitHydrated(runtime: ReturnType<ReturnType<typeof fixture>['create']>): Promise<void> {
  for (let attempt = 0; attempt < 100 && runtime.view.state.workspacePins.getSnapshot().status === 'loading'; attempt++)
    await Bun.sleep(5)
  expect(runtime.view.state.workspacePins.getSnapshot().status).not.toBe('loading')
}

test('pin uses stable Workspace IDs, preserves other preferences and recovers a pin beyond the first page', async () => {
  const f = fixture()
  const first = f.create()
  try {
    await first.ready
    await first.view.commands.execute('workspace.list', { limit: 100 })
    await first.view.commands.execute('workspace.list', { after: 'a', limit: 100 })
    const [pin, other] = await Promise.all([
      first.view.commands.execute('workspacePins.toggle', { workspaceId: 'b', expectedPinned: false }),
      first.view.commands.execute('preferences.set', { key: 'other-module', value: { enabled: true } }),
    ])
    expect(pin).toMatchObject({ pinned: true, persisted: true })
    expect(other.values).toMatchObject({ 'other-module': { enabled: true } })
    expect(first.view.state.workspacePins.getSnapshot().ids).toEqual(['b'])
    expect(first.view.state.preferences.getSnapshot().values).toMatchObject({
      pinnedWorkspaceIds: { version: 1, ids: ['b'] },
      'other-module': { enabled: true },
    })
    expect(
      sortPinnedWorkspaces(first.view.state.directory.getSnapshot(), first.view.state.workspacePins.getSnapshot()).map(
        (item) => item.id,
      ),
    ).toEqual(['b', 'a'])
  } finally {
    first.dispose()
  }
  const restored = f.create()
  try {
    await restored.ready
    await restored.view.commands.execute('workspace.list', { limit: 100 })
    await waitHydrated(restored)
    const pins = restored.view.state.workspacePins.getSnapshot()
    expect(pins).toMatchObject({ ids: ['b'], status: 'ready', error: null })
    expect(f.requests).toContain('b')
    expect(sortPinnedWorkspaces(restored.view.state.directory.getSnapshot(), pins).map((item) => item.id)).toEqual([
      'b',
      'a',
    ])
    expect(restored.view.state.preferences.getSnapshot().values).toMatchObject({ 'other-module': { enabled: true } })
    await restored.view.commands.execute('workspace.list', { after: 'evict', limit: 100 })
    await restored.view.commands.execute('workspace.list', { after: 'evict2', limit: 100 })
    expect(restored.view.state.directory.getSnapshot().workspaces.b).toBeUndefined()
    expect(
      sortPinnedWorkspaces(
        restored.view.state.directory.getSnapshot(),
        restored.view.state.workspacePins.getSnapshot(),
      ).at(0)?.id,
    ).toBe('b')
    expect(
      await restored.view.commands.execute('workspacePins.toggle', { workspaceId: 'b', expectedPinned: true }),
    ).toMatchObject({ pinned: false, persisted: true })
    expect(
      sortPinnedWorkspaces(
        restored.view.state.directory.getSnapshot(),
        restored.view.state.workspacePins.getSnapshot(),
      ).some((item) => item.id === 'b'),
    ).toBe(false)
  } finally {
    restored.dispose()
  }
})

test('slow or offline restoration never holds normal runtime startup and exposes local retry', async () => {
  const f = fixture({ version: 1, revision: 1, value: { pinnedWorkspaceIds: { version: 1, ids: ['b'] } } })
  let releaseRead: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    releaseRead = resolve
  })
  f.setReadGate(gate)
  const runtime = f.create()
  try {
    await runtime.ready
    await runtime.view.commands.execute('workspace.list', { limit: 100 })
    expect(runtime.view.state.directory.getSnapshot().workspaces.a?.id).toBe('a')
    expect(runtime.view.state.workspacePins.getSnapshot().status).toBe('loading')
    f.setReadFailure(true)
    releaseRead?.()
    for (
      let attempt = 0;
      attempt < 40 && runtime.view.state.workspacePins.getSnapshot().status === 'loading';
      attempt++
    )
      await Bun.sleep(2)
    expect(runtime.view.state.workspacePins.getSnapshot()).toMatchObject({
      status: 'error',
      error: 'CONNECTION_CLOSED',
    })
    f.setReadFailure(false)
    expect(await runtime.view.commands.execute('workspacePins.refresh', {})).toMatchObject({ status: 'ready' })
    expect(runtime.view.state.workspacePins.getSnapshot().resolved.b?.id).toBe('b')
  } finally {
    releaseRead?.()
    runtime.dispose()
  }
})

test('failed preference write keeps old order until a read confirms no change; then retry can succeed', async () => {
  const f = fixture()
  const runtime = f.create()
  try {
    await runtime.ready
    await runtime.view.commands.execute('workspace.list', { limit: 100 })
    f.setWriteFailure(true)
    try {
      await runtime.view.commands.execute('workspacePins.toggle', { workspaceId: 'a', expectedPinned: false })
      throw new Error('expected write failure')
    } catch (reason) {
      expect(reason).toMatchObject({ code: 'PERSISTENCE_FAILED' })
    }
    expect(runtime.view.state.workspacePins.getSnapshot()).toMatchObject({
      ids: [],
      action: { workspaceId: 'a', status: 'unknown', error: 'PERSISTENCE_FAILED' },
    })
    f.setWriteFailure(false)
    expect(await runtime.view.commands.execute('workspacePins.reconcile', { workspaceId: 'a' })).toMatchObject({
      pinned: false,
      persisted: false,
    })
    expect(runtime.view.state.workspacePins.getSnapshot().action).toMatchObject({
      status: 'failed',
      error: 'NOT_APPLIED',
    })
    await runtime.view.commands.execute('workspacePins.toggle', { workspaceId: 'a', expectedPinned: false })
    expect(runtime.view.state.workspacePins.getSnapshot()).toMatchObject({
      ids: ['a'],
      action: { status: 'succeeded' },
    })
  } finally {
    runtime.dispose()
  }
})

test('a plain post-write error cannot be treated as a confirmed failure or blindly replayed', async () => {
  const f = fixture()
  const runtime = f.create()
  try {
    await runtime.ready
    await runtime.view.commands.execute('workspace.list', { limit: 100 })
    f.setPlainLostResult(true)
    try {
      await runtime.view.commands.execute('workspacePins.toggle', { workspaceId: 'a', expectedPinned: false })
      throw new Error('expected lost result')
    } catch (reason) {
      expect(reason).toBeInstanceOf(Error)
    }
    expect(runtime.view.state.workspacePins.getSnapshot()).toMatchObject({ ids: [], action: { status: 'unknown' } })
    f.setPlainLostResult(false)
    expect(await runtime.view.commands.execute('workspacePins.reconcile', { workspaceId: 'a' })).toMatchObject({
      pinned: true,
      persisted: true,
    })
  } finally {
    runtime.dispose()
  }
})

test('unknown preference result stays locked until a serialized disk read confirms the exact pin', async () => {
  const f = fixture()
  const runtime = f.create()
  try {
    await runtime.ready
    await runtime.view.commands.execute('workspace.list', { limit: 100 })
    f.setLostResult(true)
    try {
      await runtime.view.commands.execute('workspacePins.toggle', { workspaceId: 'a', expectedPinned: false })
      throw new Error('expected unknown result')
    } catch (reason) {
      expect(reason).toMatchObject({ code: 'RESULT_UNKNOWN' })
    }
    expect(runtime.view.state.workspacePins.getSnapshot().action.status).toBe('unknown')
    try {
      await runtime.view.commands.execute('workspacePins.toggle', { workspaceId: 'a', expectedPinned: false })
      throw new Error('expected lock')
    } catch (reason) {
      expect(reason).toMatchObject({ code: 'BUSY' })
    }
    f.setLostResult(false)
    expect(await runtime.view.commands.execute('workspacePins.reconcile', { workspaceId: 'a' })).toMatchObject({
      pinned: true,
      persisted: true,
    })
    expect(runtime.view.state.workspacePins.getSnapshot().action.status).toBe('succeeded')
  } finally {
    runtime.dispose()
  }
})

test('confirmed missing IDs are not rendered and are displaced only by an explicit new pin', async () => {
  const f = fixture({
    version: 1,
    revision: 1,
    value: { pinnedWorkspaceIds: { version: 1, ids: ['missing'] } },
  })
  const runtime = f.create()
  try {
    await runtime.ready
    await runtime.view.commands.execute('workspace.list', { limit: 100 })
    await waitHydrated(runtime)
    expect(runtime.view.state.workspacePins.getSnapshot()).toMatchObject({
      ids: ['missing'],
      missing: ['missing'],
      status: 'ready',
    })
    expect(
      sortPinnedWorkspaces(
        runtime.view.state.directory.getSnapshot(),
        runtime.view.state.workspacePins.getSnapshot(),
      ).map((item) => item.id),
    ).toEqual(['a'])
    await runtime.view.commands.execute('workspacePins.toggle', { workspaceId: 'a', expectedPinned: false })
    expect(runtime.view.state.workspacePins.getSnapshot().ids).toEqual(['a'])
    expect(runtime.view.state.preferences.getSnapshot().values.pinnedWorkspaceIds).toEqual({ version: 1, ids: ['a'] })
  } finally {
    runtime.dispose()
  }
})

test('invalid and duplicate persisted IDs fail closed; hydration is limited to four concurrent reads', async () => {
  const duplicate = fixture({ version: 1, revision: 1, value: { pinnedWorkspaceIds: { version: 1, ids: ['a', 'a'] } } })
  const runtime = duplicate.create()
  try {
    await runtime.ready
    await waitHydrated(runtime)
    expect(runtime.view.state.workspacePins.getSnapshot()).toMatchObject({
      ids: [],
      status: 'error',
      error: 'INVALID_PERSISTED_STATE',
    })
    expect(duplicate.requests).toEqual([])
  } finally {
    runtime.dispose()
  }
  const ids = Array.from({ length: MAX_PINNED_WORKSPACES }, (_, index) => `missing-${index}`)
  const f = fixture({ version: 1, revision: 1, value: { pinnedWorkspaceIds: { version: 1, ids } } })
  const many = f.create()
  try {
    await many.ready
    await waitHydrated(many)
    expect(f.requests).toHaveLength(MAX_PINNED_WORKSPACES)
    expect(f.peak()).toBeLessThanOrEqual(4)
    expect(many.view.state.workspacePins.getSnapshot().missing).toHaveLength(MAX_PINNED_WORKSPACES)
  } finally {
    many.dispose()
  }
})
