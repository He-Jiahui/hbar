import { CommandError } from '@hbar/commands'
import { createUsageRequests, type UsageRequestsOptions, type UsageRequestsRuntime } from './usage-requests'

/** A pane owns its reader. The target cannot be changed by global Usage filters. */
export type SessionRequestsRuntime = Omit<UsageRequestsRuntime, 'setScope'>

export function createSessionRequests(options: Pick<UsageRequestsOptions, 'usage' | 'onSubscriberError'> = {}) {
  const owners = new Set<SessionRequestsRuntime>()
  let disposed = false
  return {
    create(sessionId: string): SessionRequestsRuntime {
      if (disposed) throw new CommandError('DISPOSED', 'Session request readers have been disposed')
      const requests = createUsageRequests({
        ...options,
        initialScope: { kind: 'session', sessionId, includeDescendants: false },
        initialRange: { from: 0 },
        order: 'desc',
      })
      const owner: SessionRequestsRuntime = {
        reader: requests.reader,
        refresh: requests.refresh,
        loadMore: requests.loadMore,
        dispose() {
          if (!owners.delete(owner)) return
          requests.dispose()
        },
      }
      owners.add(owner)
      return owner
    },
    dispose() {
      disposed = true
      for (const owner of owners) owner.dispose()
    },
  }
}
