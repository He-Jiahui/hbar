import { createHash } from 'node:crypto'
import { z } from 'zod'
import { CommandError, CommandRegistry, createCommandClient, type CommandContext } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { runCommands, runCommandRecordSchema, operationSnapshotSchema } from '@hbar/contracts/commands/run'
import type {
  PeerMessageSendInput,
  QueuedRunGuideReceipt,
  RunAccepted,
  RunCommandRecord,
  SubmitRunInput,
} from '@hbar/contracts/commands/run'
import type { Run } from '@hbar/contracts'
import type { RunCommandKernelPort } from './controller-port'

function accepted(run: Run, command: RunCommandRecord): RunAccepted {
  return {
    status: 'accepted',
    commandId: 'run.submit',
    commandVersion: 1,
    requestId: command.requestId,
    idempotencyKey: command.idempotencyKey,
    operationId: run.id,
    sessionId: run.sessionId,
    acceptedAt: run.createdAt,
  }
}

function peerReceipt(
  input: PeerMessageSendInput,
  idempotencyKey: string,
  run: Run,
  status: 'accepted' | 'queued',
  delivery: 'new_run' | 'steered' | 'queued',
  sessionSeq: number,
  guide?: QueuedRunGuideReceipt,
) {
  return {
    commandId: 'session.message.send' as const,
    commandVersion: 1 as const,
    idempotencyKey,
    messageId: guide?.messageId ?? null,
    senderSessionId: input.senderSessionId,
    targetSessionId: input.targetSessionId,
    workspaceId: input.workspaceId,
    status,
    delivery,
    operationId: run.id,
    targetRunId: guide?.activeRunId ?? run.id,
    eventId: guide?.eventId ?? null,
    sessionSeq: guide?.sessionSeq ?? sessionSeq,
    acceptedAt: run.createdAt,
    deliveredAt: guide?.guidedAt ?? null,
  }
}

function peerGuideKey(actorId: string, input: PeerMessageSendInput, idempotencyKey: string) {
  return `peer-guide-${createHash('sha256')
    .update(JSON.stringify([actorId, input.workspaceId, input.senderSessionId, input.targetSessionId, idempotencyKey]))
    .digest('hex')}`
}

type PeerGuideAttempt =
  | { readonly kind: 'acknowledged'; readonly receipt: QueuedRunGuideReceipt }
  | { readonly kind: 'error'; readonly error: unknown }

export function createRunCommands(kernel: RunCommandKernelPort) {
  const registry = new CommandRegistry({ execution: 'host' })
  const locks = new Map<string, Promise<void>>()
  async function serial<T>(key: string, action: () => Promise<T>): Promise<T> {
    const previous = locks.get(key) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    locks.set(key, current)
    await previous
    try {
      return await action()
    } finally {
      release()
      if (locks.get(key) === current) locks.delete(key)
    }
  }
  async function reconcilePeerDelivery(
    actorId: string,
    input: PeerMessageSendInput,
    idempotencyKey: string,
    requestId: string,
    operationId: string,
    guideAttempt: PeerGuideAttempt | null,
  ) {
    try {
      const canonical = await kernel.storage.call('runByRequestInWorkspace', input.workspaceId, requestId)
      if (!canonical || canonical.run.id !== operationId)
        throw new CommandError('RESULT_UNKNOWN', 'Peer message Run requires reconciliation')
      const guideReceipt = await kernel.storage.call(
        'queuedRunGuideReceipt',
        actorId,
        peerGuideKey(actorId, input, idempotencyKey),
        input.targetSessionId,
      )
      if (guideReceipt && guideReceipt.operationId !== operationId)
        throw new CommandError('RESULT_UNKNOWN', 'Peer message guide receipt does not match its Run')
      if (guideReceipt && guideAttempt?.kind === 'acknowledged') {
        const acknowledged = guideAttempt.receipt
        if (
          acknowledged.commandId !== guideReceipt.commandId ||
          acknowledged.commandVersion !== guideReceipt.commandVersion ||
          acknowledged.sessionId !== guideReceipt.sessionId ||
          acknowledged.operationId !== guideReceipt.operationId ||
          acknowledged.activeRunId !== guideReceipt.activeRunId ||
          acknowledged.status !== guideReceipt.status ||
          acknowledged.operationStatus !== guideReceipt.operationStatus ||
          acknowledged.messageId !== guideReceipt.messageId ||
          acknowledged.eventId !== guideReceipt.eventId ||
          acknowledged.idempotencyKey !== guideReceipt.idempotencyKey ||
          acknowledged.revision !== guideReceipt.revision ||
          acknowledged.sessionSeq !== guideReceipt.sessionSeq ||
          acknowledged.queueRevision !== guideReceipt.queueRevision ||
          acknowledged.guidedAt !== guideReceipt.guidedAt
        )
          throw new CommandError('RESULT_UNKNOWN', 'Peer message guide acknowledgement conflicts with its receipt')
      }
      if (!guideReceipt && guideAttempt?.kind === 'acknowledged')
        throw new CommandError('RESULT_UNKNOWN', 'Peer message guide acknowledgement has no durable receipt')
      if (
        !guideReceipt &&
        guideAttempt?.kind === 'error' &&
        (!(guideAttempt.error instanceof HbarError || guideAttempt.error instanceof CommandError) ||
          guideAttempt.error.code !== 'COMMAND_CONFLICT')
      )
        throw new CommandError('RESULT_UNKNOWN', 'Peer message guidance outcome requires reconciliation')
      if (!guideReceipt && canonical.run.status === 'guided')
        throw new CommandError('RESULT_UNKNOWN', 'Peer message guidance receipt is unavailable')
      const active = await kernel.storage.call('activeOperations', { sessionId: input.targetSessionId, limit: 20 })
      const activeRun = active.items.find((item) =>
        ['running', 'waiting_approval', 'cancelRequested'].includes(item.status),
      )
      return { run: canonical.run, guideReceipt, activeRun }
    } catch (error) {
      if (error instanceof CommandError && error.code === 'RESULT_UNKNOWN') throw error
      throw new CommandError('RESULT_UNKNOWN', 'Peer message delivery requires reconciliation')
    }
  }
  async function lookup(input: SubmitRunInput, command: RunCommandRecord, requestId: string) {
    const found = await kernel.storage.call('runByRequest', input.sessionId, requestId)
    if (!found) return null
    if (
      !found.command ||
      found.command.actorId !== command.actorId ||
      found.command.idempotencyKey !== command.idempotencyKey ||
      found.command.inputHash !== command.inputHash
    )
      throw new CommandError('IDEMPOTENCY_CONFLICT', 'Run key was used with different input')
    return accepted(found.run, found.command)
  }
  function receiptScope(
    commandId: 'run.submit' | 'run.retry',
    sessionId: string,
    actorId: string,
    idempotencyKey: string,
  ) {
    return JSON.stringify(
      commandId === 'run.submit'
        ? [sessionId, actorId, idempotencyKey]
        : [sessionId, actorId, commandId, idempotencyKey],
    )
  }
  async function submit(
    input: SubmitRunInput,
    context: CommandContext,
    identity: { readonly id: 'run.submit' | 'run.retry'; readonly input: unknown },
  ) {
    const actorId = context.actorId,
      idempotencyKey = context.idempotencyKey
    if (!actorId || !idempotencyKey)
      throw new CommandError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
    const scope = receiptScope(identity.id, input.sessionId, actorId, idempotencyKey)
    const requestId = `command-${createHash('sha256').update(scope).digest('hex')}`
    const command = runCommandRecordSchema.parse({
      actorId,
      idempotencyKey,
      requestId: context.requestId,
      inputHash: createHash('sha256')
        .update(JSON.stringify({ id: identity.id, version: 1, input: identity.input }))
        .digest('hex'),
    })
    return serial(scope, async () => {
      let prior: RunAccepted | null
      try {
        prior = await lookup(input, command, requestId)
      } catch (error) {
        if (error instanceof CommandError) throw error
        throw new CommandError('RESULT_UNKNOWN', 'Run journal is unavailable')
      }
      if (prior) return prior
      let continuingFrom: string | undefined
      try {
        let run: Run
        if (identity.id === 'run.retry') {
          const source = z.object({ operationId: z.string() }).parse(identity.input)
          let predecessor = await kernel.storage.call('run', source.operationId)
          const planned = await kernel.storage.call('runtimeRecoveryRead', predecessor.id)
          const chain = await kernel.storage.call(
            'runtimeRecoveryChain',
            predecessor.recovery?.chainId ?? planned?.chain.chainId ?? `recovery:${predecessor.id}`,
          )
          if (chain && chain.currentRunId !== predecessor.id)
            predecessor = await kernel.storage.call('run', chain.currentRunId)
          if (predecessor.status === 'interrupted' || predecessor.failure?.category === 'result_unknown') {
            continuingFrom = predecessor.id
            if (predecessor.failure?.category === 'result_unknown')
              throw new HbarError('EFFECT_UNKNOWN', 'Reconcile the existing side effect before continuing')
            if (!kernel.continueInterrupted)
              throw new HbarError(
                'RUNTIME_RESTART_REQUIRED',
                'Interrupted retries require the safe continuation lifecycle',
              )
            run = await kernel.continueInterrupted(predecessor.id, { requestId, command })
            const receipt = await lookup(input, command, requestId)
            if (receipt) return receipt
            throw new HbarError('RESULT_UNKNOWN', 'Continuation acceptance requires its canonical receipt')
          } else {
            if (chain)
              throw new HbarError(
                'CONTINUATION_ALREADY_EXISTS',
                'Observe the latest recovery outcome before replaying a historical task',
              )
            run = await kernel.submit(
              input.sessionId,
              requestId,
              input.input,
              input.modelId,
              command,
              context.signal,
              input.expectedLaunchTargetRevision,
            )
          }
        } else
          run = await kernel.submit(
            input.sessionId,
            requestId,
            input.input,
            input.modelId,
            command,
            context.signal,
            input.expectedLaunchTargetRevision,
          )
        return accepted(run, command)
      } catch (error) {
        // Admission may have committed before the response was lost. Inspect the canonical queued fact.
        let recovered: RunAccepted | null
        try {
          recovered = await lookup(input, command, requestId)
        } catch (lookupError) {
          if (lookupError instanceof CommandError) throw lookupError
          throw new CommandError('RESULT_UNKNOWN', 'Run acceptance requires reconciliation')
        }
        if (recovered) return recovered
        if (continuingFrom && error instanceof HbarError) {
          if (
            error.code === 'EFFECT_UNKNOWN' ||
            error.code === 'CONTINUATION_ALREADY_EXISTS' ||
            error.code === 'RUNTIME_RESTART_REQUIRED'
          )
            throw new CommandError(error.code, error.message)
          const record = await kernel.storage.call('runtimeRecoveryRead', continuingFrom)
          if (
            record?.manual?.requestId === requestId &&
            !record.run &&
            ['waiting', 'manual_required'].includes(record.chain.status)
          )
            throw new CommandError(record.chain.reasonCode ?? error.code, error.message)
        }
        if (
          error instanceof HbarError &&
          [
            'FILE_LIMIT',
            'EMPTY_INPUT',
            'BUDGET_EXHAUSTED',
            'GOAL_NOT_ACTIVE',
            'MODEL_NOT_FOUND',
            'DEMO_DISABLED',
            'UNSUPPORTED_IMAGE',
            'ARCHIVED',
            'NOT_FOUND',
            'INVALID_INPUT',
            'COMMAND_CONFLICT',
            'IDEMPOTENCY_CONFLICT',
            'BRANCH_IN_USE',
            'BRANCH_EXISTS',
            'BRANCH_NOT_FOUND',
            'BUSY',
            'GIT_INVALID_BRANCH',
            'GIT_REF_NOT_FOUND',
            'GIT_NOT_REPOSITORY',
            'GIT_OPERATION_FAILED',
            'SESSION_LAUNCH_TARGET_LOCKED',
            'SESSION_LAUNCH_TARGET_PATH_OCCUPIED',
            'SESSION_LAUNCH_TARGET_INVALID_ROOT',
            'SESSION_LAUNCH_TARGET_SUBDIRECTORY_UNSUPPORTED',
            'SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED',
            'SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT',
            'SESSION_LAUNCH_TARGET_UNRESOLVED',
            'SESSION_LAUNCH_TARGET_TIMEOUT',
            'USER_CANCELLED',
            'HOST_SHUTTING_DOWN',
            'EXECUTION_UNSETTLED',
            'RECOVERY_TOTAL_LIMIT',
            'CONTINUATION_ALREADY_EXISTS',
          ].includes(error.code)
        )
          throw new CommandError(error.code, error.message)
        throw new CommandError('RESULT_UNKNOWN', 'Run acceptance requires reconciliation')
      }
    })
  }
  registry.register(
    runCommands['session.message.send'],
    async (input, context) => {
      const actorId = context.actorId
      const idempotencyKey = context.idempotencyKey
      if (!actorId || !idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
      if (input.senderSessionId === input.targetSessionId)
        throw new CommandError('INVALID_INPUT', 'Sender and recipient sessions must be different')
      const scope = JSON.stringify([
        'session.message.send',
        input.workspaceId,
        input.senderSessionId,
        actorId,
        idempotencyKey,
      ])
      const requestId = `peer-${createHash('sha256').update(scope).digest('hex')}`
      const command = runCommandRecordSchema.parse({
        actorId,
        idempotencyKey,
        requestId: context.requestId,
        inputHash: createHash('sha256')
          .update(JSON.stringify({ id: 'session.message.send', version: 1, input }))
          .digest('hex'),
      })
      try {
        return await serial(scope, async () => {
          const prior = await kernel.storage.call('runByRequestInWorkspace', input.workspaceId, requestId)
          if (prior) {
            if (
              !prior.command ||
              prior.command.actorId !== actorId ||
              prior.command.idempotencyKey !== idempotencyKey ||
              prior.command.inputHash !== command.inputHash
            )
              throw new CommandError('IDEMPOTENCY_CONFLICT', 'Message key was used with different input')
            if (prior.run.sessionId !== input.targetSessionId)
              throw new CommandError(
                'IDEMPOTENCY_CONFLICT',
                'Message key was already used for a different recipient session',
              )
            if (
              prior.run.input.peerMessage?.senderSessionId !== input.senderSessionId ||
              prior.run.input.peerMessage.workspaceId !== input.workspaceId ||
              prior.run.input.peerMessage.idempotencyKey !== idempotencyKey
            )
              throw new CommandError('IDEMPOTENCY_CONFLICT', 'Message key was used with different input')
            const currentTarget = await kernel.storage.call('session', input.targetSessionId)
            const guideReceipt = await kernel.storage.call(
              'queuedRunGuideReceipt',
              actorId,
              peerGuideKey(actorId, input, idempotencyKey),
              input.targetSessionId,
            )
            let guideAttempt: PeerGuideAttempt | null = null
            if (!guideReceipt && prior.run.status === 'queued') {
              const active = await kernel.storage.call('activeOperations', {
                sessionId: input.targetSessionId,
                limit: 20,
              })
              const activeRun = active.items.find((item) => ['running', 'waiting_approval'].includes(item.status))
              const queued = await kernel.storage.call('queuedUserRuns', {
                sessionId: input.targetSessionId,
                limit: 20,
              })
              const item = queued.items.find((candidate) => candidate.operationId === prior.run.id)
              if (activeRun && item) {
                try {
                  guideAttempt = {
                    kind: 'acknowledged',
                    receipt: await kernel.guideQueuedRun({
                      actorId,
                      idempotencyKey: peerGuideKey(actorId, input, idempotencyKey),
                      request: {
                        sessionId: input.targetSessionId,
                        operationId: prior.run.id,
                        activeRunId: activeRun.operationId,
                        expectedRevision: item.revision,
                      },
                    }),
                  }
                } catch (error) {
                  guideAttempt = { kind: 'error', error }
                }
              }
            }
            const reconciled = await reconcilePeerDelivery(
              actorId,
              input,
              idempotencyKey,
              requestId,
              prior.run.id,
              guideAttempt,
            )
            const canonicalGuideReceipt = reconciled.guideReceipt ?? undefined
            const delivery = canonicalGuideReceipt
              ? 'steered'
              : reconciled.run.status === 'queued' && reconciled.activeRun
                ? 'queued'
                : 'new_run'
            return peerReceipt(
              input,
              idempotencyKey,
              reconciled.run,
              delivery === 'queued' ? 'queued' : 'accepted',
              delivery,
              currentTarget.seq,
              canonicalGuideReceipt,
            )
          }
          const [sender, target] = await Promise.all([
            kernel.storage.call('session', input.senderSessionId),
            kernel.storage.call('session', input.targetSessionId),
          ])
          if (sender.workspaceId !== input.workspaceId || target.workspaceId !== input.workspaceId)
            throw new CommandError('FORBIDDEN', 'Sessions must belong to the declared workspace')
          if (sender.archived || target.archived)
            throw new CommandError('ARCHIVED', 'Archived sessions cannot exchange messages')
          const active = await kernel.storage.call('activeOperations', { sessionId: target.id, limit: 20 })
          const activeRun = active.items.find((item) =>
            ['running', 'waiting_approval', 'cancelRequested'].includes(item.status),
          )
          const peerMessage = {
            senderSessionId: sender.id,
            targetSessionId: target.id,
            workspaceId: input.workspaceId,
            idempotencyKey,
            queuedBehindActive: Boolean(activeRun),
          }
          let run: Run
          try {
            run = await kernel.submit(
              target.id,
              requestId,
              { text: input.text, images: [], source: 'user', peerMessage },
              input.modelId,
              command,
              context.signal,
            )
          } catch (error) {
            if (error instanceof HbarError) throw new CommandError(error.code, error.message)
            throw new CommandError('RESULT_UNKNOWN', 'Peer message acceptance requires reconciliation')
          }
          let guideAttempt: PeerGuideAttempt | null = null
          if (activeRun?.status === 'running' || activeRun?.status === 'waiting_approval') {
            try {
              const queued = await kernel.storage.call('queuedUserRuns', { sessionId: target.id, limit: 20 })
              const item = queued.items.find((candidate) => candidate.operationId === run.id)
              if (item) {
                guideAttempt = {
                  kind: 'acknowledged',
                  receipt: await kernel.guideQueuedRun({
                    actorId,
                    idempotencyKey: peerGuideKey(actorId, input, idempotencyKey),
                    request: {
                      sessionId: target.id,
                      operationId: run.id,
                      activeRunId: activeRun.operationId,
                      expectedRevision: item.revision,
                    },
                  }),
                }
              }
            } catch (error) {
              guideAttempt = { kind: 'error', error }
            }
          }
          const reconciled = await reconcilePeerDelivery(
            actorId,
            input,
            idempotencyKey,
            requestId,
            run.id,
            guideAttempt,
          )
          const canonicalGuideReceipt = reconciled.guideReceipt ?? undefined
          const delivery = canonicalGuideReceipt
            ? 'steered'
            : reconciled.run.status === 'queued' && reconciled.activeRun
              ? 'queued'
              : 'new_run'
          const admittedTarget = await kernel.storage.call('session', target.id)
          return peerReceipt(
            input,
            idempotencyKey,
            reconciled.run,
            delivery === 'queued' ? 'queued' : 'accepted',
            delivery,
            admittedTarget.seq,
            canonicalGuideReceipt,
          )
        })
      } catch (error) {
        if (error instanceof CommandError) throw error
        if (error instanceof HbarError) throw new CommandError(error.code, error.message)
        throw new CommandError('RESULT_UNKNOWN', 'Peer message requires operation reconciliation')
      }
    },
    { durable: true },
  )
  registry.register(
    runCommands['run.submit'],
    (input, context) => {
      const { peerMessage: _untrustedPeerMessage, ...cleanInput } = input.input
      const clean = { ...input, input: cleanInput }
      return submit(clean, context, { id: 'run.submit', input: clean })
    },
    { durable: true },
  )
  registry.register(
    runCommands['run.retry'],
    async ({ sessionId, operationId }, context) => {
      const actorId = context.actorId,
        idempotencyKey = context.idempotencyKey
      if (!actorId || !idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
      let prior: Run
      try {
        prior = await kernel.storage.call('run', operationId)
      } catch (error) {
        if (error instanceof HbarError) throw new CommandError(error.code, error.message)
        throw error
      }
      if (prior.sessionId !== sessionId)
        throw new CommandError('COMMAND_NOT_FOUND', 'Operation does not belong to the selected session')
      if (['queued', 'running', 'waiting_approval'].includes(prior.status))
        throw new CommandError('BUSY', 'Wait for the original operation to settle before retrying')
      if (prior.status === 'guided')
        throw new CommandError('COMMAND_CONFLICT', 'This queued input already belongs to its original active Run')
      // A user-triggered retry is a new user turn. Never replay an automatic Goal
      // continuation identity, because its intent may already have been replaced
      // or consumed by the current Goal workflow.
      const retryInput =
        prior.input.source === 'goal' && prior.input.continuation
          ? (() => {
              const {
                continuation: _continuation,
                source: _source,
                peerMessage: _peerMessage,
                ...userInput
              } = prior.input
              return { ...userInput, source: 'user' as const }
            })()
          : (() => {
              const { peerMessage: _peerMessage, ...userInput } = prior.input
              return userInput
            })()
      return submit({ sessionId, modelId: prior.modelId, input: retryInput }, context, {
        id: 'run.retry',
        input: { sessionId, operationId },
      })
    },
    { durable: true },
  )
  registry.register(runCommands['session.activeOperations'], async (input) => {
    try {
      return await kernel.storage.call('activeOperations', input)
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  })
  registry.register(runCommands['session.queuedUserRuns'], async (input) => {
    try {
      return await kernel.storage.call('queuedUserRuns', input)
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  })
  registry.register(runCommands['queuedRun.getEditable'], async (input) => {
    try {
      return await kernel.storage.call('queuedRunEditable', input)
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  })
  registry.register(
    runCommands['queuedRun.editText'],
    async (input, context) => {
      const actorId = context.actorId,
        idempotencyKey = context.idempotencyKey
      if (!actorId || !idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
      try {
        return await kernel.editQueuedRunText(input, actorId, idempotencyKey)
      } catch (error) {
        if (
          error instanceof HbarError &&
          [
            'NOT_FOUND',
            'FORBIDDEN',
            'COMMAND_CONFLICT',
            'IDEMPOTENCY_CONFLICT',
            'INVALID_INPUT',
            'INPUT_TOO_LARGE',
          ].includes(error.code)
        )
          throw new CommandError(error.code, error.message)
        throw new CommandError('RESULT_UNKNOWN', 'Queue edit requires receipt reconciliation')
      }
    },
    { durable: true },
  )
  registry.register(
    runCommands['queuedRun.remove'],
    async (input, context) => {
      const actorId = context.actorId,
        idempotencyKey = context.idempotencyKey
      if (!actorId || !idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
      try {
        return await kernel.removeQueuedRun(input, actorId, idempotencyKey)
      } catch (error) {
        if (
          error instanceof HbarError &&
          ['NOT_FOUND', 'FORBIDDEN', 'COMMAND_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'INVALID_INPUT'].includes(error.code)
        )
          throw new CommandError(error.code, error.message)
        throw new CommandError('RESULT_UNKNOWN', 'Queue removal requires receipt reconciliation')
      }
    },
    { durable: true },
  )
  registry.register(
    runCommands['queuedRun.guide'],
    async (input, context) => {
      const actorId = context.actorId,
        idempotencyKey = context.idempotencyKey
      if (!actorId || !idempotencyKey)
        throw new CommandError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
      try {
        return await kernel.guideQueuedRun({ request: input, actorId, idempotencyKey })
      } catch (error) {
        if (
          error instanceof HbarError &&
          [
            'NOT_FOUND',
            'FORBIDDEN',
            'COMMAND_CONFLICT',
            'IDEMPOTENCY_CONFLICT',
            'INVALID_INPUT',
            'INPUT_TOO_LARGE',
            'EMPTY_INPUT',
            'FILE_LIMIT',
            'ARCHIVED',
            'BUSY',
          ].includes(error.code)
        )
          throw new CommandError(error.code, error.message)
        throw new CommandError('RESULT_UNKNOWN', 'Queue guidance requires receipt reconciliation')
      }
    },
    { durable: true },
  )
  registry.register(runCommands['operation.get'], async ({ operationId }) => {
    try {
      const original = await kernel.storage.call('run', operationId)
      const record = await kernel.storage.call('runtimeRecoveryRead', operationId)
      const chainId = original.recovery?.chainId ?? record?.chain.chainId
      const chain = chainId ? await kernel.storage.call('runtimeRecoveryChain', chainId) : null
      const run = chain ? await kernel.storage.call('run', chain.currentRunId) : original
      const cancelRequested =
        ['running', 'waiting_approval'].includes(run.status) && (await kernel.storage.call('cancelRequested', run.id))
      const pending =
        run.status === 'interrupted' &&
        !(await kernel.storage.call('cancelRequested', run.id)) &&
        (chain
          ? ['pending', 'running'].includes(chain.status)
          : Boolean(await kernel.storage.call('runtimeExecutionRead', run.id)))
      return {
        operationId: original.id,
        sessionId: run.sessionId,
        status: cancelRequested ? ('cancelRequested' as const) : run.status,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        error: run.error,
        ...(run.failure ? { failure: run.failure } : {}),
        ...(chain ? { executionRunId: run.id, recovery: chain } : {}),
        ...(pending ? { recoveryPending: true } : {}),
      }
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  })
  registry.register(
    runCommands['operation.cancel'],
    async ({ operationId }) => {
      try {
        await kernel.cancel(operationId)
        const state = operationSnapshotSchema.parse(await registry.execute('operation.get', { operationId }))
        const run = await kernel.storage.call('run', state.executionRunId ?? operationId)
        if (run.status === 'queued' || run.status === 'running' || run.status === 'waiting_approval')
          return { operationId, status: 'cancelRequested' as const }
        return { operationId, status: run.status }
      } catch (error) {
        if (error instanceof HbarError && error.code === 'NOT_FOUND') throw new CommandError(error.code, error.message)
        throw new CommandError('RESULT_UNKNOWN', 'Cancellation requires operation reconciliation')
      }
    },
    { durable: true },
  )
  registry.register(
    runCommands['context.compact'],
    async ({ sessionId, modelId }, context) => {
      try {
        return await kernel.compact(sessionId, modelId, context.signal)
      } catch (error) {
        if (
          error instanceof HbarError &&
          [
            'NOTHING_TO_COMPACT',
            'MODEL_NOT_FOUND',
            'DEMO_DISABLED',
            'BUSY',
            'COMPACTION_FAILED',
            'COMPACTION_INCOMPLETE',
            'COMPACTION_LIMIT',
            'CONTEXT_WINDOW_EXCEEDED',
          ].includes(error.code)
        )
          throw new CommandError(error.code, error.message)
        if (error instanceof CommandError) throw error
        throw new CommandError('RESULT_UNKNOWN', 'Compaction outcome requires session reconciliation')
      }
    },
    { durable: true },
  )
  return {
    ...createCommandClient(runCommands, registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    async getReceipt(
      commandId: 'run.submit' | 'run.retry',
      sessionId: string,
      actorId: string,
      idempotencyKey: string,
    ): Promise<RunAccepted | null> {
      const scope = receiptScope(commandId, sessionId, actorId, idempotencyKey)
      const requestId = `command-${createHash('sha256').update(scope).digest('hex')}`
      let found
      try {
        found = await kernel.storage.call('runByRequest', sessionId, requestId)
      } catch {
        throw new CommandError('RESULT_UNKNOWN', 'Run journal is unavailable')
      }
      if (!found) return null
      if (!found.command || found.command.actorId !== actorId || found.command.idempotencyKey !== idempotencyKey)
        throw new CommandError('IDEMPOTENCY_CONFLICT', 'Run key belongs to another actor')
      return accepted(found.run, found.command)
    },
    async getQueuedRemoveReceipt(sessionId: string, actorId: string, idempotencyKey: string) {
      try {
        return await kernel.storage.call('queuedRunRemoveReceipt', actorId, idempotencyKey, sessionId)
      } catch (error) {
        if (error instanceof HbarError) throw new CommandError(error.code, error.message)
        throw new CommandError('RESULT_UNKNOWN', 'Queue removal receipt is unavailable')
      }
    },
    async getQueuedEditTextReceipt(sessionId: string, actorId: string, idempotencyKey: string) {
      try {
        return await kernel.storage.call('queuedRunEditTextReceipt', actorId, idempotencyKey, sessionId)
      } catch (error) {
        if (error instanceof HbarError) throw new CommandError(error.code, error.message)
        throw new CommandError('RESULT_UNKNOWN', 'Queue edit receipt is unavailable')
      }
    },
    async getQueuedRunGuideReceipt(
      sessionId: string,
      actorId: string,
      idempotencyKey: string,
    ): Promise<QueuedRunGuideReceipt | null> {
      try {
        return await kernel.storage.call('queuedRunGuideReceipt', actorId, idempotencyKey, sessionId)
      } catch (error) {
        if (error instanceof HbarError) throw new CommandError(error.code, error.message)
        throw new CommandError('RESULT_UNKNOWN', 'Queue guidance receipt is unavailable')
      }
    },
    dispose: () => registry.dispose(),
  }
}
