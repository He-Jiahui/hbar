import { expect, test } from 'bun:test'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { createAppRuntime, type ClientPersistencePort } from '@hbar/app-runtime'
import { HbarError } from '@hbar/contracts'
import type { AgentRecord } from '@hbar/contracts/commands/agents'
import type { Session, Workspace } from '@hbar/contracts/directory'

const workspaces: Record<string, Workspace> = {
  parent: { id: 'parent-w', name: 'Parent', path: 'D:/parent', createdAt: 1 },
  child: { id: 'child-w', name: 'Isolated', path: 'D:/child', createdAt: 1 },
}
const session = (id: string, workspaceId: string, parentId: string | null = null, archived = false): Session => ({
  id,
  workspaceId,
  parentId,
  archived,
  title: id,
  createdAt: 1,
  updatedAt: 1,
  seq: 1,
})
const record: AgentRecord = {
  agentId: 'agent-1',
  parentSessionId: 'parent',
  sessionId: 'child',
  runId: 'run-1',
  requestId: 'request-1',
  objective: 'Review',
  modelId: 'model',
  tokenBudget: null,
  status: 'running',
  error: null,
  createdAt: 1,
  updatedAt: 1,
}
function fixture(overrides?: {
  agentResult?: (input: unknown) => Promise<unknown>
  directory?: (name: string, input: unknown) => Promise<unknown>
}) {
  const sessions = new Map<string, Session>([
    ['parent', session('parent', 'parent-w')],
    ['child', session('child', 'child-w', 'parent')],
  ])
  const values = new Map<string, unknown>()
  const persistence: ClientPersistencePort = {
    read: (key) => Promise.resolve(values.get(key) ?? null),
    write: (key, value) => {
      values.set(key, value)
      return Promise.resolve()
    },
    remove: (key) => {
      values.delete(key)
      return Promise.resolve()
    },
  }
  const agents: CommandExecutor = {
    execute(name, input) {
      if (name === 'agent.list') return Promise.resolve({ items: [record], nextCursor: null })
      if (name === 'agent.result.get') return overrides?.agentResult?.(input) ?? Promise.resolve(record)
      throw new Error(`Unexpected Agent command ${name}`)
    },
  }
  const directory: CommandExecutor = {
    execute(name, input) {
      if (overrides?.directory) return overrides.directory(name, input)
      const target = input as { sessionId?: string; workspaceId?: string }
      if (name === 'session.get') return Promise.resolve(sessions.get(target.sessionId ?? '') ?? null)
      if (name === 'workspace.get')
        return Promise.resolve(Object.values(workspaces).find((item) => item.id === target.workspaceId) ?? null)
      if (name === 'session.list') return Promise.resolve({ items: [], nextCursor: null })
      throw new Error(`Unexpected directory command ${name}`)
    },
  }
  const create = () =>
    createAppRuntime({
      instanceId: crypto.randomUUID(),
      hostId: 'agent-child-host',
      agents,
      directory,
      persistence,
      surfaces: { canRender: (id) => id === 'agents' },
    })
  return { sessions, values, persistence, directory, create }
}

async function detail(runtime: ReturnType<ReturnType<typeof fixture>['create']>) {
  await runtime.ready
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'parent-w', sessionId: 'parent' })
  const sourceTabInstanceKey = runtime.workspaceTabs.capture(['parent'])[0]!.instanceKey
  const panel = await runtime.view.commands.execute('app.openPanel', { panelId: 'agents' })
  await runtime.view.commands.execute('agentWorkspace.refresh', { instanceId: panel.instanceId })
  await runtime.view.commands.execute('agentWorkspace.showAgent', {
    instanceId: panel.instanceId,
    agentId: record.agentId,
  })
  return {
    panelInstanceId: panel.instanceId,
    parentSessionId: 'parent',
    agentId: record.agentId,
    expectedChildSessionId: 'child',
    sourceTabInstanceKey,
  }
}

test('an isolated child opens by its actual Workspace, returns to the original parent and never persists the Back provenance', async () => {
  const f = fixture()
  const runtime = f.create()
  const input = await detail(runtime)
  const opened = await runtime.view.commands.execute('agentChild.open', input)
  expect(opened).toMatchObject({ childSessionId: 'child', sourceAttached: true })
  expect(runtime.view.state.navigation.getSnapshot()).toMatchObject({ workspaceId: 'child-w', sessionId: 'child' })
  const child = runtime.view.state.workspaceTabs.getSnapshot().items.find((item) => item.id === 'child')
  expect(child).toMatchObject({
    kind: 'session',
    agentSource: {
      parentSessionId: 'parent',
      parentWorkspaceId: 'parent-w',
      agentId: 'agent-1',
      sourceTabInstanceKey: input.sourceTabInstanceKey,
    },
  })
  expect(
    await runtime.view.commands.execute('agentChild.return', {
      childSessionId: 'child',
      childTabInstanceKey: opened.childTabInstanceKey,
    }),
  ).toEqual({ activeId: 'parent' })
  expect(runtime.view.state.workspaceTabs.getSnapshot().items.map((item) => item.id)).toEqual(['parent', 'child'])
  await runtime.view.commands.execute('workspaceTabs.select', { id: 'child' })
  await runtime.workspaceTabs.whenIdle()
  const stored = f.values.get('hbar:agent-child-host:preferences') as {
    value: { workspaceTabs: { items: Record<string, unknown>[] } }
  }
  expect(stored.value.workspaceTabs.items.find((item) => item.id === 'child')).toEqual({
    kind: 'session',
    id: 'child',
    sessionId: 'child',
    workspaceId: 'child-w',
  })
  runtime.dispose()
  const restored = f.create()
  await restored.ready
  expect(restored.view.state.workspaceTabs.getSnapshot().items.find((item) => item.id === 'child')).toMatchObject({
    kind: 'session',
    id: 'child',
  })
  expect(
    'agentSource' in restored.view.state.workspaceTabs.getSnapshot().items.find((item) => item.id === 'child')!,
  ).toBe(false)
  await expect(
    restored.view.commands.execute('agentChild.return', {
      childSessionId: 'child',
      childTabInstanceKey: restored.workspaceTabs.capture(['child'])[0]!.instanceKey,
    }),
  ).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
  restored.dispose()
})

test('four identities and child parentId must agree before navigation; an archived child cannot open', async () => {
  const f = fixture({ agentResult: () => Promise.resolve({ ...record, sessionId: 'unrelated' }) })
  const runtime = f.create()
  const input = await detail(runtime)
  await expect(runtime.view.commands.execute('agentChild.open', input)).rejects.toMatchObject({
    code: 'INVALID_OUTPUT',
  })
  expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe('parent')
  runtime.dispose()

  const wrong = fixture()
  wrong.sessions.set('child', session('child', 'child-w', 'wrong-parent'))
  const checked = wrong.create()
  const target = await detail(checked)
  await expect(checked.view.commands.execute('agentChild.open', target)).rejects.toMatchObject({
    code: 'SOURCE_CHANGED',
  })
  wrong.sessions.set('child', session('child', 'child-w', 'parent', true))
  await expect(checked.view.commands.execute('agentChild.open', target)).rejects.toMatchObject({
    code: 'SOURCE_CHANGED',
  })
  expect(checked.workspaceTabs.capture(['child'])).toEqual([])
  checked.dispose()
})

test('lost Agent query and stale source panel leave navigation untouched; late facts cannot override a newer selection', async () => {
  const pending = Promise.withResolvers<unknown>()
  const entered = Promise.withResolvers<void>()
  let hold = false
  const f = fixture({
    agentResult: () => {
      if (!hold) return Promise.resolve(record)
      entered.resolve()
      return pending.promise
    },
  })
  f.sessions.set('other', session('other', 'parent-w'))
  const runtime = f.create()
  const input = await detail(runtime)
  hold = true
  const opening = runtime.view.commands.execute('agentChild.open', input)
  await entered.promise
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'parent-w', sessionId: 'other' })
  pending.resolve(record)
  await expect(opening).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
  expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe('other')
  expect(runtime.workspaceTabs.capture(['child'])).toEqual([])
  runtime.dispose()

  const offline = fixture({ agentResult: () => Promise.reject(new CommandError('CONNECTION_CLOSED', 'Offline')) })
  const disconnected = offline.create()
  const retry = await detail(disconnected)
  await expect(disconnected.view.commands.execute('agentChild.open', retry)).rejects.toMatchObject({
    code: 'CONNECTION_CLOSED',
  })
  expect(disconnected.view.state.navigation.getSnapshot().sessionId).toBe('parent')
  disconnected.dispose()
})

test('closing and reopening the captured parent clears the source relation; Back cannot select a replacement', async () => {
  const f = fixture()
  const runtime = f.create()
  const input = await detail(runtime)
  const opened = await runtime.view.commands.execute('agentChild.open', input)
  await runtime.workspaceTabs.closeCaptured(runtime.workspaceTabs.capture(['parent']), new AbortController().signal)
  expect(runtime.view.state.workspaceTabs.getSnapshot().items.find((item) => item.id === 'child')).toMatchObject({
    kind: 'session',
    id: 'child',
  })
  expect(
    'agentSource' in runtime.view.state.workspaceTabs.getSnapshot().items.find((item) => item.id === 'child')!,
  ).toBe(false)
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'parent-w', sessionId: 'parent' })
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'child-w', sessionId: 'child' })
  await expect(
    runtime.view.commands.execute('agentChild.return', {
      childSessionId: 'child',
      childTabInstanceKey: opened.childTabInstanceKey,
    }),
  ).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
  expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe('child')
  runtime.dispose()
})

test('parent archive and return-time result failure keep the child selected and do not close or stop it', async () => {
  let fail = false
  const f = fixture({
    agentResult: () =>
      fail ? Promise.reject(new CommandError('CONNECTION_CLOSED', 'Offline')) : Promise.resolve(record),
  })
  const runtime = f.create()
  const input = await detail(runtime)
  const opened = await runtime.view.commands.execute('agentChild.open', input)
  fail = true
  await expect(
    runtime.view.commands.execute('agentChild.return', {
      childSessionId: 'child',
      childTabInstanceKey: opened.childTabInstanceKey,
    }),
  ).rejects.toMatchObject({ code: 'CONNECTION_CLOSED' })
  fail = false
  f.sessions.set('parent', session('parent', 'parent-w', null, true))
  await expect(
    runtime.view.commands.execute('agentChild.return', {
      childSessionId: 'child',
      childTabInstanceKey: opened.childTabInstanceKey,
    }),
  ).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
  expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe('child')
  expect(runtime.workspaceTabs.capture(['child'])).toHaveLength(1)
  runtime.dispose()
})

test('same panel instance retargeted during an Agent read cannot open the old child', async () => {
  const pending = Promise.withResolvers<unknown>()
  const entered = Promise.withResolvers<void>()
  let hold = false
  const f = fixture({
    agentResult: () => {
      if (!hold) return Promise.resolve(record)
      entered.resolve()
      return pending.promise
    },
  })
  const runtime = f.create()
  const input = await detail(runtime)
  hold = true
  const opening = runtime.view.commands.execute('agentChild.open', input)
  await entered.promise
  await runtime.view.commands.execute('app.openPanel', {
    panelId: 'agents',
    instanceId: input.panelInstanceId,
    workspaceId: 'parent-w',
    sessionId: 'parent',
    binding: 'pinned',
  })
  pending.resolve(record)
  await expect(opening).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
  expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe('parent')
  runtime.dispose()
})

test('late return cannot override a newer navigation, and a closed child incarnation cannot reuse its old Back target', async () => {
  const pending = Promise.withResolvers<unknown>()
  const entered = Promise.withResolvers<void>()
  let hold = false
  const f = fixture({
    agentResult: () => {
      if (!hold) return Promise.resolve(record)
      entered.resolve()
      return pending.promise
    },
  })
  f.sessions.set('other', session('other', 'child-w'))
  const runtime = f.create()
  const input = await detail(runtime)
  const opened = await runtime.view.commands.execute('agentChild.open', input)
  hold = true
  const returning = runtime.view.commands.execute('agentChild.return', {
    childSessionId: 'child',
    childTabInstanceKey: opened.childTabInstanceKey,
  })
  await entered.promise
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'child-w', sessionId: 'other' })
  pending.resolve(record)
  await expect(returning).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
  expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe('other')
  await runtime.workspaceTabs.closeCaptured(runtime.workspaceTabs.capture(['child']), new AbortController().signal)
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'child-w', sessionId: 'child' })
  await expect(
    runtime.view.commands.execute('agentChild.return', {
      childSessionId: 'child',
      childTabInstanceKey: opened.childTabInstanceKey,
    }),
  ).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
  runtime.dispose()
})

test('a full 32-tab set denies child navigation without losing the captured Agent detail or writing a Run', async () => {
  const f = fixture()
  for (let i = 0; i < 31; i++) f.sessions.set(`extra-${i}`, session(`extra-${i}`, 'parent-w'))
  const runtime = f.create()
  const input = await detail(runtime)
  await runtime.view.commands.execute('app.openPanel', {
    panelId: 'agents',
    instanceId: input.panelInstanceId,
    workspaceId: 'parent-w',
    sessionId: 'parent',
    binding: 'pinned',
  })
  for (let i = 0; i < 31; i++)
    await runtime.view.commands.execute('app.setSession', { workspaceId: 'parent-w', sessionId: `extra-${i}` })
  expect(runtime.view.state.workspaceTabs.getSnapshot().items).toHaveLength(32)
  await expect(runtime.view.commands.execute('agentChild.open', input)).rejects.toMatchObject({ code: 'TAB_LIMIT' })
  expect(runtime.workspaceTabs.capture(['child'])).toEqual([])
  expect(runtime.view.state.agents.getSnapshot().entries[input.panelInstanceId]?.selectedAgentId).toBe('agent-1')
  runtime.dispose()
})

test('aborting a delayed Agent fact read cannot navigate to its child after the result arrives', async () => {
  const pending = Promise.withResolvers<unknown>()
  const entered = Promise.withResolvers<void>()
  const f = fixture({
    agentResult: () => {
      entered.resolve()
      return pending.promise
    },
  })
  const runtime = f.create()
  const input = await detail(runtime)
  const abort = new AbortController()
  const opening = runtime.view.commands.execute('agentChild.open', input, { signal: abort.signal })
  await entered.promise
  abort.abort()
  pending.resolve(record)
  await expect(opening).rejects.toBeDefined()
  expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe('parent')
  expect(runtime.workspaceTabs.capture(['child'])).toEqual([])
  runtime.dispose()
})

test('Host disconnect codes survive open and return boundaries without leaking messages, and retries only read facts', async () => {
  let reads = 0
  const f = fixture({
    agentResult: () => {
      reads++
      if (reads === 1) return Promise.reject(new HbarError('DISCONNECTED', 'secret request payload'))
      if (reads === 3) return Promise.reject(new HbarError('CONNECTION_CLOSED', 'secret credentials'))
      return Promise.resolve(record)
    },
  })
  const runtime = f.create()
  const input = await detail(runtime)
  await expect(runtime.view.commands.execute('agentChild.open', input)).rejects.toMatchObject({
    code: 'DISCONNECTED',
    message: 'Agent navigation could not be completed',
  })
  expect(runtime.workspaceTabs.capture(['child'])).toEqual([])
  const opened = await runtime.view.commands.execute('agentChild.open', input)
  expect(opened.sourceAttached).toBe(true)
  await expect(
    runtime.view.commands.execute('agentChild.return', {
      childSessionId: opened.childSessionId,
      childTabInstanceKey: opened.childTabInstanceKey,
    }),
  ).rejects.toMatchObject({ code: 'CONNECTION_CLOSED', message: 'Agent navigation could not be completed' })
  expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe('child')
  expect(
    await runtime.view.commands.execute('agentChild.return', {
      childSessionId: opened.childSessionId,
      childTabInstanceKey: opened.childTabInstanceKey,
    }),
  ).toEqual({ activeId: 'parent' })
  expect(reads).toBe(4)
  expect(runtime.view.state.workspaceTabs.getSnapshot().items.map((item) => item.id)).toEqual(['parent', 'child'])
  runtime.dispose()
})

test('existing CommandError is preserved, while malformed codes and plain errors become safe generic failures', async () => {
  const known = new CommandError('AGENT_NOT_FOUND', 'Known typed failure')
  for (const [reason, code, message] of [
    [known, 'AGENT_NOT_FOUND', 'Known typed failure'],
    [
      new HbarError('DISCONNECTED secret=token', 'secret payload'),
      'EXECUTION_FAILED',
      'Agent navigation could not be completed',
    ],
    [new Error('private account information'), 'EXECUTION_FAILED', 'Agent navigation could not be completed'],
  ] as const) {
    const f = fixture({ agentResult: () => Promise.reject(reason) })
    const runtime = f.create()
    const input = await detail(runtime)
    await expect(runtime.view.commands.execute('agentChild.open', input)).rejects.toMatchObject({ code, message })
    expect(runtime.workspaceTabs.capture(['child'])).toEqual([])
    runtime.dispose()
  }
})
