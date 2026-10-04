export type SidebarTimeGroupId = 'running' | 'today' | 'yesterday' | 'last7Days' | 'last30Days' | 'earlier'

export interface SidebarTimeSession {
  readonly id: string
  readonly updatedAt: number
  readonly active: boolean
}

export interface SidebarTimeGroup {
  readonly id: SidebarTimeGroupId
  readonly sessionIds: readonly string[]
}

const GROUP_ORDER: readonly SidebarTimeGroupId[] = [
  'running',
  'today',
  'yesterday',
  'last7Days',
  'last30Days',
  'earlier',
]

const DAY_MS = 24 * 60 * 60 * 1000

function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function calendarDaysAgo(timestamp: number, now: number): number {
  return Math.round((startOfLocalDay(now) - startOfLocalDay(timestamp)) / DAY_MS)
}

function groupForUpdatedAt(timestamp: number, now: number): SidebarTimeGroupId {
  if (!Number.isFinite(timestamp) || !Number.isFinite(now)) return 'earlier'

  const daysAgo = calendarDaysAgo(timestamp, now)
  if (daysAgo <= 0) return 'today'
  if (daysAgo === 1) return 'yesterday'
  if (daysAgo <= 7) return 'last7Days'
  if (daysAgo <= 30) return 'last30Days'
  return 'earlier'
}

function compareSessionsNewestFirst(left: SidebarTimeSession, right: SidebarTimeSession): number {
  const leftUpdatedAt = Number.isFinite(left.updatedAt) ? left.updatedAt : 0
  const rightUpdatedAt = Number.isFinite(right.updatedAt) ? right.updatedAt : 0
  const difference = rightUpdatedAt - leftUpdatedAt
  if (difference !== 0) return difference
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

/**
 * Projects a Host-bounded sidebar feed into date groups without retaining
 * session DTOs or application state. The Host owns feed capacity and loading.
 */
export function buildSidebarTimeGroups(
  sessions: readonly SidebarTimeSession[],
  now: number,
): readonly SidebarTimeGroup[] {
  const uniqueSessions = new Map<string, SidebarTimeSession>()
  for (const session of sessions) {
    if (!uniqueSessions.has(session.id)) uniqueSessions.set(session.id, session)
  }

  const buckets = new Map<SidebarTimeGroupId, SidebarTimeSession[]>()
  for (const session of uniqueSessions.values()) {
    const groupId = session.active ? 'running' : groupForUpdatedAt(session.updatedAt, now)
    const bucket = buckets.get(groupId)
    if (bucket) bucket.push(session)
    else buckets.set(groupId, [session])
  }

  const groups: SidebarTimeGroup[] = []
  for (const groupId of GROUP_ORDER) {
    const bucket = buckets.get(groupId)
    if (!bucket || bucket.length === 0) continue
    groups.push({
      id: groupId,
      sessionIds: bucket.sort(compareSessionsNewestFirst).map(({ id }) => id),
    })
  }
  return groups
}
