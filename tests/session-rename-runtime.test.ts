import { expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError } from '@hbar/commands'
import { directoryCommands } from '@hbar/contracts/commands'
import { workspaceSessionCommands } from '@hbar/contracts/commands/workspaces'
import type { Session } from '@hbar/contracts/directory'

function fixture() {
  const workspace = { id: 'w', name: '项目', path: '/fixture', createdAt: 1 }
  const sessions = new Map<string, Session>(
    ['a', 'b'].map((id) => [
      id,
      {
        id,
        workspaceId: workspace.id,
        title: `Title ${id}`,
        archived: false,
        parentId: null,
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    ]),
  )
  const writes: unknown[] = []
  let failure: string | null = null
  let accepted = false
  let gate: Promise<void> | null = null
  const runtime = createAppRuntime({
    instanceId: 'rename-runtime',
    hostId: 'test',
    directory: {
      execute(name, raw) {
        if (name === 'workspace.get') return Promise.resolve(workspace)
        if (name === 'workspace.list') return Promise.resolve({ items: [workspace], nextCursor: null })
        if (name === 'session.get')
          return Promise.resolve(sessions.get(directoryCommands['session.get'].input.parse(raw).sessionId) ?? null)
        if (name === 'session.list') return Promise.resolve({ items: [...sessions.values()], nextCursor: null })
        throw new Error(`Unexpected ${name}`)
      },
    },
    workspaces: {
      async execute(name, raw) {
        if (name !== 'session.rename') throw new Error(`Unexpected ${name}`)
        const input = workspaceSessionCommands['session.rename'].input.parse(raw)
        writes.push(input)
        if (gate) await gate
        const prior = sessions.get(input.sessionId)
        if (!prior) throw new CommandError('NOT_FOUND', 'No session')
        if (prior.archived) throw new CommandError('SESSION_ARCHIVED', 'Archived')
        if (input.expectedTitle !== undefined && prior.title !== input.expectedTitle && prior.title !== input.title)
          throw new CommandError('VERSION_CONFLICT', 'Title changed')
        const next = { ...prior, title: input.title, updatedAt: prior.updatedAt + 1, seq: prior.seq + 1 }
        if (!failure || accepted) sessions.set(prior.id, next)
        if (failure === 'untyped') throw new Error('Unknown transport error')
        if (failure) throw new CommandError(failure, 'Rename failed')
        return next
      },
    },
  })
  const commands = runtime.view.commands
  const state = () => runtime.view.state.sessionRename.getSnapshot()
  const target = () => ({ sessionId: 'a', revision: state().revision })
  return {
    runtime,
    commands,
    state,
    target,
    sessions,
    writes,
    async begin() {
      await commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'a' })
      await commands.execute('sessionRename.begin', { workspaceId: 'w', sessionId: 'a' })
    },
    fail(value: string | null, wasAccepted = false) {
      failure = value
      accepted = wasAccepted
    },
    gate(value: Promise<void>) {
      gate = value
    },
  }
}

test('inline rename validates its draft, trims only on submit, and preserves navigation', async () => {
  const f = fixture()
  try {
    await f.begin()
    await f.commands.execute('sessionRename.edit', { ...f.target(), title: '  ' })
    await expect(f.commands.execute('sessionRename.submit', f.target())).rejects.toMatchObject({
      code: 'TITLE_REQUIRED',
    })
    expect(f.state()).toMatchObject({ draft: '  ', status: 'failed' })
    await expect(
      f.commands.execute('sessionRename.edit', { ...f.target(), title: 'x'.repeat(161) }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await f.commands.execute('sessionRename.edit', { ...f.target(), title: `  ${'名'.repeat(156)}  ` })
    await f.commands.execute('sessionRename.submit', f.target())
    expect(f.writes).toEqual([{ sessionId: 'a', title: '名'.repeat(156), expectedTitle: 'Title a' }])
    expect(f.runtime.view.state.directory.getSnapshot().sessions.a?.title).toBe('名'.repeat(156))
    expect(f.runtime.view.state.navigation.getSnapshot()).toMatchObject({ workspaceId: 'w', sessionId: 'a' })
    expect(f.state().status).toBe('succeeded')
  } finally {
    f.runtime.dispose()
  }
})

test('cancel never writes and old editor events cannot mutate a later edit', async () => {
  const f = fixture()
  try {
    await f.begin()
    const stale = f.target()
    await f.commands.execute('sessionRename.edit', { ...stale, title: 'Discard this draft' })
    await f.commands.execute('sessionRename.cancel', stale)
    await f.commands.execute('sessionRename.begin', { workspaceId: 'w', sessionId: 'a' })
    await expect(f.commands.execute('sessionRename.edit', { ...stale, title: 'Late input' })).rejects.toMatchObject({
      code: 'STALE_TARGET',
    })
    expect(f.state().draft).toBe('Title a')
    expect(f.writes).toHaveLength(0)
  } finally {
    f.runtime.dispose()
  }
})

test('pending rename is target-locked, resists double submit, and a late result does not navigate back', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>()
  try {
    await f.begin()
    await f.commands.execute('sessionRename.edit', { ...f.target(), title: 'Accepted A' })
    f.gate(gate.promise)
    const submitting = f.commands.execute('sessionRename.submit', f.target())
    await f.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'b' })
    await expect(f.commands.execute('sessionRename.begin', { workspaceId: 'w', sessionId: 'b' })).rejects.toMatchObject(
      { code: 'BUSY' },
    )
    await expect(f.commands.execute('sessionRename.cancel', f.target())).rejects.toMatchObject({ code: 'BUSY' })
    await expect(f.commands.execute('sessionRename.submit', f.target())).rejects.toMatchObject({ code: 'BUSY' })
    gate.resolve()
    await submitting
    expect(f.writes).toHaveLength(1)
    expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('b')
    expect(f.runtime.view.state.directory.getSnapshot().sessions.a?.title).toBe('Accepted A')
    expect(f.runtime.view.state.directory.getSnapshot().sessions.b?.title).toBe('Title b')
  } finally {
    gate.resolve()
    f.runtime.dispose()
  }
})

test('a title changed before submit is a local conflict and preserves the original draft without a write', async () => {
  const f = fixture()
  try {
    await f.begin()
    await f.commands.execute('sessionRename.edit', { ...f.target(), title: 'My draft' })
    f.sessions.set('a', { ...f.sessions.get('a')!, title: 'Other device', seq: 2, updatedAt: 2 })
    await expect(f.commands.execute('sessionRename.submit', f.target())).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
    })
    expect(f.state()).toMatchObject({ draft: 'My draft', status: 'failed', target: { originalTitle: 'Title a' } })
    expect(f.writes).toHaveLength(0)
    expect(f.runtime.view.state.directory.getSnapshot().sessions.a?.title).toBe('Other device')
  } finally {
    f.runtime.dispose()
  }
})

for (const failure of ['DISCONNECTED', 'CONNECTION_CLOSED', 'EXECUTION_FAILED', 'RPC_ERROR', 'untyped']) {
  test(`an accepted rename with ${failure} stays unknown until an exact original-target read confirms it`, async () => {
    const f = fixture()
    try {
      await f.begin()
      await f.commands.execute('sessionRename.edit', { ...f.target(), title: 'Accepted title' })
      f.fail(failure, true)
      await expect(f.commands.execute('sessionRename.submit', f.target())).rejects.toBeDefined()
      expect(f.state()).toMatchObject({ status: 'unknown', draft: 'Accepted title', target: { sessionId: 'a' } })
      await expect(f.commands.execute('sessionRename.cancel', f.target())).rejects.toMatchObject({ code: 'BUSY' })
      await expect(f.commands.execute('sessionRename.submit', f.target())).rejects.toMatchObject({ code: 'BUSY' })
      await f.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'b' })
      await f.commands.execute('sessionRename.reconcile', f.target())
      expect(f.state().status).toBe('succeeded')
      expect(f.writes).toHaveLength(1)
      expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('b')
      expect(f.runtime.view.state.directory.getSnapshot().sessions.a?.title).toBe('Accepted title')
    } finally {
      f.runtime.dispose()
    }
  })
}

test('an absent rename result never unlocks replay or silently replaces the original target', async () => {
  const f = fixture()
  try {
    await f.begin()
    await f.commands.execute('sessionRename.edit', { ...f.target(), title: 'Uncertain title' })
    f.fail('EXECUTION_FAILED')
    await expect(f.commands.execute('sessionRename.submit', f.target())).rejects.toBeDefined()
    await f.commands.execute('sessionRename.reconcile', f.target())
    expect(f.state()).toMatchObject({ status: 'unknown', draft: 'Uncertain title', error: 'RESULT_UNKNOWN' })
    await expect(f.commands.execute('sessionRename.begin', { workspaceId: 'w', sessionId: 'b' })).rejects.toMatchObject(
      { code: 'BUSY' },
    )
    expect(f.writes).toHaveLength(1)
  } finally {
    f.runtime.dispose()
  }
})

for (const unavailable of ['archived', 'removed'] as const) {
  test(`a ${unavailable} original row retains its editable draft until explicit cancellation`, async () => {
    const f = fixture()
    try {
      await f.begin()
      await f.commands.execute('sessionRename.edit', { ...f.target(), title: 'Keep this orphaned draft' })
      await f.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'b' })
      const prior = f.sessions.get('a')
      if (!prior) throw new Error('Missing fixture session')
      if (unavailable === 'archived') f.sessions.set('a', { ...prior, archived: true, seq: 2 })
      else f.sessions.delete('a')
      await expect(f.commands.execute('sessionRename.submit', f.target())).rejects.toMatchObject({
        code: 'STALE_TARGET',
      })
      expect(f.state()).toMatchObject({
        status: 'failed',
        draft: 'Keep this orphaned draft',
        target: { sessionId: 'a', originalTitle: 'Title a' },
      })
      expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('b')
      await expect(
        f.commands.execute('sessionRename.begin', { workspaceId: 'w', sessionId: 'b' }),
      ).rejects.toMatchObject({ code: 'BUSY' })
      await f.commands.execute('sessionRename.cancel', f.target())
      expect(f.state()).toMatchObject({ status: 'idle', target: null })
      expect(f.writes).toHaveLength(0)
      expect(f.sessions.get('a')?.archived ?? true).toBe(true)
    } finally {
      f.runtime.dispose()
    }
  })
}

test('an archived original row cannot clear an unknown rename or turn reconciliation into another write', async () => {
  const f = fixture()
  try {
    await f.begin()
    await f.commands.execute('sessionRename.edit', { ...f.target(), title: 'Original uncertain draft' })
    f.fail('CONNECTION_CLOSED')
    await expect(f.commands.execute('sessionRename.submit', f.target())).rejects.toBeDefined()
    const prior = f.sessions.get('a')
    if (!prior) throw new Error('Missing fixture session')
    f.sessions.set('a', { ...prior, archived: true, seq: 2 })
    await f.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'b' })
    await f.commands.execute('sessionRename.reconcile', f.target())
    expect(f.state()).toMatchObject({
      status: 'unknown',
      draft: 'Original uncertain draft',
      error: 'RESULT_UNKNOWN',
      target: { sessionId: 'a' },
    })
    expect(f.runtime.view.state.directory.getSnapshot().sessions.a?.archived).toBe(true)
    await expect(f.commands.execute('sessionRename.cancel', f.target())).rejects.toMatchObject({ code: 'BUSY' })
    await expect(f.commands.execute('sessionRename.submit', f.target())).rejects.toMatchObject({ code: 'BUSY' })
    await expect(f.commands.execute('sessionRename.begin', { workspaceId: 'w', sessionId: 'b' })).rejects.toMatchObject(
      { code: 'BUSY' },
    )
    expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('b')
    expect(f.writes).toHaveLength(1)
    expect(f.sessions.get('a')?.archived).toBe(true)
  } finally {
    f.runtime.dispose()
  }
})
