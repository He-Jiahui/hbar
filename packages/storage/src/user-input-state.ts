import { createHash } from 'node:crypto'
import type { Database } from 'bun:sqlite'
import { HbarError, type SessionEvent } from '@hbar/contracts'
import {
  USER_INPUT_STATE_BYTES,
  userInputIdentitySchema,
  userInputAcceptSchema,
  userInputCommitSchema,
  userInputStateSchema,
  type UserInputIdentity,
  type UserInputAccept,
  type UserInputCommit,
  type UserInputState,
} from '@hbar/contracts/user-input-state'

type Append = (sessionId: string, type: string, data: unknown, runId?: string) => SessionEvent
const typeOf = (requestId: string) => `user_input.state.${createHash('sha256').update(requestId).digest('hex')}`
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

/** One indexed canonical record per request. The single writer arbitrates every answer and cancellation. */
export function createUserInputStateStorage(db: Database, append: Append) {
  const latest = db.query<{ data: string; runId: string }, [string, string]>(
    'SELECT data,runId FROM events WHERE sessionId=? AND type=? ORDER BY seq DESC LIMIT 1',
  )
  const run = db.query<{ sessionId: string; status: string }, [string]>('SELECT sessionId,status FROM runs WHERE id=?')
  function read(raw: UserInputIdentity): UserInputState | null {
    const input = userInputIdentitySchema.parse(raw)
    const row = latest.get(input.sessionId, typeOf(input.requestId))
    if (!row) return null
    const state = userInputStateSchema.parse(JSON.parse(row.data) as unknown)
    if (
      state.request.sessionId !== input.sessionId ||
      state.request.requestId !== input.requestId ||
      state.request.runId !== row.runId
    )
      throw new HbarError('SESSION_LOG_CORRUPTED', 'User input differs from its canonical source')
    return state
  }
  function write(state: UserInputState): SessionEvent {
    const value = userInputStateSchema.parse(state)
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > USER_INPUT_STATE_BYTES)
      throw new HbarError('USER_INPUT_CAPACITY', 'User input state exceeds its durable capacity')
    return append(value.request.sessionId, typeOf(value.request.requestId), value, value.request.runId)
  }
  return {
    read,
    accept(raw: UserInputAccept) {
      const input = userInputAcceptSchema.parse(raw)
      return db
        .transaction(() => {
          const prior = read({ sessionId: input.request.sessionId, requestId: input.request.requestId })
          if (prior) {
            if (!same(prior.request, input.request))
              throw new HbarError('USER_INPUT_EXISTS', 'Request ID already belongs to another question')
            return { created: false, state: prior, events: [] as SessionEvent[] }
          }
          const source = run.get(input.request.runId)
          if (!source || source.sessionId !== input.request.sessionId || input.policy.sessionId !== source.sessionId)
            throw new HbarError('USER_INPUT_INVALID', 'User input requires its original Session Run')
          if (!['running', 'waiting_approval'].includes(source.status))
            throw new HbarError('USER_INPUT_INACTIVE', 'User input requires an active Run')
          if (
            db
              .query("SELECT 1 FROM events WHERE runId=? AND type='run.cancelRequested' LIMIT 1")
              .get(input.request.runId)
          )
            throw new HbarError('USER_CANCELLED', 'The source Run was cancelled')
          const now = Date.now()
          const state = userInputStateSchema.parse({
            version: 1,
            revision: 1,
            ...input,
            settlement: null,
            createdAt: now,
            updatedAt: now,
          })
          const events = [
            write(state),
            append(input.request.sessionId, 'user_input.requested', input.request, input.request.runId),
          ]
          return { created: true, state, events }
        })
        .immediate()
    },
    commit(raw: UserInputCommit) {
      const input = userInputCommitSchema.parse(raw)
      return db
        .transaction(() => {
          const prior = read({ sessionId: input.sessionId, requestId: input.requestId })
          if (!prior) throw new HbarError('NOT_FOUND', 'User input request is unavailable')
          if (prior.settlement || prior.revision !== input.expectedRevision)
            return { accepted: false, state: prior, events: [] as SessionEvent[] }
          const { request } = prior
          const { settlement } = input
          if (settlement.kind === 'answered') {
            const source = run.get(request.runId)
            if (!source || !['running', 'waiting_approval'].includes(source.status))
              throw new HbarError('USER_INPUT_INACTIVE', 'The source Run no longer accepts answers')
            if (
              db.query("SELECT 1 FROM events WHERE runId=? AND type='run.cancelRequested' LIMIT 1").get(request.runId)
            )
              throw new HbarError('USER_CANCELLED', 'The source Run was cancelled')
            if (
              Object.keys(settlement.response.answers).some(
                (id) => !request.questions.some((question) => question.id === id),
              )
            )
              throw new HbarError('USER_INPUT_INVALID', 'Answer contains an unknown question')
            if (settlement.automatic) {
              if (
                prior.policy.policy.mode !== 'recommended' ||
                request.questions.some((question) => question.isSecret || question.purpose !== 'decision')
              )
                throw new HbarError(
                  'USER_INPUT_INVALID',
                  'Only declared nonsecret decisions can be answered automatically',
                )
              if (
                !same(settlement.automatic.request, request) ||
                !same(settlement.automatic.response, settlement.response) ||
                !same(settlement.automatic.policy, prior.policy)
              )
                throw new HbarError(
                  'USER_INPUT_INVALID',
                  'Automatic evidence must match the original question, policy and answer',
                )
              if (Object.keys(settlement.response.answers).length !== request.questions.length)
                throw new HbarError('USER_INPUT_INVALID', 'An automatic answer must cover every question')
              for (const question of request.questions) {
                const answers = settlement.response.answers[question.id]?.answers
                if (!answers || answers.length !== 1)
                  throw new HbarError('USER_INPUT_INVALID', 'An automatic decision needs one answer per question')
                const selected = question.options?.find((option) => option.label === answers[0])
                if (question.options?.length && !question.isOther && !selected)
                  throw new HbarError('USER_INPUT_INVALID', 'Automatic answer must use a declared option')
                if (settlement.automatic.source === 'recommended' && !selected?.recommended)
                  throw new HbarError('USER_INPUT_INVALID', 'Recommended answers must use a declared recommendation')
              }
              if (settlement.automatic.source === 'model') {
                if (!settlement.automatic.modelId || !settlement.automatic.attemptIds?.length)
                  throw new HbarError('USER_INPUT_INVALID', 'Model decisions require source model and usage evidence')
                const usage = db.query(
                  "SELECT 1 FROM events WHERE sessionId=? AND runId=? AND stepId=? AND type='usage.recorded' LIMIT 1",
                )
                for (const attemptId of settlement.automatic.attemptIds)
                  if (!usage.get(request.sessionId, request.runId, attemptId))
                    throw new HbarError('USER_INPUT_INVALID', 'Decision usage must be recorded before the answer')
              }
              const revisions = Object.entries(prior.policy.revisions)
              if (revisions.length > 16) throw new HbarError('USER_INPUT_INVALID', 'Too many policy layers')
              for (const [id, expected] of revisions) {
                const layer = db
                  .query<{ revision: number }, [string]>('SELECT revision FROM settings_layers WHERE id=?')
                  .get(id)
                if ((layer?.revision ?? 0) !== expected)
                  throw new HbarError(
                    'DECISION_POLICY_CHANGED',
                    'The decision policy changed before the answer was committed',
                  )
              }
            }
          }
          const state = userInputStateSchema.parse({
            ...prior,
            revision: prior.revision + 1,
            settlement,
            updatedAt: Date.now(),
          })
          const events = [write(state)]
          if (settlement.kind === 'answered' && settlement.automatic)
            events.push(append(request.sessionId, 'user_input.autoDecided', settlement.automatic, request.runId))
          events.push(
            append(
              request.sessionId,
              'user_input.resolved',
              {
                requestId: request.requestId,
                sessionId: request.sessionId,
                cancelled: settlement.kind === 'cancelled',
                ...(settlement.kind === 'answered' ? { response: settlement.response } : {}),
              },
              request.runId,
            ),
          )
          return { accepted: true, state, events }
        })
        .immediate()
    },
  }
}
