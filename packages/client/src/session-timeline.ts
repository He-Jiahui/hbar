import type { PlanState, SessionEvent, SessionSnapshot, StreamDelta, WireNotification } from '@hbar/contracts'
import type { ClientTransport } from './transport'
import { COMMAND_PROTOCOL_VERSION, createCommandClient } from '@hbar/commands'
import { contextHistoryCommands } from '@hbar/contracts/commands/context-history'
import { sessionObservabilityCommands } from '@hbar/contracts/commands/session-observability'
import type { ContextHistoryInput } from '@hbar/contracts/context-history'

type SessionTimelineUpdate =
  | { readonly kind: 'event'; readonly event: SessionEvent }
  | { readonly kind: 'stream'; readonly stream: StreamDelta }
  | { readonly kind: 'tool.output'; readonly output: import('@hbar/contracts').ToolOutputNotification }
  | { readonly kind: 'reset' }

export interface SessionTimelineTransport extends ClientTransport {
  follow(sessionId: string, cursor: number): Promise<unknown>
  unfollow(sessionId: string): Promise<void>
  onEvent(listener: (event: WireNotification) => void): () => void
}

/** Adapt the reconnecting Client stream to the app-runtime timeline port. */
export function createSessionTimelineClient(client: SessionTimelineTransport) {
  const history = createCommandClient(
    { ...contextHistoryCommands, ...sessionObservabilityCommands },
    {
      execute(commandId, input, options) {
        return client.call('command.execute', {
          protocol: COMMAND_PROTOCOL_VERSION,
          requestId: options?.requestId ?? crypto.randomUUID(),
          commandId,
          commandVersion: 1,
          input,
        })
      },
    },
  )
  return {
    observability(input: import('@hbar/contracts/session-observability').SessionObservabilityInput) {
      return history.execute('session.observability', input)
    },
    contextHistory(input: ContextHistoryInput) {
      return history.execute('session.contextHistory', input)
    },
    snapshot(sessionId: string, before?: number, limit?: number): Promise<SessionSnapshot> {
      return client.call('session.snapshot', { sessionId, before, limit })
    },
    plan(sessionId: string): Promise<PlanState | null> {
      return client.call('plan.get', { sessionId })
    },
    async watch(sessionId: string, cursor: number, onUpdate: (update: SessionTimelineUpdate) => void) {
      let closed = false
      const offEvent = client.onEvent((notification) => {
        if (closed) return
        if (notification.method === 'session.event' && notification.params.sessionId === sessionId)
          onUpdate({ kind: 'event', event: notification.params })
        else if (notification.method === 'stream.update' && notification.params.sessionId === sessionId)
          onUpdate({ kind: 'stream', stream: notification.params })
        else if (notification.method === 'tool.output' && notification.params.sessionId === sessionId)
          onUpdate({ kind: 'tool.output', output: notification.params })
        else if (notification.method === 'host.changed' && notification.params.kind === 'resync')
          onUpdate({ kind: 'reset' })
      })
      try {
        await client.follow(sessionId, cursor)
      } catch (error) {
        closed = true
        offEvent()
        throw error
      }
      return async () => {
        if (closed) return
        closed = true
        offEvent()
        await client.unfollow(sessionId)
      }
    },
  }
}
