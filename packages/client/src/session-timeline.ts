import type { SessionEvent, SessionSnapshot, StreamDelta, WireNotification } from '@hbar/contracts'
import type { ClientTransport } from './transport'

type SessionTimelineUpdate =
  | { readonly kind: 'event'; readonly event: SessionEvent }
  | { readonly kind: 'stream'; readonly stream: StreamDelta }
  | { readonly kind: 'reset' }

export interface SessionTimelineTransport extends ClientTransport {
  follow(sessionId: string, cursor: number): Promise<unknown>
  unfollow(sessionId: string): Promise<void>
  onEvent(listener: (event: WireNotification) => void): () => void
}

/** Adapt the reconnecting Client stream to the app-runtime timeline port. */
export function createSessionTimelineClient(client: SessionTimelineTransport) {
  return {
    snapshot(sessionId: string, before?: number, limit?: number): Promise<SessionSnapshot> {
      return client.call('session.snapshot', { sessionId, before, limit })
    },
    async watch(sessionId: string, cursor: number, onUpdate: (update: SessionTimelineUpdate) => void) {
      let closed = false
      const offEvent = client.onEvent((notification) => {
        if (closed) return
        if (notification.method === 'session.event' && notification.params.sessionId === sessionId)
          onUpdate({ kind: 'event', event: notification.params })
        else if (notification.method === 'stream.update' && notification.params.sessionId === sessionId)
          onUpdate({ kind: 'stream', stream: notification.params })
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
