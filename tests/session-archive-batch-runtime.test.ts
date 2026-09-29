import { expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError } from '@hbar/commands'
import { directoryCommands, navigationCommands } from '@hbar/contracts/commands'
import type { Session } from '@hbar/contracts/directory'

interface Failure {
  readonly code: string
  readonly accepted?: boolean
}

function fixture(count = 3) {
  const workspaces = [
    { id: 'w', name: 'Original project', path: '/fixture/w', createdAt: 1 },
    { id: 'other', name: 'Other project', path: '/fixture/other', createdAt: 1 },
  ]
  const sessions = new Map<string, Session>(
    Array.from({ length: count }, (_, index) => {
      const id = `s${index.toString().padStart(3, '0')}`
      const workspaceId = index % 2 === 0 ? 'w' : 'other'
      return [
        id,
        {
          id,
          workspaceId,
          title: `Session ${index}`,
          archived: false,
          parentId: null,
          seq: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      ]
    }),
  )
  const writes: Array<{ readonly sessionId: string; readonly workspaceId: string; readonly requestId?: string }> = []
  const events: string[] = []
  const writeFailures = new Map<string, Failure>()
  const readFailures = new Map<string, string>()
  const runtime = createAppRuntime({
    instanceId: 'archive-batch-test',
    hostId: 'fixture',
    directory: {
      async execute(name, raw) {
        if (name === 'workspace.get') {
          const id = directoryCommands['workspace.get'].input.parse(raw).workspaceId
          return workspaces.find((workspace) => workspace.id === id) ?? null
        }
        if (name === 'session.get') {
          const id = directoryCommands['session.get'].input.parse(raw).sessionId
          events.push(`read:${id}`)
          const failure = readFailures.get(id)
          if (failure) throw new CommandError(failure, 'Fixture session read failed')
          return sessions.get(id) ?? null
        }
        if (name === 'session.list') {
          const input = directoryCommands['session.list'].input.parse(raw)
          const items = [...sessions.values()].filter(
            (session) => session.workspaceId === input.workspaceId && (input.includeArchived || !session.archived),
          )
          return { items: items.slice(0, input.limit), nextCursor: null }
        }
        throw new Error(`Unexpected directory command ${name}`)
      },
    },
    workspaces: {
      async execute(name, raw, execution) {
        if (name !== 'session.archive') throw new Error(`Unexpected workspace command ${name}`)
        const input = navigationCommands['app.archiveSession'].input.parse(raw)
        const session = sessions.get(input.sessionId)
        if (!session) throw new CommandError('NOT_FOUND', 'No session')
        events.push(`write:${input.sessionId}`)
        writes.push({
          sessionId: input.sessionId,
          workspaceId: session.workspaceId,
          ...(execution?.requestId ? { requestId: execution.requestId } : {}),
        })
        const failure = writeFailures.get(input.sessionId)
        if (!failure || failure.accepted) {
          sessions.set(session.id, {
            ...session,
            archived: input.archived,
            seq: session.seq + 1,
            updatedAt: session.updatedAt + 1,
          })
        }
        if (failure) throw new CommandError(failure.code, 'Fixture archive failed')
        return sessions.get(input.sessionId)
      },
    },
  })
  const commands = runtime.view.commands
  const batch = () => runtime.view.state.sessionArchive.getSnapshot().batch
  const mutation = () => runtime.view.state.sessionArchive.getSnapshot().mutation
  const hydrate = async (ids: readonly string[]) => {
    for (const sessionId of ids) {
      if (!sessions.has(sessionId)) throw new Error(`Fixture lacks ${sessionId}`)
      await commands.execute('session.get', { sessionId })
    }
  }
  const begin = (targets: readonly { readonly workspaceId: string; readonly sessionId: string }[]) =>
    commands.execute('sessionArchiveBatch.begin', { targets: [...targets] })
  const inputTarget = (sessionId: string) => {
    const session = sessions.get(sessionId)
    if (!session) throw new Error(`Fixture lacks ${sessionId}`)
    return { workspaceId: session.workspaceId, sessionId }
  }
  return {
    runtime,
    commands,
    sessions,
    writes,
    events,
    writeFailures,
    readFailures,
    batch,
    mutation,
    hydrate,
    begin,
    inputTarget,
  }
}

test('batch confirmation captures ordered workspace/session targets and cancellation has zero writes', async () => {
  const f = fixture()
  try {
    await f.hydrate(['s000', 's001', 's002'])
    const targets = [f.inputTarget('s001'), f.inputTarget('s000')]
    await f.begin(targets)
    const preview = f.batch()
    expect(preview).toMatchObject({
      status: 'confirming',
      items: [
        { target: { workspaceId: 'other', sessionId: 's001', title: 'Session 1' }, status: 'pending' },
        { target: { workspaceId: 'w', sessionId: 's000', title: 'Session 0' }, status: 'pending' },
      ],
    })
    const revision = preview.revision
    await f.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 's002' })
    await f.commands.execute('sessionArchiveBatch.cancel', { revision })
    expect(f.batch()).toMatchObject({ status: 'idle', items: [] })
    expect(f.writes).toHaveLength(0)
    expect(f.runtime.view.state.navigation.getSnapshot()).toMatchObject({ workspaceId: 'w', sessionId: 's002' })
  } finally {
    f.runtime.dispose()
  }
})

test('batch archive processes captured targets in order, keeps per-item failures visible, and preserves single-item state', async () => {
  const f = fixture()
  try {
    await f.hydrate(['s000', 's001', 's002'])
    await f.commands.execute('sessionArchive.begin', f.inputTarget('s002'))
    await f.commands.execute('sessionArchive.confirm', {
      sessionId: 's002',
      revision: f.mutation().revision,
    })
    const singleMutation = f.mutation()
    expect(singleMutation.status).toBe('succeeded')
    f.writeFailures.set('s001', { code: 'BUSY' })
    const targets = [f.inputTarget('s001'), f.inputTarget('s000')]
    await f.begin(targets)
    const revision = f.batch().revision
    await f.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 's000' })
    f.events.splice(0)
    await f.commands.execute('sessionArchiveBatch.confirm', { revision })
    expect(f.events).toEqual(['read:s001', 'write:s001', 'read:s000', 'write:s000'])
    expect(f.writes.map(({ sessionId, workspaceId }) => ({ sessionId, workspaceId }))).toEqual([
      { sessionId: 's002', workspaceId: 'w' },
      { sessionId: 's001', workspaceId: 'other' },
      { sessionId: 's000', workspaceId: 'w' },
    ])
    expect(f.batch()).toMatchObject({
      status: 'partial',
      items: [
        { target: { sessionId: 's001', workspaceId: 'other' }, status: 'failed', error: 'BUSY' },
        { target: { sessionId: 's000', workspaceId: 'w' }, status: 'archived', error: null },
      ],
    })
    expect(f.mutation()).toEqual(singleMutation)
    expect(f.sessions.get('s000')?.archived).toBe(true)
    expect(f.sessions.get('s001')?.archived).toBe(false)
    await f.commands.execute('sessionArchiveBatch.dismiss', { revision })
  } finally {
    f.runtime.dispose()
  }
})

test('an uncertain write stops later targets, reconciles read-only, and continues only after confirmation', async () => {
  const f = fixture()
  try {
    await f.hydrate(['s000', 's001', 's002'])
    f.writeFailures.set('s001', { code: 'CONNECTION_CLOSED', accepted: true })
    await f.begin(['s000', 's001', 's002'].map(f.inputTarget))
    const revision = f.batch().revision
    f.events.splice(0)
    await f.commands.execute('sessionArchiveBatch.confirm', { revision })
    expect(f.batch()).toMatchObject({ status: 'unknown', activeIndex: 1 })
    expect(f.batch().items.map((item) => item.status)).toEqual(['archived', 'unknown', 'pending'])
    expect(f.writes.map(({ sessionId }) => sessionId)).toEqual(['s000', 's001'])
    expect(f.events).toEqual(['read:s000', 'write:s000', 'read:s001', 'write:s001'])

    f.writeFailures.delete('s001')
    f.events.splice(0)
    await f.commands.execute('sessionArchiveBatch.reconcile', { revision })
    expect(f.batch()).toMatchObject({ status: 'paused', activeIndex: 2 })
    expect(f.batch().items.map((item) => item.status)).toEqual(['archived', 'archived', 'pending'])
    expect(f.events).toEqual(['read:s001'])
    expect(f.writes.map(({ sessionId }) => sessionId)).toEqual(['s000', 's001'])

    await f.commands.execute('sessionArchiveBatch.continue', { revision })
    expect(f.batch().status).toBe('succeeded')
    expect(f.batch().items.map((item) => item.status)).toEqual(['archived', 'archived', 'archived'])
    expect(f.writes.map(({ sessionId }) => sessionId)).toEqual(['s000', 's001', 's002'])
    expect(f.writes.every(({ requestId }) => Boolean(requestId))).toBe(true)
  } finally {
    f.runtime.dispose()
  }
})

test('an unconfirmed read does not authorize replay or later writes', async () => {
  const f = fixture()
  try {
    await f.hydrate(['s000', 's001', 's002'])
    f.writeFailures.set('s001', { code: 'CONNECTION_CLOSED' })
    await f.begin(['s000', 's001', 's002'].map(f.inputTarget))
    const revision = f.batch().revision
    await f.commands.execute('sessionArchiveBatch.confirm', { revision })
    expect(f.batch()).toMatchObject({ status: 'unknown', activeIndex: 1 })
    await f.commands.execute('sessionArchiveBatch.reconcile', { revision })
    expect(f.batch()).toMatchObject({ status: 'unknown', error: 'RESULT_UNKNOWN' })
    await expect(f.commands.execute('sessionArchiveBatch.continue', { revision })).rejects.toMatchObject({
      code: 'STALE_TARGET',
    })
    expect(f.writes.map(({ sessionId }) => sessionId)).toEqual(['s000', 's001'])
    expect(f.sessions.get('s002')?.archived).toBe(false)
  } finally {
    f.runtime.dispose()
  }
})

test('batch preflight rejects empty, duplicate, stale and over-capacity targets before writing', async () => {
  const f = fixture(101)
  try {
    await f.hydrate(Array.from({ length: 100 }, (_, index) => `s${index.toString().padStart(3, '0')}`))
    await expect(f.begin([])).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const first = f.inputTarget('s000')
    await expect(f.begin([first, first])).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const hundred = Array.from({ length: 100 }, (_, index) => f.inputTarget(`s${index.toString().padStart(3, '0')}`))
    await f.begin(hundred)
    expect(f.batch().items).toHaveLength(100)
    await f.commands.execute('sessionArchiveBatch.cancel', { revision: f.batch().revision })
    await expect(
      f.begin(Array.from({ length: 101 }, (_, index) => f.inputTarget(`s${index.toString().padStart(3, '0')}`))),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await f.commands.execute('sessionArchiveBatch.begin', { targets: [first] })
    const revision = f.batch().revision
    await f.commands.execute('sessionArchiveBatch.cancel', { revision })
    await expect(f.begin([f.inputTarget('s100')])).rejects.toMatchObject({ code: 'STALE_TARGET' })
    expect(f.writes).toHaveLength(0)
  } finally {
    f.runtime.dispose()
  }
})

test('a failed read is visible and later known targets can still be processed', async () => {
  const f = fixture()
  try {
    await f.hydrate(['s000', 's001', 's002'])
    f.readFailures.set('s001', 'DISCONNECTED')
    await f.begin(['s001', 's000'].map(f.inputTarget))
    const revision = f.batch().revision
    await f.commands.execute('sessionArchiveBatch.confirm', { revision })
    expect(f.batch()).toMatchObject({
      status: 'partial',
      items: [
        { target: { sessionId: 's001' }, status: 'failed', error: 'DISCONNECTED' },
        { target: { sessionId: 's000' }, status: 'archived' },
      ],
    })
    expect(f.writes.map(({ sessionId }) => sessionId)).toEqual(['s000'])
  } finally {
    f.runtime.dispose()
  }
})
