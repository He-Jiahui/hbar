import { expect, test } from 'bun:test'
import { CommandError, type CommandExecutor, type ExecuteOptions } from '@hbar/commands'
import {
  createAppRuntime,
  type ClientJsonValue,
  type ClientPersistencePort,
  type RunCommandPort,
} from '@hbar/app-runtime'
import { agentCreateInputSchema, type AgentCreateInput, type AgentRecord } from '@hbar/contracts/commands/agents'
import type { ModelDescriptor } from '@hbar/contracts/commands/models'

const workspace = { id: 'workspace', path: 'D:/workspace', name: 'Workspace', createdAt: 1 }
const parent = {
  id: 'parent',
  workspaceId: workspace.id,
  title: 'Parent',
  archived: false,
  parentId: null,
  createdAt: 2,
  updatedAt: 3,
  seq: 4,
}
const sibling = { ...parent, id: 'sibling', title: 'Sibling', seq: 5 }
const model: ModelDescriptor = {
  id: 'provider:model',
  providerId: 'provider',
  providerName: 'Provider',
  modelId: 'model',
  modelName: 'Model',
  contextWindow: 128_000,
  maxOutput: 8192,
  imageInput: false,
  reasoning: true,
  thinkingLevels: ['low', 'high'],
  defaultThinkingLevel: 'low',
  hasKey: true,
}

function agent(input: AgentCreateInput, agentId: string): AgentRecord {
  return {
    agentId,
    parentSessionId: input.parentSessionId,
    sessionId: `session-${agentId}`,
    runId: null,
    requestId: `request-${agentId}`,
    objective: input.objective,
    ...(input.profileId ? { profileId: input.profileId } : {}),
    modelId: input.modelId ?? model.id,
    tokenBudget: input.tokenBudget ?? null,
    status: 'created',
    error: null,
    createdAt: 10,
    updatedAt: 10,
  }
}

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (check()) return
    await Bun.sleep(1)
  }
  throw new Error('state did not settle')
}

function memoryPersistence() {
  const values = new Map<string, unknown>()
  const persistence: ClientPersistencePort = {
    read: async (key) => values.get(key) ?? null,
    write: async (key, value: ClientJsonValue) => {
      values.set(key, value)
    },
    remove: async (key) => {
      values.delete(key)
    },
  }
  return { persistence, values }
}

function createRuntime(
  instanceId: string,
  agents: CommandExecutor,
  persistence?: ClientPersistencePort,
  runCalls: string[] = [],
) {
  const sessions = { [parent.id]: parent, [sibling.id]: sibling }
  const run: RunCommandPort = {
    async execute(name) {
      runCalls.push(name)
      throw new CommandError('UNEXPECTED_RUN', `Unexpected Run command: ${name}`)
    },
    async getReceipt() {
      return null
    },
  }
  return createAppRuntime({
    instanceId,
    hostId: 'host',
    directory: {
      async execute(name, input) {
        if (name === 'session.get') return sessions[String((input as { sessionId: string }).sessionId)] ?? null
        if (name === 'workspace.get') return workspace
        if (name === 'session.list') return { items: [parent, sibling], nextCursor: null }
        if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
        throw new Error(`Unsupported directory query: ${name}`)
      },
    },
    models: {
      async execute(name, input) {
        if (name === 'model.list') return [model]
        if (name === 'session.getModel') {
          return {
            sessionId: (input as { sessionId: string }).sessionId,
            status: 'configured',
            modelId: model.id,
            model,
            thinkingLevel: 'low',
            revisions: {},
            sources: { model: 'session', thinkingLevel: 'session' },
          }
        }
        throw new Error(`Unsupported model query: ${name}`)
      },
    },
    agents,
    run,
    ...(persistence ? { persistence } : {}),
    surfaces: { canRender: (panelId) => panelId === 'agents' },
  })
}

async function select(runtime: ReturnType<typeof createRuntime>, sessionId = parent.id) {
  await runtime.view.commands.execute('app.setSession', { sessionId, workspaceId: workspace.id })
  await waitFor(() => runtime.view.state.controls.getSnapshot().model?.sessionId === sessionId)
  expect(runtime.view.state.navigation.getSnapshot()).toMatchObject({
    sessionId,
    workspaceId: workspace.id,
    status: 'idle',
  })
}

async function setSlashDraft(runtime: ReturnType<typeof createRuntime>, text: string, sessionId = parent.id) {
  await runtime.view.commands.execute('draft.setText', { sessionId, text })
  return runtime.view.state.drafts.getSnapshot()[sessionId]!
}

function invokeInput(
  sessionId: string,
  draft: { readonly text: string; readonly revision: number },
  objective: string,
) {
  return {
    sessionId,
    workspaceId: workspace.id,
    draftText: draft.text,
    draftRevision: draft.revision,
    profileId: 'explore' as const,
    objective,
  }
}

test('direct Agent composer dispatch uses the typed profile catalog, clears only its draft, and opens the exact child on request', async () => {
  const runCalls: string[] = []
  const agentCalls: string[] = []
  const records: AgentRecord[] = []
  const runtime = createRuntime(
    'agent-composer-success',
    {
      async execute(name, input, execution?: ExecuteOptions) {
        agentCalls.push(name)
        if (name === 'agent.profiles.list') return ['explore']
        if (name === 'agent.list') {
          const parentSessionId = (input as { parentSessionId: string }).parentSessionId
          return { items: records.filter((item) => item.parentSessionId === parentSessionId), nextCursor: null }
        }
        if (name === 'agent.create') {
          expect(execution?.idempotencyKey).toBeString()
          const createdInput = agentCreateInputSchema.parse(input)
          const created = agent(createdInput, 'child')
          records.push(created)
          return created
        }
        throw new Error(`Unsupported Agent command: ${name}`)
      },
    },
    memoryPersistence().persistence,
    runCalls,
  )
  try {
    await select(runtime)
    const draft = await setSlashDraft(runtime, '/agent explore inspect the active workspace')
    expect(runtime.view.state.surfaces.getSnapshot().panels).toEqual({})
    await runtime.view.commands.execute('agentComposer.refresh', { sessionId: parent.id, workspaceId: workspace.id })
    expect(runtime.view.state.agentComposer.getSnapshot().profileCatalog).toEqual({
      status: 'ready',
      profiles: ['explore'],
      error: null,
    })

    const result = await runtime.view.commands.execute(
      'agentComposer.invoke',
      invokeInput(parent.id, draft, 'inspect the active workspace'),
    )
    expect(result).toEqual({
      sessionId: parent.id,
      status: 'succeeded',
      agentId: 'child',
      error: null,
      draftCleared: true,
    })
    expect(agentCalls).toEqual(['agent.profiles.list', 'agent.create'])
    expect(runCalls.filter((name) => name === 'run.submit')).toEqual([])
    expect(runtime.view.state.drafts.getSnapshot()[parent.id]).toMatchObject({
      text: '',
      attachments: [],
      mentions: [],
    })
    expect(runtime.view.state.agents.getSnapshot().entries).toEqual({})
    expect(runtime.view.state.agentComposer.getSnapshot().actions[parent.id]).toMatchObject({
      status: 'succeeded',
      agent: { agentId: 'child', parentSessionId: parent.id },
      draftCleared: true,
    })

    const opened = await runtime.view.commands.execute('agentComposer.openResult', {
      sessionId: parent.id,
      workspaceId: workspace.id,
      agentId: 'child',
    })
    expect(opened).toMatchObject({ selected: true, agentId: 'child' })
    expect(runtime.view.state.agents.getSnapshot().entries[opened.panelInstanceId]).toMatchObject({
      parentSessionId: parent.id,
      view: 'detail',
      selectedAgentId: 'child',
    })
    expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe(parent.id)
    expect(runCalls.filter((name) => name === 'run.submit')).toEqual([])
  } finally {
    runtime.dispose()
  }
})

test('unknown direct Agent create is restored after reload and retries the same key even when the local draft is empty', async () => {
  const storage = memoryPersistence()
  const calls: Array<{ input: AgentCreateInput; key: string }> = []
  let attempt = 0
  const host: CommandExecutor = {
    async execute(name, rawInput, execution?: ExecuteOptions) {
      if (name === 'agent.profiles.list') return ['explore']
      if (name === 'agent.list') return { items: [], nextCursor: null }
      if (name !== 'agent.create') throw new Error(`Unsupported Agent command: ${name}`)
      const input = agentCreateInputSchema.parse(rawInput)
      const key = execution?.idempotencyKey ?? ''
      calls.push({ input, key })
      attempt += 1
      if (attempt === 1) throw new CommandError('DISCONNECTED', 'response lost')
      return agent(input, 'same-child')
    },
  }
  const first = createRuntime('agent-composer-before-reload', host, storage.persistence)
  let second: ReturnType<typeof createRuntime> | undefined
  try {
    await select(first)
    const draft = await setSlashDraft(first, '/agent explore inspect the repository')
    const input = invokeInput(parent.id, draft, 'inspect the repository')
    await expect(first.view.commands.execute('agentComposer.invoke', input)).rejects.toMatchObject({
      code: 'DISCONNECTED',
    })
    const pendingKey = 'hbar:agent-workspace:pending-create:host:parent'
    const persisted = storage.values.get(pendingKey) as { operationKey: string; input: AgentCreateInput }
    expect(persisted.operationKey).toBe(calls[0]!.key)
    expect(first.view.state.agentComposer.getSnapshot().actions[parent.id]?.status).toBe('unknown')
    const management = await first.view.commands.execute('app.openPanel', { panelId: 'agents' })
    await first.view.commands.execute('agentWorkspace.refresh', { instanceId: management.instanceId })
    expect(first.view.state.agents.getSnapshot().entries[management.instanceId]).toMatchObject({
      view: 'list',
      creation: { status: 'idle' },
    })
    await first.view.commands.execute('agentWorkspace.showCreate', { instanceId: management.instanceId })
    await first.view.commands.execute('agentWorkspace.setField', {
      instanceId: management.instanceId,
      field: 'objective',
      value: 'inspect the repository',
    })
    await first.view.commands.execute('agentWorkspace.setField', {
      instanceId: management.instanceId,
      field: 'profileId',
      value: 'explore',
    })
    await expect(
      first.view.commands.execute('agentWorkspace.create', { instanceId: management.instanceId }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    expect(calls).toHaveLength(1)
    expect(storage.values.has(pendingKey)).toBe(true)
    first.dispose()

    second = createRuntime('agent-composer-after-reload', host, storage.persistence)
    await select(second)
    await second.view.commands.execute('agentComposer.refresh', { sessionId: parent.id, workspaceId: workspace.id })
    const recovered = second.view.state.agentComposer.getSnapshot().actions[parent.id]!
    expect(recovered).toMatchObject({
      status: 'unknown',
      draftText: input.draftText,
      draftRevision: input.draftRevision,
    })
    expect(second.view.state.drafts.getSnapshot()[parent.id]).toMatchObject({
      sessionId: parent.id,
      text: '',
      revision: 0,
      status: 'idle',
      attachments: [],
      attachmentTransfers: [],
      lastOperationId: null,
    })
    await second.view.commands.execute('agentComposer.invoke', {
      sessionId: recovered.sessionId,
      workspaceId: recovered.workspaceId,
      draftText: recovered.draftText,
      draftRevision: recovered.draftRevision,
      profileId: recovered.profileId,
      objective: recovered.objective,
    })

    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(calls[0])
    expect(calls[0]).toEqual({ input: persisted.input, key: persisted.operationKey })
    expect(storage.values.has(pendingKey)).toBe(false)
    expect(second.view.state.agentComposer.getSnapshot().actions[parent.id]).toMatchObject({
      status: 'succeeded',
      agent: { agentId: 'same-child' },
    })
  } finally {
    first.dispose()
    second?.dispose()
  }
})

test('cancellation after Host dispatch preserves the same key for a safe retry', async () => {
  const storage = memoryPersistence()
  const calls: Array<{ input: AgentCreateInput; key: string }> = []
  const host: CommandExecutor = {
    async execute(name, rawInput, execution?: ExecuteOptions) {
      if (name === 'agent.profiles.list') return ['explore']
      if (name !== 'agent.create') throw new Error(`Unsupported Agent command: ${name}`)
      const input = agentCreateInputSchema.parse(rawInput)
      const key = execution?.idempotencyKey ?? ''
      calls.push({ input, key })
      if (calls.length === 1)
        return new Promise<AgentRecord>((_resolve, reject) => {
          execution?.signal?.addEventListener(
            'abort',
            () => reject(new CommandError('CANCELLED', 'request cancelled')),
            {
              once: true,
            },
          )
        })
      return agent(input, 'cancelled-once')
    },
  }
  const runtime = createRuntime('agent-composer-cancel-after-dispatch', host, storage.persistence)
  try {
    await select(runtime)
    const draft = await setSlashDraft(runtime, '/agent explore inspect cancellation recovery')
    const input = invokeInput(parent.id, draft, 'inspect cancellation recovery')
    const controller = new AbortController()
    const invocation = runtime.view.commands.execute('agentComposer.invoke', input, { signal: controller.signal })
    await waitFor(() => calls.length === 1)
    controller.abort()
    await expect(invocation).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    await waitFor(() => runtime.view.state.agentComposer.getSnapshot().actions[parent.id]?.status === 'unknown')
    expect(storage.values.has('hbar:agent-workspace:pending-create:host:parent')).toBe(true)

    await runtime.view.commands.execute('agentComposer.invoke', input)
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(calls[0])
    expect(storage.values.has('hbar:agent-workspace:pending-create:host:parent')).toBe(false)
    expect(runtime.view.state.agentComposer.getSnapshot().actions[parent.id]).toMatchObject({
      status: 'succeeded',
      agent: { agentId: 'cancelled-once' },
    })
  } finally {
    runtime.dispose()
  }
})

test('same captured slash action returns its confirmed Agent after the draft changed, without minting another child', async () => {
  let runtime: ReturnType<typeof createRuntime> | undefined
  let creates = 0
  const host: CommandExecutor = {
    async execute(name, rawInput) {
      if (name === 'agent.profiles.list') return ['explore']
      if (name !== 'agent.create') throw new Error(`Unsupported Agent command: ${name}`)
      creates += 1
      const input = agentCreateInputSchema.parse(rawInput)
      await runtime?.view.commands.execute('draft.setText', {
        sessionId: parent.id,
        text: 'a newer draft the Agent action must preserve',
      })
      return agent(input, 'confirmed-once')
    },
  }
  runtime = createRuntime('agent-composer-confirmed-repeat', host, memoryPersistence().persistence)
  try {
    await select(runtime)
    const draft = await setSlashDraft(runtime, '/agent explore check this change')
    const input = invokeInput(parent.id, draft, 'check this change')
    const firstOutcome = await runtime.view.commands
      .execute('agentComposer.invoke', input)
      .catch((reason: unknown) => reason)
    expect(firstOutcome).toMatchObject({
      status: 'succeeded',
      agentId: 'confirmed-once',
      draftCleared: false,
      error: 'DRAFT_CHANGED',
    })
    expect(runtime.view.state.drafts.getSnapshot()[parent.id]?.text).toBe(
      'a newer draft the Agent action must preserve',
    )
    await expect(runtime.view.commands.execute('agentComposer.invoke', input)).resolves.toMatchObject({
      status: 'succeeded',
      agentId: 'confirmed-once',
    })
    expect(creates).toBe(1)
  } finally {
    runtime.dispose()
  }
})

test('composer dispatch shares the per-session Agent lock, and a completed child does not open or select after switching away', async () => {
  let resolveCreate: (value: AgentRecord) => void = () => undefined
  let creates = 0
  const host: CommandExecutor = {
    async execute(name, rawInput) {
      if (name === 'agent.profiles.list') return ['explore']
      if (name !== 'agent.create') throw new Error(`Unsupported Agent command: ${name}`)
      creates += 1
      agentCreateInputSchema.parse(rawInput)
      return new Promise<AgentRecord>((resolve) => {
        resolveCreate = (record) => resolve(record)
      })
    },
  }
  const runtime = createRuntime('agent-composer-switch', host, memoryPersistence().persistence)
  try {
    await select(runtime)
    const originalDraft = await setSlashDraft(runtime, '/agent explore inspect the parent')
    const input = invokeInput(parent.id, originalDraft, 'inspect the parent')
    const inFlight = runtime.view.commands.execute('agentComposer.invoke', input)
    await waitFor(() => creates === 1)
    await expect(runtime.view.commands.execute('agentComposer.invoke', input)).rejects.toMatchObject({ code: 'BUSY' })
    await select(runtime, sibling.id)
    await setSlashDraft(runtime, 'leave the sibling composer alone', sibling.id)
    const record = agent(
      {
        parentSessionId: parent.id,
        objective: input.objective,
        profileId: input.profileId,
        modelId: model.id,
        thinkingLevel: 'low',
        approval: 'deny',
      },
      'child-after-switch',
    )
    resolveCreate(record)
    await expect(inFlight).resolves.toMatchObject({ status: 'succeeded', agentId: record.agentId })
    expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe(sibling.id)
    expect(runtime.view.state.drafts.getSnapshot()[sibling.id]?.text).toBe('leave the sibling composer alone')
    expect(runtime.view.state.drafts.getSnapshot()[parent.id]?.text).toBe('')
    expect(runtime.view.state.surfaces.getSnapshot().panels).toEqual({})
    await expect(
      runtime.view.commands.execute('agentComposer.openResult', {
        sessionId: parent.id,
        workspaceId: workspace.id,
        agentId: record.agentId,
      }),
    ).rejects.toMatchObject({ code: 'STALE_TARGET' })
    expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe(sibling.id)
    expect(creates).toBe(1)
  } finally {
    runtime.dispose()
  }
})

test('pre-dispatch cancellation cleans its newly persisted key; attachments and unsupported profile ids are rejected before Host create', async () => {
  const storage = memoryPersistence()
  const writesStarted: (() => void)[] = []
  let finishWrite: () => void = () => undefined
  const persistence: ClientPersistencePort = {
    read: storage.persistence.read,
    write: async (key, value) => {
      writesStarted.shift()?.()
      if (key.includes('pending-create')) await new Promise<void>((resolve) => (finishWrite = resolve))
      await storage.persistence.write(key, value)
    },
    remove: storage.persistence.remove,
  }
  let creates = 0
  const host: CommandExecutor = {
    async execute(name) {
      if (name === 'agent.profiles.list') return ['explore']
      if (name === 'agent.create') {
        creates += 1
        throw new Error('Must not dispatch after pre-dispatch cancellation')
      }
      throw new Error(`Unsupported Agent command: ${name}`)
    },
  }
  const runtime = createRuntime('agent-composer-cancel', host, persistence)
  try {
    await select(runtime)
    const draft = await setSlashDraft(runtime, '/agent explore inspect the worktree')
    const invalidProfile = { ...invokeInput(parent.id, draft, 'inspect the worktree'), profileId: 'plan' }
    await expect(runtime.view.commands.execute('agentComposer.invoke', invalidProfile as never)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    })

    const artifact = { id: 'a'.repeat(64), name: 'notes.txt', mime: 'text/plain', size: 12 }
    await runtime.view.commands.execute('draft.setAttachments', {
      sessionId: parent.id,
      attachments: [{ kind: 'file', artifact }],
    })
    const withAttachment = runtime.view.state.drafts.getSnapshot()[parent.id]!
    await expect(
      runtime.view.commands.execute(
        'agentComposer.invoke',
        invokeInput(parent.id, withAttachment, 'inspect the worktree'),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await runtime.view.commands.execute('draft.setAttachments', { sessionId: parent.id, attachments: [] })
    const exactDraft = runtime.view.state.drafts.getSnapshot()[parent.id]!
    const controller = new AbortController()
    const writeStarted = new Promise<void>((resolve) => writesStarted.push(resolve))
    const invoke = runtime.view.commands.execute(
      'agentComposer.invoke',
      invokeInput(parent.id, exactDraft, 'inspect the worktree'),
      { signal: controller.signal },
    )
    await writeStarted
    controller.abort()
    finishWrite()
    await expect(invoke).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    await waitFor(() => !storage.values.has('hbar:agent-workspace:pending-create:host:parent'))
    expect(creates).toBe(0)
    expect(runtime.view.state.agentComposer.getSnapshot().actions[parent.id]).toMatchObject({
      status: 'failed',
      error: 'CANCELLED',
    })
  } finally {
    finishWrite()
    runtime.dispose()
  }
})
