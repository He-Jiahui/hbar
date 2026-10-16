import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { Database } from 'bun:sqlite'
import { HbarError, type Run, type SessionEvent, type ApprovalMode } from '@hbar/contracts'
import type { AutonomyPolicyResolution } from '@hbar/contracts/autonomy'
import {
  DELEGATED_INPUT_MAX_PENDING,
  DELEGATED_INPUT_MAX_STATE_BYTES,
  delegatedInputIdentitySchema,
  delegatedInputAcceptSchema,
  delegatedInputRecordSchema,
  delegatedInputBindSchema,
  delegatedInputCompleteSchema,
  delegatedInputFinishSchema,
  delegatedInputInboxSchema,
  delegatedInputDeliverSchema,
  delegatedInputRunSchema,
  type DelegatedInputIdentity,
  type DelegatedInputAccept,
  type DelegatedInputRecord,
  type DelegatedInputBind,
  type DelegatedInputComplete,
  type DelegatedInputFinish,
  type DelegatedInputInbox,
  type DelegatedInputDeliver,
  type DelegatedInputRun,
} from '@hbar/contracts/delegated-user-input'
import type { UserInputState, UserInputSettlement } from '@hbar/contracts/user-input-state'
import type { ExecutionPrincipal } from '@hbar/contracts/execution-principal'

type Append = (sessionId: string, type: string, data: unknown, runId?: string) => SessionEvent
const keyOf = (input: DelegatedInputIdentity) =>
  'decision.delegation.' + createHash('sha256').update(input.requestId).digest('hex')
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const identityOf = (value: DelegatedInputIdentity): DelegatedInputIdentity => ({
  sessionId: value.sessionId,
  requestId: value.requestId,
})
const open = (state: DelegatedInputRecord) => ['pending', 'delivered', 'answered'].includes(state.status)
const noLongerCurrent = (error: unknown) =>
  error instanceof HbarError &&
  [
    'DELEGATION_EXPIRED',
    'DECISION_CONFLICT',
    'USER_CANCELLED',
    'FORBIDDEN',
    'DELEGATION_TARGET_UNAVAILABLE',
    'DECISION_POLICY_CHANGED',
    'NOT_FOUND',
  ].includes(error.code)
const edgeSchema = delegatedInputIdentitySchema.extend({
  delegationId: z.string(),
  targetSessionId: z.string(),
  expiresAt: z.number(),
})
const indexSchema = z.strictObject({
  version: z.literal(1),
  items: z.array(edgeSchema).max(DELEGATED_INPUT_MAX_PENDING),
})

/** Event-backed bounded graph and receipts. The existing journal remains the canonical durable state. */
export function createDelegatedUserInputStorage(
  db: Database,
  append: Append,
  ports: {
    question(identity: DelegatedInputIdentity): UserInputState | null
    run(runId: string): Run
    principal(runId: string): ExecutionPrincipal | null
    authorize(actorId: string, sessionIds: readonly string[]): boolean
    available(sessionId: string): boolean
    exists(sessionId: string): boolean
    delivery?: {
      plan(
        state: DelegatedInputRecord,
        permission: ApprovalMode,
      ): { kind: 'guidance' | 'dedicated'; targetRunId: string; publish(): SessionEvent[] }
    }
  },
) {
  const latest = db.query<{ data: string }, [string, string]>(
    'SELECT data FROM events WHERE sessionId=? AND type=? ORDER BY seq DESC LIMIT 1',
  )
  const cancelled = db.query("SELECT 1 FROM events WHERE runId=? AND type='run.cancelRequested' LIMIT 1")
  function read(raw: DelegatedInputIdentity): DelegatedInputRecord | null {
    const identity = delegatedInputIdentitySchema.parse(raw)
    const row = latest.get(identity.sessionId, keyOf(identity))
    if (!row) return null
    const value = delegatedInputRecordSchema.parse(JSON.parse(row.data) as unknown)
    if (value.sessionId !== identity.sessionId || value.requestId !== identity.requestId)
      throw new HbarError('SESSION_LOG_CORRUPTED', 'Delegated decision differs from its canonical identity')
    return value
  }
  function index(sessionId: string, direction: 'inbox' | 'outbox') {
    const row = latest.get(sessionId, `decision.delegation.${direction}`)
    return row ? indexSchema.parse(JSON.parse(row.data) as unknown).items : []
  }
  function retained(sessionId: string, direction: 'inbox' | 'outbox') {
    const now = Date.now()
    return index(sessionId, direction).filter((item) => {
      if (item.expiresAt <= now) return false
      const state = read(identityOf(item))
      return state !== null && state.delegationId === item.delegationId && open(state)
    })
  }
  function prepareSave(state: DelegatedInputRecord): () => SessionEvent[] {
    const value = delegatedInputRecordSchema.parse(state)
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > DELEGATED_INPUT_MAX_STATE_BYTES)
      throw new HbarError('DELEGATION_CAPACITY', 'The delegated decision exceeds its durable byte capacity')
    const prior = read(identityOf(value))
    const staged: Array<{ sessionId: string; type: string; data: z.output<typeof indexSchema> }> = []
    for (const [sessionId, direction] of [
      [value.sessionId, 'outbox'],
      [value.targetSessionId, 'inbox'],
    ] as const) {
      if (direction === 'inbox' && !ports.exists(sessionId)) continue
      const items = retained(sessionId, direction).filter((item) => item.delegationId !== value.delegationId)
      // Preserve an old live edge until the final state record is durable. Orphan staging entries are ignored on replay.
      if ((open(value) || (prior && open(prior))) && value.expiresAt > Date.now())
        items.push({
          sessionId: value.sessionId,
          requestId: value.requestId,
          delegationId: value.delegationId,
          targetSessionId: value.targetSessionId,
          expiresAt: value.expiresAt,
        })
      staged.push({
        sessionId,
        type: `decision.delegation.${direction}`,
        data: indexSchema.parse({ version: 1, items }),
      })
    }
    // Each append fsyncs its own canonical Session log; this final record is the publication point across those logs.
    return () => {
      const events = staged.map((item) => append(item.sessionId, item.type, item.data))
      events.push(append(value.sessionId, keyOf(value), value, value.sourceRunId))
      return events
    }
  }
  const save = (state: DelegatedInputRecord) => prepareSave(state)()
  function revisions(policy: AutonomyPolicyResolution): void {
    if (
      policy.policy.mode !== 'delegate' ||
      policy.source === 'default' ||
      Object.keys(policy.revisions).length < 1 ||
      Object.keys(policy.revisions).length > 16
    )
      throw new HbarError('DELEGATION_POLICY_INVALID', 'Delegation requires its captured explicit policy revisions')
    for (const [id, expected] of Object.entries(policy.revisions)) {
      const saved = db.query<{ revision: number }, [string]>('SELECT revision FROM settings_layers WHERE id=?').get(id)
      if ((saved?.revision ?? 0) !== expected)
        throw new HbarError('DECISION_POLICY_CHANGED', 'The delegation policy has changed')
    }
  }
  function current(state: DelegatedInputRecord): UserInputState {
    if (Date.now() >= state.expiresAt) throw new HbarError('DELEGATION_EXPIRED', 'The original delegation has expired')
    const question = ports.question(identityOf(state))
    if (
      !question ||
      question.settlement ||
      question.revision !== state.questionRevision ||
      !same(question.request, state.request)
    )
      throw new HbarError('DECISION_CONFLICT', 'The source question has already changed or been handled')
    const run = ports.run(state.sourceRunId)
    if (
      run.sessionId !== state.sessionId ||
      !['running', 'waiting_approval'].includes(run.status) ||
      cancelled.get(run.id)
    )
      throw new HbarError('USER_CANCELLED', 'The source Run no longer accepts delegated decisions')
    const principal = ports.principal(run.id)
    if (
      !principal ||
      principal.actorId !== state.sourceActorId ||
      !ports.authorize(principal.actorId, [state.sessionId, state.targetSessionId, principal.originSessionId])
    )
      throw new HbarError('FORBIDDEN', 'The original device no longer has access to both Sessions')
    if (!ports.available(state.sessionId) || !ports.available(state.targetSessionId))
      throw new HbarError('DELEGATION_TARGET_UNAVAILABLE', 'The target Session is unavailable')
    if (!same(question.policy, state.policy))
      throw new HbarError('DECISION_POLICY_CHANGED', 'The source question has another policy')
    revisions(state.policy)
    return question
  }
  function mutation(raw: DelegatedInputIdentity & { delegationId: string; expectedRevision: number }) {
    const state = read(identityOf(raw))
    if (!state || state.delegationId !== raw.delegationId)
      throw new HbarError('NOT_FOUND', 'The original delegated decision is unavailable')
    if (state.revision !== raw.expectedRevision)
      throw new HbarError('DECISION_CONFLICT', 'The delegated decision has changed')
    return state
  }
  function target(state: DelegatedInputRecord, sessionId: string, runId: string, queued = false): string {
    const run = ports.run(runId)
    if (
      sessionId !== state.targetSessionId ||
      run.sessionId !== sessionId ||
      !['running', 'waiting_approval', ...(queued ? ['queued'] : [])].includes(run.status) ||
      cancelled.get(runId)
    )
      throw new HbarError('DELEGATION_TARGET_UNAVAILABLE', 'The original target Run is no longer active')
    const principal = ports.principal(runId)
    if (
      !principal ||
      !ports.authorize(principal.actorId, [state.sessionId, state.targetSessionId, principal.originSessionId])
    )
      throw new HbarError('FORBIDDEN', 'The target Run is not authorized to inspect both Sessions')
    return principal.actorId
  }
  function cycle(sourceId: string, targetId: string): void {
    const queue = [targetId],
      visited = new Set<string>()
    while (queue.length) {
      const id = queue.shift()
      if (id === undefined) break
      if (id === sourceId) throw new HbarError('DELEGATION_CYCLE', 'This decision would create a waiting cycle')
      if (visited.has(id)) continue
      if (visited.size >= DELEGATED_INPUT_MAX_PENDING)
        throw new HbarError('DELEGATION_CAPACITY', 'The delegation graph exceeds its traversal capacity')
      visited.add(id)
      for (const item of retained(id, 'outbox')) {
        const state = read(identityOf(item))
        if (!state) continue
        try {
          current(state)
        } catch (error) {
          if (!noLongerCurrent(error)) throw error
          continue
        }
        queue.push(item.targetSessionId)
      }
    }
  }
  return {
    read,
    admitRun(raw: DelegatedInputRun): DelegatedInputRecord {
      const input = delegatedInputRunSchema.parse(raw)
      const state = read({ sessionId: input.sessionId, requestId: input.requestId })
      if (
        !state ||
        state.delegationId !== input.delegationId ||
        state.delivery !== 'dedicated' ||
        state.targetRunId !== input.targetRunId ||
        state.status !== 'delivered'
      )
        throw new HbarError('DELEGATION_RECEIPT_INVALID', 'The dedicated Run requires its exact live source grant')
      current(state)
      target(state, input.targetSessionId, input.targetRunId)
      return state
    },
    deliver(raw: DelegatedInputDeliver) {
      const input = delegatedInputDeliverSchema.parse(raw)
      return db
        .transaction(() => {
          const prior = mutation(input)
          current(prior)
          if (prior.status === 'answered') return { state: prior, events: [] as SessionEvent[] }
          if (prior.status === 'delivered' && prior.targetRunId) {
            target(prior, prior.targetSessionId, prior.targetRunId, prior.delivery === 'dedicated')
            return { state: prior, events: [] as SessionEvent[] }
          }
          if (prior.status !== 'pending')
            throw new HbarError('DECISION_CONFLICT', 'The delegation is no longer pending')
          if (!ports.delivery)
            throw new HbarError('DELEGATION_TARGET_UNAVAILABLE', 'This storage has no decision delivery port')
          const plan = ports.delivery.plan(prior, input.targetPermission)
          if (plan.kind === 'guidance') target(prior, prior.targetSessionId, plan.targetRunId)
          const state = delegatedInputRecordSchema.parse({
            ...prior,
            revision: prior.revision + 1,
            status: 'delivered',
            targetRunId: plan.targetRunId,
            delivery: plan.kind,
            updatedAt: Date.now(),
          })
          // Publish the grant first. A target queue/message must never outlive a missing source authorization.
          const events = save(state)
          events.push(...plan.publish())
          return { state, events }
        })
        .immediate()
    },
    /** Private composition port: validate everything before the source writer publishes its first durable event. */
    prepareSettlement(question: UserInputState, settlement: UserInputSettlement): () => SessionEvent[] {
      const state = read({ sessionId: question.request.sessionId, requestId: question.request.requestId })
      const automatic = settlement.kind === 'answered' ? settlement.automatic : undefined
      if (automatic?.source === 'delegate') {
        const proof = automatic.delegation
        if (
          !state ||
          !proof ||
          state.status !== 'answered' ||
          state.reply?.kind !== 'answered' ||
          !state.repliedBy ||
          state.delegationId !== proof.delegationId ||
          state.revision !== proof.replyRevision ||
          state.targetSessionId !== proof.targetSessionId ||
          state.targetRunId !== proof.targetRunId ||
          !same(state.reply.response, automatic.response)
        )
          throw new HbarError(
            'DELEGATION_RECEIPT_INVALID',
            'The answer requires its exact original structured target receipt',
          )
        current(state)
        // A valid reply survives normal target completion; current device access still governs consumption.
        const run = ports.run(proof.targetRunId)
        const principal = ports.principal(run.id)
        if (
          run.sessionId !== state.targetSessionId ||
          state.repliedBy.runId !== run.id ||
          !principal ||
          principal.actorId !== state.repliedBy.actorId ||
          !ports.authorize(principal.actorId, [state.sessionId, state.targetSessionId, principal.originSessionId])
        )
          throw new HbarError('FORBIDDEN', 'The original target device no longer has access to both Sessions')
      }
      if (!state || !open(state)) return () => []
      if (state.questionRevision !== question.revision || !same(state.request, question.request))
        throw new HbarError('DECISION_CONFLICT', 'The delegation belongs to another original question')
      return prepareSave({
        ...state,
        revision: state.revision + 1,
        status: settlement.kind === 'cancelled' ? 'cancelled' : 'closed',
        reason: settlement.kind === 'cancelled' ? 'source_cancelled' : 'source_resolved',
        updatedAt: Date.now(),
      })
    },
    accept(raw: DelegatedInputAccept) {
      const input = delegatedInputAcceptSchema.parse(raw)
      return db
        .transaction(() => {
          const prior = read({ sessionId: input.sessionId, requestId: input.requestId })
          if (prior) {
            if (
              prior.questionRevision !== input.expectedQuestionRevision ||
              !same(prior.policy, input.policy) ||
              prior.expiresAt - prior.createdAt !== input.timeoutMs
            )
              throw new HbarError('DECISION_CONFLICT', 'This question already has another delegation')
            return { created: false, state: prior, events: [] as SessionEvent[] }
          }
          const question = ports.question(identityOf(input))
          if (!question || question.revision !== input.expectedQuestionRevision || question.settlement)
            throw new HbarError('DECISION_CONFLICT', 'The original question is no longer pending')
          if (question.request.questions.some((item) => item.isSecret || item.purpose !== 'decision'))
            throw new HbarError('DELEGATION_HUMAN_REQUIRED', 'Facts, secrets and authorization require the user')
          if (
            input.policy.policy.mode !== 'delegate' ||
            !same(input.policy, question.policy) ||
            input.policy.sessionId !== input.sessionId
          )
            throw new HbarError('DELEGATION_POLICY_INVALID', 'Delegation must use the accepted question policy')
          if (input.sessionId === input.policy.policy.targetSessionId)
            throw new HbarError('DELEGATION_SELF', 'A Session cannot decide its own delegated question')
          const principal = ports.principal(question.request.runId)
          if (!principal)
            throw new HbarError('COMMAND_PRINCIPAL_REQUIRED', 'The source Run needs its authenticated device')
          const now = Date.now()
          const state = delegatedInputRecordSchema.parse({
            ...identityOf(input),
            version: 1,
            delegationId: crypto.randomUUID(),
            revision: 1,
            sourceRunId: question.request.runId,
            sourceCallId: question.request.callId,
            sourceActorId: principal.actorId,
            questionRevision: question.revision,
            request: question.request,
            policy: question.policy,
            targetSessionId: input.policy.policy.targetSessionId,
            targetRunId: null,
            delivery: null,
            status: 'pending',
            reply: null,
            repliedBy: null,
            reason: null,
            createdAt: now,
            expiresAt: now + input.timeoutMs,
            updatedAt: now,
          })
          current(state)
          if (
            retained(state.sessionId, 'outbox').length >= 64 ||
            retained(state.targetSessionId, 'inbox').length >= DELEGATED_INPUT_MAX_PENDING
          )
            throw new HbarError('DELEGATION_CAPACITY', 'The source or target decision queue is full')
          cycle(state.sessionId, state.targetSessionId)
          return { created: true, state, events: save(state) }
        })
        .immediate()
    },
    bind(raw: DelegatedInputBind) {
      const input = delegatedInputBindSchema.parse(raw)
      return db
        .transaction(() => {
          const prior = mutation(input)
          current(prior)
          target(prior, input.targetSessionId, input.targetRunId)
          if (prior.status !== 'pending')
            throw new HbarError('DECISION_CONFLICT', 'The delegation was already delivered')
          const state = delegatedInputRecordSchema.parse({
            ...prior,
            revision: prior.revision + 1,
            status: 'delivered',
            targetRunId: input.targetRunId,
            delivery: input.delivery,
            updatedAt: Date.now(),
          })
          return { state, events: save(state) }
        })
        .immediate()
    },
    complete(raw: DelegatedInputComplete) {
      const input = delegatedInputCompleteSchema.parse(raw)
      return db
        .transaction(() => {
          const prior = mutation(input)
          current(prior)
          const actorId = target(prior, input.targetSessionId, input.targetRunId)
          if (prior.status !== 'delivered' || prior.targetRunId !== input.targetRunId)
            throw new HbarError('DECISION_CONFLICT', 'Only the original delivered target Run may reply')
          if (input.reply.kind === 'answered') {
            const answers = input.reply.response.answers
            if (Object.keys(answers).length !== prior.request.questions.length)
              throw new HbarError('USER_INPUT_INVALID', 'The delegated reply must cover every original question')
            for (const question of prior.request.questions) {
              const values = answers[question.id]?.answers
              if (
                !values ||
                values.length !== 1 ||
                (question.options?.length &&
                  !question.isOther &&
                  !question.options.some((option) => option.label === values[0]))
              )
                throw new HbarError('USER_INPUT_INVALID', 'The delegated answer does not match the original options')
            }
          }
          const state = delegatedInputRecordSchema.parse({
            ...prior,
            revision: prior.revision + 1,
            status: input.reply.kind === 'answered' ? 'answered' : 'human',
            reply: input.reply,
            repliedBy: { runId: input.targetRunId, callId: input.targetCallId, actorId },
            reason: input.reply.kind === 'human' ? input.reply.reason : null,
            updatedAt: Date.now(),
          })
          return { state, events: save(state) }
        })
        .immediate()
    },
    finish(raw: DelegatedInputFinish) {
      const input = delegatedInputFinishSchema.parse(raw)
      return db
        .transaction(() => {
          const prior = mutation(input)
          if (!open(prior)) return { state: prior, events: [] as SessionEvent[] }
          if (input.reason === 'timeout' && Date.now() < prior.expiresAt)
            throw new HbarError('DECISION_CONFLICT', 'The delegation has not expired')
          if (input.reason === 'source_resolved') {
            const settlement = ports.question(identityOf(prior))?.settlement
            if (!settlement)
              throw new HbarError('DECISION_CONFLICT', 'The original question has no committed settlement')
          }
          const state = delegatedInputRecordSchema.parse({
            ...prior,
            revision: prior.revision + 1,
            status:
              input.reason === 'source_resolved'
                ? 'closed'
                : input.reason === 'cancelled' || input.reason === 'source_cancelled'
                  ? 'cancelled'
                  : 'human',
            reason: input.reason,
            updatedAt: Date.now(),
          })
          return { state, events: save(state) }
        })
        .immediate()
    },
    inbox(raw: DelegatedInputInbox) {
      const input = delegatedInputInboxSchema.parse(raw)
      const own = ports.run(input.runId)
      if (own.sessionId !== input.sessionId)
        throw new HbarError('FORBIDDEN', 'The inbox belongs to another Session Run')
      const entries = retained(input.sessionId, 'inbox')
        .filter((item) => input.after === undefined || item.delegationId > input.after)
        .sort((a, b) => (a.delegationId < b.delegationId ? -1 : 1))
      const items: DelegatedInputRecord[] = []
      let seen = 0,
        bytes = 512
      for (const entry of entries) {
        const state = read(identityOf(entry))
        seen++
        if (!state || (state.targetRunId !== null && state.targetRunId !== input.runId)) continue
        try {
          current(state)
          target(state, input.sessionId, input.runId)
        } catch (error) {
          if (!noLongerCurrent(error)) throw error
          continue
        }
        const size = Buffer.byteLength(JSON.stringify(state), 'utf8') + 1
        if (bytes + size > DELEGATED_INPUT_MAX_STATE_BYTES || items.length >= input.limit) {
          if (!items.length)
            throw new HbarError('DELEGATION_CAPACITY', 'One delegated question exceeds the inbox byte capacity')
          seen--
          break
        }
        items.push(state)
        bytes += size
      }
      const last = entries[seen - 1]
      return { items, ...(last && seen < entries.length ? { nextCursor: last.delegationId } : {}) }
    },
  }
}
