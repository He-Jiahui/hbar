import { createHash } from 'node:crypto'
import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import {
  operationCancelResultSchema,
  operationSnapshotSchema,
  peerMessageReceiptSchema,
  type PeerMessageSendInput,
  type PeerMessageReceipt,
} from '@hbar/contracts/commands/run'
import { workflowCommands } from '@hbar/contracts/commands/workflows'
import type { WorkflowService } from '@hbar/plugin-sdk'
import type { WorkflowTargetDispatch } from '@hbar/contracts'

interface WorkflowTargetTransport {
  lookup(
    input: PeerMessageSendInput,
    options: { actorId: string; idempotencyKey: string },
  ): Promise<{ receipt: PeerMessageReceipt; runInputMatches: boolean; runStartSeq: number } | null>
  send(
    input: PeerMessageSendInput,
    options: { actorId: string; idempotencyKey: string; requestId: string; signal: AbortSignal },
  ): Promise<unknown>
  cancel(
    operationId: string,
    options: { actorId: string; idempotencyKey: string; requestId: string; signal: AbortSignal },
  ): Promise<unknown>
  get(
    operationId: string,
    options: { actorId: string; idempotencyKey: string; requestId: string; signal: AbortSignal },
  ): Promise<unknown>
}

function dispatchInput(sourceSessionId: string, dispatch: WorkflowTargetDispatch): PeerMessageSendInput {
  return {
    senderSessionId: sourceSessionId,
    targetSessionId: dispatch.targetSessionId,
    workspaceId: dispatch.workspaceId,
    modelId: dispatch.modelId,
    text: dispatch.messageText,
    deliveryPolicy: 'queue',
  }
}

function knownNoAdmissionError(error: unknown) {
  return (
    error instanceof CommandError && ['FORBIDDEN', 'ARCHIVED', 'INVALID_INPUT', 'COMMAND_CONFLICT'].includes(error.code)
  )
}

async function sendTargetDispatch(
  service: WorkflowService,
  transport: WorkflowTargetTransport,
  sourceSessionId: string,
  dispatch: WorkflowTargetDispatch,
  actorId: string,
  signal: AbortSignal,
) {
  const before = await service.get(sourceSessionId)
  const admission = before.targetDispatches.find((entry) => entry.dispatchId === dispatch.dispatchId)
  if (!['active', 'verifying'].includes(before.workflow?.status ?? '') || admission?.status !== 'dispatching') return
  try {
    const acknowledgement = peerMessageReceiptSchema.parse(
      await transport.send(dispatchInput(sourceSessionId, dispatch), {
        actorId,
        idempotencyKey: dispatch.peerIdempotencyKey,
        requestId: dispatch.peerIdempotencyKey,
        signal,
      }),
    )
    const canonical = await transport.lookup(dispatchInput(sourceSessionId, dispatch), {
      actorId,
      idempotencyKey: dispatch.peerIdempotencyKey,
    })
    if (!canonical || canonical.receipt.operationId !== acknowledgement.operationId)
      throw new CommandError('RESULT_UNKNOWN', 'Peer acknowledgement has no matching canonical Run receipt')
    const receipt = peerMessageReceiptSchema.parse(canonical.receipt)
    if (!canonical.runInputMatches) {
      await transport.cancel(receipt.operationId, {
        actorId,
        idempotencyKey: `workflow-target-cancel-${dispatch.dispatchId}`,
        requestId: `workflow-target-cancel-${dispatch.dispatchId}`,
        signal: new AbortController().signal,
      })
      await service.recordTargetDispatchReceipt(sourceSessionId, dispatch.dispatchId, receipt, canonical.runStartSeq)
      await service.recordTargetDispatchStale(sourceSessionId, dispatch.dispatchId, 'TARGET_RUN_INPUT_CHANGED')
      return
    }
    const after = await service.recordTargetDispatchReceipt(
      sourceSessionId,
      dispatch.dispatchId,
      receipt,
      canonical.runStartSeq,
    )
    const recorded = after.targetDispatches.find((entry) => entry.dispatchId === dispatch.dispatchId)
    if (recorded?.status === 'stale' || !['active', 'verifying'].includes(after.workflow?.status ?? '')) {
      await transport
        .cancel(receipt.operationId, {
          actorId,
          idempotencyKey: `workflow-target-cancel-${dispatch.dispatchId}`,
          requestId: `workflow-target-cancel-${dispatch.dispatchId}`,
          signal: new AbortController().signal,
        })
        .catch(() => {})
    }
  } catch (error) {
    await service.recordTargetDispatchFailure(
      sourceSessionId,
      dispatch.dispatchId,
      error instanceof CommandError ? error.code : 'RESULT_UNKNOWN',
      knownNoAdmissionError(error) ? 'known_failure' : 'unknown',
    )
  }
}

export function createWorkflowCommands(service: WorkflowService, targetTransport?: WorkflowTargetTransport) {
  const registry = new CommandRegistry({ execution: 'host' })
  const translate = async <Value>(operation: () => Promise<Value>): Promise<Value> => {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }

  registry.register(workflowCommands['workflow.get'], ({ sessionId }) => translate(() => service.get(sessionId)))
  registry.register(
    workflowCommands['workflow.focus.set'],
    ({ sessionId, stepIndex, item, completionPolicy, expectedPlanRevision }) =>
      translate(() => service.focus(sessionId, stepIndex, item, completionPolicy, expectedPlanRevision)),
    { durable: true },
  )
  registry.register(
    workflowCommands['workflow.plan.save'],
    ({ sessionId, objective, items, expectedRevision }) =>
      translate(() => service.savePlan(sessionId, objective, items, expectedRevision)),
    { durable: true },
  )
  registry.register(
    workflowCommands['workflow.start'],
    ({ sessionId, objective, items, tokenBudget }, context) =>
      translate(() => {
        if (!context.actorId || !context.idempotencyKey)
          throw new HbarError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
        const inputHash = createHash('sha256')
          .update(JSON.stringify({ sessionId, objective, items, tokenBudget }))
          .digest('hex')
        return service.start(sessionId, objective, items, tokenBudget, undefined, {
          actorId: context.actorId,
          idempotencyKey: context.idempotencyKey,
          requestId: context.requestId,
          inputHash,
        })
      }),
    { durable: true },
  )
  registry.register(
    workflowCommands['workflow.activate'],
    ({ sessionId, planRevision, tokenBudget }) =>
      translate(() => service.activate(sessionId, planRevision, tokenBudget)),
    { durable: true },
  )
  registry.register(
    workflowCommands['workflow.expandScope'],
    ({ sessionId, itemId, scope, reason, expectedRevision }) =>
      translate(() => service.expandScope(sessionId, itemId, scope, reason, expectedRevision)),
    { durable: true },
  )
  registry.register(
    workflowCommands['workflow.checkpoint'],
    ({ sessionId, itemId, outcome, summary, evidenceIds, nextItemId, expectedRevision }) =>
      translate(() =>
        service.checkpoint(sessionId, itemId, outcome, summary, nextItemId, expectedRevision, evidenceIds),
      ),
    { durable: true },
  )
  registry.register(
    workflowCommands['workflow.delegate'],
    ({ sessionId, itemIds, modelId, tokenBudget, expectedRevision }) =>
      translate(() => service.delegate(sessionId, itemIds, modelId, tokenBudget, expectedRevision)),
    { durable: true },
  )
  registry.register(
    workflowCommands['workflow.acceptCheck'],
    ({ sessionId, itemId, checkId, decision, note, expectedRevision }, context) =>
      translate(() => {
        if (!context.actorId) throw new HbarError('INVALID_INPUT', 'Authenticated actor is required')
        return service.acceptCheck(sessionId, itemId, checkId, decision, note, expectedRevision, context.actorId)
      }),
    { durable: true },
  )
  const requireTargetTransport = () => {
    if (!targetTransport) throw new HbarError('WORKFLOW_UNAVAILABLE', 'Workflow target transport is unavailable')
    return targetTransport
  }
  registry.register(
    workflowCommands['workflow.targets.dispatch'],
    async ({ sessionId, planId, planRevision, itemIds, modelId }, context) =>
      translate(async () => {
        if (!context.actorId || !context.idempotencyKey || !context.requestId)
          throw new HbarError('INVALID_INPUT', 'Authenticated actor, request, and idempotency key are required')
        const prepared = await service.prepareTargetDispatch(sessionId, planId, planRevision, itemIds, modelId, {
          actorId: context.actorId,
          idempotencyKey: context.idempotencyKey,
          requestId: context.requestId,
          inputHash: createHash('sha256')
            .update(JSON.stringify({ sessionId, planId, planRevision, itemIds, modelId }))
            .digest('hex'),
        })
        if (!prepared.createdDispatchIds.length) return service.get(sessionId)
        const transport = requireTargetTransport()
        for (const dispatch of prepared.dispatches) {
          if (!prepared.createdDispatchIds.includes(dispatch.dispatchId)) continue
          await sendTargetDispatch(service, transport, sessionId, dispatch, context.actorId, context.signal)
        }
        return service.get(sessionId)
      }),
    { durable: true },
  )
  registry.register(
    workflowCommands['workflow.targets.reconcile'],
    async ({ sessionId, planId, planRevision, dispatchIds }, context) =>
      translate(async () => {
        if (!context.actorId || !context.idempotencyKey || !context.requestId)
          throw new HbarError('INVALID_INPUT', 'Authenticated actor, request, and idempotency key are required')
        const transport = requireTargetTransport()
        const preparation = await service.prepareTargetReconciliation(
          sessionId,
          planId,
          planRevision,
          dispatchIds,
          context.actorId,
        )
        const retryIds = new Set(preparation.retryDispatchIds)
        const before = await service.get(sessionId)
        const selected = preparation.dispatches
        const staleIds = new Set<string>()
        const canonicalRunIds = new Map<string, string>()
        for (const dispatch of selected) {
          if (
            ['failed', 'cancelled'].includes(dispatch.status) ||
            (dispatch.status === 'succeeded' && dispatch.targetRunStartSeq !== null && dispatch.resultSummary !== null)
          )
            continue
          const activeParent =
            dispatch.status !== 'stale' &&
            ['active', 'verifying'].includes(before.workflow?.status ?? '') &&
            before.workflow?.workflowId === dispatch.workflowId &&
            before.workflowPlan?.planId === planId &&
            before.workflowPlan.revision === planRevision &&
            before.workflowPlan.phase === 'active'
          if (!activeParent) {
            retryIds.delete(dispatch.dispatchId)
            let operationId = dispatch.operationId
            const found = await transport.lookup(dispatchInput(sessionId, dispatch), {
              actorId: context.actorId,
              idempotencyKey: dispatch.peerIdempotencyKey,
            })
            const lookup = found ? { ...found, receipt: peerMessageReceiptSchema.parse(found.receipt) } : null
            if (lookup) {
              const receipt = lookup.receipt
              if (operationId && operationId !== receipt.operationId)
                throw new HbarError('RESULT_UNKNOWN', 'Stored target Run does not match its canonical peer receipt')
              await service.recordTargetDispatchReceipt(sessionId, dispatch.dispatchId, receipt, lookup.runStartSeq)
              operationId = receipt.operationId
            }
            if (operationId) {
              await transport.cancel(operationId, {
                actorId: context.actorId,
                idempotencyKey: `workflow-target-cancel-${dispatch.dispatchId}`,
                requestId: `workflow-target-cancel-${dispatch.dispatchId}`,
                signal: new AbortController().signal,
              })
            }
            await service.recordTargetDispatchStale(
              sessionId,
              dispatch.dispatchId,
              lookup && !lookup.runInputMatches ? 'TARGET_RUN_INPUT_CHANGED' : 'PARENT_WORKFLOW_INACTIVE',
            )
            staleIds.add(dispatch.dispatchId)
            continue
          }
          const found = await transport.lookup(dispatchInput(sessionId, dispatch), {
            actorId: context.actorId,
            idempotencyKey: dispatch.peerIdempotencyKey,
          })
          const lookup = found ? { ...found, receipt: peerMessageReceiptSchema.parse(found.receipt) } : null
          if (lookup) {
            if (dispatch.operationId && dispatch.operationId !== lookup.receipt.operationId)
              throw new HbarError('RESULT_UNKNOWN', 'Stored target Run does not match its canonical peer receipt')
            await service.recordTargetDispatchReceipt(
              sessionId,
              dispatch.dispatchId,
              lookup.receipt,
              lookup.runStartSeq,
            )
            retryIds.delete(dispatch.dispatchId)
            if (!lookup.runInputMatches) {
              await transport.cancel(lookup.receipt.operationId, {
                actorId: context.actorId,
                idempotencyKey: `workflow-target-cancel-${dispatch.dispatchId}`,
                requestId: `workflow-target-cancel-${dispatch.dispatchId}`,
                signal: new AbortController().signal,
              })
              await service.recordTargetDispatchStale(sessionId, dispatch.dispatchId, 'TARGET_RUN_INPUT_CHANGED')
              staleIds.add(dispatch.dispatchId)
            } else {
              canonicalRunIds.set(dispatch.dispatchId, lookup.receipt.operationId)
            }
          } else if (retryIds.has(dispatch.dispatchId)) {
            continue
          } else {
            throw new HbarError('RESULT_UNKNOWN', 'Accepted target Run has no canonical peer receipt')
          }
        }
        for (const dispatch of selected) {
          const operationId = canonicalRunIds.get(dispatch.dispatchId) ?? dispatch.operationId
          const recoveredThisPass = canonicalRunIds.has(dispatch.dispatchId)
          if (
            staleIds.has(dispatch.dispatchId) ||
            retryIds.has(dispatch.dispatchId) ||
            !operationId ||
            (!recoveredThisPass &&
              !['queued', 'running', 'waiting_approval', 'cancel_requested'].includes(dispatch.status))
          )
            continue
          const operation = operationSnapshotSchema.parse(
            await transport.get(operationId, {
              actorId: context.actorId,
              idempotencyKey: context.idempotencyKey,
              requestId: context.requestId,
              signal: context.signal,
            }),
          )
          if (operation.sessionId !== dispatch.targetSessionId || operation.operationId !== operationId)
            throw new HbarError('RESULT_UNKNOWN', 'Canonical operation belongs to a different target session')
          let status:
            'queued' | 'running' | 'waiting_approval' | 'cancel_requested' | 'succeeded' | 'failed' | 'cancelled'
          if (operation.status === 'queued') status = 'queued'
          else if (['running', 'guided'].includes(operation.status)) status = 'running'
          else if (operation.status === 'waiting_approval') status = 'waiting_approval'
          else if (operation.status === 'cancelRequested') status = 'cancel_requested'
          else if (operation.status === 'completed') status = 'succeeded'
          else if (operation.status === 'cancelled') status = 'cancelled'
          else status = 'failed'
          const runStatus = ['completed', 'failed', 'cancelled', 'interrupted'].includes(operation.status)
            ? (operation.status as 'completed' | 'failed' | 'cancelled' | 'interrupted')
            : undefined
          await service.recordTargetRunStatus(sessionId, dispatch.dispatchId, status, runStatus, operation.error)
        }
        for (const dispatch of selected) {
          if (!retryIds.has(dispatch.dispatchId)) continue
          await sendTargetDispatch(service, transport, sessionId, dispatch, context.actorId, context.signal)
        }
        return service.get(sessionId)
      }),
    { durable: true },
  )
  registry.register(
    workflowCommands['workflow.targets.cancel'],
    async ({ sessionId, planId, planRevision, dispatchId }, context) =>
      translate(async () => {
        if (!context.actorId || !context.idempotencyKey || !context.requestId)
          throw new HbarError('INVALID_INPUT', 'Authenticated actor, request, and idempotency key are required')
        const transport = requireTargetTransport()
        const dispatch = await service.prepareTargetCancellation(
          sessionId,
          planId,
          planRevision,
          dispatchId,
          context.actorId,
        )
        if (!dispatch.operationId)
          throw new HbarError('WORKFLOW_DISPATCH_CONFLICT', 'Target Run has no accepted operation')
        try {
          const result = operationCancelResultSchema.parse(
            await transport.cancel(dispatch.operationId, {
              actorId: context.actorId,
              idempotencyKey: `workflow-target-cancel-${dispatch.dispatchId}`,
              requestId: `workflow-target-cancel-${dispatch.dispatchId}`,
              signal: context.signal,
            }),
          )
          await service.recordTargetCancellation(
            sessionId,
            dispatchId,
            result.status === 'cancelRequested'
              ? 'cancel_requested'
              : result.status === 'cancelled'
                ? 'cancelled'
                : result.status === 'completed'
                  ? 'succeeded'
                  : 'failed',
            result.status === 'failed' || result.status === 'interrupted' ? result.status : undefined,
            result.status === 'completed'
              ? 'completed'
              : result.status === 'cancelled'
                ? 'cancelled'
                : result.status === 'failed'
                  ? 'failed'
                  : result.status === 'interrupted'
                    ? 'interrupted'
                    : undefined,
          )
        } catch (error) {
          await service.recordTargetCancellation(
            sessionId,
            dispatchId,
            'cancel_requested',
            error instanceof CommandError ? error.code : 'RESULT_UNKNOWN',
          )
        }
        return service.get(sessionId)
      }),
    { durable: true },
  )
  registry.register(
    workflowCommands['workflow.complete'],
    ({ sessionId, expectedRevision }) => translate(() => service.complete(sessionId, expectedRevision)),
    { durable: true },
  )

  return {
    ...createCommandClient(workflowCommands, registry),
    dispatchPrepared: registry.dispatchPrepared.bind(registry),
    dispatchPreparedTracked: registry.dispatchPreparedTracked.bind(registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}
