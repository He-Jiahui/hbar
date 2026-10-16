import type { Database } from 'bun:sqlite'
import { HbarError, type Run, type SessionEvent, type ContentBlock, type ApprovalMode } from '@hbar/contracts'
import type { Session, Workspace } from '@hbar/contracts/directory'
import type { DelegatedInputRecord } from '@hbar/contracts/delegated-user-input'
import type { ExecutionPrincipal } from '@hbar/contracts/execution-principal'
import type { RunSteeringRegistry } from './run-steering'

type Append = (sessionId: string, type: string, data: unknown, runId?: string) => SessionEvent
export function delegatedDecisionText(state: DelegatedInputRecord): string {
  const text = JSON.stringify({
    kind: 'hbar.delegated_input',
    version: 1,
    instruction:
      'Answer this delegated decision with hbar_decision_reply, using the current grant from hbar_decisions_inbox. Return human if facts are missing or you decline. This request grants no permission to execute the source task. Preserve your current task and continue it after replying.',
    grant: { sessionId: state.sessionId, requestId: state.requestId, delegationId: state.delegationId },
    expiresAt: state.expiresAt,
    request: state.request,
    ...(state.approval ? { approval: state.approval } : {}),
  })
  if (Buffer.byteLength(text, 'utf8') > 128_000)
    throw new HbarError('DELEGATION_CAPACITY', 'The decision envelope exceeds its delivery capacity')
  return text
}

/** Plans are process-private and published only after their canonical source grant is durable. */
export function createDelegatedInputDelivery(
  db: Database,
  append: Append,
  ports: {
    session(id: string): Session
    workspace(id: string): Workspace
    run(id: string): Run
    principal(id: string): ExecutionPrincipal | null
    steering: RunSteeringRegistry
    indexMessage(id: string, sessionId: string, seq: number, content: ContentBlock[]): void
  },
) {
  return {
    plan(state: DelegatedInputRecord, permission: ApprovalMode) {
      const text = delegatedDecisionText(state)
      const active = db
        .query<{ id: string }, [string]>(
          "SELECT id FROM runs WHERE sessionId=? AND status IN ('running','waiting_approval') ORDER BY createdAt LIMIT 1",
        )
        .get(state.targetSessionId)
      if (active) {
        const target = ports.run(active.id)
        if (target.status !== 'running' || !ports.steering.canAdmit(state.targetSessionId, active.id))
          throw new HbarError('DELEGATION_TARGET_BUSY', 'The target is not at an open model steering boundary')
        const messageId = crypto.randomUUID()
        const content: ContentBlock[] = [{ type: 'text', text }]
        return {
          kind: 'guidance' as const,
          targetRunId: target.id,
          publish() {
            const event = append(
              state.targetSessionId,
              'message.committed',
              {
                id: messageId,
                role: 'user',
                content,
                decisionDelegation: {
                  sessionId: state.sessionId,
                  requestId: state.requestId,
                  delegationId: state.delegationId,
                  targetRunId: target.id,
                },
              },
              target.id,
            )
            db.query('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)').run(
              messageId,
              state.targetSessionId,
              target.id,
              'user',
              JSON.stringify(content),
              event.seq,
              event.time,
              null,
            )
            ports.indexMessage(messageId, state.targetSessionId, event.seq, content)
            ports.steering.admit(state.targetSessionId, target.id, messageId)
            return [event]
          },
        }
      }
      if (db.query("SELECT 1 FROM runs WHERE sessionId=? AND status='queued' LIMIT 1").get(state.targetSessionId))
        throw new HbarError('DELEGATION_TARGET_BUSY', 'The target already has an admitted task waiting to start')
      const owner = ports.session(state.targetSessionId)
      const workspace = ports.workspace(owner.workspaceId)
      // No workspace tools are available to dedicated decisions. Remote worktree setup is not implicit authority.
      if (workspace.location?.kind === 'node')
        throw new HbarError(
          'DELEGATION_TARGET_UNAVAILABLE',
          'Dedicated decisions in remote workspaces require an admitted execution target',
        )
      const latest = db
        .query<{ id: string }, [string]>(
          'SELECT id FROM runs WHERE sessionId=? ORDER BY createdAt DESC,id DESC LIMIT 1',
        )
        .get(owner.id)
      const modelId = ports.run(latest?.id ?? state.sourceRunId).modelId
      const principal = ports.principal(state.sourceRunId)
      if (!principal || principal.actorId !== state.sourceActorId)
        throw new HbarError('FORBIDDEN', 'The dedicated decision requires its original source device')
      const run: Run = {
        id: crypto.randomUUID(),
        sessionId: owner.id,
        requestId: `decision:${state.delegationId}`,
        input: {
          text,
          images: [],
          files: [],
          source: 'system',
          mode: 'default',
          approval: 'deny',
          permissionAtAdmission: permission,
          delegatedDecision: {
            sessionId: state.sessionId,
            requestId: state.requestId,
            delegationId: state.delegationId,
          },
        },
        modelId,
        status: 'queued',
        createdAt: Date.now(),
        startedAt: null,
        endedAt: null,
        error: null,
      }
      return {
        kind: 'dedicated' as const,
        targetRunId: run.id,
        publish() {
          const event = append(
            owner.id,
            'run.queued',
            { run, executionPrincipal: principal, workspaceId: owner.workspaceId },
            run.id,
          )
          db.query(
            'INSERT INTO runs(id,sessionId,requestId,input,modelId,status,createdAt,startedAt,endedAt,error) VALUES(?,?,?,?,?,?,?,?,?,?)',
          ).run(
            run.id,
            owner.id,
            run.requestId,
            JSON.stringify(run.input),
            modelId,
            'queued',
            run.createdAt,
            null,
            null,
            null,
          )
          return [event]
        },
      }
    },
  }
}
