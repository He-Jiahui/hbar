import { createCommandClient, COMMAND_PROTOCOL_VERSION, CommandError } from '@hbar/commands'
import {
  runCommands,
  runAcceptedSchema,
  operationWatchResultSchema,
  operationCancelResultSchema,
  queuedRunEditTextReceiptSchema,
  queuedRunRemoveReceiptSchema,
} from '@hbar/contracts/commands/run'
import type {
  OperationWatchResult,
  QueuedRunEditTextReceipt,
  QueuedRunRemoveReceipt,
  RunAccepted,
} from '@hbar/contracts/commands/run'
import { HbarError } from '@hbar/contracts'
import type { SessionEvent, WireNotification } from '@hbar/contracts'
import type { ConnectionStatus } from './index'
import type { ClientTransport } from './transport'

export function createRunCommandClient(client: ClientTransport) {
  const commands = createCommandClient(runCommands, {
    async execute(id, input, options) {
      if (id === 'operation.cancel' && options?.signal?.aborted)
        throw new CommandError('CANCELLED', 'Cancellation was not dispatched')
      if (
        ['run.submit', 'run.retry', 'queuedRun.editText', 'queuedRun.remove'].includes(id) &&
        !options?.idempotencyKey
      )
        throw new CommandError('INVALID_INPUT', `An idempotency key is required for ${id}`)
      try {
        const output = await client.call('command.execute', {
          protocol: COMMAND_PROTOCOL_VERSION,
          requestId: options?.requestId ?? crypto.randomUUID(),
          commandId: id,
          commandVersion: options?.version ?? 1,
          ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
          input,
        })
        if (id === 'operation.cancel') {
          const result = operationCancelResultSchema.safeParse(output)
          const requested = runCommands['operation.cancel'].input.parse(input)
          if (!result.success || result.data.operationId !== requested.operationId)
            throw new CommandError('RESULT_UNKNOWN', 'Cancellation response could not be verified')
        }
        if (id === 'queuedRun.remove') {
          const result = queuedRunRemoveReceiptSchema.safeParse(output)
          const requested = runCommands['queuedRun.remove'].input.parse(input)
          if (
            !result.success ||
            result.data.sessionId !== requested.sessionId ||
            result.data.operationId !== requested.operationId ||
            result.data.idempotencyKey !== options?.idempotencyKey
          )
            throw new CommandError('RESULT_UNKNOWN', 'Queue removal response could not be verified')
        }
        if (id === 'queuedRun.editText') {
          const result = queuedRunEditTextReceiptSchema.safeParse(output)
          const requested = runCommands['queuedRun.editText'].input.parse(input)
          if (
            !result.success ||
            result.data.sessionId !== requested.sessionId ||
            result.data.operationId !== requested.operationId ||
            result.data.idempotencyKey !== options?.idempotencyKey
          )
            throw new CommandError('RESULT_UNKNOWN', 'Queue edit response could not be verified')
        }
        return output
      } catch (error) {
        if (
          id === 'operation.cancel' &&
          !(
            error instanceof HbarError &&
            [
              'NOT_FOUND',
              'FORBIDDEN',
              'UNAUTHORIZED',
              'INVALID_INPUT',
              'INPUT_TOO_LARGE',
              'BUSY',
              'CAPABILITY_UNAVAILABLE',
              'COMMAND_NOT_FOUND',
              'VERSION_MISMATCH',
            ].includes(error.code)
          )
        )
          throw new CommandError(
            'RESULT_UNKNOWN',
            'Cancellation response was not confirmed; read the original operation state',
          )
        if (
          ['run.submit', 'run.retry', 'queuedRun.editText', 'queuedRun.remove', 'context.compact'].includes(id) &&
          error instanceof HbarError &&
          ['DISCONNECTED', 'TIMEOUT'].includes(error.code)
        )
          throw new CommandError(
            'RESULT_UNKNOWN',
            `${id} response was lost; inspect its receipt or session state before retrying`,
          )
        throw error
      }
    },
  })
  return {
    ...commands,
    async getReceipt(
      sessionId: string,
      idempotencyKey: string,
      commandId: 'run.submit' | 'run.retry' = 'run.submit',
    ): Promise<RunAccepted | null> {
      const result = await client.call('command.getReceipt', { commandId, sessionId, idempotencyKey })
      const parsed = runAcceptedSchema.nullable().safeParse(result)
      if (!parsed.success) throw new CommandError('INVALID_OUTPUT', 'Invalid run acceptance receipt')
      return parsed.data
    },
    async getQueuedRemoveReceipt(sessionId: string, idempotencyKey: string): Promise<QueuedRunRemoveReceipt | null> {
      const result = await client.call('command.getReceipt', {
        commandId: 'queuedRun.remove',
        sessionId,
        idempotencyKey,
      })
      const parsed = queuedRunRemoveReceiptSchema.nullable().safeParse(result)
      if (
        !parsed.success ||
        (parsed.data && (parsed.data.sessionId !== sessionId || parsed.data.idempotencyKey !== idempotencyKey))
      )
        throw new CommandError('INVALID_OUTPUT', 'Invalid queue removal receipt')
      return parsed.data
    },
    async getQueuedEditTextReceipt(
      sessionId: string,
      idempotencyKey: string,
    ): Promise<QueuedRunEditTextReceipt | null> {
      const result = await client.call('command.getReceipt', {
        commandId: 'queuedRun.editText',
        sessionId,
        idempotencyKey,
      })
      const parsed = queuedRunEditTextReceiptSchema.nullable().safeParse(result)
      if (
        !parsed.success ||
        (parsed.data && (parsed.data.sessionId !== sessionId || parsed.data.idempotencyKey !== idempotencyKey))
      )
        throw new CommandError('INVALID_OUTPUT', 'Invalid queue edit receipt')
      return parsed.data
    },
  }
}

export interface OperationWatchTransport extends ClientTransport {
  onEvent(listener: (event: WireNotification) => void): () => void
  onStatus(listener: (status: ConnectionStatus) => void): () => void
}

export function createOperationWatcher(client: OperationWatchTransport) {
  return {
    async watch(
      operationId: string,
      after: number,
      onUpdate: (
        update:
          | { kind: 'event'; event: SessionEvent }
          | { kind: 'reset'; snapshot: OperationWatchResult['snapshot'] }
          | { kind: 'error'; code: string },
      ) => void,
    ) {
      let cursor = after,
        closed = false,
        loading = true,
        overflow = false
      const seen = new Set<string>()
      const pending: SessionEvent[] = []
      const emit = (update: Parameters<typeof onUpdate>[0]) => {
        try {
          onUpdate(update)
        } catch (error) {
          console.error('Operation watch observer failed:', error)
        }
      }
      const deliver = (event: SessionEvent) => {
        if (seen.has(event.eventId)) return
        seen.add(event.eventId)
        if (seen.size > 4096) seen.delete(seen.values().next().value!)
        cursor = Math.max(cursor, event.seq)
        emit({ kind: 'event', event })
      }
      const offEvent = client.onEvent((notification) => {
        if (notification.method !== 'session.event' || notification.params.runId !== operationId || closed) return
        if (loading) {
          if (pending.length < 2048) pending.push(notification.params)
          else overflow = true
        } else deliver(notification.params)
      })
      const refresh = async () => {
        if (loading || closed) return
        loading = true
        try {
          const result = operationWatchResultSchema.parse(await client.call('operation.watch', { operationId, cursor }))
          if (closed) return
          if (result.reset || overflow) emit({ kind: 'reset', snapshot: result.snapshot })
          else for (const event of result.events) deliver(event)
          cursor = Math.max(cursor, result.cursor)
          for (const event of pending.splice(0)) deliver(event)
          overflow = false
        } catch (error) {
          if (!closed) emit({ kind: 'error', code: error instanceof HbarError ? error.code : 'WATCH_FAILED' })
        } finally {
          loading = false
        }
      }
      const offStatus = client.onStatus((status) => {
        if (status === 'connected' && !loading && !closed) void refresh()
      })
      const close = async () => {
        if (closed) return
        closed = true
        offEvent()
        offStatus()
        // A disconnected socket has no server-side subscription to release.
        await client.call('operation.unwatch', { operationId }).catch(() => {})
      }
      try {
        const initial = operationWatchResultSchema.parse(await client.call('operation.watch', { operationId, cursor }))
        cursor = Math.max(cursor, initial.cursor)
        if (overflow) {
          pending.length = 0
          loading = false
          return { initial: { ...initial, events: [], reset: true }, close }
        }
        for (const event of initial.events) seen.add(event.eventId)
        loading = false
        for (const event of pending.splice(0)) deliver(event)
        return { initial, close }
      } catch (error) {
        closed = true
        offEvent()
        offStatus()
        throw error
      }
    },
  }
}
