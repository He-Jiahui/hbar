import { createRoot } from 'react-dom/client'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { AgentPolicyEditor, HbarRuntimeProvider } from '@hbar/app-react'
import {
  agentPolicySnapshotSchema,
  agentPolicySetInputSchema,
  agentDispatchCandidatesSchema,
  type AgentPolicySnapshot,
} from '@hbar/contracts/commands/agents'
import { modelDescriptorSchema } from '@hbar/contracts/commands/models'
import { LumenFrame, LumenProvider, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

export interface AgentPolicyFixtureInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly suffix: string
  readonly count: number
  readonly failure: 'none' | 'unknown' | 'invalid' | 'duplicate'
}
declare global {
  interface Window {
    mountAgentPolicy(input: AgentPolicyFixtureInput): Promise<void>
    releaseAgentPolicy(): void
    agentPolicyAdd(): Promise<string | null>
    agentPolicySnapshot(): {
      readonly rows: readonly { readonly id: string; readonly weight: string }[]
      readonly writeKeys: readonly string[]
      readonly targets: readonly string[]
      readonly writes: number
    }
    agentPolicyBoundaryAccepted(count: number): boolean
  }
}
function candidates(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    difficulty: 'simple',
    modelId: `original-model-${index}`,
    thinkingLevel: 'low',
    weight: 100,
  }))
}
window.agentPolicyBoundaryAccepted = (count) => agentDispatchCandidatesSchema.safeParse(candidates(count)).success
window.mountAgentPolicy = async (input) => {
  const container = document.getElementById('agent-policy-fixture')
  if (!container) throw new Error('Missing owned Agent policy root')
  const workspace = { id: 'original-workspace', path: 'D:/owned-policy', name: 'Owned policy', createdAt: 1 }
  const session = {
    id: 'original-parent',
    workspaceId: workspace.id,
    title: 'Original parent',
    parentId: null,
    archived: false,
    createdAt: 1,
    updatedAt: 1,
    seq: 0,
  }
  let snapshot: AgentPolicySnapshot = agentPolicySnapshotSchema.parse({
    parentSessionId: session.id,
    candidates: candidates(input.count),
    revisions: { session: 4 },
    sourceLayer: 'settings:session:original-parent',
    inherited: false,
  })
  const writeKeys: string[] = []
  const targets: string[] = []
  const receipts = new Map<string, AgentPolicySnapshot>()
  const directory: CommandExecutor = {
    async execute(name) {
      if (name === 'workspace.get') return workspace
      if (name === 'session.get') return session
      if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
      if (name === 'session.list') return { items: [session], nextCursor: null }
      throw new Error(`Unexpected owned directory query ${name}`)
    },
  }
  const agents: CommandExecutor = {
    async execute(name, value, options) {
      if (name === 'agent.policy.get') return snapshot
      if (name !== 'agent.policy.set') throw new Error(`Unexpected owned Agent query ${name}`)
      const parsed = agentPolicySetInputSchema.parse(value)
      const key = options?.idempotencyKey
      if (!key) throw new Error('Missing owned policy save key')
      writeKeys.push(key)
      targets.push(parsed.parentSessionId)
      const previous = receipts.get(key)
      if (previous) return previous
      snapshot = agentPolicySnapshotSchema.parse({
        ...snapshot,
        candidates: parsed.candidates ?? [],
        revisions: { session: 5 },
        inherited: parsed.candidates === null,
      })
      receipts.set(key, snapshot)
      if (input.failure === 'unknown' && writeKeys.length === 1)
        throw new CommandError('DISCONNECTED', 'Owned lost policy acknowledgement')
      return snapshot
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'owned-agent-policy',
    hostId: 'host',
    directory,
    agents,
    surfaces: { canRender: () => true },
  })
  const root = createRoot(container)
  window.releaseAgentPolicy = () => {
    root.unmount()
    runtime.dispose()
  }
  await runtime.ready
  await runtime.view.commands.execute('app.setSession', { workspaceId: workspace.id, sessionId: session.id })
  const panel = await runtime.view.commands.execute('app.openPanel', { panelId: 'agents' })
  const target = { instanceId: panel.instanceId, parentSessionId: session.id }
  await runtime.view.commands.execute('agentPolicy.load', target)
  if (input.failure === 'duplicate') {
    const row = runtime.view.state.agentPolicies.getSnapshot().entries[session.id]?.rows[1]
    if (!row) throw new Error('Missing original duplicate-candidate target')
    await runtime.view.commands.execute('agentPolicy.change', {
      ...target,
      rowId: row.id,
      field: 'modelId',
      value: 'original-model-0',
    })
  }
  window.agentPolicyAdd = async () => {
    try {
      await runtime.view.commands.execute('agentPolicy.add', target)
      return null
    } catch (error) {
      return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'UNEXPECTED'
    }
  }
  window.agentPolicySnapshot = () => ({
    rows: runtime.view.state.agentPolicies.getSnapshot().entries[session.id]?.rows ?? [],
    writeKeys,
    targets,
    writes: receipts.size,
  })
  const catalog = {
    status: 'ready' as const,
    error: null,
    models: Array.from({ length: 32 }, (_, index) =>
      modelDescriptorSchema.parse({
        id: `original-model-${index}`,
        providerId: 'owned-provider',
        providerName: 'Owned models',
        modelId: `original-${index}`,
        modelName: `Original model ${index} — 原始模型完整名称 `.repeat(3),
        contextWindow: 128000,
        maxOutput: 8192,
        imageInput: false,
        reasoning: true,
        thinkingLevels: ['low', 'high'],
        defaultThinkingLevel: 'low',
        hasKey: false,
      }),
    ),
  }
  const copy = getShellCopy(input.locale).agents
  const labels = {
    ...copy.policy,
    title: copy.policy.title + input.suffix,
    model: copy.policy.model + input.suffix,
    difficulty: copy.policy.difficulty + input.suffix,
    thinking: copy.policy.thinking + input.suffix,
    weight: copy.policy.weight + input.suffix,
    add: copy.policy.add + input.suffix,
    save: copy.policy.save + input.suffix,
    remove: (index: number) => copy.policy.remove(index) + input.suffix,
  }
  root.render(
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}>
      <LumenFrame className="agent-policy-fixture-pane">
        <HbarRuntimeProvider view={runtime.view}>
          <AgentPolicyEditor
            {...target}
            labels={labels}
            modelLabels={copy.modelPicker}
            catalog={catalog}
            connected
            refreshModels={() => {}}
          />
        </HbarRuntimeProvider>
      </LumenFrame>
    </LumenProvider>,
  )
}
