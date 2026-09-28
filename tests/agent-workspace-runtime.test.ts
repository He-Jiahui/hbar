import { expect, test } from 'bun:test'
import { CommandError, type ExecuteOptions } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import { agentCreateInputSchema, type AgentRecord } from '@hbar/contracts/commands/agents'
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

test('agent workspace owns paged drafts and retries unknown create and cancel commands safely', async () => {
  const createKeys: string[] = []
  const createProfiles: Array<string | undefined> = []
  let createAttempts = 0
  let cancelAttempts = 0
  let records: AgentRecord[] = []
  const runtime = createAppRuntime({
    instanceId: 'agent-workspace',
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
    agents: {
      async execute(name: string, input: unknown, options?: ExecuteOptions) {
        if (name === 'agent.list') return { items: records, nextCursor: null }
        if (name === 'agent.create') {
          const createInput = agentCreateInputSchema.parse(input)
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
    surfaces: { canRender: (panelId) => panelId === 'agents' },
  })
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
