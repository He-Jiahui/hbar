import { expect, test } from 'bun:test'
import { CommandError, type ExecuteOptions } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import type { AgentRecord } from '@hbar/contracts/commands/agents'

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
      async execute() {
        return {
          sessionId: session.id,
          status: 'configured',
          modelId: 'provider:model',
          model: null,
          thinkingLevel: null,
          revisions: {},
          sources: { model: 'session', thinkingLevel: 'default' },
        }
      },
    },
    agents: {
      async execute(name: string, _input: unknown, options?: ExecuteOptions) {
        if (name === 'agent.list') return { items: records, nextCursor: null }
        if (name === 'agent.create') {
          createKeys.push(options?.idempotencyKey ?? '')
          createAttempts += 1
          if (createAttempts === 1) throw new CommandError('DISCONNECTED', 'response lost')
          records = [child('running')]
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
    expect(runtime.view.state.agents.getSnapshot().entries[opened.instanceId]!.items[0]).toMatchObject({
      sessionId: 'child-session',
      status: 'running',
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
