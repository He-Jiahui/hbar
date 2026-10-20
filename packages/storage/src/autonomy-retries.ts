import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import type { Database } from 'bun:sqlite'
import { HbarError, idSchema, type Run, type SessionEvent, type UserInput } from '@hbar/contracts'
import { BACKEND_UNATTENDED_VALUE_KEY } from '@hbar/contracts/backend'
import type { ExecutionPrincipal } from '@hbar/contracts/execution-principal'
import {
  AUTONOMY_RETRY_MAX_DELAY_MS,
  autonomyRetryConfigurationSchema,
  autonomyRetrySettingKeys,
  autonomyRetryKind,
  autonomyRetryPlanSchema,
  autonomyRetryAdmissionSchema,
  autonomyRetryContextSchema,
  autonomyRetryInput,
  type AutonomyRetryAdmission,
  type AutonomyRetryPlan,
} from '@hbar/contracts/autonomy-retry'
import { createExecutionPrincipalStorage } from './execution-principals'
import { createCommandMutationGuards } from './command-mutation-guards'

type Append = (sessionId: string, type: string, data: unknown, runId?: string) => SessionEvent
export const AUTONOMY_RETRY_INDEX = 'CREATE INDEX IF NOT EXISTS tool_intents_run_status ON tool_intents(runId,status);'

/** Planning is durable; accepting a successor and its lineage remains inside enqueue's existing transaction. */
export function createAutonomyRetryStorage(
  db: Database,
  append: Append,
  options: {
    run(id: string): Run
    hasPendingCommands(sessionId: string): boolean
    authorized(principal: ExecutionPrincipal, sessionId: string): boolean
  },
) {
  const principals = createExecutionPrincipalStorage(db)
  const guards = createCommandMutationGuards(db, append)
  const record = db.query<{ runId: string | null; data: string; seq: number }, [string, string]>(
    'SELECT runId,data,seq FROM events WHERE sessionId=? AND type=? ORDER BY seq DESC LIMIT 1',
  )
  const acceptance = db.query<{ type: string; data: string }, [string]>(
    "SELECT type,data FROM events WHERE runId=? AND type IN ('run.queued','run.recoveryQueued') ORDER BY seq LIMIT 1",
  )
  const contextAcceptance = db.query<
    {
      type: string
      retry: string | null
      predecessor: string | null
    },
    [string]
  >(
    `SELECT type,json_extract(data,'$.autonomyRetry') AS retry,
     json_extract(data,'$.predecessorRunId') AS predecessor FROM events
     WHERE runId=? AND type IN ('run.queued','run.recoveryQueued') ORDER BY seq LIMIT 1`,
  )
  const contextRun = db.query<
    {
      id: string
      sessionId: string
      error: string | null
      failureCode: string | null
    },
    [string]
  >(
    `SELECT id,sessionId,substr(error,1,4000) AS error,json_extract(failure,'$.code') AS failureCode
     FROM runs WHERE id=?`,
  )
  function contextFacts(runId: string) {
    const facts = contextRun.get(runId)
    if (!facts) throw new HbarError('NOT_FOUND', 'Run not found')
    return facts
  }
  function enabled() {
    const row = db
      .query<{ revision: number; valuesJson: string }, []>(
        "SELECT revision,valuesJson FROM settings_layers WHERE id='settings:global'",
      )
      .get()
    const values = row ? z.record(z.string(), z.unknown()).parse(JSON.parse(row.valuesJson) as unknown) : {}
    return {
      enabled: values[BACKEND_UNATTENDED_VALUE_KEY] === true,
      revision: row?.revision ?? 0,
      configuration: autonomyRetryConfigurationSchema.parse({
        transientRetries: values[autonomyRetrySettingKeys.transientRetries],
        repairRetries: values[autonomyRetrySettingKeys.repairRetries],
        retryDelayMs: values[autonomyRetrySettingKeys.retryDelayMs],
      }),
    }
  }
  const typeOf = (runId: string) => 'run.autonomyRetry.' + createHash('sha256').update(runId).digest('hex')
  function hasGoal(sessionId: string) {
    const cleared = record.get(sessionId, 'goal.cleared')
    return ['goal.created', 'goal.updated', 'goal.run_bound', 'goal.accounted'].some((type) => {
      const current = record.get(sessionId, type)
      return current !== null && (!cleared || current.seq > cleared.seq)
    })
  }
  function candidate(sessionId: string) {
    const setting = enabled()
    if (!setting.enabled) return null
    const session = db.query<{ archived: number }, [string]>('SELECT archived FROM sessions WHERE id=?').get(sessionId)
    if (!session || session.archived) return null
    if (hasGoal(sessionId)) return null
    const latest = ['run.queued', 'run.recoveryQueued']
      .flatMap((type) => {
        const event = record.get(sessionId, type)
        return event ? [event] : []
      })
      .sort((a, b) => b.seq - a.seq)[0]
    if (!latest) return null
    const run = options.run(idSchema.parse(latest.runId))
    const kind = autonomyRetryKind(run)
    if (kind === null || run.input.source === 'goal' || run.input.delegatedDecision !== undefined) return null
    const principal = principals.run(run.id)
    if (
      !principal ||
      !options.authorized(principal, sessionId) ||
      options.hasPendingCommands(principal.originSessionId) ||
      guards.pending(principal.originSessionId, 1).length
    )
      return null
    const visited = new Set<string>()
    let sourceId = run.id
    let previous: AutonomyRetryPlan | undefined
    for (;;) {
      if (visited.has(sourceId) || visited.size >= 32)
        throw new HbarError('AUTONOMY_RETRY_LINEAGE', 'Retry recovery lineage is cyclic or too deep')
      visited.add(sourceId)
      if (
        db.query("SELECT 1 FROM events WHERE runId=? AND type='run.cancelRequested' LIMIT 1").get(sourceId) ||
        db.query("SELECT 1 FROM tool_intents WHERE runId=? AND status<>'settled' LIMIT 1").get(sourceId) ||
        db.query("SELECT 1 FROM runtime_execution_ownership WHERE runId=? AND state='active' LIMIT 1").get(sourceId)
      )
        return null
      const queued = acceptance.get(sourceId)
      if (!queued) throw new HbarError('RUN_JOURNAL_MISSING', 'Automatic retry requires its original acceptance')
      const value = z.record(z.string(), z.unknown()).parse(JSON.parse(queued.data) as unknown)
      if (value.autonomyRetry !== undefined) {
        previous = autonomyRetryPlanSchema.parse(value.autonomyRetry)
        if (previous.sessionId !== sessionId)
          throw new HbarError('AUTONOMY_RETRY_LINEAGE', 'Retry belongs to another Session')
        break
      }
      if (queued.type !== 'run.recoveryQueued' || value.manual !== undefined) break
      sourceId = idSchema.parse(value.predecessorRunId)
      if (options.run(sourceId).sessionId !== sessionId)
        throw new HbarError('AUTONOMY_RETRY_LINEAGE', 'Recovery belongs to another Session')
    }
    const attempts = {
      transientRetries: previous?.transientRetries ?? 0,
      repairRetries: previous?.repairRetries ?? 0,
    }
    const counter = kind === 'transient' ? 'transientRetries' : 'repairRetries'
    if (attempts[counter] >= setting.configuration[counter]) return null
    attempts[counter]++
    if (
      db
        .query("SELECT 1 FROM events WHERE runId=? AND type='run.cancelRequested' LIMIT 1")
        .get(previous?.rootRunId ?? sourceId)
    )
      return null
    return { run, setting, kind, rootRunId: previous?.rootRunId ?? sourceId, ...attempts, attempt: attempts[counter] }
  }
  function plan(rawSessionId: string) {
    const sessionId = idSchema.parse(rawSessionId)
    return db
      .transaction(() => {
        const source = candidate(sessionId)
        if (!source) return null
        const prior = record.get(sessionId, typeOf(source.run.id))
        const value = prior
          ? autonomyRetryPlanSchema.parse(JSON.parse(prior.data) as unknown)
          : autonomyRetryPlanSchema.parse({
              version: 1,
              kind: source.kind,
              sessionId,
              rootRunId: source.rootRunId,
              predecessorRunId: source.run.id,
              requestId: 'autonomy:retry:' + createHash('sha256').update(source.run.id).digest('hex'),
              transientRetries: source.transientRetries,
              repairRetries: source.repairRetries,
              wakeAt:
                (source.run.endedAt ?? Date.now()) +
                Math.min(
                  AUTONOMY_RETRY_MAX_DELAY_MS,
                  source.setting.configuration.retryDelayMs * 2 ** (source.attempt - 1),
                ),
            })
        if (
          value.predecessorRunId !== source.run.id ||
          value.rootRunId !== source.rootRunId ||
          value.kind !== source.kind ||
          value.transientRetries !== source.transientRetries ||
          value.repairRetries !== source.repairRetries
        )
          throw new HbarError('AUTONOMY_RETRY_LINEAGE', 'Retry plan differs from its canonical source')
        if (!prior) append(sessionId, typeOf(source.run.id), value, source.run.id)
        return { plan: value, settingsRevision: source.setting.revision, predecessor: source.run }
      })
      .immediate()
  }
  return {
    plan,
    context(rawRunId: string) {
      const original = contextFacts(idSchema.parse(rawRunId))
      let current = original
      const visited = new Set<string>()
      for (;;) {
        if (visited.has(current.id) || visited.size >= 32)
          throw new HbarError('AUTONOMY_RETRY_LINEAGE', 'Retry context recovery lineage is cyclic or too deep')
        visited.add(current.id)
        const accepted = contextAcceptance.get(current.id)
        if (!accepted) return null
        if (accepted.retry !== null) {
          const plan = autonomyRetryPlanSchema.parse(JSON.parse(accepted.retry) as unknown)
          const predecessor = contextFacts(plan.predecessorRunId)
          if (
            plan.sessionId !== original.sessionId ||
            predecessor.sessionId !== original.sessionId ||
            contextFacts(plan.rootRunId).sessionId !== original.sessionId
          )
            throw new HbarError('AUTONOMY_RETRY_LINEAGE', 'Retry diagnostic belongs to another Session')
          return autonomyRetryContextSchema.parse({
            plan,
            failureCode: predecessor.failureCode,
            diagnostic: predecessor.error?.slice(0, 4_000) ?? null,
          })
        }
        if (accepted.type !== 'run.recoveryQueued' || accepted.predecessor === null) return null
        current = contextFacts(idSchema.parse(accepted.predecessor))
        if (current.sessionId !== original.sessionId)
          throw new HbarError('AUTONOMY_RETRY_LINEAGE', 'Retry context recovery belongs to another Session')
      }
    },
    successor(runId: string): Run | null {
      const run = options.run(idSchema.parse(runId))
      const planned = record.get(run.sessionId, typeOf(run.id))
      if (!planned) return null
      const plan = autonomyRetryPlanSchema.parse(JSON.parse(planned.data) as unknown)
      if (planned.runId !== run.id || plan.predecessorRunId !== run.id || plan.sessionId !== run.sessionId)
        throw new HbarError('AUTONOMY_RETRY_LINEAGE', 'Retry plan does not belong to its original predecessor')
      const row = db
        .query<{ id: string }, [string, string]>('SELECT id FROM runs WHERE sessionId=? AND requestId=?')
        .get(run.sessionId, plan.requestId)
      if (!row) return null
      const accepted = acceptance.get(row.id)
      const data = accepted ? z.record(z.string(), z.unknown()).parse(JSON.parse(accepted.data) as unknown) : null
      // A colliding manually supplied request ID does not turn another task into this retry's descendant.
      if (!data || accepted?.type !== 'run.queued' || data.autonomyRetry === undefined) return null
      const childPlan = autonomyRetryPlanSchema.parse(data.autonomyRetry)
      if (JSON.stringify(childPlan) !== JSON.stringify(plan))
        throw new HbarError('AUTONOMY_RETRY_LINEAGE', 'Accepted retry differs from its durable plan')
      return options.run(row.id)
    },
    cancel(runId: string): SessionEvent | null {
      const run = options.run(idSchema.parse(runId))
      if (
        run.status !== 'failed' ||
        autonomyRetryKind(run) === null ||
        run.input.source === 'goal' ||
        hasGoal(run.sessionId)
      )
        return null
      if (db.query("SELECT 1 FROM events WHERE runId=? AND type='run.cancelRequested' LIMIT 1").get(runId)) return null
      return append(run.sessionId, 'run.cancelRequested', { runId, reason: 'autonomy_retry_cancelled' }, runId)
    },
    validate(
      raw: AutonomyRetryAdmission,
      sessionId: string,
      requestId: string,
      input: UserInput,
      modelId: string,
    ): string {
      const admission = autonomyRetryAdmissionSchema.parse(raw)
      const current = plan(sessionId)
      if (
        !current ||
        current.settingsRevision !== admission.settingsRevision ||
        JSON.stringify(current.plan) !== JSON.stringify(admission.plan)
      )
        throw new HbarError(
          'AUTONOMY_RETRY_STALE',
          'The original task or unattended policy changed before retry admission',
        )
      if (Date.now() < current.plan.wakeAt)
        throw new HbarError('AUTONOMY_RETRY_BACKOFF', 'The durable retry delay has not elapsed')
      const inherited = autonomyRetryInput(current.predecessor)
      const retainedContent = (value: UserInput) => ({
        images: value.images.map((artifact) => artifact.id),
        files: (value.files ?? []).map((artifact) => artifact.id),
        sandbox: value.sandbox ?? null,
        maxMode: value.maxMode === true,
        continuation: value.continuation ?? null,
        peerMessage: value.peerMessage ?? null,
        delegatedDecision: value.delegatedDecision ?? null,
      })
      if (
        requestId !== current.plan.requestId ||
        input.source !== 'system' ||
        input.text !== inherited.text ||
        !isDeepStrictEqual(retainedContent(input), retainedContent(inherited)) ||
        (['approval', 'mode', 'thinking', 'permissionAtAdmission'] as const).some(
          (key) => inherited[key] !== undefined && input[key] !== inherited[key],
        ) ||
        modelId !== current.predecessor.modelId
      )
        throw new HbarError(
          'AUTONOMY_RETRY_INVALID',
          'The retry must retain its original task, model and execution constraints',
        )
      return current.plan.predecessorRunId
    },
  }
}
