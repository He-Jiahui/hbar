import { createHash } from 'node:crypto'
import { HbarError, approvalModeSchema, thinkingLevelSchema } from '@hbar/contracts'
import { agentSessionConfigurationSchema } from '@hbar/contracts/commands/agents'
import { sandboxProfileIdSchema } from '@hbar/contracts/sandbox'
import { encodePath } from '@hbar/schema-core'
import type { SessionService } from '@hbar/plugin-sdk'
import type { Run, ApprovalMode } from '@hbar/contracts'
import type { ModelRegistry } from '@hbar/plugin-sdk'
import { SettingsService, HBAR_SETTINGS_SCHEMA_VERSION } from './settings-service'

const field = (name: string) => [{ kind: 'field' as const, name }]
const fields = ['provider.model', 'provider.thinkingLevel', 'session.approval', 'session.sandboxProfile'] as const

export function createAgentSessionConfiguration(options: {
  readonly settings: SettingsService
  readonly model: ModelRegistry['get']
  readonly runs: (sessionId: string) => Promise<readonly Run[]>
  readonly permission: () => ApprovalMode
}): NonNullable<SessionService['agentConfiguration']> {
  return {
    async read(sessionId, parentRunId) {
      const snapshot = await options.settings.get({ kind: 'session', targetId: sessionId })
      const value = (name: string) => snapshot.resolution.reports[encodePath(field(name))]?.effectiveValue
      const modelValue = value('provider.model')
      let modelId = typeof modelValue === 'string' ? modelValue : null
      let thinkingLevel = thinkingLevelSchema.nullable().parse(value('provider.thinkingLevel'))
      let approval = approvalModeSchema.nullable().parse(value('session.approval')) ?? options.permission()
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
