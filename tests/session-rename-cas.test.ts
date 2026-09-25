import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets, createWorkspaceSessionCommands } from '@hbar/kernel'
import { COMMAND_PROTOCOL_VERSION, createCommandClient } from '@hbar/commands'
import { workspaceSessionCommands } from '@hbar/contracts/commands/workspaces'

test('session rename atomically compares titles, preserves other fields, and retains legacy calls', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-session-rename-cas-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = createWorkspaceSessionCommands(kernel)
  const commands = createCommandClient(workspaceSessionCommands, {
    execute(commandId, input, options) {
      return host.dispatch(
        {
          protocol: COMMAND_PROTOCOL_VERSION,
          requestId: options?.requestId ?? crypto.randomUUID(),
          commandId,
          commandVersion: options?.version ?? 1,
          input,
        },
        'rename-test-device',
      )
    },
  })
  try {
    const workspace = (await kernel.storage.call('workspaces'))[0]!
    const parent = await kernel.createSession(workspace.id, 'Parent')
    const session = await kernel.createSession(workspace.id, 'Original', parent.id)
    const legacy = await commands.execute('session.rename', { sessionId: session.id, title: 'Legacy' })
    expect(legacy.title).toBe('Legacy')
    const priorEvents = await kernel.storage.call('events', session.id, 0)
    // Resolve the worker-backed rejection before matching. Bun 1.4.0's
    // expect(promise).rejects stalled worker delivery for this exact call.
    const conflict = await commands
      .execute('session.rename', {
        sessionId: session.id,
        title: 'Stale write',
        expectedTitle: 'Original',
      })
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(conflict).toMatchObject({ code: 'VERSION_CONFLICT' })
    expect(await kernel.storage.call('session', session.id)).toEqual(legacy)
    expect(await kernel.storage.call('events', session.id, 0)).toEqual(priorEvents)

    const rename = { sessionId: session.id, title: 'Accepted', expectedTitle: 'Legacy' }
    const accepted = await commands.execute('session.rename', rename)
    expect(accepted).toMatchObject({
      title: 'Accepted',
      parentId: parent.id,
      workspaceId: workspace.id,
      archived: false,
      createdAt: session.createdAt,
    })
    const acceptedEvents = await kernel.storage.call('events', session.id, 0)
    expect(await commands.execute('session.rename', rename)).toEqual(accepted)
    expect(await commands.execute('session.rename', { ...rename, expectedTitle: 'Accepted' })).toEqual(accepted)
    expect(await kernel.storage.call('events', session.id, 0)).toEqual(acceptedEvents)

    const competing = await Promise.allSettled([
      commands.execute('session.rename', { sessionId: session.id, title: 'First winner', expectedTitle: 'Accepted' }),
      commands.execute('session.rename', { sessionId: session.id, title: 'Second winner', expectedTitle: 'Accepted' }),
    ])
    expect(competing.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(competing.filter((result) => result.status === 'rejected')).toHaveLength(1)
    const winner = await kernel.storage.call('session', session.id)
    const archived = await commands.execute('session.archive', { sessionId: session.id, archived: true })
    const archivedEvents = await kernel.storage.call('events', session.id, 0)
    const archivedRejection = await commands
      .execute('session.rename', {
        sessionId: session.id,
        title: 'Do not rename archived',
        expectedTitle: winner.title,
      })
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(archivedRejection).toMatchObject({ code: 'SESSION_ARCHIVED' })
    expect(await kernel.storage.call('session', session.id)).toEqual(archived)
    expect(await kernel.storage.call('events', session.id, 0)).toEqual(archivedEvents)
    await commands.execute('session.archive', { sessionId: session.id, archived: false })
    const restored = await commands.execute('session.rename', {
      sessionId: session.id,
      title: 'Restored title',
      expectedTitle: winner.title,
    })
    expect(restored).toMatchObject({ title: 'Restored title', archived: false, parentId: parent.id })
  } finally {
    host.dispose()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})
