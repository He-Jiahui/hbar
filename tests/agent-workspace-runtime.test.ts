import { expect, test } from 'bun:test'
import { CommandError, type CommandExecutor, type ExecuteOptions } from '@hbar/commands'
import { createAppRuntime, type ClientJsonValue, type ClientPersistencePort } from '@hbar/app-runtime'
import { agentCreateInputSchema, type AgentCreateInput, type AgentRecord } from '@hbar/contracts/commands/agents'
import type { ModelDescriptor } from '@hbar/contracts/commands/models'

const workspace = { id: 'workspace', path: 'D:/workspace', name: 'Workspace', createdAt: 1 }
const session = {
  id: 'parent',
  workspaceId: workspace.id,
  title: 'Parent',
  archived: false,
  parentId: null,
  createdAt: 2,
  updatedAt: 3,
  seq: 4,
}
const primaryModel: ModelDescriptor = {
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
const alternateModel: ModelDescriptor = {
  ...primaryModel,
  id: 'provider:alternate',
  modelId: 'alternate',
  modelName: 'Alternate',
  thinkingLevels: ['medium'],
  defaultThinkingLevel: 'medium',
}

function child(status: AgentRecord['status']): AgentRecord {
  return {
    agentId: 'child',
    parentSessionId: session.id,
    sessionId: 'child-session',
    runId: 'child-run',
    requestId: 'child-request',
    objective: 'Review the change',
    modelId: 'provider:model',
    tokenBudget: 8_000,
    status,
    error: null,
    createdAt: 10,
    updatedAt: 11,
  }
}

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
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

function createAgentWorkspaceRuntime(instanceId: string, agents: CommandExecutor, persistence?: ClientPersistencePort) {
  return createAppRuntime({
    instanceId,
    hostId: 'host',
    directory: {
      async execute(name: string) {
        if (name === 'session.get') return session
        if (name === 'workspace.get') return workspace
        if (name === 'session.list') return { items: [session], nextCursor: null }
        if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
        throw new Error(`Unsupported query: ${name}`)
      },
    },
    models: {
      async execute(name: string) {
        if (name === 'model.list') return [primaryModel, alternateModel]
        return {
          sessionId: session.id,
          status: 'configured',
          modelId: 'provider:model',
          model: primaryModel,
          thinkingLevel: null,
          revisions: {},
          sources: { model: 'session', thinkingLevel: 'default' },
        }
      },
    },
    agents,
    ...(persistence ? { persistence } : {}),
    surfaces: { canRender: (panelId) => panelId === 'agents' },
  })
}

async function openAgentCreateForm(
  runtime: ReturnType<typeof createAgentWorkspaceRuntime>,
  objective: string,
  instanceId?: string,
) {
  await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
  await waitFor(() => runtime.view.state.controls.getSnapshot().model?.modelId === primaryModel.id)
  const opened = await runtime.view.commands.execute('app.openPanel', {
    panelId: 'agents',
    ...(instanceId ? { instanceId } : {}),
  })
  await runtime.view.commands.execute('agentWorkspace.refresh', { instanceId: opened.instanceId })
  await runtime.view.commands.execute('agentWorkspace.showCreate', { instanceId: opened.instanceId })
  await waitFor(() => runtime.view.state.agents.getSnapshot().catalog.status === 'ready')
  await runtime.view.commands.execute('agentWorkspace.setField', {
    instanceId: opened.instanceId,
    field: 'objective',
    value: objective,
  })
  return opened
}

test('agent workspace owns paged drafts and retries unknown create and cancel commands safely', async () => {
  const createKeys: string[] = []
  const createInputs: AgentCreateInput[] = []
  const createProfiles: Array<string | undefined> = []
  let createAttempts = 0
  let cancelAttempts = 0
  let records: AgentRecord[] = []
  const storage = memoryPersistence()
  const runtime = createAgentWorkspaceRuntime(
    'agent-workspace',
    {
      async execute(name, input, options?: ExecuteOptions) {
        if (name === 'agent.list') return { items: records, nextCursor: null }
        if (name === 'agent.create') {
          const createInput = agentCreateInputSchema.parse(input)
          createInputs.push(createInput)
          createProfiles.push(createInput.profileId)
          createKeys.push(options?.idempotencyKey ?? '')
          createAttempts += 1
          if (createAttempts === 1) throw new CommandError('DISCONNECTED', 'response lost')
          records = [{ ...child('running'), profileId: createInput.profileId }]
          return records[0]
        }
        if (name === 'agent.cancel') {
          cancelAttempts += 1
          if (cancelAttempts === 1) throw new CommandError('TIMEOUT', 'response lost')
          records = [child('cancelRequested')]
          return records[0]
        }
        throw new Error(`Unsupported agent command: ${name}`)
      },
    },
    storage.persistence,
  )
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    await waitFor(() => runtime.view.state.controls.getSnapshot().model?.modelId === 'provider:model')
    const opened = await runtime.view.commands.execute('app.openPanel', { panelId: 'agents' })
    await runtime.view.commands.execute('agentWorkspace.refresh', { instanceId: opened.instanceId })
    const loaded = runtime.view.state.agents.getSnapshot().entries[opened.instanceId]!
    expect(loaded.draft.modelId).toBe('provider:model')
    expect(loaded).toMatchObject({ view: 'list', selectedAgentId: null })

    await expect(
      runtime.view.commands.execute('agentWorkspace.showAgent', {
        instanceId: opened.instanceId,
        agentId: 'missing',
      }),
    ).rejects.toMatchObject({ code: 'COMMAND_NOT_FOUND' })
    await runtime.view.commands.execute('agentWorkspace.showCreate', { instanceId: opened.instanceId })
    expect(runtime.view.state.agents.getSnapshot().entries[opened.instanceId]!.view).toBe('create')
    await expect(
      runtime.view.commands.execute('agentWorkspace.setField', {
        instanceId: opened.instanceId,
        field: 'profileId',
        value: 'unrecognized',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(runtime.view.state.agents.getSnapshot().entries[opened.instanceId]!.draft.profileId).toBe('')
    await runtime.view.commands.execute('agentWorkspace.setField', {
      instanceId: opened.instanceId,
      field: 'profileId',
      value: 'explore',
    })
    await waitFor(() => runtime.view.state.agents.getSnapshot().catalog.status === 'ready')
    expect(runtime.view.state.agents.getSnapshot().catalog.models).toEqual([primaryModel, alternateModel])
    await runtime.view.commands.execute('agentWorkspace.setField', {
      instanceId: opened.instanceId,
      field: 'thinkingLevel',
      value: 'high',
    })
    await runtime.view.commands.execute('agentWorkspace.setField', {
      instanceId: opened.instanceId,
      field: 'modelId',
      value: alternateModel.id,
    })
    expect(runtime.view.state.agents.getSnapshot().entries[opened.instanceId]!.draft.thinkingLevel).toBe('')
    await runtime.view.commands.execute('agentWorkspace.setField', {
      instanceId: opened.instanceId,
      field: 'modelId',
      value: primaryModel.id,
    })

    for (const [field, value] of [
      ['objective', 'Review the change'],
      ['title', 'Review child'],
      ['tokenBudget', '8000'],
    ] as const)
      await runtime.view.commands.execute('agentWorkspace.setField', { instanceId: opened.instanceId, field, value })

    await expect(
      runtime.view.commands.execute('agentWorkspace.create', { instanceId: opened.instanceId }),
    ).rejects.toMatchObject({
      code: 'DISCONNECTED',
    })
    expect(runtime.view.state.agents.getSnapshot().entries[opened.instanceId]!.creation.status).toBe('unknown')
    const pendingKey = 'hbar:agent-workspace:pending-create:host:parent'
    expect(storage.values.get(pendingKey)).toMatchObject({
      version: 1,
      hostId: 'host',
      parentSessionId: 'parent',
      operationKey: createKeys[0],
      input: {
        parentSessionId: 'parent',
        objective: 'Review the change',
        profileId: 'explore',
        modelId: 'provider:model',
        title: 'Review child',
        tokenBudget: 8_000,
        approval: 'deny',
      },
    })
    await expect(
      runtime.view.commands.execute('agentWorkspace.setField', {
        instanceId: opened.instanceId,
        field: 'objective',
        value: 'Changed after loss',
      }),
    ).rejects.toMatchObject({ code: 'BUSY' })

    await runtime.view.commands.execute('agentWorkspace.create', { instanceId: opened.instanceId })
    expect(createKeys).toHaveLength(2)
    expect(createKeys[0]).toBe(createKeys[1])
    expect(createProfiles).toEqual(['explore', 'explore'])
    expect(createInputs[0]).toEqual(createInputs[1])
    expect(storage.values.has(pendingKey)).toBe(false)
    expect(runtime.view.state.agents.getSnapshot().entries[opened.instanceId]!.items[0]).toMatchObject({
      sessionId: 'child-session',
      status: 'running',
      profileId: 'explore',
    })
    expect(runtime.view.state.agents.getSnapshot().entries[opened.instanceId]).toMatchObject({
      view: 'detail',
      selectedAgentId: 'child',
    })

    await expect(
      runtime.view.commands.execute('agentWorkspace.cancel', { instanceId: opened.instanceId, agentId: 'child' }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(runtime.view.state.agents.getSnapshot().entries[opened.instanceId]!.actions.child?.status).toBe('unknown')
    await runtime.view.commands.execute('agentWorkspace.cancel', { instanceId: opened.instanceId, agentId: 'child' })
    expect(runtime.view.state.agents.getSnapshot().entries[opened.instanceId]!.items[0]?.status).toBe('cancelRequested')
    await runtime.view.commands.execute('agentWorkspace.showList', { instanceId: opened.instanceId })
    expect(runtime.view.state.agents.getSnapshot().entries[opened.instanceId]).toMatchObject({
      view: 'list',
      selectedAgentId: null,
    })
  } finally {
    runtime.dispose()
  }
})

test('agent create fails closed when recovery persistence cannot save the request', async () => {
  let createCalls = 0
  const persistence: ClientPersistencePort = {
    read: async () => null,
    write: async () => {
      throw new Error('storage unavailable')
    },
    remove: async () => {},
  }
  const runtime = createAgentWorkspaceRuntime(
    'agent-create-storage-failure',
    {
      async execute(name) {
        if (name === 'agent.list') return { items: [], nextCursor: null }
        if (name === 'agent.create') createCalls += 1
        throw new Error(`Unexpected command: ${name}`)
      },
    },
    persistence,
  )
  try {
    const opened = await openAgentCreateForm(runtime, 'Create only if recovery can be saved')
    await expect(
      runtime.view.commands.execute('agentWorkspace.create', { instanceId: opened.instanceId }),
    ).rejects.toMatchObject({ code: 'PERSISTENCE_UNAVAILABLE' })
    expect(createCalls).toBe(0)
    expect(runtime.view.state.agents.getSnapshot().entries[opened.instanceId]!.creation).toEqual({
      status: 'failed',
      error: 'PERSISTENCE_UNAVAILABLE',
    })
  } finally {
    runtime.dispose()
  }
})

test('agent create does not dispatch after close or dispose during the recovery write', async () => {
  const pendingKey = 'hbar:agent-workspace:pending-create:host:parent'
  const closeStorage = memoryPersistence()
  let closeWriteStarted: () => void = () => {}
  let finishCloseWrite: () => void = () => {}
  const closeWriteObserved = new Promise<void>((resolve) => {
    closeWriteStarted = resolve
  })
  const closeWriteGate = new Promise<void>((resolve) => {
    finishCloseWrite = resolve
  })
  const closePersistence: ClientPersistencePort = {
    ...closeStorage.persistence,
    write: async (key, value) => {
      if (key === pendingKey) {
        closeWriteStarted()
        await closeWriteGate
      }
      await closeStorage.persistence.write(key, value)
    },
  }
  let closeCreateCalls = 0
  const closeRuntime = createAgentWorkspaceRuntime(
    'agent-create-close-during-write',
    {
      async execute(name) {
        if (name === 'agent.list') return { items: [], nextCursor: null }
        if (name === 'agent.create') closeCreateCalls += 1
        throw new Error(`Unexpected command: ${name}`)
      },
    },
    closePersistence,
  )
  try {
    const opened = await openAgentCreateForm(closeRuntime, 'Do not create after close')
    const createResult = closeRuntime.view.commands
      .execute('agentWorkspace.create', { instanceId: opened.instanceId })
      .catch((reason: unknown) => reason)
    await closeWriteObserved
    await closeRuntime.view.commands.execute('app.closePanel', { instanceId: opened.instanceId })
    finishCloseWrite()
    await expect(createResult).resolves.toMatchObject({ code: 'CANCELLED' })
    expect(closeCreateCalls).toBe(0)
    expect(closeStorage.values.has(pendingKey)).toBe(false)
  } finally {
    closeRuntime.dispose()
  }

  const disposeStorage = memoryPersistence()
  let disposeWriteStarted: () => void = () => {}
  let finishDisposeWrite: () => void = () => {}
  const disposeWriteObserved = new Promise<void>((resolve) => {
    disposeWriteStarted = resolve
  })
  const disposeWriteGate = new Promise<void>((resolve) => {
    finishDisposeWrite = resolve
  })
  let disposeCleanupStarted: () => void = () => {}
  const disposeCleanupObserved = new Promise<void>((resolve) => {
    disposeCleanupStarted = resolve
  })
  const disposePersistence: ClientPersistencePort = {
    ...disposeStorage.persistence,
    write: async (key, value) => {
      if (key === pendingKey) {
        disposeWriteStarted()
        await disposeWriteGate
      }
      await disposeStorage.persistence.write(key, value)
    },
    remove: async (key) => {
      if (key === pendingKey) {
        disposeCleanupStarted()
        throw new Error('recovery cleanup unavailable')
      }
      await disposeStorage.persistence.remove(key)
    },
  }
  let disposeCreateCalls = 0
  const disposeRuntime = createAgentWorkspaceRuntime(
    'agent-create-dispose-during-write',
    {
      async execute(name) {
        if (name === 'agent.list') return { items: [], nextCursor: null }
        if (name === 'agent.create') disposeCreateCalls += 1
        throw new Error(`Unexpected command: ${name}`)
      },
    },
    disposePersistence,
  )
  let recoveredRuntime: ReturnType<typeof createAgentWorkspaceRuntime> | undefined
  try {
    const opened = await openAgentCreateForm(disposeRuntime, 'Recover after runtime disposal')
    const createResult = disposeRuntime.view.commands
      .execute('agentWorkspace.create', { instanceId: opened.instanceId })
      .catch((reason: unknown) => reason)
    await disposeWriteObserved
    disposeRuntime.dispose()
    finishDisposeWrite()
    await disposeCleanupObserved
    expect(await createResult).toBeInstanceOf(CommandError)
    expect(disposeCreateCalls).toBe(0)
    const persisted = disposeStorage.values.get(pendingKey) as { operationKey: string; input: AgentCreateInput }

    recoveredRuntime = createAgentWorkspaceRuntime(
      'agent-create-after-dispose',
      {
        async execute(name, rawInput, options?: ExecuteOptions) {
          if (name === 'agent.list') return { items: [], nextCursor: null }
          if (name !== 'agent.create') throw new Error(`Unexpected command: ${name}`)
          disposeCreateCalls += 1
          expect(agentCreateInputSchema.parse(rawInput)).toEqual(persisted.input)
          expect(options?.idempotencyKey).toBe(persisted.operationKey)
          return { ...child('running') }
        },
      },
      disposeStorage.persistence,
    )
    await recoveredRuntime.view.commands.execute('app.setSession', { sessionId: session.id })
    const recovered = await recoveredRuntime.view.commands.execute('app.openPanel', { panelId: 'agents' })
    await recoveredRuntime.view.commands.execute('agentWorkspace.refresh', { instanceId: recovered.instanceId })
    expect(recoveredRuntime.view.state.agents.getSnapshot().entries[recovered.instanceId]!.creation.status).toBe(
      'unknown',
    )
    await recoveredRuntime.view.commands.execute('agentWorkspace.create', { instanceId: recovered.instanceId })
    expect(disposeCreateCalls).toBe(1)
    expect(disposeStorage.values.has(pendingKey)).toBe(false)
  } finally {
    disposeRuntime.dispose()
    recoveredRuntime?.dispose()
  }
})

test('unknown Agent create survives panel and runtime reload and retries the exact persisted request', async () => {
  const storage = memoryPersistence()
  const calls: Array<{ input: AgentCreateInput; key: string }> = []
  let createAttempts = 0
  const agents: CommandExecutor = {
    async execute(name, rawInput, options?: ExecuteOptions) {
      if (name === 'agent.list') return { items: [], nextCursor: null }
      if (name !== 'agent.create') throw new Error(`Unsupported agent command: ${name}`)
      const input = agentCreateInputSchema.parse(rawInput)
      calls.push({ input, key: options?.idempotencyKey ?? '' })
      createAttempts += 1
      if (createAttempts === 1) throw new CommandError('DISCONNECTED', 'response lost')
      return { ...child('running'), profileId: input.profileId }
    },
  }
  const firstRuntime = createAgentWorkspaceRuntime('agent-create-before-reload', agents, storage.persistence)
  let secondRuntime: ReturnType<typeof createAgentWorkspaceRuntime> | undefined
  try {
    const firstPanel = await openAgentCreateForm(firstRuntime, 'Recover across runtime reload')
    await expect(
      firstRuntime.view.commands.execute('agentWorkspace.create', { instanceId: firstPanel.instanceId }),
    ).rejects.toMatchObject({ code: 'DISCONNECTED' })
    const persistedKey = 'hbar:agent-workspace:pending-create:host:parent'
    const persisted = storage.values.get(persistedKey) as {
      operationKey: string
      input: AgentCreateInput
    }
    await firstRuntime.view.commands.execute('app.closePanel', { instanceId: firstPanel.instanceId })
    firstRuntime.dispose()

    secondRuntime = createAgentWorkspaceRuntime('agent-create-after-reload', agents, storage.persistence)
    await secondRuntime.view.commands.execute('app.setSession', { sessionId: session.id })
    const recoveredPanel = await secondRuntime.view.commands.execute('app.openPanel', { panelId: 'agents' })
    await secondRuntime.view.commands.execute('agentWorkspace.refresh', { instanceId: recoveredPanel.instanceId })
    const recovered = secondRuntime.view.state.agents.getSnapshot().entries[recoveredPanel.instanceId]!
    expect(recovered).toMatchObject({
      view: 'create',
      creation: { status: 'unknown' },
      draft: {
        objective: 'Recover across runtime reload',
        modelId: primaryModel.id,
      },
    })
    await secondRuntime.view.commands.execute('agentWorkspace.create', { instanceId: recoveredPanel.instanceId })

    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual({ input: persisted.input, key: persisted.operationKey })
    expect(calls[0]).toEqual(calls[1])
    expect(storage.values.has(persistedKey)).toBe(false)
    expect(secondRuntime.view.state.agents.getSnapshot().entries[recoveredPanel.instanceId]).toMatchObject({
      view: 'detail',
      selectedAgentId: 'child',
      creation: { status: 'succeeded' },
    })
  } finally {
    firstRuntime.dispose()
    secondRuntime?.dispose()
  }
})

test('a stale edited Agent form is restored and refused before retrying a pending key', async () => {
  const storage = memoryPersistence()
  const calls: Array<{ input: AgentCreateInput; key: string }> = []
  let createAttempts = 0
  const agents: CommandExecutor = {
    async execute(name, rawInput, options?: ExecuteOptions) {
      if (name === 'agent.list') return { items: [], nextCursor: null }
      if (name !== 'agent.create') throw new Error(`Unsupported agent command: ${name}`)
      const input = agentCreateInputSchema.parse(rawInput)
      calls.push({ input, key: options?.idempotencyKey ?? '' })
      createAttempts += 1
      if (createAttempts === 1) throw new CommandError('DISCONNECTED', 'response lost')
      return { ...child('running'), profileId: input.profileId }
    },
  }
  const firstRuntime = createAgentWorkspaceRuntime('agent-create-original-form', agents, storage.persistence)
  const secondRuntime = createAgentWorkspaceRuntime('agent-create-stale-form', agents, storage.persistence)
  try {
    const original = await openAgentCreateForm(firstRuntime, 'Original immutable objective')
    const stale = await openAgentCreateForm(secondRuntime, 'Changed in another runtime')
    await expect(
      firstRuntime.view.commands.execute('agentWorkspace.create', { instanceId: original.instanceId }),
    ).rejects.toMatchObject({ code: 'DISCONNECTED' })

    await expect(
      secondRuntime.view.commands.execute('agentWorkspace.create', { instanceId: stale.instanceId }),
    ).rejects.toMatchObject({ code: 'BUSY' })
    expect(calls).toHaveLength(1)
    expect(secondRuntime.view.state.agents.getSnapshot().entries[stale.instanceId]).toMatchObject({
      creation: { status: 'unknown' },
      draft: { objective: 'Original immutable objective' },
    })

    await secondRuntime.view.commands.execute('agentWorkspace.create', { instanceId: stale.instanceId })
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(calls[0])
    expect(storage.values.has('hbar:agent-workspace:pending-create:host:parent')).toBe(false)
  } finally {
    firstRuntime.dispose()
    secondRuntime.dispose()
  }
})

test('same-session Agent panels cannot replay an unresolved request with another draft', async () => {
  const storage = memoryPersistence()
  const calls: Array<{ input: AgentCreateInput; key: string }> = []
  let rejectFirst: (reason: unknown) => void = () => {}
  const agents: CommandExecutor = {
    async execute(name, rawInput, options?: ExecuteOptions) {
      if (name === 'agent.list') return { items: [], nextCursor: null }
      if (name !== 'agent.create') throw new Error(`Unsupported agent command: ${name}`)
      const input = agentCreateInputSchema.parse(rawInput)
      calls.push({ input, key: options?.idempotencyKey ?? '' })
      if (calls.length === 1)
        return new Promise<AgentRecord>((_resolve, reject) => {
          rejectFirst = reject
        })
      return { ...child('running'), profileId: input.profileId }
    },
  }
  const runtime = createAgentWorkspaceRuntime('agent-create-multi-panel', agents, storage.persistence)
  try {
    const first = await openAgentCreateForm(runtime, 'Original immutable objective')
    const second = await openAgentCreateForm(runtime, 'Edited in another panel', 'agents:second')
    const firstResult = runtime.view.commands
      .execute('agentWorkspace.create', { instanceId: first.instanceId })
      .catch((reason: unknown) => reason)
    await waitFor(() => calls.length === 1)
    await runtime.view.commands.execute('agentWorkspace.refresh', { instanceId: second.instanceId })
    expect(runtime.view.state.agents.getSnapshot().entries[second.instanceId]!.creation.status).toBe('submitting')
    await expect(
      runtime.view.commands.execute('agentWorkspace.create', { instanceId: second.instanceId }),
    ).rejects.toMatchObject({ code: 'BUSY' })
    rejectFirst(new CommandError('DISCONNECTED', 'response lost'))
    await expect(firstResult).resolves.toMatchObject({ code: 'DISCONNECTED' })
    expect(runtime.view.state.agents.getSnapshot().entries[second.instanceId]!.creation.status).toBe('unknown')
    expect(runtime.view.state.agents.getSnapshot().entries[second.instanceId]!.draft.objective).toBe(
      'Original immutable objective',
    )

    await runtime.view.commands.execute('agentWorkspace.create', { instanceId: second.instanceId })
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(calls[0])
    expect(storage.values.has('hbar:agent-workspace:pending-create:host:parent')).toBe(false)
  } finally {
    runtime.dispose()
  }
})

test('agent model catalog failure is local and retry preserves the target draft', async () => {
  let reads = 0
  const runtime = createAppRuntime({
    instanceId: 'agent-model-retry',
    hostId: 'host',
    directory: {
      async execute(name: string) {
        if (name === 'session.get') return session
        if (name === 'workspace.get') return workspace
        if (name === 'session.list') return { items: [session], nextCursor: null }
        if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
        throw new Error(`Unsupported query: ${name}`)
      },
    },
    agents: {
      async execute() {
        return { items: [], nextCursor: null }
      },
    },
    models: {
      async execute(name: string) {
        if (name === 'model.list') {
          reads += 1
          if (reads === 1) throw new CommandError('DISCONNECTED', 'Temporary model catalog failure')
          return [primaryModel]
        }
        return {
          sessionId: session.id,
          status: 'configured',
          modelId: primaryModel.id,
          model: primaryModel,
          thinkingLevel: 'low',
          revisions: {},
          sources: { model: 'session', thinkingLevel: 'default' },
        }
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'agents' },
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    const panel = await runtime.view.commands.execute('app.openPanel', { panelId: 'agents' })
    await runtime.view.commands.execute('agentWorkspace.refresh', { instanceId: panel.instanceId })
    await runtime.view.commands.execute('agentWorkspace.showCreate', { instanceId: panel.instanceId })
    await runtime.view.commands.execute('agentWorkspace.setField', {
      instanceId: panel.instanceId,
      field: 'objective',
      value: 'Keep this draft',
    })
    await waitFor(() => runtime.view.state.agents.getSnapshot().catalog.status === 'error')
    expect(runtime.view.state.agents.getSnapshot().catalog.error).toBe('DISCONNECTED')
    expect(
      await runtime.view.commands.execute('agentWorkspace.refreshModels', { instanceId: panel.instanceId }),
    ).toEqual({
      status: 'ready',
      itemCount: 1,
      error: null,
    })
    expect(runtime.view.state.agents.getSnapshot().entries[panel.instanceId]!.draft.objective).toBe('Keep this draft')
    expect(reads).toBe(2)
  } finally {
    runtime.dispose()
  }
})

test('closing an Agent panel fences a late model catalog response from the next panel', async () => {
  let resolveFirst: (models: ModelDescriptor[]) => void = () => {}
  let reads = 0
  const runtime = createAppRuntime({
    instanceId: 'agent-model-late-read',
    hostId: 'host',
    directory: {
      async execute(name: string) {
        if (name === 'session.get') return session
        if (name === 'workspace.get') return workspace
        if (name === 'session.list') return { items: [session], nextCursor: null }
        if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
        throw new Error(`Unsupported query: ${name}`)
      },
    },
    agents: {
      async execute() {
        return { items: [], nextCursor: null }
      },
    },
    models: {
      async execute(name: string) {
        if (name === 'model.list') {
          reads += 1
          return reads === 1
            ? new Promise<ModelDescriptor[]>((resolve) => {
                resolveFirst = resolve
              })
            : [alternateModel]
        }
        return {
          sessionId: session.id,
          status: 'configured',
          modelId: primaryModel.id,
          model: primaryModel,
          thinkingLevel: 'low',
          revisions: {},
          sources: { model: 'session', thinkingLevel: 'default' },
        }
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'agents' },
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    const first = await runtime.view.commands.execute('app.openPanel', { panelId: 'agents' })
    await runtime.view.commands.execute('agentWorkspace.refresh', { instanceId: first.instanceId })
    await runtime.view.commands.execute('agentWorkspace.showCreate', { instanceId: first.instanceId })
    await waitFor(() => reads === 1)
    await runtime.view.commands.execute('app.closePanel', { instanceId: first.instanceId })
    expect(runtime.view.state.agents.getSnapshot().catalog.status).toBe('idle')
    const second = await runtime.view.commands.execute('app.openPanel', { panelId: 'agents' })
    await runtime.view.commands.execute('agentWorkspace.refresh', { instanceId: second.instanceId })
    await runtime.view.commands.execute('agentWorkspace.showCreate', { instanceId: second.instanceId })
    await waitFor(() => runtime.view.state.agents.getSnapshot().catalog.status === 'ready')
    resolveFirst([primaryModel])
    await Bun.sleep(0)
    expect(runtime.view.state.agents.getSnapshot().catalog.models).toEqual([alternateModel])
    expect(reads).toBe(2)
  } finally {
    runtime.dispose()
  }
})
