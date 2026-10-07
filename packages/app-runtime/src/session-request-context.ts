import type { Message } from '@hbar/contracts'
import type { StateReader } from './state'
import type { SessionTimelineState } from './types'

export interface SessionRequestContext {
  readonly messages: readonly Readonly<Message>[] | null
  readonly revision: number
  readonly hasOlder: boolean
  readonly olderStatus: SessionTimelineState['olderStatus']
  readonly olderError: string | null
}

/** Raw-message and usage consumers do not subscribe to every streaming token. */
export function createSessionRequestContext(
  timeline: StateReader<SessionTimelineState>,
  sessionId: string,
): StateReader<SessionRequestContext> {
  let cached: SessionRequestContext | undefined
  let events: SessionTimelineState['events'] | undefined
  let revision = 0
  const getSnapshot = () => {
    const current = timeline.getSnapshot()
    const owns = current.sessionId === sessionId
    if (events !== current.events) {
      events = current.events
      revision = events.reduce(
        (latest, event) =>
          event.type === 'usage.recorded' && event.sessionId === sessionId ? Math.max(latest, event.seq) : latest,
        0,
      )
    }
    const next: SessionRequestContext = {
      messages: owns ? current.messages : null,
      revision: owns ? revision : 0,
      hasOlder: owns && current.hasOlder,
      olderStatus: owns ? current.olderStatus : 'idle',
      olderError: owns ? current.olderError : null,
    }
    if (
      !cached ||
      Object.keys(next).some(
        (key) => next[key as keyof SessionRequestContext] !== cached?.[key as keyof SessionRequestContext],
      )
    )
      cached = Object.freeze(next)
    return cached
  }
  return {
    getSnapshot,
    subscribe(listener) {
      let previous = getSnapshot()
      return timeline.subscribe(() => {
        const next = getSnapshot()
        if (previous === next) return
        previous = next
        listener()
      })
    },
  }
}
