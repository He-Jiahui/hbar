import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry, type CommandExecutor } from '@hbar/commands'
import { createAppRuntime, type ClientPersistencePort } from '@hbar/app-runtime'
import { directoryCommands, navigationCommands } from '@hbar/contracts/commands'
import { workspaceSessionCommands } from '@hbar/contracts/commands/workspaces'
import type { Session, Workspace } from '@hbar/contracts/directory'
import { createWorkspaceTabs } from '../packages/app-runtime/src/workspace-tabs-runtime'
import { createDirectoryModule } from '../packages/app-runtime/src/directory'
import { createSessionArchive } from '../packages/app-runtime/src/session-archive'
import { createState } from '../packages/app-runtime/src/state'
import { z } from 'zod'

const savedTabs = (f: ReturnType<typeof fixture>) =>
  z.object({ value: z.object({ workspaceTabs: z.unknown() }) }).parse(f.values.get('hbar:archive-tabs:preferences'))
    .value.workspaceTabs

const workspace: Workspace = { id: 'w', name: 'Original workspace', path: 'D:/fixture/w', createdAt: 1 }
const session = (id: string): Session => ({
  id,
  workspaceId: workspace.id,
  title: id,
  archived: false,
  parentId: null,
  seq: 1,
  createdAt: 1,
  updatedAt: 1,
})
function fixture(saved?: unknown) {
  const sessions = new Map<string, Session>(['a', 'b'].map((id) => [id, session(id)]))
  const values = new Map<string, unknown>()
  if (saved !== undefined)
    values.set('hbar:archive-tabs:preferences', { version: 1, revision: 1, value: { workspaceTabs: saved } })
  const writes: string[] = []
  let unknownWrite = false
  let preferenceError: string | null = null
  let writeGate: Promise<void> | undefined
  let writeStarted: (() => void) | undefined
  let queryOverride: ((name: string, input: unknown) => Promise<unknown> | undefined) | undefined
  const persistence: ClientPersistencePort = {
    read: (key) => Promise.resolve(values.get(key) ?? null),
    write: (key, value) => {
      if (preferenceError) return Promise.reject(new CommandError(preferenceError, 'Fixture preference write failed'))
      values.set(key, value)
      return Promise.resolve()
    },
    remove: (key) => {
      values.delete(key)
      return Promise.resolve()
    },
  }
  const directory: CommandExecutor = {
    execute(name, raw) {
      const override = queryOverride?.(name, raw)
      if (override) return override
      if (name === 'workspace.get') {
        const input = directoryCommands['workspace.get'].input.parse(raw)
        return Promise.resolve(input.workspaceId === workspace.id ? workspace : null)
      }
      if (name === 'session.get')
        return Promise.resolve(sessions.get(directoryCommands['session.get'].input.parse(raw).sessionId) ?? null)
      if (name === 'session.list') {
        const input = directoryCommands['session.list'].input.parse(raw)
        return Promise.resolve({
          items: [...sessions.values()]
            .filter((item) => item.workspaceId === input.workspaceId && (input.includeArchived || !item.archived))
            .slice(0, input.limit),
          nextCursor: null,
        })
      }
      throw new Error(`Unexpected directory query ${name}`)
    },
  }
  const workspaces: CommandExecutor = {
    async execute(name, raw) {
      writes.push(name)
      if (name !== 'session.archive') throw new Error(`Unexpected write ${name}`)
      const input = workspaceSessionCommands['session.archive'].input.parse(raw)
      const prior = sessions.get(input.sessionId)
      if (!prior) throw new CommandError('NOT_FOUND', 'Missing fixture session')
      const next = { ...prior, archived: input.archived, seq: prior.seq + 1, updatedAt: prior.updatedAt + 1 }
      sessions.set(next.id, next)
      writeStarted?.()
      if (writeGate) await writeGate
      if (unknownWrite) throw new CommandError('CONNECTION_CLOSED', 'Fixture lost accepted archive response')
      return next
    },
  }
  const runtime = createAppRuntime({
    instanceId: crypto.randomUUID(),
    hostId: 'archive-tabs',
    directory,
    workspaces,
    persistence,
    surfaces: { canRender: (id) => id === 'files' },
  })
  const commands = runtime.view.commands
  return {
    runtime,
    commands,
    sessions,
    writes,
    values,
    tabs: () => runtime.view.state.workspaceTabs.getSnapshot(),
    async open(id: string) {
      await commands.execute('app.setSession', { workspaceId: workspace.id, sessionId: id })
    },
    async begin(id = 'a') {
      await commands.execute('sessionArchive.begin', { workspaceId: workspace.id, sessionId: id })
    },
    target: () => ({
      sessionId: runtime.view.state.sessionArchive.getSnapshot().mutation.target?.sessionId ?? '',
      revision: runtime.view.state.sessionArchive.getSnapshot().mutation.revision,
    }),
    failUnknown(value: boolean) {
      unknownWrite = value
    },
    failPreferences(code: string | null) {
      preferenceError = code
    },
    overrideQueries(read: typeof queryOverride) {
      queryOverride = read
    },
    delayWrite(gate: Promise<void> | undefined) {
      writeGate = gate
    },
    onWriteStarted(listener: (() => void) | undefined) {
      writeStarted = listener
    },
  }
}

test('confirmed archive retires only the original Session tab without navigation or draft changes; restore opens a new instance', async () => {
  const f = fixture()
  try {
    await f.runtime.ready
    await f.open('a')
    await f.commands.execute('draft.setText', { sessionId: 'a', text: 'retained A draft' })
    const prior = f.tabs().items.find((item) => item.id === 'a')
    await f.open('b')
    await f.commands.execute('draft.setText', { sessionId: 'b', text: 'retained B draft' })
    await f.begin()
    await f.commands.execute('sessionArchive.confirm', f.target())
    expect(f.tabs().items.map((item) => item.id)).toEqual(['b'])
    expect(f.tabs().activeId).toBe('b')
    expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('b')
    expect(f.runtime.view.state.drafts.getSnapshot().a?.text).toBe('retained A draft')
    expect(f.runtime.view.state.drafts.getSnapshot().b?.text).toBe('retained B draft')
    expect(f.writes).toEqual(['session.archive'])
    await f.runtime.workspaceTabs.whenIdle()
    expect(savedTabs(f)).toMatchObject({ activeId: 'b' })
    expect(savedTabs(f)).not.toHaveProperty('activeWorkspaceId')
    await f.commands.execute('sessionArchive.restore', { workspaceId: 'w', sessionId: 'a' })
    expect(f.tabs().items.map((item) => item.id)).toEqual(['b'])
    await f.open('a')
    expect(f.tabs().items.find((item) => item.id === 'a')?.instanceKey).not.toBe(prior?.instanceKey)
    expect(f.runtime.view.state.drafts.getSnapshot().a?.text).toBe('retained A draft')
  } finally {
    f.runtime.dispose()
  }
})

test('unknown archive retains its original tab until exact Host reconciliation; never replays or selects it', async () => {
  const f = fixture()
  try {
    await f.runtime.ready
    await f.open('a')
    await f.open('b')
    await f.begin()
    f.failUnknown(true)
    await expect(f.commands.execute('sessionArchive.confirm', f.target())).rejects.toMatchObject({
      code: 'CONNECTION_CLOSED',
    })
    expect(f.tabs().items.map((item) => item.id)).toEqual(['a', 'b'])
    expect(f.runtime.view.state.sessionArchive.getSnapshot().mutation.status).toBe('unknown')
    await f.commands.execute('sessionArchive.reconcile', f.target())
    expect(f.tabs().items.map((item) => item.id)).toEqual(['b'])
    expect(f.tabs().activeId).toBe('b')
    expect(f.writes).toEqual(['session.archive'])
  } finally {
    f.runtime.dispose()
  }
})

test('local archive of the selected Session leaves its empty workspace, not a neighbour, and retains its draft', async () => {
  const f = fixture()
  try {
    await f.runtime.ready
    await f.open('b')
    await f.open('a')
    await f.commands.execute('draft.setText', { sessionId: 'a', text: 'original unsent draft' })
    await f.begin()
    await f.commands.execute('sessionArchive.confirm', f.target())
    expect(f.tabs().items.map((item) => item.id)).toEqual(['b'])
    expect(f.tabs().activeId).toBeNull()
    expect(f.runtime.view.state.navigation.getSnapshot()).toMatchObject({ workspaceId: 'w', sessionId: null })
    expect(f.runtime.view.state.drafts.getSnapshot().a?.text).toBe('original unsent draft')
    await f.runtime.workspaceTabs.whenIdle()
    expect(savedTabs(f)).toMatchObject({ activeId: null, activeWorkspaceId: 'w' })
    const reloaded = fixture(savedTabs(f))
    try {
      await reloaded.runtime.ready
      expect(reloaded.tabs().items.map((item) => item.id)).toEqual(['b'])
      expect(reloaded.tabs().activeId).toBeNull()
      expect(reloaded.runtime.view.state.navigation.getSnapshot()).toMatchObject({ workspaceId: 'w', sessionId: null })
    } finally {
      reloaded.runtime.dispose()
    }
  } finally {
    f.runtime.dispose()
  }
})

test('confirmed archive keeps the pinned Files Workbench instance and its active ownership intact', async () => {
  const f = fixture()
  try {
    await f.runtime.ready
    await f.open('a')
    await f.commands.execute('app.openPanel', {
      panelId: 'files',
      instanceId: 'files-a',
      binding: 'pinned',
      workspaceId: 'w',
      sessionId: 'a',
    })
    const workbench = await f.commands.execute('workspaceTabs.openWorkbench', {
      panelInstanceId: 'files-a',
      workspaceId: 'w',
      sourceSessionId: 'a',
    })
    const captured = f.runtime.workspaceTabs.capture([workbench.id])
    const panel = f.runtime.view.state.surfaces.getSnapshot().panels['files-a']
    await f.begin()
    await f.commands.execute('sessionArchive.confirm', f.target())
    expect(f.tabs().items.map((item) => item.id)).toEqual([workbench.id])
    expect(f.tabs().activeId).toBe(workbench.id)
    expect(f.runtime.workspaceTabs.capture([workbench.id])).toEqual(captured)
    expect(f.runtime.view.state.surfaces.getSnapshot().panels['files-a']).toBe(panel)
    expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBeNull()
    await f.runtime.workspaceTabs.whenIdle()
    expect(savedTabs(f)).toMatchObject({ activeId: null, activeWorkspaceId: 'w' })
  } finally {
    f.runtime.dispose()
  }
})

test('observational external archive retires the tab without clearing the loaded active view or its draft', async () => {
  const f = fixture()
  try {
    await f.runtime.ready
    await f.open('b')
    await f.open('a')
    await f.commands.execute('draft.setText', { sessionId: 'a', text: 'original active draft' })
    f.sessions.set('a', { ...session('a'), archived: true, seq: 2, updatedAt: 2 })
    await f.commands.execute('sessionRoster.refresh', { workspaceId: 'w' })
    expect(f.tabs().items.map((item) => item.id)).toEqual(['b'])
    expect(f.tabs().activeId).toBeNull()
    expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('a')
    expect(f.runtime.view.state.drafts.getSnapshot().a?.text).toBe('original active draft')
    expect(f.writes).toEqual([])
    await f.runtime.workspaceTabs.whenIdle()
    expect(savedTabs(f)).toMatchObject({ activeId: null, activeWorkspaceId: 'w' })
    const emptyReload = fixture(savedTabs(f))
    try {
      await emptyReload.runtime.ready
      expect(emptyReload.tabs().activeId).toBeNull()
      expect(emptyReload.runtime.view.state.navigation.getSnapshot()).toMatchObject({
        workspaceId: 'w',
        sessionId: null,
      })
    } finally {
      emptyReload.runtime.dispose()
    }
    await f.open('b')
    await f.runtime.workspaceTabs.whenIdle()
    expect(savedTabs(f)).toMatchObject({ activeId: 'b' })
    expect(savedTabs(f)).not.toHaveProperty('activeWorkspaceId')
    const selectedReload = fixture(savedTabs(f))
    try {
      await selectedReload.runtime.ready
      expect(selectedReload.tabs().activeId).toBe('b')
      expect(selectedReload.runtime.view.state.navigation.getSnapshot().sessionId).toBe('b')
    } finally {
      selectedReload.runtime.dispose()
    }
  } finally {
    f.runtime.dispose()
  }
})

test('archive marker never overrides a selected Files Workbench with a different recoverable source B', async () => {
  const f = fixture()
  try {
    await f.runtime.ready
    await f.open('b')
    await f.open('a')
    await f.commands.execute('app.openPanel', {
      panelId: 'files',
      instanceId: 'files-b',
      binding: 'pinned',
      workspaceId: 'w',
      sessionId: 'b',
    })
    const workbench = await f.commands.execute('workspaceTabs.openWorkbench', {
      panelInstanceId: 'files-b',
      workspaceId: 'w',
      sourceSessionId: 'b',
    })
    f.sessions.set('a', { ...session('a'), archived: true, seq: 2, updatedAt: 2 })
    await f.commands.execute('sessionRoster.refresh', { workspaceId: 'w' })
    expect(f.tabs().activeId).toBe(workbench.id)
    expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('a')
    await f.runtime.workspaceTabs.whenIdle()
    expect(savedTabs(f)).toMatchObject({ activeId: 'b' })
    expect(savedTabs(f)).not.toHaveProperty('activeWorkspaceId')
  } finally {
    f.runtime.dispose()
  }
})

test('late pre-archive selection cannot recreate the retired tab or replace the current B view', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<unknown>()
  const entered = Promise.withResolvers<void>()
  try {
    await f.runtime.ready
    await f.open('a')
    await f.open('b')
    let delayed = true
    f.overrideQueries((name) => {
      if (name === 'workspace.get' && delayed) {
        delayed = false
        entered.resolve()
        return gate.promise
      }
      return undefined
    })
    const select = f.open('a')
    await entered.promise
    f.sessions.set('a', { ...session('a'), archived: true, seq: 2, updatedAt: 2 })
    await f.commands.execute('session.get', { sessionId: 'a' })
    gate.resolve(workspace)
    await expect(select).rejects.toMatchObject({ code: 'SESSION_ARCHIVED' })
    expect(f.tabs().items.map((item) => item.id)).toEqual(['b'])
    expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('b')
  } finally {
    gate.resolve(workspace)
    f.runtime.dispose()
  }
})

test('saved restoration cannot publish a Session archived while its Workspace validation was pending', async () => {
  const f = fixture({
    version: 1,
    items: [{ kind: 'session', id: 'a', sessionId: 'a', workspaceId: 'w' }],
    activeId: 'a',
  })
  const gate = Promise.withResolvers<unknown>()
  const entered = Promise.withResolvers<void>()
  let delayed = true
  f.overrideQueries((name) => {
    if (name === 'workspace.get' && delayed) {
      delayed = false
      entered.resolve()
      return gate.promise
    }
    return undefined
  })
  try {
    await entered.promise
    f.sessions.set('a', { ...session('a'), archived: true, seq: 2, updatedAt: 2 })
    await f.commands.execute('session.get', { sessionId: 'a' })
    gate.resolve(workspace)
    await f.runtime.ready
    expect(f.tabs().items).toEqual([])
    expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBeNull()
  } finally {
    gate.resolve(workspace)
    f.runtime.dispose()
  }
})

test('close cannot activate a neighbour retired while its Workspace validation was pending', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<unknown>()
  const entered = Promise.withResolvers<void>()
  try {
    await f.runtime.ready
    await f.open('b')
    await f.open('a')
    let delayed = true
    f.overrideQueries((name) => {
      if (name === 'workspace.get' && delayed) {
        delayed = false
        entered.resolve()
        return gate.promise
      }
      return undefined
    })
    const close = f.runtime.workspaceTabs.closeCaptured(
      f.runtime.workspaceTabs.capture(['a']),
      new AbortController().signal,
    )
    await entered.promise
    f.sessions.set('b', { ...session('b'), archived: true, seq: 2, updatedAt: 2 })
    await f.commands.execute('session.get', { sessionId: 'b' })
    gate.resolve(workspace)
    await close
    expect(f.tabs().items).toEqual([])
    expect(f.tabs().activeId).toBeNull()
    expect(f.runtime.view.state.navigation.getSnapshot()).toMatchObject({ workspaceId: 'w', sessionId: null })
  } finally {
    gate.resolve(workspace)
    f.runtime.dispose()
  }
})

for (const source of ['get', 'archive'] as const) {
  test(`older ${source} archived response cannot retire or clear a newer restored Session`, async () => {
    const f = fixture()
    const gate = Promise.withResolvers<unknown>()
    const entered = Promise.withResolvers<void>()
    try {
      await f.runtime.ready
      await f.open('a')
      const old = { ...session('a'), archived: true, seq: 2, updatedAt: 2 }
      let pending: Promise<unknown>
      if (source === 'get') {
        f.overrideQueries((name) => {
          if (name === 'session.get') {
            entered.resolve()
            return gate.promise
          }
          return undefined
        })
        pending = f.commands.execute('session.get', { sessionId: 'a' })
        await entered.promise
        f.overrideQueries(undefined)
      } else {
        f.onWriteStarted(entered.resolve)
        f.delayWrite(gate.promise.then(() => undefined))
        pending = f.commands.execute('app.archiveSession', { sessionId: 'a', archived: true })
        await entered.promise
        f.onWriteStarted(undefined)
        f.delayWrite(undefined)
      }
      f.sessions.set('a', old)
      await f.commands.execute('app.archiveSession', { sessionId: 'a', archived: false })
      gate.resolve(old)
      await pending
      expect(f.tabs().items.map((item) => item.id)).toEqual(['a'])
      expect(f.tabs().activeId).toBe('a')
      expect(f.runtime.view.state.directory.getSnapshot().sessions.a).toMatchObject({ archived: false, seq: 3 })
      expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('a')
    } finally {
      gate.resolve(null)
      f.runtime.dispose()
    }
  })
}

test('a late archive ACK cannot retire a restored instance after its newer canonical row is evicted', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>()
  const entered = Promise.withResolvers<void>()
  try {
    await f.runtime.ready
    await f.open('a')
    await f.commands.execute('draft.setText', { sessionId: 'a', text: 'original A draft' })
    f.onWriteStarted(entered.resolve)
    f.delayWrite(gate.promise)
    const pending = f.commands.execute('app.archiveSession', { sessionId: 'a', archived: true })
    await entered.promise
    f.onWriteStarted(undefined)
    f.delayWrite(undefined)
    await f.commands.execute('app.archiveSession', { sessionId: 'a', archived: false })
    await f.open('a')
    const restored = f.tabs().items.find((item) => item.id === 'a')!
    await f.open('b')
    await f.commands.execute('draft.setText', { sessionId: 'b', text: 'active B draft' })
    f.overrideQueries((name, raw) => {
      if (name !== 'session.list') return undefined
      const input = directoryCommands['session.list'].input.parse(raw)
      return Promise.resolve({
        items: Array.from({ length: 200 }, (_, index) => ({
          ...session(`bulk-${input.after}-${index}`),
          workspaceId: 'other-workspace',
        })),
        nextCursor: null,
      })
    })
    for (let page = 0; page < 7; page++)
      await f.commands.execute('session.list', { workspaceId: 'other-workspace', after: String(page), limit: 200 })
    expect(f.runtime.view.state.directory.getSnapshot().sessions.a).toBeUndefined()
    gate.resolve()
    expect(await pending).toMatchObject({ id: 'a', archived: true, seq: 2 })
    expect(f.tabs().items.find((item) => item.id === 'a')?.instanceKey).toBe(restored.instanceKey)
    expect(f.sessions.get('a')).toMatchObject({ archived: false, seq: 3 })
    expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('b')
    expect(f.runtime.view.state.drafts.getSnapshot().a?.text).toBe('original A draft')
    expect(f.runtime.view.state.drafts.getSnapshot().b?.text).toBe('active B draft')
    expect(f.runtime.view.state.directory.getSnapshot().sessions.a).toBeUndefined()
  } finally {
    gate.resolve()
    f.runtime.dispose()
  }
})

test('confirmed archive intent treats the actual local projection capacity rejection as failed before its Host write', async () => {
  const gates: ReturnType<typeof Promise.withResolvers<unknown>>[] = []
  const pressure: Promise<unknown>[] = []
  let targetWrites = 0
  const navigation = createState(
    { workspaceId: 'w', sessionId: null, status: 'idle' as const, error: null },
    () => undefined,
  )
  const directory = createDirectoryModule(
    {
      instanceId: 'archive-capacity-feedback',
      hostId: 'fixture',
      directory: { execute: () => Promise.resolve(session('a')) },
      workspaces: {
        execute(_name, raw) {
          const input = workspaceSessionCommands['session.archive'].input.parse(raw)
          if (input.sessionId === 'a') targetWrites++
          const gate = Promise.withResolvers<unknown>()
          gates.push(gate)
          return gate.promise
        },
      },
    },
    navigation.reader,
    () => undefined,
    () => undefined,
  )
  const local = new CommandRegistry()
  const archive = createSessionArchive(local, {
    directory: directory.reader,
    isDisposed: () => false,
    onSubscriberError: () => undefined,
    commands: {
      async execute(name, raw, execution) {
        if (name === 'session.get') {
          const input = directoryCommands['session.get'].input.parse(raw)
          const result = await directory.queries.execute('session.get', input, execution)
          // Occupy real local projection slots after preflight, before the original target write is dispatched.
          for (let index = 0; index < 32; index++)
            pressure.push(directory.archiveSession(`pressure-${index}`, true, {}))
          return result
        }
        if (name === 'app.archiveSession') {
          const input = navigationCommands['app.archiveSession'].input.parse(raw)
          return directory.archiveSession(input.sessionId, input.archived, execution ?? {})
        }
        throw new Error(`Unexpected archive capacity command ${name}`)
      },
    },
  })
  try {
    await directory.queries.execute('session.get', { sessionId: 'a' })
    await local.execute('sessionArchive.begin', { workspaceId: 'w', sessionId: 'a' })
    const revision = archive.reader.getSnapshot().mutation.revision
    await expect(local.execute('sessionArchive.confirm', { sessionId: 'a', revision })).rejects.toMatchObject({
      code: 'CAPACITY_EXCEEDED',
    })
    expect(archive.reader.getSnapshot().mutation).toMatchObject({
      status: 'failed',
      error: 'CAPACITY_EXCEEDED',
      revision,
      target: { workspaceId: 'w', sessionId: 'a', archived: true },
    })
    expect(targetWrites).toBe(0)
    expect(gates).toHaveLength(32)
    expect(directory.reader.getSnapshot().sessions.a?.archived).toBe(false)
    expect(await local.execute('sessionArchive.cancel', { sessionId: 'a', revision })).toEqual({
      revision: revision + 1,
    })
  } finally {
    for (const [index, gate] of gates.entries()) gate.resolve({ ...session(`pressure-${index}`), archived: true })
    await Promise.allSettled(pressure)
    archive.dispose()
    local.dispose()
    directory.dispose()
    navigation.dispose()
  }
})

test('get and archive projections share a 32-request bound and release aborted or completed scopes without replay', async () => {
  const gates: ReturnType<typeof Promise.withResolvers<unknown>>[] = []
  let abortedGate: ReturnType<typeof Promise.withResolvers<unknown>> | undefined
  const entered = Promise.withResolvers<void>()
  let blocked = true
  const host: CommandExecutor = {
    execute(_name, _input, execution) {
      if (!blocked) return Promise.resolve(session('a'))
      const gate = Promise.withResolvers<unknown>()
      if (execution?.signal === aborted.signal) abortedGate = gate
      gates.push(gate)
      if (gates.length === 32) entered.resolve()
      return gate.promise
    },
  }
  const navigation = createState(
    { workspaceId: 'w', sessionId: null, status: 'idle' as const, error: null },
    () => undefined,
  )
  const directory = createDirectoryModule(
    { instanceId: 'bounded-projections', hostId: 'fixture', directory: host, workspaces: host },
    navigation.reader,
    () => undefined,
    () => undefined,
  )
  const aborted = new AbortController()
  const reads = Array.from({ length: 16 }, () => directory.queries.execute('session.get', { sessionId: 'a' }))
  const writes = Array.from({ length: 16 }, (_, index) =>
    directory.archiveSession('a', false, index === 0 ? { signal: aborted.signal } : {}),
  )
  try {
    await entered.promise
    await expect(directory.archiveSession('a', false, {})).rejects.toMatchObject({ code: 'CAPACITY_EXCEEDED' })
    expect(gates).toHaveLength(32)
    aborted.abort()
    blocked = false
    expect(await directory.archiveSession('a', false, {})).toMatchObject({ id: 'a', archived: false, seq: 1 })
    expect(abortedGate).toBeDefined()
    for (const gate of gates)
      gate.resolve(gate === abortedGate ? { ...session('a'), seq: 99, updatedAt: 99 } : session('a'))
    await Promise.all([...reads, ...writes])
    expect(directory.reader.getSnapshot().sessions.a?.seq).toBe(1)
    expect(await directory.archiveSession('a', false, {})).toMatchObject({ seq: 1 })
    expect(gates).toHaveLength(32)
  } finally {
    for (const gate of gates) gate.resolve(session('a'))
    await Promise.allSettled([...reads, ...writes])
    directory.dispose()
    navigation.dispose()
  }
})

for (const code of ['WRITE_FAILED', 'RESULT_UNKNOWN']) {
  test(`tab preferences ${code} is not a failure of the confirmed Host archive`, async () => {
    const f = fixture()
    try {
      await f.runtime.ready
      await f.open('a')
      await f.open('b')
      await f.runtime.workspaceTabs.whenIdle()
      f.failPreferences(code)
      await f.begin()
      await f.commands.execute('sessionArchive.confirm', f.target())
      await f.runtime.workspaceTabs.whenIdle()
      expect(f.tabs().items.map((item) => item.id)).toEqual(['b'])
      expect(f.tabs().persistError).not.toBeNull()
      expect(f.runtime.view.state.sessionArchive.getSnapshot().mutation.status).toBe('succeeded')
      expect(f.sessions.get('a')?.archived).toBe(true)
      expect(f.writes).toEqual(['session.archive'])
    } finally {
      f.runtime.dispose()
    }
  })
}

test('cache absence does not retire a tab; an explicit accepted archived read does even when the cache stays full', async () => {
  const f = fixture()
  try {
    await f.runtime.ready
    await f.open('a')
    await f.open('b')
    f.overrideQueries((name, raw) => {
      if (name !== 'session.list') return undefined
      const input = directoryCommands['session.list'].input.parse(raw)
      const page = Number(input.after ?? 0)
      return Promise.resolve({
        items: Array.from({ length: 200 }, (_, index) => session(`bulk-${page * 200 + index}`)),
        nextCursor: null,
      })
    })
    for (let page = 0; page < 7; page++)
      await f.commands.execute('session.list', { workspaceId: 'w', limit: 200, after: String(page) })
    expect(f.runtime.view.state.directory.getSnapshot().sessions.a).toBeUndefined()
    expect(f.tabs().items.map((item) => item.id)).toEqual(['a', 'b'])
    f.sessions.set('a', { ...session('a'), archived: true, seq: 2, updatedAt: 2 })
    await f.commands.execute('session.get', { sessionId: 'a' })
    expect(f.tabs().items.map((item) => item.id)).toEqual(['b'])
  } finally {
    f.runtime.dispose()
  }
})

for (const delayedAt of ['session', 'workspace'] as const) {
  test(`cache eviction cannot revive a retired tab from its late ${delayedAt} validation`, async () => {
    const f = fixture()
    const gate = Promise.withResolvers<unknown>()
    const entered = Promise.withResolvers<void>()
    try {
      await f.runtime.ready
      await f.open('a')
      await f.open('b')
      let delayed = true
      f.overrideQueries((name, raw) => {
        if (name === `${delayedAt}.get` && delayed) {
          delayed = false
          entered.resolve()
          return gate.promise
        }
        if (name === 'session.list') {
          const input = directoryCommands['session.list'].input.parse(raw)
          const page = Number(input.after ?? 0)
          return Promise.resolve({
            items: Array.from({ length: 200 }, (_, index) => session(`bulk-${page * 200 + index}`)),
            nextCursor: null,
          })
        }
        return undefined
      })
      const select = f.open('a')
      await entered.promise
      await f.commands.execute('app.archiveSession', { sessionId: 'a', archived: true })
      for (let page = 0; page < 7; page++)
        await f.commands.execute('session.list', { workspaceId: 'w', limit: 200, after: String(page) })
      expect(f.runtime.view.state.directory.getSnapshot().sessions.a).toBeUndefined()
      gate.resolve(delayedAt === 'session' ? session('a') : workspace)
      await expect(select).rejects.toMatchObject({
        code: 'SESSION_ARCHIVED',
      })
      expect(f.tabs().items.map((item) => item.id)).toEqual(['b'])
      expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('b')
      expect(f.runtime.view.state.directory.getSnapshot().sessions.a).toBeUndefined()
      await f.commands.execute('app.archiveSession', { sessionId: 'a', archived: false })
      await f.open('a')
      expect(f.tabs().activeId).toBe('a')
    } finally {
      gate.resolve(null)
      f.runtime.dispose()
    }
  })
}

test('selection fences are bounded, released explicitly and unusable after disposal', async () => {
  const f = fixture()
  const local = new CommandRegistry({ execution: 'client' })
  let deliver: ((facts: readonly Session[]) => void) | undefined
  const tabs = createWorkspaceTabs(local, {
    navigation: f.runtime.view.state.navigation,
    directory: f.runtime.view.state.directory,
    surfaces: f.runtime.view.state.surfaces,
    preferences: f.runtime.view.state.preferences,
    preferenceCommands: f.commands,
    preferencesReady: f.runtime.ready.then(() => undefined),
    retryPreferencesRestore: () => Promise.resolve(f.runtime.view.state.preferences.getSnapshot()),
    queries: f.commands,
    selectSession: f.open,
    commitLocalSelection: () => undefined,
    onSubscriberError: () => undefined,
    subscribeConfirmedSessions(listener) {
      deliver = listener
      return () => {
        deliver = undefined
      }
    },
  })
  try {
    await tabs.ready
    const guards = Array.from({ length: 32 }, () => tabs.hooks.beginSelection(null))
    expect(() => tabs.hooks.beginSelection('a')).toThrow('Too many pending Session validations')
    guards[0]!.dispose()
    const replacement = tabs.hooks.beginSelection('a')
    for (const guard of guards) guard.dispose()
    deliver?.([{ ...session('a'), archived: true, seq: 2, updatedAt: 2 }])
    expect(() => replacement.assertCurrent(session('a'))).toThrow('Session was confirmed archived')
    replacement.dispose()
    const next = tabs.hooks.beginSelection('a')
    next.assertCurrent(session('a'))
    const unknown = tabs.hooks.beginSelection(null)
    deliver?.(Array.from({ length: 33 }, (_, index) => ({ ...session(`archived-${index}`), archived: true })))
    expect(() => unknown.assertCurrent(session('unrelated'))).toThrow('Too many archive facts')
    unknown.dispose()
    tabs.dispose()
    expect(deliver).toBeUndefined()
    expect(() => next.assertCurrent(session('a'))).toThrow('no longer belongs to this intent')
    expect(() => tabs.hooks.beginSelection('a')).toThrow('Tabs runtime is disposed')
    next.dispose()
  } finally {
    tabs.dispose()
    local.dispose()
    f.runtime.dispose()
  }
})

test('restoring all 32 Session tabs releases validation fences before the active reselect', async () => {
  const ids = Array.from({ length: 32 }, (_, index) => `restored-${index}`)
  const f = fixture({
    version: 1,
    items: ids.map((id) => ({ kind: 'session', id, sessionId: id, workspaceId: 'w' })),
    activeId: ids[31],
  })
  f.sessions.clear()
  for (const id of ids) f.sessions.set(id, session(id))
  try {
    await f.runtime.ready
    expect(f.tabs().items.map((item) => item.id)).toEqual(ids)
    expect(f.tabs().activeId).toBe(ids[31]!)
    expect(f.tabs().restoreStatus).toBe('ready')
    expect(f.tabs().restoreError).toBeNull()
    expect(f.runtime.view.state.navigation.getSnapshot()).toMatchObject({ sessionId: ids[31], status: 'idle' })
  } finally {
    f.runtime.dispose()
  }
})

for (const source of ['list', 'roster'] as const) {
  test(`a late ${source} reply cannot retire a restored instance after its canonical row was evicted`, async () => {
    const f = fixture()
    const gate = Promise.withResolvers<unknown>()
    const entered = Promise.withResolvers<void>()
    f.sessions.set('c', session('c'))
    try {
      await f.runtime.ready
      await f.open('a')
      await f.open('b')
      await f.commands.execute('session.get', { sessionId: 'c' })
      f.overrideQueries((name, raw) => {
        if (name === 'session.list') {
          const input = directoryCommands['session.list'].input.parse(raw)
          if (source === 'list' && input.after === 'late') {
            entered.resolve()
            return gate.promise
          }
          if (source === 'roster' && input.limit === 100)
            return Promise.resolve({ items: [session('b')], nextCursor: null })
          return Promise.resolve({
            items: Array.from({ length: 200 }, (_, index) => ({
              ...session(`bulk-${input.after}-${index}`),
              workspaceId: 'other-workspace',
            })),
            nextCursor: null,
          })
        }
        if (source === 'roster' && name === 'session.get') {
          const input = directoryCommands['session.get'].input.parse(raw)
          if (input.sessionId === 'a') return Promise.resolve({ ...session('a'), archived: true, seq: 2, updatedAt: 2 })
          if (input.sessionId === 'c') {
            entered.resolve()
            return gate.promise
          }
        }
        return undefined
      })
      const pending =
        source === 'list'
          ? f.commands.execute('session.list', { workspaceId: 'w', limit: 1, after: 'late', includeArchived: true })
          : f.commands.execute('sessionRoster.refresh', { workspaceId: 'w' })
      await entered.promise
      // Let the first worker's resolved A response enter the roster accumulator while C still holds the scan.
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      f.overrideQueries((name, raw) => {
        if (name !== 'session.list') return undefined
        const input = directoryCommands['session.list'].input.parse(raw)
        return Promise.resolve({
          items: Array.from({ length: 200 }, (_, index) => ({
            ...session(`bulk-${input.after}-${index}`),
            workspaceId: 'other-workspace',
          })),
          nextCursor: null,
        })
      })
      const archived = await f.commands.execute('app.archiveSession', { sessionId: 'a', archived: true })
      await f.commands.execute('app.archiveSession', { sessionId: 'a', archived: false })
      await f.open('a')
      const restored = f.tabs().items.find((item) => item.id === 'a')!
      await f.open('b')
      for (let page = 0; page < 7; page++)
        await f.commands.execute('session.list', { workspaceId: 'other-workspace', after: String(page), limit: 200 })
      expect(f.runtime.view.state.directory.getSnapshot().sessions.a).toBeUndefined()
      // A later confirmed null can free a slot. Capacity alone is not a version fence for the older roster accumulator.
      await f.commands.execute('session.get', { sessionId: 'bulk-5-0' })
      gate.resolve(source === 'list' ? { items: [archived], nextCursor: null } : session('c'))
      const result = await pending
      if (source === 'list') expect(result).toMatchObject({ items: [archived] })
      else {
        // The unrelated c row was evicted too; a full observational cache must
        // report its skipped projection while preserving the restored a tab.
        expect(f.runtime.view.state.sessionRosterRefresh.getSnapshot().entries.w).toMatchObject({
          status: 'ready',
          error: null,
          skipped: 1,
        })
        expect(f.runtime.view.state.directory.getSnapshot().sessions.c).toBeUndefined()
      }
      expect(f.tabs().items.find((item) => item.id === 'a')?.instanceKey).toBe(restored.instanceKey)
      expect(f.sessions.get('a')).toMatchObject({ archived: false, seq: 3 })
      expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('b')
      expect(f.runtime.view.state.directory.getSnapshot().sessions.a).toBeUndefined()
    } finally {
      gate.resolve(null)
      f.runtime.dispose()
    }
  })
}

test('a saturated roster scan reports non-authoritative projection instead of retiring tabs or claiming freshness', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<unknown>()
  const entered = Promise.withResolvers<void>()
  try {
    await f.runtime.ready
    await f.open('a')
    await f.commands.execute('draft.setText', { sessionId: 'a', text: 'Original A at projection capacity' })
    await f.open('b')
    f.overrideQueries((name, raw) => {
      if (name === 'session.list') {
        const input = directoryCommands['session.list'].input.parse(raw)
        if (input.limit === 100) return Promise.resolve({ items: [session('b')], nextCursor: null })
        return Promise.resolve({
          items: Array.from({ length: 200 }, (_, index) => session(`overflow-${input.after}-${index}`)),
          nextCursor: null,
        })
      }
      if (name === 'session.get' && directoryCommands['session.get'].input.parse(raw).sessionId === 'a') {
        entered.resolve()
        return gate.promise
      }
      return undefined
    })
    const refresh = f.commands.execute('sessionRoster.refresh', { workspaceId: 'w' })
    await entered.promise
    for (let page = 0; page < 7; page++)
      await f.commands.execute('session.list', { workspaceId: 'w', after: String(page), limit: 200 })
    f.sessions.set('a', { ...session('a'), archived: true, seq: 2, updatedAt: 2 })
    gate.resolve(f.sessions.get('a'))
    await expect(refresh).rejects.toMatchObject({ code: 'QUERY_SUPERSEDED' })
    expect(f.runtime.view.state.sessionRosterRefresh.getSnapshot().entries.w).toMatchObject({
      status: 'error',
      error: 'QUERY_SUPERSEDED',
      skipped: 0,
    })
    expect(f.tabs().items.map((item) => item.id)).toEqual(['a', 'b'])
    expect(f.tabs().activeId).toBe('b')
    expect(f.runtime.view.state.drafts.getSnapshot().a?.text).toBe('Original A at projection capacity')
    f.overrideQueries(undefined)
    await f.commands.execute('session.get', { sessionId: 'a' })
    expect(f.tabs().items.map((item) => item.id)).toEqual(['b'])
  } finally {
    gate.resolve(null)
    f.runtime.dispose()
  }
})

test('a get started after a confirmed restore seeds that version before cache eviction and cannot retire the fresh instance', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<unknown>()
  const entered = Promise.withResolvers<void>()
  try {
    await f.runtime.ready
    await f.open('a')
    const old = await f.commands.execute('app.archiveSession', { sessionId: 'a', archived: true })
    await f.commands.execute('app.archiveSession', { sessionId: 'a', archived: false })
    await f.open('a')
    const restored = f.tabs().items.find((item) => item.id === 'a')!
    await f.open('b')
    f.overrideQueries((name, raw) => {
      if (name === 'session.get' && directoryCommands['session.get'].input.parse(raw).sessionId === 'a') {
        entered.resolve()
        return gate.promise
      }
      if (name === 'session.list') {
        const input = directoryCommands['session.list'].input.parse(raw)
        return Promise.resolve({
          items: Array.from({ length: 200 }, (_, index) => ({
            ...session(`bulk-${input.after}-${index}`),
            workspaceId: 'other-workspace',
          })),
          nextCursor: null,
        })
      }
      return undefined
    })
    const pending = f.commands.execute('session.get', { sessionId: 'a' })
    await entered.promise
    for (let page = 0; page < 7; page++)
      await f.commands.execute('session.list', { workspaceId: 'other-workspace', after: String(page), limit: 200 })
    expect(f.runtime.view.state.directory.getSnapshot().sessions.a).toBeUndefined()
    gate.resolve(old)
    expect(await pending).toMatchObject({ id: 'a', archived: true, seq: 2 })
    expect(f.tabs().items.find((item) => item.id === 'a')?.instanceKey).toBe(restored.instanceKey)
    expect(f.tabs().activeId).toBe('b')
    expect(f.runtime.view.state.directory.getSnapshot().sessions.a).toBeUndefined()
  } finally {
    gate.resolve(null)
    f.runtime.dispose()
  }
})

for (const source of ['selection', 'restore'] as const) {
  test(`initial canonical archive prevents stale unarchived ${source} from reviving a view after eviction`, async () => {
    const f = fixture(
      source === 'restore'
        ? { version: 1, items: [{ kind: 'session', id: 'a', sessionId: 'a', workspaceId: 'w' }], activeId: 'a' }
        : undefined,
    )
    const gate = Promise.withResolvers<unknown>()
    const entered = Promise.withResolvers<void>()
    const published: string[][] = []
    let stop: () => void = () => undefined
    try {
      if (source === 'restore')
        f.overrideQueries((name) =>
          name === 'session.get'
            ? Promise.reject(new CommandError('CONNECTION_CLOSED', 'Initial fixture restore unavailable'))
            : undefined,
        )
      await f.runtime.ready
      f.overrideQueries(undefined)
      if (source === 'selection') {
        await f.open('a')
        await f.open('b')
      }
      await f.commands.execute('app.archiveSession', { sessionId: 'a', archived: true })
      let delayed = true
      f.overrideQueries((name, raw) => {
        if (name === 'session.get' && directoryCommands['session.get'].input.parse(raw).sessionId === 'a' && delayed) {
          delayed = false
          entered.resolve()
          return gate.promise
        }
        if (name === 'session.list') {
          const input = directoryCommands['session.list'].input.parse(raw)
          return Promise.resolve({
            items: Array.from({ length: 200 }, (_, index) => ({
              ...session(`bulk-${input.after}-${index}`),
              workspaceId: 'other-workspace',
            })),
            nextCursor: null,
          })
        }
        return undefined
      })
      stop = f.runtime.view.state.workspaceTabs.subscribe(() => {
        published.push(f.tabs().items.map((item) => item.id))
      })
      const pending = source === 'selection' ? f.open('a') : f.commands.execute('workspaceTabs.retryRestore', {})
      await entered.promise
      for (let page = 0; page < 7; page++)
        await f.commands.execute('session.list', { workspaceId: 'other-workspace', after: String(page), limit: 200 })
      gate.resolve(session('a'))
      if (source === 'selection') await expect(pending).rejects.toMatchObject({ code: 'SESSION_ARCHIVED' })
      else await pending
      expect(published.some((ids) => ids.includes('a'))).toBe(false)
      expect(f.tabs().items.some((item) => item.id === 'a')).toBe(false)
      expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe(source === 'selection' ? 'b' : null)
      if (source === 'restore') expect(f.tabs().restoreStatus).toBe('ready')
    } finally {
      stop()
      gate.resolve(null)
      f.runtime.dispose()
    }
  })
}

test('an initially cached archive does not ban a freshly Host-confirmed newer restoration', async () => {
  const f = fixture()
  try {
    await f.runtime.ready
    await f.open('a')
    await f.open('b')
    await f.commands.execute('app.archiveSession', { sessionId: 'a', archived: true })
    expect(f.runtime.view.state.directory.getSnapshot().sessions.a).toMatchObject({ archived: true, seq: 2 })
    f.sessions.set('a', { ...session('a'), archived: false, seq: 3, updatedAt: 3 })
    await f.open('a')
    expect(f.tabs().activeId).toBe('a')
    expect(f.runtime.view.state.directory.getSnapshot().sessions.a).toMatchObject({ archived: false, seq: 3 })
  } finally {
    f.runtime.dispose()
  }
})

test('cancelled Session pages retain bounded transport backpressure and never merge a late archive before or after disposal', async () => {
  const f = fixture()
  const replies: ReturnType<typeof Promise.withResolvers<unknown>>[] = []
  let started: (() => void) | undefined
  try {
    await f.runtime.ready
    await f.open('a')
    f.overrideQueries((name, raw) => {
      if (name !== 'session.list') return undefined
      const input = directoryCommands['session.list'].input.parse(raw)
      if (!input.after?.startsWith('hold-')) return undefined
      const gate = Promise.withResolvers<unknown>()
      replies.push(gate)
      started?.()
      return gate.promise
    })
    for (let index = 0; index < 16; index++) {
      const entered = Promise.withResolvers<void>()
      started = entered.resolve
      const controller = new AbortController()
      const pending = f.commands.execute(
        'session.list',
        { workspaceId: 'w', after: `hold-${index}`, limit: 1 },
        { signal: controller.signal },
      )
      await entered.promise
      controller.abort()
      await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
    }
    // Cancellation cannot abort the underlying transport. Registry keeps its 16 query slots
    // until those handlers settle instead of letting cancelled callers start unbounded I/O.
    await expect(f.commands.execute('session.list', { workspaceId: 'w', limit: 1 })).rejects.toMatchObject({
      code: 'BUSY',
    })
    for (const reply of replies)
      reply.resolve({ items: [{ ...session('a'), archived: true, seq: 2 }], nextCursor: null })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(f.tabs().activeId).toBe('a')
    f.overrideQueries(undefined)
    const fresh = await f.commands.execute('session.list', { workspaceId: 'w', limit: 1 })
    expect(fresh.items).toHaveLength(1)
    expect(f.tabs().items.map((item) => item.id)).toEqual(['a'])
    const before = f.tabs()
    const gate = Promise.withResolvers<unknown>()
    const entered = Promise.withResolvers<void>()
    f.overrideQueries((name) => {
      if (name === 'session.list') {
        entered.resolve()
        return gate.promise
      }
      return undefined
    })
    const pending = f.commands.execute('session.list', { workspaceId: 'w', limit: 1 })
    await entered.promise
    f.runtime.dispose()
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
    gate.resolve({ items: [{ ...session('a'), archived: true, seq: 2 }], nextCursor: null })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(f.tabs()).toBe(before)
  } finally {
    f.runtime.dispose()
    for (const reply of replies) reply.resolve({ items: [], nextCursor: null })
  }
})

test('invalid or older archive facts never retire the restored tab and disposal rejects late reads', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<unknown>()
  try {
    await f.runtime.ready
    await f.open('a')
    f.overrideQueries((name) =>
      name === 'session.get' ? Promise.resolve({ ...session('a'), id: 'wrong', archived: true }) : undefined,
    )
    await expect(f.commands.execute('session.get', { sessionId: 'a' })).rejects.toMatchObject({
      code: 'INVALID_OUTPUT',
    })
    expect(f.tabs().items.map((item) => item.id)).toEqual(['a'])
    f.overrideQueries((name) => (name === 'session.get' ? gate.promise : undefined))
    const pending = f.commands.execute('session.get', { sessionId: 'a' })
    const before = f.tabs()
    f.runtime.dispose()
    gate.resolve({ ...session('a'), archived: true, seq: 2 })
    await expect(pending).rejects.toBeDefined()
    expect(f.tabs()).toBe(before)
  } finally {
    gate.resolve(null)
    f.runtime.dispose()
  }
})
