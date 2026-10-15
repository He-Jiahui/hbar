import type { Database } from 'bun:sqlite'
import { z } from 'zod'
import { HbarError, runSchema, type Run, type SessionEvent } from '@hbar/contracts'
import { runCommandRecordSchema } from '@hbar/contracts/commands/run'
import { executionPrincipalSchema } from '@hbar/contracts/execution-principal'
import { sessionLaunchTargetBindingSchema } from './session-launch-target'
import type { SessionLaunchTargetBinding } from './types'
import {
  executionOwnershipSchema,
  recoveryChainSchema,
  runRecoverySchema,
  runtimeOwnerSchema,
  type ExecutionOwnership,
  type RecoveryChain,
  type RunRecovery,
  type RuntimeOwner,
} from '@hbar/contracts/runtime'

export const RUNTIME_STATE_SQL = `
  CREATE TABLE IF NOT EXISTS runtime_execution_ownership(
    leaseId TEXT PRIMARY KEY, sessionId TEXT NOT NULL, runId TEXT NOT NULL UNIQUE,
    incarnation TEXT NOT NULL, fence INTEGER NOT NULL, state TEXT NOT NULL,
    leaseJson TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS runtime_execution_session_active
    ON runtime_execution_ownership(sessionId) WHERE state='active';
  CREATE TABLE IF NOT EXISTS runtime_recovery(
    recoveryId TEXT PRIMARY KEY, predecessorRunId TEXT NOT NULL UNIQUE,
    chainId TEXT NOT NULL, recordJson TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS runtime_recovery_chains(chainId TEXT PRIMARY KEY, chainJson TEXT NOT NULL);
`

export const runtimeManualRecoverySchema = z.strictObject({
  requestId: z.string().regex(/^command-[a-f0-9]{64}$/),
  command: runCommandRecordSchema,
})
export type RuntimeManualRecovery = z.infer<typeof runtimeManualRecoverySchema>
export const runtimeRecoveryRecordSchema = z.strictObject({
  recoveryId: z.string().min(1).max(160),
  predecessorRunId: z.string().min(1).max(160),
  chain: recoveryChainSchema,
  run: runSchema.nullable(),
  manual: runtimeManualRecoverySchema.optional(),
  executionPrincipal: executionPrincipalSchema.nullable().optional(),
  launchTarget: sessionLaunchTargetBindingSchema.optional(),
})
export type RuntimeRecoveryRecord = z.infer<typeof runtimeRecoveryRecordSchema>
export interface RuntimeRecoveryScope {
  readonly runIds?: readonly string[]
  readonly preserveQueued?: boolean
  readonly preserveApprovals?: boolean
  readonly reconcileInterrupted?: boolean
  /** Keep precisely bound process executions pending for a Node receipt reconciler. Defaults to false. */
  readonly deferNodeExecutions?: boolean
}
export interface RuntimeStatePort {
  run(id: string): Run
  append(sessionId: string, type: string, data: unknown, runId: string): SessionEvent
  cancelRequested(id: string): boolean
  requestCancel(id: string): { run: Run; event: SessionEvent | null }
  archived(sessionId: string): boolean
  /** Called in the same SQLite transaction as the ownership record. */
  start(run: Run, startedAt: number): Run
  /** Atomically append one canonical record containing both Run and recovery identity. */
  queue(original: Run, relationship: RunRecovery, chain: RecoveryChain, manual?: RuntimeManualRecovery): Run
  reconcile(run: Run): void
  restoreBinding(binding: SessionLaunchTargetBinding): void
}

function parseJson(text: string): unknown {
  return JSON.parse(text)
}

/** Durable authority is checked in the database Worker, immediately before a protected write. */
export function createRuntimeState(db: Database, port: RuntimeStatePort) {
  function ownership(runId: string): { lease: ExecutionOwnership; state: string } | null {
    const row = db
      .query<{ leaseJson: string; state: string }, [string]>(
        'SELECT leaseJson,state FROM runtime_execution_ownership WHERE runId=?',
      )
      .get(runId)
    return row ? { lease: executionOwnershipSchema.parse(parseJson(row.leaseJson)), state: row.state } : null
  }
  function projectOwnership(lease: ExecutionOwnership, state: 'active' | 'released' | 'revoked') {
    db.query(
      `INSERT INTO runtime_execution_ownership VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(leaseId) DO UPDATE SET state=excluded.state`,
    ).run(
      lease.leaseId,
      lease.sessionId,
      lease.runId,
      lease.owner.incarnation,
      lease.fence,
      state,
      JSON.stringify(lease),
    )
  }
  function projectRecovery(record: RuntimeRecoveryRecord) {
    db.query(
      `INSERT INTO runtime_recovery VALUES(?,?,?,?)
      ON CONFLICT(recoveryId) DO UPDATE SET recordJson=excluded.recordJson`,
    ).run(record.recoveryId, record.predecessorRunId, record.chain.chainId, JSON.stringify(record))
    db.query(
      `INSERT INTO runtime_recovery_chains VALUES(?,?)
      ON CONFLICT(chainId) DO UPDATE SET chainJson=excluded.chainJson`,
    ).run(record.chain.chainId, JSON.stringify(record.chain))
  }
  function readRecovery(predecessorRunId: string): RuntimeRecoveryRecord | null {
    const row = db
      .query<{ recordJson: string }, [string]>('SELECT recordJson FROM runtime_recovery WHERE predecessorRunId=?')
      .get(predecessorRunId)
    return row ? runtimeRecoveryRecordSchema.parse(parseJson(row.recordJson)) : null
  }
  function readChain(chainId: string): RecoveryChain | null {
    const row = db
      .query<{ chainJson: string }, [string]>('SELECT chainJson FROM runtime_recovery_chains WHERE chainId=?')
      .get(chainId)
    if (!row) return null
    const chain = recoveryChainSchema.parse(parseJson(row.chainJson))
    const run = port.run(chain.currentRunId)
    if (['completed', 'failed', 'cancelled', 'guided'].includes(run.status))
      return { ...chain, status: 'settled', updatedAt: run.endedAt ?? chain.updatedAt }
    return chain
  }
  function reason(run: Run): string | null {
    if (port.archived(run.sessionId)) return 'ARCHIVED'
    if (port.cancelRequested(run.id)) return 'USER_CANCELLED'
    if (db.query("SELECT id FROM approvals WHERE runId=? AND status='pending'").get(run.id)) return 'APPROVAL_PENDING'
    if (run.failure?.category === 'result_unknown') return 'EFFECT_UNKNOWN'
    if (run.failure?.category !== 'interrupted') return 'RUN_NOT_RECOVERABLE'
    return null
  }
  function publish(record: RuntimeRecoveryRecord) {
    port.append(record.chain.sessionId, 'run.recoveryPlanned', record, record.predecessorRunId)
    projectRecovery(record)
    return record
  }
  return {
    ownership,
    assert(lease: ExecutionOwnership, runId?: string, allowSettled = false): void {
      const parsed = executionOwnershipSchema.parse(lease)
      const current = ownership(parsed.runId)
      if (
        !current ||
        current.state !== 'active' ||
        current.lease.leaseId !== parsed.leaseId ||
        current.lease.fence !== parsed.fence ||
        JSON.stringify(current.lease.owner) !== JSON.stringify(parsed.owner) ||
        (runId !== undefined && runId !== parsed.runId)
      )
        throw new HbarError('EXECUTION_OWNER_REVOKED', 'The submitting execution no longer owns this Run')
      if (!allowSettled && !['running', 'waiting_approval'].includes(port.run(parsed.runId).status))
        throw new HbarError('EXECUTION_SETTLED', 'The submitting Run has already settled')
    },
    claim(draft: ExecutionOwnership): ExecutionOwnership | null {
      return db
        .transaction(() => {
          const parsed = executionOwnershipSchema.parse(draft)
          const run = port.run(parsed.runId)
          if (run.sessionId !== parsed.sessionId)
            throw new HbarError('RUNTIME_OWNER_MISMATCH', 'Claim Session does not match Run')
          const previous = ownership(run.id)
          if (previous) {
            if (previous.state === 'active' && previous.lease.leaseId === parsed.leaseId) {
              if (
                JSON.stringify(previous.lease.owner) !== JSON.stringify(parsed.owner) ||
                JSON.stringify(previous.lease.versions) !== JSON.stringify(parsed.versions)
              )
                throw new HbarError(
                  'RUNTIME_OWNER_MISMATCH',
                  'Replayed claim does not match its durable owner and versions',
                )
              return previous.lease
            }
            return null
          }
          if (run.status !== 'queued' || port.archived(run.sessionId) || port.cancelRequested(run.id)) return null
          if (
            db
              .query("SELECT id FROM runs WHERE sessionId=? AND status IN ('running','waiting_approval')")
              .get(run.sessionId)
          )
            return null
          if (
            db
              .query("SELECT leaseId FROM runtime_execution_ownership WHERE sessionId=? AND state='active'")
              .get(run.sessionId)
          )
            return null
          const maximum =
            db.query<{ fence: number | null }, []>('SELECT MAX(fence) AS fence FROM runtime_execution_ownership').get()
              ?.fence ?? 0
          if (maximum >= Number.MAX_SAFE_INTEGER)
            throw new HbarError('EXECUTION_FENCE_EXHAUSTED', 'Durable execution fence capacity is exhausted')
          const lease = executionOwnershipSchema.parse({ ...parsed, fence: Math.max(maximum + 1, parsed.fence) })
          const started = port.start(run, Date.now())
          port.append(run.sessionId, 'execution.claimed', { lease, run: started }, run.id)
          projectOwnership(lease, 'active')
          return lease
        })
        .immediate()
    },
    release(value: ExecutionOwnership): void {
      db.transaction(() => {
        const lease = executionOwnershipSchema.parse(value)
        const current = ownership(lease.runId)
        if (!current || current.lease.leaseId !== lease.leaseId || current.lease.fence !== lease.fence)
          throw new HbarError('EXECUTION_OWNER_REVOKED', 'Execution release does not match its durable lease')
        if (current.state !== 'active') return
        if (['running', 'waiting_approval', 'queued'].includes(port.run(lease.runId).status))
          throw new HbarError('EXECUTION_UNSETTLED', 'Execution may only release a settled Run')
        port.append(lease.sessionId, 'execution.released', { lease }, lease.runId)
        projectOwnership(lease, 'released')
      }).immediate()
    },
    revoke(value: RuntimeOwner, runIds: readonly string[]): string[] {
      const owner = runtimeOwnerSchema.parse(value)
      const ids = z.array(z.string().min(1).max(160)).max(256).parse(runIds)
      return db
        .transaction(() => {
          const revoked: string[] = []
          for (const id of new Set(ids)) {
            const current = ownership(id)
            if (!current || current.state !== 'active') continue
            // A failed dependency fences the Kernel's lease as well as its own writes.
            if (
              current.lease.owner.incarnation !== owner.incarnation &&
              ![current.lease.versions.driver, ...current.lease.versions.plugins, ...current.lease.versions.hooks].some(
                (version) => version.unitId === owner.unitId && version.generation === owner.generation,
              )
            )
              throw new HbarError('RUNTIME_OWNER_MISMATCH', 'Fault owner is not bound to this Run')
            port.append(current.lease.sessionId, 'execution.revoked', { lease: current.lease, failedOwner: owner }, id)
            projectOwnership(current.lease, 'revoked')
            revoked.push(id)
          }
          return revoked
        })
        .immediate()
    },
    readRecovery,
    readChain,
    cancelRecovery(runId: string): { run: Run; events: SessionEvent[] } {
      return db
        .transaction(() => {
          const original = port.run(runId)
          const recovery = readRecovery(runId)
          const chainId = original.recovery?.chainId ?? recovery?.chain.chainId
          const chain = chainId ? readChain(chainId) : null
          const ids = new Set([original.id, ...(chain ? [chain.rootRunId, chain.currentRunId] : [])])
          const events: SessionEvent[] = []
          // The chain has at most two continuations. Cancellation and queueing share this writer transaction.
          for (const id of ids) {
            const cancelled = port.requestCancel(id)
            if (cancelled.event) events.push(cancelled.event)
          }
          return { run: port.run(chain?.currentRunId ?? original.id), events }
        })
        .immediate()
    },
    holdRecovery(
      predecessorRunId: string,
      recoveryId: string,
      reasonCode: string | null,
      manual?: RuntimeManualRecovery,
    ): RuntimeRecoveryRecord {
      return db
        .transaction(() => {
          const record = readRecovery(predecessorRunId)
          if (!record || record.recoveryId !== recoveryId)
            throw new HbarError('RECOVERY_NOT_FOUND', 'Recovery identity does not match its durable record')
          if (record.run) return record
          if (manual) {
            manual = runtimeManualRecoverySchema.parse(manual)
            if (
              record.manual &&
              (record.manual.command.actorId !== manual.command.actorId ||
                record.manual.command.inputHash !== manual.command.inputHash)
            )
              throw new HbarError(
                'IDEMPOTENCY_CONFLICT',
                'Interrupted continuation already belongs to a different manual request',
              )
            if (record.chain.attempts >= 32) return record
            if (record.chain.status === 'manual_required' && record.chain.reasonCode !== 'RECOVERY_LIMIT') return record
          } else if (record.chain.status === 'manual_required') return record
          const code =
            reason(port.run(predecessorRunId)) ??
            (reasonCode === null ? null : z.string().min(1).max(128).parse(reasonCode))
          if (!manual && record.chain.reasonCode === code && record.chain.status === (code ? 'waiting' : 'pending'))
            return record
          return publish({
            ...record,
            ...(manual ? { manual } : {}),
            chain: { ...record.chain, status: code ? 'waiting' : 'pending', reasonCode: code, updatedAt: Date.now() },
          })
        })
        .immediate()
    },
    reconcileRecovery(predecessorRunId: string, recoveryId: string): void {
      db.transaction(() => {
        const record = readRecovery(predecessorRunId)
        const run = port.run(predecessorRunId)
        if (!record || record.recoveryId !== recoveryId || record.run || run.status !== 'interrupted' || reason(run))
          throw new HbarError('RECOVERY_NOT_READY', 'Reconciliation requires a known interrupted recovery predecessor')
        port.reconcile(run)
      }).immediate()
    },
    appendRecovery(predecessorRunId: string, recoveryId: string, type: string, data: unknown): SessionEvent {
      return db
        .transaction(() => {
          const record = readRecovery(predecessorRunId)
          const run = port.run(predecessorRunId)
          const permitted = new Set(['goal.accounted', 'goal.updated', 'goal.run_bound', 'budget.accounted'])
          if (
            !record ||
            record.recoveryId !== recoveryId ||
            record.run ||
            run.status !== 'interrupted' ||
            !permitted.has(type)
          )
            throw new HbarError(
              'RECOVERY_WRITE_FORBIDDEN',
              'Reconciliation may only append accounting for its interrupted predecessor',
            )
          return port.append(run.sessionId, type, data, run.id)
        })
        .immediate()
    },
    planRecovery(predecessorRunId: string): RuntimeRecoveryRecord {
      return db
        .transaction(() => {
          const previous = readRecovery(predecessorRunId)
          if (previous) return previous
          const run = port.run(predecessorRunId)
          const authority = ownership(run.id)
          if (authority?.state === 'active' || run.status !== 'interrupted')
            throw new HbarError('EXECUTION_UNSETTLED', 'Reconcile and interrupt the prior execution before recovery')
          const rootRunId = run.recovery?.rootRunId ?? run.id
          const chainId = run.recovery?.chainId ?? `recovery:${run.id}`
          const attempts = run.recovery?.attempt ?? 0
          const automaticAttempts = run.recovery?.automaticAttempt ?? attempts
          const reasonCode =
            attempts >= 32 ? 'RECOVERY_TOTAL_LIMIT' : automaticAttempts >= 2 ? 'RECOVERY_LIMIT' : reason(run)
          const chain: RecoveryChain = {
            chainId,
            sessionId: run.sessionId,
            rootRunId,
            currentRunId: run.id,
            attempts,
            automaticAttempts,
            status: reasonCode
              ? reasonCode === 'APPROVAL_PENDING' || reasonCode === 'EFFECT_UNKNOWN'
                ? 'waiting'
                : 'manual_required'
              : 'pending',
            reasonCode,
            updatedAt: Date.now(),
          }
          return publish({ recoveryId: crypto.randomUUID(), predecessorRunId, chain, run: null })
        })
        .immediate()
    },
    queueRecovery(predecessorRunId: string, recoveryId: string): RuntimeRecoveryRecord {
      return db
        .transaction(() => {
          const record = readRecovery(predecessorRunId)
          if (!record || record.recoveryId !== recoveryId)
            throw new HbarError('RECOVERY_NOT_FOUND', 'Recovery identity does not match its durable record')
          if (record.run)
            return { ...record, run: port.run(record.run.id), chain: readChain(record.chain.chainId) ?? record.chain }
          if (record.chain.status !== 'pending') return record
          const original = port.run(predecessorRunId)
          const reasonCode = reason(original)
          if (reasonCode)
            return publish({
              ...record,
              chain: {
                ...record.chain,
                status:
                  reasonCode === 'APPROVAL_PENDING' || reasonCode === 'EFFECT_UNKNOWN' ? 'waiting' : 'manual_required',
                reasonCode,
                updatedAt: Date.now(),
              },
            })
          const automaticAttempts = record.chain.automaticAttempts ?? record.chain.attempts
          if ((!record.manual && automaticAttempts >= 2) || record.chain.attempts >= 32)
            throw new HbarError('RECOVERY_LIMIT', 'Continuation requires manual admission within its recovery budget')
          const relationship = runRecoverySchema.parse({
            recoveryId,
            chainId: record.chain.chainId,
            rootRunId: record.chain.rootRunId,
            predecessorRunId,
            attempt: record.chain.attempts + 1,
            automaticAttempt: automaticAttempts + (record.manual ? 0 : 1),
            ...(record.manual ? { manual: true } : {}),
          })
          const chain: RecoveryChain = {
            ...record.chain,
            attempts: relationship.attempt,
            automaticAttempts: automaticAttempts + (record.manual ? 0 : 1),
            status: 'running',
            updatedAt: Date.now(),
          }
          const run = port.queue(original, relationship, chain, record.manual)
          const queued = { ...record, chain: { ...chain, currentRunId: run.id }, run }
          projectRecovery(queued)
          return queued
        })
        .immediate()
    },
    restore(event: SessionEvent): boolean {
      if (['execution.claimed', 'execution.released', 'execution.revoked'].includes(event.type)) {
        const data = z.object({ lease: executionOwnershipSchema, run: runSchema.optional() }).parse(event.data)
        if (data.lease.sessionId !== event.sessionId || data.lease.runId !== event.runId)
          throw new HbarError('SESSION_LOG_CORRUPTED', 'Execution journal identity does not match the event')
        projectOwnership(
          data.lease,
          event.type === 'execution.claimed' ? 'active' : event.type === 'execution.released' ? 'released' : 'revoked',
        )
        if (data.run)
          db.query('UPDATE runs SET status=?,startedAt=? WHERE id=?').run(
            data.run.status,
            data.run.startedAt,
            data.run.id,
          )
        return true
      }
      if (event.type === 'run.recoveryPlanned' || event.type === 'run.recoveryQueued') {
        const record = runtimeRecoveryRecordSchema.parse(event.data)
        if (record.chain.sessionId !== event.sessionId)
          throw new HbarError('SESSION_LOG_CORRUPTED', 'Recovery journal Session does not match the event')
        if (record.launchTarget) {
          if (record.launchTarget.sessionId !== event.sessionId)
            throw new HbarError('SESSION_LOG_CORRUPTED', 'Recovery checkout belongs to another Session')
          port.restoreBinding(record.launchTarget)
        }
        projectRecovery(record)
        if (record.run) {
          const run = record.run
          db.query(
            `INSERT INTO runs(id,sessionId,requestId,input,modelId,status,createdAt,startedAt,endedAt,error,recovery)
            VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`,
          ).run(
            run.id,
            run.sessionId,
            run.requestId,
            JSON.stringify(run.input),
            run.modelId,
            run.status,
            run.createdAt,
            run.startedAt,
            run.endedAt,
            run.error,
            JSON.stringify(run.recovery),
          )
        }
        return true
      }
      return false
    },
  }
}
