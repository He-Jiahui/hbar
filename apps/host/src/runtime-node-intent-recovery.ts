import { setTimeout as pause } from 'node:timers/promises'
import { HbarError } from '@hbar/contracts'
import { nodeCallAuthoritySchema, nodeReceiptSchema, type NodeReceipt } from '@hbar/contracts/node'
import type { ToolResult } from '@hbar/plugin-sdk'
import type { NodeExecutionIntentRecord, StoragePort } from '@hbar/storage'
import { reconcileNodeToolIntent, type NodeToolIntentRecoveryIdentity } from '@hbar/kernel/node-intent-recovery'
import type { RuntimeNodeLinkPort } from './runtime-node-link-contract'

type RecoveryIdentity = Omit<NodeExecutionIntentRecord, 'createdAt'>
type SettlementPort = (identity: RecoveryIdentity, result: ToolResult) => Promise<void>
export interface RuntimeNodeIntentRecovery {
  reconcileRun(runId: string, signal: AbortSignal, assertHostAuthority: () => void): Promise<'settled' | 'waiting'>
}

function identityOf(record: NodeExecutionIntentRecord): RecoveryIdentity {
  const { createdAt: _createdAt, ...identity } = record
  return identity
}

function isOffline(error: unknown): boolean {
  return (
    error instanceof HbarError &&
    ['NODE_OFFLINE', 'NODE_BUSY', 'NODE_LINK_UNAVAILABLE', 'NODE_RESULT_UNKNOWN', 'RUNTIME_RECOVERING'].includes(
      error.code,
    )
  )
}

/** Stable-Host adapter for durable A-side node intents. It holds no plugin invocation. */
export function createRuntimeNodeIntentRecovery(options: {
  readonly storage: StoragePort
  readonly node: Pick<RuntimeNodeLinkPort, 'call'>
  /** Atomic Storage operation: result commit and tool-intent settlement must share one transaction. */
  readonly settle: SettlementPort
}): RuntimeNodeIntentRecovery {
  return {
    async reconcileRun(runId, signal, assertHostAuthority) {
      const run = await options.storage.call('run', runId)
      const session = await options.storage.call('session', run.sessionId)
      const workspace = await options.storage.call('workspace', session.workspaceId)
      if (workspace.location?.kind !== 'node') return 'settled'
      const managedWorktree = await options.storage.call('nodeRunWorktree', runId)
      const pending: NodeExecutionIntentRecord[] = []
      let cursor: string | undefined
      for (let page = 0; page < 32; page++) {
        signal.throwIfAborted()
        const result = await options.storage.call('pendingNodeExecutionIntents', {
          runIds: [runId],
          ...(cursor ? { after: cursor } : {}),
          limit: 100,
        })
        pending.push(...result.items)
        if (!result.nextCursor) break
        cursor = result.nextCursor
        if (page === 31)
          throw new HbarError('NODE_RECOVERY_CAPACITY', 'Too many pending node execution intents to recover safely')
      }
      if (pending.length === 0) return 'settled'
      if (pending.some((intent) => intent.kind !== 'process'))
        throw new HbarError(
          'NODE_RECOVERY_UNSUPPORTED',
          'A pending node intent has no process receipt recovery contract',
        )
      for (const record of pending) {
        signal.throwIfAborted()
        const identity = identityOf(record)
        let delayMs = 100
        while (!signal.aborted) {
          try {
            const outcome = await reconcileNodeToolIntent(identity, {
              assertCurrentScope: async (candidate) => {
                assertHostAuthority()
                const currentRun = await options.storage.call('run', candidate.runId)
                const currentSession = await options.storage.call('session', candidate.sessionId)
                const currentWorkspace = await options.storage.call('workspace', candidate.workspaceId)
                const location = currentWorkspace.location
                const authority = nodeCallAuthoritySchema.parse(candidate.authority)
                if (
                  candidate.runId !== runId ||
                  currentRun.id !== candidate.runId ||
                  currentRun.sessionId !== candidate.sessionId ||
                  !['running', 'waiting_approval', 'interrupted'].includes(currentRun.status) ||
                  currentSession.id !== candidate.sessionId ||
                  currentSession.workspaceId !== candidate.workspaceId ||
                  currentWorkspace.id !== candidate.workspaceId ||
                  location?.kind !== 'node' ||
                  location.nodeId !== candidate.nodeId ||
                  (managedWorktree
                    ? managedWorktree.runId !== candidate.runId ||
                      managedWorktree.sessionId !== candidate.sessionId ||
                      managedWorktree.workspaceId !== candidate.workspaceId ||
                      managedWorktree.nodeId !== candidate.nodeId ||
                      managedWorktree.worktreeRootId !== candidate.rootId ||
                      managedWorktree.nodePath !== candidate.nodePath ||
                      authority.managedWorktree?.worktreeId !== managedWorktree.worktreeId ||
                      authority.managedWorktree.targetRevision !== managedWorktree.worktreeTargetRevision
                    : location.rootId !== candidate.rootId || location.nodePath !== candidate.nodePath) ||
                  authority.sessionId !== candidate.sessionId ||
                  authority.runId !== candidate.runId ||
                  authority.callId !== candidate.callId ||
                  candidate.operationId !== `${candidate.runId}:${candidate.callId}`
                )
                  throw new HbarError(
                    'WORKSPACE_SCOPE',
                    'The interrupted node execution no longer matches its pinned workspace authority',
                  )
              },
              readReceipt: async (operationId): Promise<NodeReceipt> => {
                signal.throwIfAborted()
                return nodeReceiptSchema.parse(
                  await options.node.call(identity.nodeId, 'exec.receipt', { operationId }, signal),
                )
              },
              commitSettled: async (candidate, result) => {
                assertHostAuthority()
                await options.settle(identityOfRecord(candidate, identity), result)
              },
              settleNeverAccepted: async (candidate) => {
                assertHostAuthority()
                await options.settle(identityOfRecord(candidate, identity), {
                  text: 'The workspace node never accepted this execution. The Run may continue through normal admission.',
                  isError: true,
                  details: { code: 'NODE_NOT_STARTED', executionStarted: false },
                  outcome: { kind: 'failed', executionStarted: false },
                })
              },
            })
            if (outcome.state !== 'waiting') break
          } catch (error) {
            if (!isOffline(error)) {
              if (signal.aborted) return 'waiting'
              throw error
            }
          }
          try {
            await pause(delayMs, undefined, { signal })
          } catch {
            return 'waiting'
          }
          delayMs = Math.min(2_000, delayMs * 2)
        }
        if (signal.aborted) return 'waiting'
      }
      return 'settled'
    },
  }
}

function identityOfRecord(candidate: NodeToolIntentRecoveryIdentity, original: RecoveryIdentity): RecoveryIdentity {
  if (candidate.operationId !== original.operationId || candidate.nodeId !== original.nodeId)
    throw new HbarError('EXECUTION_OWNER_MISMATCH', 'Node receipt settlement changed its durable intent identity')
  return original
}
