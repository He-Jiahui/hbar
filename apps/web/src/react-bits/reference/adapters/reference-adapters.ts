import type { Approval, ArtifactRef, Bootstrap, PlanState, SessionEvent, SessionSnapshot, SessionBudget, Usage } from '@hbar/contracts'

export type ReferenceProductionContext = {
  readonly bootstrap?: Bootstrap | null
  readonly snapshot?: SessionSnapshot | null
  readonly events?: readonly SessionEvent[]
  readonly plan?: PlanState | null
  readonly budget?: SessionBudget | null
}

export type ReferenceModelOption = {
  readonly id: string
  readonly providerId: string
  readonly providerName: string
  readonly name: string
  readonly contextWindow: number
  readonly reasoning: boolean
  readonly inputPrice: number
  readonly outputPrice: number
}

export type ReferenceChatModelView = {
  readonly models: readonly ReferenceModelOption[]
  readonly selectedModelId: string | null
  readonly sessionTitle: string | null
  readonly messages: readonly { id: string; role: string; text: string; artifacts: readonly ArtifactRef[] }[]
  readonly streams: readonly { id: string; text: string; thinking: string }[]
}

export type ReferenceActivityView = {
  readonly sessionId: string | null
  readonly runs: readonly { id: string; status: string; title: string; startedAt: number | null; endedAt: number | null }[]
  readonly events: readonly { id: string; type: string; runId: string | null; time: number }[]
  readonly activeCount: number
}

export type ReferenceUsageView = {
  readonly usage: Usage
  readonly budget: null | { limit: number; usedTokens: number; remainingTokens: number; phase: string }
  readonly totalTokens: number
}

export type ReferenceApprovalView = {
  readonly approvals: readonly { id: string; tool: string; status: Approval['status']; args: Record<string, unknown> }[]
}

export type ReferencePlanView = {
  readonly sessionId: string | null
  readonly explanation: string | null
  readonly steps: readonly { label: string; status: string }[]
  readonly completed: number
}

export type ReferenceArtifactView = {
  readonly artifacts: readonly ArtifactRef[]
}

export type ReferenceShellView = {
  readonly workspaces: readonly { id: string; name: string; path: string }[]
  readonly sessions: readonly { id: string; title: string; workspaceId: string }[]
  readonly models: readonly ReferenceModelOption[]
}

export type ReferenceSettingsView = {
  readonly hasCatalog: boolean
  readonly sectionCount: number
  readonly settingCount: number
}

export type ReferenceProductionAdapter = {
  readonly id: string
  readonly description: string
  readonly adapt: (context: ReferenceProductionContext) => unknown
}

function textFromContent(content: SessionSnapshot['messages'][number]['content']): string {
  return content.map((block) => {
    if (block.type === 'text' || block.type === 'thinking' || block.type === 'tool_result') return block.text
    if (block.type === 'tool_call') return `${block.name}(${Object.keys(block.args).join(', ')})`
    return block.artifact.name
  }).join('\n')
}

function artifactsFromContent(content: SessionSnapshot['messages'][number]['content']): ArtifactRef[] {
  return content.flatMap((block) => block.type === 'image' || block.type === 'file' ? [block.artifact] : [])
}

export function adaptChatModelView(context: ReferenceProductionContext): ReferenceChatModelView {
  const models = context.bootstrap?.models.map((model) => ({ id: model.modelId, providerId: model.providerId, providerName: model.providerName, name: model.modelName, contextWindow: model.contextWindow, reasoning: model.reasoning, inputPrice: model.inputPrice, outputPrice: model.outputPrice })) ?? []
  const messages = context.snapshot?.messages.map((message) => ({ id: message.id, role: message.role, text: textFromContent(message.content), artifacts: artifactsFromContent(message.content) })) ?? []
  return { models, selectedModelId: context.snapshot?.runs.at(-1)?.modelId ?? null, sessionTitle: context.snapshot?.session.title ?? null, messages, streams: context.snapshot?.streams.map((stream) => ({ id: stream.id, text: stream.text, thinking: stream.thinking })) ?? [] }
}

export function adaptActivityView(context: ReferenceProductionContext): ReferenceActivityView {
  const runs = context.snapshot?.runs.map((run) => ({ id: run.id, status: run.status, title: run.input.text || 'Image input', startedAt: run.startedAt, endedAt: run.endedAt })) ?? []
  const events = (context.events ?? []).map((event) => ({ id: event.eventId, type: event.type, runId: event.runId, time: event.time }))
  return { sessionId: context.snapshot?.session.id ?? null, runs, events, activeCount: runs.filter((run) => ['queued', 'running', 'waiting_approval'].includes(run.status)).length }
}

export function adaptUsageView(context: ReferenceProductionContext): ReferenceUsageView {
  const usage = context.snapshot?.usage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 }
  const budget = context.budget ? { limit: context.budget.limit, usedTokens: context.budget.usedTokens, remainingTokens: context.budget.remainingTokens, phase: context.budget.phase } : null
  return { usage, budget, totalTokens: usage.input + usage.output + usage.cacheRead + usage.cacheWrite }
}

export function adaptApprovalView(context: ReferenceProductionContext): ReferenceApprovalView {
  return { approvals: context.snapshot?.approvals.map((approval) => ({ id: approval.id, tool: approval.tool, status: approval.status, args: approval.args })) ?? [] }
}

export function adaptPlanView(context: ReferenceProductionContext): ReferencePlanView {
  const plan = context.plan
  const steps = plan?.plan.map((step) => ({ label: step.step, status: step.status })) ?? []
  return { sessionId: plan?.sessionId ?? context.snapshot?.session.id ?? null, explanation: plan?.explanation ?? null, steps, completed: steps.filter((step) => step.status === 'completed').length }
}

export function adaptArtifactView(context: ReferenceProductionContext): ReferenceArtifactView {
  const artifacts = context.snapshot?.messages.flatMap((message) => artifactsFromContent(message.content)) ?? []
  const seen = new Set<string>()
  return { artifacts: artifacts.filter((artifact) => !seen.has(artifact.id) && (seen.add(artifact.id), true)) }
}

export function adaptShellView(context: ReferenceProductionContext): ReferenceShellView {
  return {
    workspaces: context.bootstrap?.workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name, path: workspace.path })) ?? [],
    sessions: context.bootstrap?.sessions.map((session) => ({ id: session.id, title: session.title, workspaceId: session.workspaceId })) ?? [],
    models: context.bootstrap?.models.map((model) => ({ id: model.modelId, providerId: model.providerId, providerName: model.providerName, name: model.modelName, contextWindow: model.contextWindow, reasoning: model.reasoning, inputPrice: model.inputPrice, outputPrice: model.outputPrice })) ?? [],
  }
}

export function adaptSettingsView(context: ReferenceProductionContext): ReferenceSettingsView {
  const catalog = context.bootstrap ? (context.bootstrap as Bootstrap & { settings?: { sections?: readonly { settings?: readonly unknown[] }[] } }).settings : undefined
  const sections = catalog?.sections ?? []
  return { hasCatalog: Boolean(catalog), sectionCount: sections.length, settingCount: sections.reduce((total, section) => total + (section.settings?.length ?? 0), 0) }
}

const adapters: Record<string, ReferenceProductionAdapter> = {
  'session-chat': { id: 'session-chat', description: 'SessionSnapshot messages and LiveStream projections for chat surfaces.', adapt: adaptChatModelView },
  'model-picker': { id: 'model-picker', description: 'Bootstrap.models projection for provider/model selection.', adapt: adaptChatModelView },
  activity: { id: 'activity', description: 'SessionSnapshot runs and SessionEvent timeline projection.', adapt: adaptActivityView },
  'session-events': { id: 'session-events', description: 'SessionEvent trace projection with stable event IDs.', adapt: adaptActivityView },
  approval: { id: 'approval', description: 'Approval projection for human-in-the-loop decisions.', adapt: adaptApprovalView },
  plan: { id: 'plan', description: 'PlanState checklist/tree projection.', adapt: adaptPlanView },
  usage: { id: 'usage', description: 'Usage and SessionBudget meter projection.', adapt: adaptUsageView },
  artifact: { id: 'artifact', description: 'ArtifactRef projection from message content.', adapt: adaptArtifactView },
  'bootstrap-shell': { id: 'bootstrap-shell', description: 'Bootstrap workspace/session/model shell projection.', adapt: adaptShellView },
  settings: { id: 'settings', description: 'Settings catalog projection when the host exposes it.', adapt: adaptSettingsView },
}

export function getReferenceProductionAdapter(adapterId: string): ReferenceProductionAdapter | undefined {
  return adapters[adapterId]
}

export function listReferenceProductionAdapters(): readonly ReferenceProductionAdapter[] {
  return Object.values(adapters)
}
