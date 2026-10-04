import { expect, test } from 'bun:test'
import { createAppRuntime, messageForkActionKey, sessionMessageForkCommands } from '@hbar/app-runtime'
import type { CommandExecutor } from '@hbar/commands'
import type { Session } from '@hbar/contracts/directory'

const source: Session = {
  id: 'source',
  workspaceId: 'workspace',
  title: 'Source',
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  seq: 1,
}
const child: Session = { ...source, id: 'forked', parentId: source.id, title: 'Forked' }

function fixture(enabled = true) {
  const sessions = new Map<string, Session>([[source.id, source]])
  const names: string[] = []
  const keys: string[] = []
  const directory: CommandExecutor = {
    execute(name, input) {
      const value = input as { sessionId?: string; workspaceId?: string; after?: string }
      if (name === 'session.get') return Promise.resolve(sessions.get(value.sessionId ?? '') ?? null)
      if (name === 'workspace.get')
        return Promise.resolve(
          value.workspaceId === source.workspaceId
            ? { id: source.workspaceId, name: 'Workspace', path: 'D:/workspace', createdAt: 1 }
            : null,
        )
      if (name === 'session.list') return Promise.resolve({ items: [...sessions.values()], nextCursor: null })
      if (name === 'workspace.list')
        return Promise.resolve({
          items: [{ id: source.workspaceId, name: 'Workspace', path: 'D:/workspace', createdAt: 1 }],
          nextCursor: null,
        })
      throw new Error(`Unexpected directory query ${name}`)
    },
  }
  const workspaces: CommandExecutor = {
    execute(name, input, execution) {
      names.push(name)
      const value = input as { sessionId: string; messageIds?: string[] }
      if (name === 'session.forkableMessages')
        return Promise.resolve({
          sessionId: value.sessionId,
          items: (value.messageIds ?? []).map((messageId) => ({ messageId, eligible: true, reason: 'ready' })),
        })
      if (name === 'session.forkFromMessage') {
        keys.push(execution?.idempotencyKey ?? '')
        sessions.set(child.id, child)
        return Promise.resolve(child)
      }
      if (name === 'session.forkFromMessageReceipt') return Promise.resolve(null)
      throw new Error(`Unexpected workspace command ${name}`)
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'fork-runtime-test',
    hostId: 'host',
    directory,
    ...(enabled ? { workspaces } : {}),
  })
  return { runtime, names, keys }
}

test('combination root exposes typed Fork commands/reader and opens the confirmed child via existing navigation', async () => {
  const { runtime, names, keys } = fixture()
  try {
    await runtime.ready
    await runtime.view.commands.execute('app.setSession', { sessionId: source.id })
    const instanceKey = runtime.workspaceTabs.capture([source.id])[0]?.instanceKey
    if (!instanceKey) throw new Error('Expected source tab')
    const queried = await runtime.view.commands.execute('messageFork.refreshEligibility', {
      sessionId: source.id,
      cursor: 8,
      messageIds: ['message-1', 'message-2'],
    })
    expect(queried).toEqual({ sessionId: source.id, cursor: 8, count: 2 })
    expect(runtime.view.state.messageFork.getSnapshot().eligibility.items['message-1']).toMatchObject({
      eligible: true,
      reason: 'ready',
    })
    const target = { sessionId: source.id, messageId: 'message-1', sourceTabInstanceKey: instanceKey }
    expect(await runtime.view.commands.execute('messageFork.submit', target)).toEqual({
      childSessionId: child.id,
      navigated: true,
    })
    expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe(child.id)
    expect(runtime.view.state.workspaceTabs.getSnapshot().items.map((item) => item.id)).toEqual([source.id, child.id])
    expect(runtime.view.state.messageFork.getSnapshot().actions[messageForkActionKey(target)]).toMatchObject({
      status: 'created',
      childSessionId: child.id,
      idempotencyKey: keys[0],
    })
    expect(names).toEqual(['session.forkableMessages', 'session.forkableMessages', 'session.forkFromMessage'])
    expect(sessionMessageForkCommands['messageFork.reconcile'].metadata.id).toBe('messageFork.reconcile')
    expect(Object.keys(runtime.view.state.messageFork).sort()).toEqual(['getSnapshot', 'subscribe'])
  } finally {
    runtime.dispose()
  }
})

test('runtime without Host session commands still constructs and reports capability failure nearby', async () => {
  const { runtime } = fixture(false)
  try {
    await runtime.ready
    await runtime.view.commands.execute('app.setSession', { sessionId: source.id })
    const instanceKey = runtime.workspaceTabs.capture([source.id])[0]?.instanceKey
    if (!instanceKey) throw new Error('Expected source tab')
    const target = { sessionId: source.id, messageId: 'message-1', sourceTabInstanceKey: instanceKey }
    await expect(runtime.view.commands.execute('messageFork.submit', target)).rejects.toMatchObject({
      code: 'CAPABILITY_UNAVAILABLE',
    })
    expect(runtime.view.state.messageFork.getSnapshot().actions[messageForkActionKey(target)]).toMatchObject({
      status: 'failed',
      error: 'CAPABILITY_UNAVAILABLE',
    })
    expect(runtime.view.state.workspaceTabs.getSnapshot().items.map((item) => item.id)).toEqual([source.id])
  } finally {
    runtime.dispose()
  }
})
