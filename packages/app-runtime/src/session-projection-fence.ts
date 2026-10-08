import type { Session } from '@hbar/contracts/directory'
import { DIRECTORY_SESSION_TOTAL_LIMIT } from './session-directory-capacity'

export const SESSION_PROJECTION_VERSION_LIMIT = DIRECTORY_SESSION_TOTAL_LIMIT
type VersionedSession = Readonly<Pick<Session, 'id' | 'workspaceId' | 'seq' | 'updatedAt'>>
export type ConfirmedSessionSubscriber = (listener: (facts: readonly Session[]) => void) => () => void

/** Short-lived read/scan version floor. It contains no titles, archive flags, navigation or full Session mirror. */
export function createSessionProjectionFence(
  workspaceId: string,
  initial: readonly VersionedSession[],
  subscribe: ConfirmedSessionSubscriber,
) {
  const versions = new Map<string, { seq: number; updatedAt: number }>()
  let overflow = false
  let disposed = false
  const observe = (facts: readonly VersionedSession[]) => {
    if (disposed || overflow) return
    for (const fact of facts) {
      if (fact.workspaceId !== workspaceId) continue
      const prior = versions.get(fact.id)
      if (prior && (fact.seq < prior.seq || (fact.seq === prior.seq && fact.updatedAt < prior.updatedAt))) continue
      if (!prior && versions.size >= SESSION_PROJECTION_VERSION_LIMIT) {
        overflow = true
        return
      }
      versions.set(fact.id, { seq: fact.seq, updatedAt: fact.updatedAt })
    }
  }
  observe(initial)
  const stop = subscribe(observe)
  return {
    filter<Item extends VersionedSession>(items: readonly Item[]): readonly Item[] {
      if (disposed || overflow) return []
      return items.filter((item) => {
        if (item.workspaceId !== workspaceId) return false
        const floor = versions.get(item.id)
        return !floor || item.seq > floor.seq || (item.seq === floor.seq && item.updatedAt >= floor.updatedAt)
      })
    },
    get overflow() {
      return overflow
    },
    dispose() {
      if (disposed) return
      disposed = true
      stop()
      versions.clear()
    },
  }
}
