import { createRoot } from 'react-dom/client'
import { createAppRuntime, type ClientJsonValue } from '@hbar/app-runtime'
import { CommandError, type CommandExecutor, type ExecuteOptions } from '@hbar/commands'
import {
  agentCommands,
  agentCreateInputSchema,
  agentRecordSchema,
  type AgentRecord,
} from '@hbar/contracts/commands/agents'
import { modelDescriptorSchema } from '@hbar/contracts/commands/models'
import { HbarRuntimeProvider, HbarAgentWorkspace } from '@hbar/app-react'
import { LumenProvider, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

export interface AgentWorkspaceContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly suffix: string
  readonly count: number
  readonly state:
    | 'list'
    | 'create'
    | 'create-unknown'
    | 'detail'
    | 'cancel-error'
    | 'cancel-unknown'
    | 'read-error'
    | 'offline'
    | 'duplicate-page'
}
declare global {
  interface Window {
    mountAgentWorkspaceContent(input: AgentWorkspaceContentInput): Promise<void>
    releaseAgentWorkspaceContent(): void
    repairAgentWorkspaceContent(): void
    reverseAgentWorkspaceContent(): Promise<void>
    removeSelectedAgentWorkspaceContent(): Promise<void>
    agentWorkspaceContentState(): {
      readonly calls: readonly {
        readonly name: string
        readonly input: unknown
        readonly operationKey: string | null
      }[]
      readonly entry: unknown
    }
    agentWorkspaceContentBounds(): Readonly<Record<string, boolean>>
  }
}
window.mountAgentWorkspaceContent = async (input) => {
  const element = document.getElementById('agent-workspace-content-fixture')
  if (!element) throw new Error('Missing Agent workspace content root')
  const workspace = {
    id: 'owned-workspace',
    path: 'D:/owned-workspace',
    name: '原始工作区 Original workspace',
    createdAt: 1,
  }
  const parent = {
    id: 'original-parent',
    workspaceId: workspace.id,
    title: '原始父会话 Original parent',
    archived: false,
    parentId: null,
    createdAt: 2,
    updatedAt: 3,
    seq: 4,
  }
  const model = modelDescriptorSchema.parse({
    id: 'original-provider:original-model',
    providerId: 'original-provider',
    providerName: '原始供应商 Original provider',
    modelId: 'original-model',
    modelName: '完整原始模型名称 Complete original model name '.repeat(8).slice(0, 160),
    contextWindow: 128000,
    maxOutput: 8192,
    imageInput: false,
    reasoning: true,
    thinkingLevels: ['low', 'high'],
    defaultThinkingLevel: 'low',
    hasKey: true,
  })
  const objective = (index: number) => `原始任务 ${index} Complete original Agent objective `.repeat(7)
  let records = Array.from({ length: input.count }, (_, index) =>
    agentRecordSchema.parse({
      agentId: `original-agent-${index}`,
      parentSessionId: parent.id,
      sessionId: `original-child-${index}`,
      runId: `original-run-${index}`,
      requestId: `original-request-${index}`,
      objective: objective(index),
      modelId: model.id,
      tokenBudget: 12000,
      status: 'running',
      error: null,
      createdAt: 100 + index,
      updatedAt: 200 + index,
    }),
  )
  let failed = true
  const calls: { name: string; input: unknown; operationKey: string | null }[] = []
  const created = new Map<string, AgentRecord>()
  const agents: CommandExecutor = {
    async execute(name, value, options?: ExecuteOptions) {
      const operationKey = options?.idempotencyKey ?? null
      calls.push({ name, input: value, operationKey })
      if (name === 'agent.list') {
        const target = agentCommands[name].input.parse(value)
        if (target.parentSessionId !== parent.id) throw new Error('A foreign parent list was read')
        if (input.state === 'read-error' && failed) throw new CommandError('DISCONNECTED', 'Owned list read failed')
        const offset = target.after ? Number(target.after) : 0
        const items = records.slice(offset, offset + target.limit)
        if (input.state === 'duplicate-page' && offset > 0 && records[0]) items.unshift(records[0])
        return agentCommands[name].output.parse({
          items,
          nextCursor: offset + target.limit < records.length ? String(offset + target.limit) : null,
        })
      }
      if (name === 'agent.create') {
        const target = agentCreateInputSchema.parse(value)
        if (target.parentSessionId !== parent.id) throw new Error('A foreign parent was mutated')
        if (!operationKey) throw new Error('Missing owned create operation key')
        const original = created.get(operationKey)
        if (original) return original
        const record = agentRecordSchema.parse({
          agentId: 'original-created-agent',
          parentSessionId: target.parentSessionId,
          sessionId: 'original-created-child',
          runId: 'original-created-run',
          requestId: operationKey,
          objective: target.objective,
          modelId: target.modelId ?? model.id,
          tokenBudget: target.tokenBudget ?? null,
          status: 'running',
          error: null,
          createdAt: 1000,
          updatedAt: 1001,
        })
        created.set(operationKey, record)
        records.unshift(record)
        if (input.state === 'create-unknown' && failed)
          throw new CommandError('RESULT_UNKNOWN', 'Owned create reply lost')
        return record
      }
      if (name === 'agent.cancel') {
        const target = agentCommands[name].input.parse(value)
        const record = records.find((item) => item.agentId === target.agentId)
        if (!record) throw new Error('A foreign Agent was cancelled')
        if (input.state === 'cancel-error' && failed) throw new CommandError('AGENT_NOT_FOUND', 'Owned cancel rejected')
        const cancelled = agentRecordSchema.parse({ ...record, status: 'cancelled', updatedAt: record.updatedAt + 1 })
        records = records.map((item) => (item.agentId === target.agentId ? cancelled : item))
        if (input.state === 'cancel-unknown' && failed)
          throw new CommandError('RESULT_UNKNOWN', 'Owned cancel reply lost')
        return cancelled
      }
      throw new Error(`Unexpected Agent content query ${name}`)
    },
  }
  const values = new Map<string, ClientJsonValue>()
  const runtime = createAppRuntime({
    instanceId: 'owned-agent-content',
    hostId: 'owned-host',
    directory: {
      async execute(name) {
        if (name === 'session.get') return parent
        if (name === 'workspace.get') return workspace
        if (name === 'session.list') return { items: [parent], nextCursor: null }
        if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
        throw new Error(`Unexpected owned directory query ${name}`)
      },
    },
    agents,
    models: {
      async execute(name) {
        if (name === 'model.list') return [model]
        return {
          sessionId: parent.id,
          status: 'configured',
          modelId: model.id,
          model,
          thinkingLevel: 'low',
          revisions: {},
          sources: { model: 'session', thinkingLevel: 'default' },
        }
      },
    },
    persistence: {
      read: async (key) => values.get(key) ?? null,
      write: async (key, value) => {
        values.set(key, value)
      },
      remove: async (key) => {
        values.delete(key)
      },
    },
    surfaces: { canRender: () => true },
  })
  const root = createRoot(element)
  window.releaseAgentWorkspaceContent = () => {
    root.unmount()
    runtime.dispose()
  }
  await runtime.ready
  await runtime.view.commands.execute('app.setSession', { sessionId: parent.id })
  const panel = await runtime.view.commands.execute('app.openPanel', { panelId: 'agents' })
  const refresh = () => runtime.view.commands.execute('agentWorkspace.refresh', { instanceId: panel.instanceId })
  try {
    await refresh()
  } catch (reason) {
    if (input.state !== 'read-error') throw reason
  }
  if (input.state === 'create' || input.state === 'create-unknown') {
    await runtime.view.commands.execute('agentWorkspace.showCreate', { instanceId: panel.instanceId })
    await runtime.view.commands.execute('agentWorkspace.refreshModels', { instanceId: panel.instanceId })
  } else if (
    (input.state === 'detail' || input.state === 'cancel-error' || input.state === 'cancel-unknown') &&
    records[0]
  ) {
    await runtime.view.commands.execute('agentWorkspace.showAgent', {
      instanceId: panel.instanceId,
      agentId: records[0].agentId,
    })
  }
  const base = getShellCopy(input.locale).agents
  const labels = {
    ...base,
    title: base.title + input.suffix,
    description: base.description + input.suffix,
    createTitle: base.createTitle + input.suffix,
    createScope: base.createScope + input.suffix,
    detailTitle: base.detailTitle + input.suffix,
    objective: base.objective + input.suffix,
    childTitle: base.childTitle + input.suffix,
    profile: base.profile + input.suffix,
    selectionMode: base.selectionMode + input.suffix,
    model: base.model + input.suffix,
    tokenBudget: base.tokenBudget + input.suffix,
    thinkingLevel: base.thinkingLevel + input.suffix,
    approval: base.approval + input.suffix,
    sandboxProfile: base.sandboxProfile + input.suffix,
    loadMore: base.loadMore + input.suffix,
    create: base.create + input.suffix,
    retryCreate: base.retryCreate + input.suffix,
    configureChild: base.configureChild + input.suffix,
    openSession: base.openSession + input.suffix,
    cancel: base.cancel + input.suffix,
    retryCancel: base.retryCancel + input.suffix,
    status: (status: AgentRecord['status']) => base.status(status) + input.suffix,
  }
  root.render(
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}>
      <HbarRuntimeProvider view={runtime.view}>
        <HbarAgentWorkspace labels={labels} instanceId={panel.instanceId} connected={input.state !== 'offline'} />
      </HbarRuntimeProvider>
    </LumenProvider>,
  )
  window.repairAgentWorkspaceContent = () => {
    failed = false
  }
  window.reverseAgentWorkspaceContent = async () => {
    records = [...records].reverse()
    await refresh()
  }
  window.removeSelectedAgentWorkspaceContent = async () => {
    const selected = runtime.view.state.agents.getSnapshot().entries[panel.instanceId]?.selectedAgentId
    records = records.filter((record) => record.agentId !== selected)
    await refresh()
  }
  window.agentWorkspaceContentState = () => ({
    calls,
    entry: runtime.view.state.agents.getSnapshot().entries[panel.instanceId],
  })
  window.agentWorkspaceContentBounds = () => {
    const original = agentRecordSchema.parse({
      agentId: 'bound-agent',
      parentSessionId: parent.id,
      sessionId: 'bound-child',
      runId: null,
      requestId: 'bound-request',
      objective: 'a'.repeat(4000),
      modelId: model.id,
      tokenBudget: 1,
      status: 'running',
      error: null,
      createdAt: 1,
      updatedAt: 2,
    })
    return {
      objective4000: agentRecordSchema.safeParse(original).success,
      objective4001: agentRecordSchema.safeParse({ ...original, objective: 'a'.repeat(4001) }).success,
      page100: agentCommands['agent.list'].output.safeParse({
        items: Array.from({ length: 100 }, (_, index) => ({ ...original, agentId: `bound-${index}` })),
        nextCursor: null,
      }).success,
      page101: agentCommands['agent.list'].output.safeParse({
        items: Array.from({ length: 101 }, (_, index) => ({ ...original, agentId: `bound-${index}` })),
        nextCursor: null,
      }).success,
    }
  }
}
