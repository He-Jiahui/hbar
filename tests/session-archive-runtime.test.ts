import { expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError } from '@hbar/commands'
import { directoryCommands, navigationCommands } from '@hbar/contracts/commands'
import type { Session } from '@hbar/contracts/directory'

function fixture(count = 3) {
  const workspaces = [
    { id: 'w', name: 'Original project', path: '/fixture/w', createdAt: 1 },
    { id: 'other', name: 'Other project', path: '/fixture/other', createdAt: 1 },
  ]
  const sessions = new Map<string, Session>(
    Array.from({ length: count }, (_, index) => {
      const id = `s${index.toString().padStart(3, '0')}`
      return [
        id,
        {
          id,
          workspaceId: 'w',
          title: `Session ${index}`,
          archived: index >= 100,
          parentId: null,
          seq: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      ]
    }),
  )
  const writes: unknown[] = []
  const queries: unknown[] = []
  let failure: string | null = null
  let accepted = false
  let writeGate: Promise<void> | null = null
  let readGate: Promise<void> | null = null
  let listError = false
  let oversized = false
  let latestSignal: AbortSignal | undefined
  const runtime = createAppRuntime({
    instanceId: 'archive-test',
    hostId: 'fixture',
    directory: {
      async execute(name, raw, execution) {
        if (name === 'workspace.get')
          return (
            workspaces.find(
              (workspace) => workspace.id === directoryCommands['workspace.get'].input.parse(raw).workspaceId,
            ) ?? null
          )
        if (name === 'session.get')
          return sessions.get(directoryCommands['session.get'].input.parse(raw).sessionId) ?? null
        if (name === 'session.list') {
          const input = directoryCommands['session.list'].input.parse(raw)
          queries.push(input)
          latestSignal = execution?.signal
          if (readGate) await readGate
          if (listError) throw new CommandError('DISCONNECTED', 'Fixture list failed')
          const items = [...sessions.values()]
            .filter(
              (session) =>
                session.workspaceId === input.workspaceId &&
                (input.includeArchived || !session.archived) &&
                (!input.after || session.id > input.after),
            )
            .sort((left, right) => left.id.localeCompare(right.id))
          const page = items.slice(0, oversized ? input.limit + 1 : input.limit)
          return { items: page, nextCursor: items.length > input.limit ? (page.at(-1)?.id ?? null) : null }
        }
        throw new Error(`Unexpected ${name}`)
      },
    },
    workspaces: {
      async execute(name, raw) {
        if (name !== 'session.archive') throw new Error(`Unexpected ${name}`)
        const input = navigationCommands['app.archiveSession'].input.parse(raw)
        writes.push(input)
        if (writeGate) await writeGate
        const prior = sessions.get(input.sessionId)
        if (!prior) throw new CommandError('NOT_FOUND', 'No session')
        const next = { ...prior, archived: input.archived, seq: prior.seq + 1, updatedAt: prior.updatedAt + 1 }
        if (!failure || accepted) sessions.set(prior.id, next)
        if (failure === 'untyped') throw new Error('A post-write transport rejection')
        if (failure) throw new CommandError(failure, 'Fixture archive failed')
        return next
      },
    },
  })
  const commands = runtime.view.commands
  const state = () => runtime.view.state.sessionArchive.getSnapshot()
  return {
    runtime,
    commands,
    state,
    writes,
    queries,
    sessions,
    target: () => ({ sessionId: state().mutation.target?.sessionId ?? '', revision: state().mutation.revision }),
    page: () => ({ workspaceId: state().list.workspaceId ?? '', revision: state().list.revision }),
    async select(id = 's000') {
      await commands.execute('app.setSession', { workspaceId: 'w', sessionId: id })
    },
    async begin() {
      await commands.execute('sessionArchive.begin', { workspaceId: 'w', sessionId: 's000' })
    },
    fail(code: string | null, didAccept = false) {
      failure = code
      accepted = didAccept
    },
    writesWait(gate: Promise<void>) {
      writeGate = gate
    },
    readsWait(gate: Promise<void> | null) {
      readGate = gate
    },
    failList(value: boolean) {
      listError = value
    },
    oversizeList() {
      oversized = true
    },
    signal: () => latestSignal,
  }
}

test('archive confirmation is fixed to its original row, cancellation has no write, and obsolete actions are rejected', async () => {
  const f = fixture()
  try {
    await f.select()
    await f.begin()
    const old = f.target()
    expect(f.state().mutation).toMatchObject({
      status: 'confirming',
      target: { sessionId: 's000', title: 'Session 0', archived: true },
    })
    await f.commands.execute('sessionArchive.cancel', old)
    expect(f.writes).toHaveLength(0)
    await f.begin()
    await expect(f.commands.execute('sessionArchive.confirm', old)).rejects.toMatchObject({ code: 'STALE_TARGET' })
    await f.commands.execute('sessionArchive.confirm', f.target())
    expect(f.runtime.view.state.navigation.getSnapshot()).toMatchObject({ workspaceId: 'w', sessionId: null })
    expect(f.sessions.get('s000')?.archived).toBe(true)
  } finally {
    f.runtime.dispose()
  }
})

test('a delayed archive never clears the newer selected session and a restored session is not automatically opened', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>()
  try {
    await f.select()
    await f.begin()
    f.writesWait(gate.promise)
    const pending = f.commands.execute('sessionArchive.confirm', f.target())
    await f.select('s001')
    await expect(f.commands.execute('sessionArchive.confirm', f.target())).rejects.toMatchObject({ code: 'BUSY' })
    await expect(
      f.commands.execute('sessionArchive.begin', { workspaceId: 'w', sessionId: 's001' }),
    ).rejects.toMatchObject({ code: 'BUSY' })
    gate.resolve()
    await pending
    expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('s001')
    await f.commands.execute('sessionArchive.restore', { workspaceId: 'w', sessionId: 's000' })
    expect(f.sessions.get('s000')?.archived).toBe(false)
    expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('s001')
    expect(f.writes).toEqual([
      { sessionId: 's000', archived: true },
      { sessionId: 's000', archived: false },
    ])
  } finally {
    gate.resolve()
    f.runtime.dispose()
  }
})

for (const code of ['CONNECTION_CLOSED', 'EXECUTION_FAILED', 'RPC_ERROR', 'untyped']) {
  test(`accepted archive with ${code} keeps one original intent and reconciles without replay`, async () => {
    const f = fixture()
    try {
      await f.select()
      await f.begin()
      f.fail(code, true)
      await expect(f.commands.execute('sessionArchive.confirm', f.target())).rejects.toBeDefined()
      const requestId = f.state().mutation.requestId
      expect(requestId).not.toBeNull()
      expect(f.state().mutation.status).toBe('unknown')
      await expect(f.commands.execute('sessionArchive.cancel', f.target())).rejects.toMatchObject({ code: 'BUSY' })
      await expect(f.commands.execute('sessionArchive.confirm', f.target())).rejects.toMatchObject({ code: 'BUSY' })
      await f.select('s001')
      await f.commands.execute('sessionArchive.reconcile', f.target())
      expect(f.state().mutation).toMatchObject({ status: 'succeeded', requestId })
      expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('s001')
      expect(f.writes).toHaveLength(1)
    } finally {
      f.runtime.dispose()
    }
  })
}

test('unconfirmed and removed results stay unknown through list close or project switch', async () => {
  const f = fixture()
  try {
    await f.select()
    await f.begin()
    f.fail('CONNECTION_CLOSED')
    await expect(f.commands.execute('sessionArchive.confirm', f.target())).rejects.toBeDefined()
    await f.commands.execute('archivedSessions.open', { workspaceId: 'w' })
    await f.commands.execute('archivedSessions.close', f.page())
    await f.commands.execute('app.setWorkspace', { workspaceId: 'other' })
    await f.commands.execute('sessionArchive.reconcile', f.target())
    expect(f.state().mutation.status).toBe('unknown')
    f.sessions.delete('s000')
    await f.commands.execute('sessionArchive.reconcile', f.target())
    expect(f.state().mutation).toMatchObject({
      status: 'unknown',
      target: { sessionId: 's000', workspaceId: 'w' },
      error: 'RESULT_UNKNOWN',
    })
    await expect(
      f.commands.execute('sessionArchive.restore', { workspaceId: 'w', sessionId: 's000' }),
    ).rejects.toMatchObject({ code: 'BUSY' })
    expect(f.writes).toHaveLength(1)
  } finally {
    f.runtime.dispose()
  }
})

test('a known active-run rejection stays near its original action and can be safely cancelled', async () => {
  const f = fixture()
  try {
    await f.select()
    await f.begin()
    f.fail('BUSY')
    await expect(f.commands.execute('sessionArchive.confirm', f.target())).rejects.toMatchObject({ code: 'BUSY' })
    expect(f.state().mutation).toMatchObject({ status: 'failed', error: 'BUSY' })
    expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('s000')
    await f.commands.execute('sessionArchive.cancel', f.target())
    expect(f.sessions.get('s000')?.archived).toBe(false)
  } finally {
    f.runtime.dispose()
  }
})

test('workspace mismatches are rejected and a target already archived elsewhere is confirmed without another write', async () => {
  const f = fixture()
  try {
    await f.select()
    await expect(
      f.commands.execute('sessionArchive.begin', { workspaceId: 'other', sessionId: 's000' }),
    ).rejects.toMatchObject({ code: 'STALE_TARGET' })
    await f.begin()
    const prior = f.sessions.get('s000')
    if (!prior) throw new Error('Missing fixture session')
    f.sessions.set(prior.id, { ...prior, archived: true, seq: 2 })
    await f.commands.execute('sessionArchive.confirm', f.target())
    expect(f.state().mutation.status).toBe('succeeded')
    expect(f.writes).toHaveLength(0)
    expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBeNull()
  } finally {
    f.runtime.dispose()
  }
})

test('invalid duplicate inclusive page records do not replace the last confirmed page', async () => {
  const workspace = { id: 'w', name: 'Workspace', path: '/fixture', createdAt: 1 }
  const session = {
    id: 's',
    workspaceId: 'w',
    title: 'Archived',
    archived: true,
    parentId: null,
    seq: 1,
    createdAt: 1,
    updatedAt: 1,
  }
  let duplicates = false
  const runtime = createAppRuntime({
    instanceId: 'archive-duplicate-page',
    hostId: 'fixture',
    directory: {
      execute(name) {
        if (name === 'workspace.get') return Promise.resolve(workspace)
        if (name === 'session.list')
          return Promise.resolve({ items: duplicates ? [session, session] : [session], nextCursor: null })
        throw new Error(`Unexpected ${name}`)
      },
    },
  })
  try {
    await runtime.view.commands.execute('workspace.get', { workspaceId: 'w' })
    await runtime.view.commands.execute('archivedSessions.open', { workspaceId: 'w' })
    duplicates = true
    await expect(
      runtime.view.commands.execute('archivedSessions.load', {
        workspaceId: 'w',
        revision: runtime.view.state.sessionArchive.getSnapshot().list.revision,
        direction: 'first',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
    expect(runtime.view.state.sessionArchive.getSnapshot().list).toMatchObject({ status: 'failed', sessionIds: ['s'] })
  } finally {
    runtime.dispose()
  }
})

for (const count of [0, 1, 100, 101, 250]) {
  test(`archived pages remain bounded for ${count} inclusive sessions without eagerly draining the cursor`, async () => {
    const f = fixture(count)
    try {
      await f.commands.execute('workspace.get', { workspaceId: 'w' })
      await f.commands.execute('archivedSessions.open', { workspaceId: 'w' })
      expect(f.state().list.sessionIds).toHaveLength(Math.min(count, 100))
      expect(f.queries).toHaveLength(1)
      expect(f.state().list.nextCursor !== null).toBe(count > 100)
      if (count > 100) {
        await f.commands.execute('archivedSessions.load', { ...f.page(), direction: 'next' })
        expect(f.state().list.sessionIds).toHaveLength(Math.min(count - 100, 100))
        expect(f.state().list).toMatchObject({ page: 2, after: 's099' })
        expect(f.state().list.sessionIds[0]).toBe('s100')
        await f.commands.execute('archivedSessions.load', { ...f.page(), direction: 'first' })
        expect(f.state().list).toMatchObject({ page: 1, after: null })
      }
      expect(f.queries).toContainEqual({ workspaceId: 'w', includeArchived: true, limit: 100 })
      expect(f.runtime.view.state.navigation.getSnapshot()).toMatchObject({ workspaceId: null, sessionId: null })
    } finally {
      f.runtime.dispose()
    }
  })
}

test('page failures keep their prior cursor, retry is explicit, and oversized pages fail closed', async () => {
  const f = fixture(250)
  try {
    await f.commands.execute('workspace.get', { workspaceId: 'w' })
    await f.commands.execute('archivedSessions.open', { workspaceId: 'w' })
    f.failList(true)
    await expect(f.commands.execute('archivedSessions.load', { ...f.page(), direction: 'next' })).rejects.toMatchObject(
      { code: 'DISCONNECTED' },
    )
    expect(f.state().list).toMatchObject({ status: 'failed', page: 1, nextCursor: 's099' })
    f.failList(false)
    await f.commands.execute('archivedSessions.load', { ...f.page(), direction: 'next' })
    expect(f.state().list.page).toBe(2)
    f.oversizeList()
    await expect(
      f.commands.execute('archivedSessions.load', { ...f.page(), direction: 'first' }),
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
    expect(f.state().list.sessionIds).toHaveLength(100)
  } finally {
    f.runtime.dispose()
  }
})

test('closing a loading page aborts its request and late results cannot reopen or retarget it', async () => {
  const f = fixture(101)
  const gate = Promise.withResolvers<void>()
  try {
    await f.commands.execute('workspace.get', { workspaceId: 'w' })
    f.readsWait(gate.promise)
    const pending = f.commands.execute('archivedSessions.open', { workspaceId: 'w' }).catch((error: unknown) => error)
    const old = f.page()
    await f.commands.execute('archivedSessions.close', old)
    expect(f.signal()?.aborted).toBe(true)
    f.readsWait(null)
    await f.commands.execute('workspace.get', { workspaceId: 'other' })
    await f.commands.execute('archivedSessions.open', { workspaceId: 'other' })
    gate.resolve()
    await pending
    expect(f.state().list).toMatchObject({ workspaceId: 'other', open: true, status: 'ready', sessionIds: [] })
    await expect(f.commands.execute('archivedSessions.load', { ...old, direction: 'next' })).rejects.toMatchObject({
      code: 'STALE_TARGET',
    })
  } finally {
    gate.resolve()
    f.runtime.dispose()
  }
})
