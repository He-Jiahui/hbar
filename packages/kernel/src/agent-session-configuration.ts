import { createHash } from 'node:crypto'
import { HbarError, approvalModeSchema, thinkingLevelSchema } from '@hbar/contracts'
import {
  agentDispatchCandidatesSchema,
  agentSessionConfigurationSchema,
  type AgentPolicySnapshot,
} from '@hbar/contracts/commands/agents'
import { sandboxProfileIdSchema } from '@hbar/contracts/sandbox'
import { encodePath } from '@hbar/schema-core'
import type { SessionService } from '@hbar/plugin-sdk'
import type { Run, ApprovalMode } from '@hbar/contracts'
import type { ModelRegistry } from '@hbar/plugin-sdk'
import { SettingsService, HBAR_SETTINGS_SCHEMA_VERSION, type SettingsSnapshot } from './settings-service'

const field = (name: string) => [{ kind: 'field' as const, name }]
const fields = ['provider.model', 'provider.thinkingLevel', 'session.approval', 'session.sandboxProfile'] as const
const policyPath = field('agent.dispatchCandidates')
function policySnapshot(
  parentSessionId: string,
  snapshot: Pick<SettingsSnapshot, 'resolution' | 'revisions'>,
): AgentPolicySnapshot {
  const report = snapshot.resolution.reports[encodePath(policyPath)]
  if (!report) throw new HbarError('CAPABILITY_UNAVAILABLE', 'Host dispatch policy is unavailable')
  const parsed = agentDispatchCandidatesSchema.safeParse(report.effectiveValue)
  if (!parsed.success) throw new HbarError('INVALID_POLICY', 'Dispatch candidates are invalid')
  return {
    parentSessionId,
    candidates: parsed.data,
    revisions: { ...snapshot.revisions },
    sourceLayer: report.sourceLayer,
    inherited: report.inherited,
  }
}

export function createAgentSessionConfiguration(options: {
  readonly settings: SettingsService
  readonly model: ModelRegistry['get']
  readonly runs: (sessionId: string) => Promise<readonly Run[]>
  readonly permission: (sessionId: string) => ApprovalMode | Promise<ApprovalMode>
}): NonNullable<SessionService['agentConfiguration']> {
  return {
    async policy(sessionId) {
      return policySnapshot(sessionId, await options.settings.get({ kind: 'session', targetId: sessionId }))
    },
    async setPolicy(input, context) {
      const scope = { kind: 'session' as const, targetId: input.parentSessionId }
      const changes =
        input.candidates === null
          ? [{ op: 'unset' as const, path: policyPath }]
          : [{ op: 'set' as const, path: policyPath, value: input.candidates }]
      const request = {
        scope,
        changes,
        schemaVersion: HBAR_SETTINGS_SCHEMA_VERSION,
        baselineRevisions: input.baselineRevisions,
      }
      const receipt = await options.settings.getReceipt(scope, context.actorId, context.idempotencyKey, request)
      if (receipt)
        return policySnapshot(input.parentSessionId, {
          resolution: receipt.resolution,
          revisions: Object.fromEntries(receipt.resolution.layers.map((layer) => [layer.id, layer.revision])),
        })
      // Bounded list, validated sequentially; no unbounded Provider work is dispatched.
      for (const candidate of agentDispatchCandidatesSchema.parse(input.candidates ?? [])) {
        const model = await options.model(candidate.modelId)
        if (!model.thinkingLevels.includes(candidate.thinkingLevel))
          throw new HbarError(
            'THINKING_LEVEL_UNSUPPORTED',
            `${candidate.thinkingLevel} is unavailable for ${candidate.modelId}`,
          )
      }
      const saved = await options.settings.apply({ ...request, ...context })
      return policySnapshot(input.parentSessionId, {
        resolution: saved.resolution,
        revisions: Object.fromEntries(saved.resolution.layers.map((layer) => [layer.id, layer.revision])),
      })
    },
    async read(sessionId, parentRunId) {
      const snapshot = await options.settings.get({ kind: 'session', targetId: sessionId })
      const value = (name: string) => snapshot.resolution.reports[encodePath(field(name))]?.effectiveValue
      const modelValue = value('provider.model')
      let modelId = typeof modelValue === 'string' ? modelValue : null
      let thinkingLevel = thinkingLevelSchema.nullable().parse(value('provider.thinkingLevel'))
      let approval = approvalModeSchema.nullable().parse(value('session.approval')) ?? await options.permission(sessionId)
      let sandboxProfileId = sandboxProfileIdSchema.parse(value('session.sandboxProfile'))
      let sandbox: Run['input']['sandbox']
      // Automated dispatch inherits its admitted parent Run, not mutable defaults.
      // Unconfigured legacy sessions can still inherit their last actual model.
      if (parentRunId || modelId === null) {
        const runs = await options.runs(sessionId)
        const run = parentRunId ? runs.find((run) => run.id === parentRunId) : runs.at(-1)
        if (parentRunId && (!run || run.sessionId !== sessionId || run.status !== 'running'))
          throw new HbarError('STALE_TARGET', 'The dispatch parent Run is no longer running')
        if (run) {
          modelId = run.modelId
          thinkingLevel = run.input.thinking ?? thinkingLevel
          if (parentRunId) {
            approval = run.input.approval ?? approval
            sandbox = run.input.sandbox
            sandboxProfileId = sandbox?.profileId ?? sandboxProfileId
          }
        }
      }
      if (modelId && thinkingLevel === null) thinkingLevel = (await options.model(modelId)).defaultThinkingLevel
      return agentSessionConfigurationSchema.parse({
        modelId,
        thinkingLevel,
        approval,
        sandboxProfileId,
        ...(approval === 'sandbox' && sandbox ? { sandbox } : {}),
      })
    },
    async initialize(sessionId, configuration, actorId) {
      const scope = { kind: 'session' as const, targetId: sessionId }
      const idempotencyKey = `agent-init:${createHash('sha256').update(sessionId).digest('hex')}`
      // Reconciliation must never reset later independent child edits.
      const receipt = await options.settings.getReceipt(scope, actorId, idempotencyKey)
      const values = [
        configuration.modelId,
        configuration.thinkingLevel,
        configuration.approval,
        configuration.sandboxProfileId,
      ]
      if (receipt) {
        if (
          fields.some(
            (name, index) => receipt.resolution.reports[encodePath(field(name))]?.effectiveValue !== values[index],
          )
        )
          throw new HbarError('IDEMPOTENCY_CONFLICT', 'Child initialization does not match its original configuration')
        return
      }
      const snapshot = await options.settings.get(scope)
      await options.settings.apply({
        scope,
        schemaVersion: HBAR_SETTINGS_SCHEMA_VERSION,
        actorId,
        idempotencyKey,
        baselineRevisions: snapshot.revisions,
        changes: fields.map((name, index) => ({ op: 'set', path: field(name), value: values[index] })),
      })
    },
  }
}
