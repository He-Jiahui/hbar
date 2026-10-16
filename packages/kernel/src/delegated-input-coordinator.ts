import { setTimeout as delay } from 'node:timers/promises'
import {
  HbarError,
  userInputAutomaticDecisionSchema,
  type UserInputRequest,
  type UserInputResponse,
  type SessionEvent,
  type ApprovalMode,
  type UserInputAutomaticDecision,
} from '@hbar/contracts'
import type { AutonomyPolicyResolution } from '@hbar/contracts/autonomy'
import type {
  DelegatedInputRecord,
  DelegatedInputWake,
  DelegatedInputFinish,
} from '@hbar/contracts/delegated-user-input'
import type { StoragePort } from '@hbar/storage'

const recoverable = new Set([
  'DELEGATION_EXPIRED',
  'DELEGATION_TARGET_UNAVAILABLE',
  'DELEGATION_HUMAN_REQUIRED',
  'DECISION_POLICY_CHANGED',
  'FORBIDDEN',
  'NOT_FOUND',
  'DELEGATION_CYCLE',
  'DELEGATION_CAPACITY',
  'DELEGATION_POLICY_INVALID',
  'DECISION_CONFLICT',
  'PLAN_EXIT_SETTLED',
  'PLAN_EXIT_UNAVAILABLE',
])
const identity = (value: DelegatedInputRecord) => ({ sessionId: value.sessionId, requestId: value.requestId })
const mutation = (value: DelegatedInputRecord) => ({
  ...identity(value),
  delegationId: value.delegationId,
  expectedRevision: value.revision,
})

/** One bounded original deadline; human and cancellation remain canonical winners throughout the wait. */
export async function coordinateDelegatedInput(
  storage: StoragePort,
  input: {
    request: UserInputRequest
    kind?: 'approval' | 'plan_exit'
    policy: AutonomyPolicyResolution
    revision: number
    signal: AbortSignal
    pending(): boolean
    permission(sessionId: string): Promise<ApprovalMode>
    wake(value: DelegatedInputWake, signal: AbortSignal): Promise<void>
    publish(event: SessionEvent): void
    settle(response: UserInputResponse, error: undefined, evidence: UserInputAutomaticDecision): Promise<boolean>
    waiting(reason: string): Promise<void>
  },
): Promise<void> {
  const { request, policy, signal } = input
  const ineligible = request.questions.find((question) => question.isSecret || question.purpose !== 'decision')
  if (ineligible) {
    await input.waiting(
      ineligible.isSecret ? 'secret' : ineligible.purpose === 'authorization' ? 'authorization' : 'fact',
    )
    return
  }
  const source = { sessionId: request.sessionId, requestId: request.requestId }
  let state: DelegatedInputRecord | null = null
  let woke = false
  async function human(reason: string): Promise<void> {
    if (!input.pending()) return
    if (state) state = (await storage.call('delegatedInputRead', source)) ?? state
    if (state && ['pending', 'delivered', 'answered'].includes(state.status)) {
      const finishReason: DelegatedInputFinish['reason'] =
        reason === 'DELEGATION_EXPIRED'
          ? 'timeout'
          : reason === 'DECISION_POLICY_CHANGED'
            ? 'policy_changed'
            : 'target_unavailable'
      const value = await storage
        .call('delegatedInputFinish', { ...mutation(state), reason: finishReason })
        .catch(async (error: unknown) => {
          const known = await storage.call('delegatedInputRead', source)
          if (!known || ['pending', 'delivered', 'answered'].includes(known.status)) throw error
          return { state: known, events: [] }
        })
      state = value.state
      for (const event of value.events) input.publish(event)
    }
    if (input.pending()) await input.waiting(reason)
  }
  try {
    const accepted = await storage
      .call('delegatedInputAccept', {
        ...source,
        kind: input.kind ?? 'questionnaire',
        expectedQuestionRevision: input.revision,
        policy,
      })
      .catch(async (error: unknown) => {
        const known = await storage.call('delegatedInputRead', source)
        if (
          !known ||
          (known.approval?.kind ?? 'questionnaire') !== (input.kind ?? 'questionnaire') ||
          known.questionRevision !== input.revision ||
          JSON.stringify(known.policy) !== JSON.stringify(policy)
        )
          throw error
        return { state: known, created: false, events: [] }
      })
    state = accepted.state
    for (const event of accepted.events) input.publish(event)
    while (input.pending()) {
      signal.throwIfAborted()
      if (Date.now() >= state.expiresAt) {
        await human('DELEGATION_EXPIRED')
        return
      }
      if (state.status === 'answered' && state.reply?.kind === 'answered' && state.targetRunId) {
        const evidence = userInputAutomaticDecisionSchema.parse({
          version: 1,
          source: 'delegate',
          request,
          response: state.reply.response,
          policy,
          delegation: {
            delegationId: state.delegationId,
            targetSessionId: state.targetSessionId,
            targetRunId: state.targetRunId,
            replyRevision: state.revision,
          },
        })
        await input.settle(state.reply.response, undefined, evidence)
        return
      }
      if (['human', 'cancelled', 'closed'].includes(state.status)) {
        await human(state.reason ?? 'target_unavailable')
        return
      }
      try {
        const delivered = await storage.call('delegatedInputDeliver', {
          ...mutation(state),
          targetPermission: await input.permission(state.targetSessionId),
        })
        state = delivered.state
        for (const event of delivered.events) input.publish(event)
        if (!woke && state.delivery === 'dedicated' && state.targetRunId) {
          await input.wake(
            {
              ...source,
              delegationId: state.delegationId,
              runId: request.runId,
              targetSessionId: state.targetSessionId,
              targetRunId: state.targetRunId,
            },
            signal,
          )
          woke = true
        }
      } catch (error) {
        if (error instanceof HbarError && error.code === 'DECISION_CONFLICT') {
          const latest = await storage.call('delegatedInputRead', source)
          if (latest && latest.delegationId === state.delegationId && latest.revision > state.revision) {
            state = latest
            continue
          }
        }
        if (!(error instanceof HbarError) || error.code !== 'DELEGATION_TARGET_BUSY') throw error
      }
      await delay(Math.min(250, Math.max(1, state.expiresAt - Date.now())), undefined, { signal })
      const next = await storage.call('delegatedInputRead', source)
      if (!next) throw new HbarError('NOT_FOUND', 'The original delegation is unavailable')
      state = next
    }
  } catch (error) {
    if (!input.pending()) return
    if (!(error instanceof HbarError) || !recoverable.has(error.code)) throw error
    await human(error.code)
  }
}
