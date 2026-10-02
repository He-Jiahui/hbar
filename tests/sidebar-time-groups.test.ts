import { expect, test } from 'bun:test'
import {
  buildSidebarTimeGroups,
  type SidebarTimeGroupId,
  type SidebarTimeSession,
} from '../packages/app-react/src/sidebar-time-groups'

function localTime(year: number, month: number, day: number, hour = 12, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime()
}

function groupIds(groups: ReturnType<typeof buildSidebarTimeGroups>): SidebarTimeGroupId[] {
  return groups.map(({ id }) => id)
}

function sessionIds(groups: ReturnType<typeof buildSidebarTimeGroups>, groupId: SidebarTimeGroupId): readonly string[] {
  return groups.find(({ id }) => id === groupId)?.sessionIds ?? []
}

function session(id: string, updatedAt: number, active = false): SidebarTimeSession {
  return { id, updatedAt, active }
}

test('returns non-empty groups in running-first local calendar order and lists each session once', () => {
  const now = localTime(2026, 8, 23, 12)
  const groups = buildSidebarTimeGroups(
    [
      session('older-running', localTime(2026, 7, 24), true),
      session('earlier', localTime(2026, 5, 15)),
      session('today', localTime(2026, 8, 23, 9)),
      session('last30', localTime(2026, 8, 3)),
      session('yesterday', localTime(2026, 8, 22)),
      session('last7', localTime(2026, 8, 20)),
      session('newer-running', localTime(2026, 8, 23, 11), true),
    ],
    now,
  )

  expect(groupIds(groups)).toEqual(['running', 'today', 'yesterday', 'last7Days', 'last30Days', 'earlier'])
  expect(sessionIds(groups, 'running')).toEqual(['newer-running', 'older-running'])
  expect(sessionIds(groups, 'today')).toEqual(['today'])
  expect(sessionIds(groups, 'yesterday')).toEqual(['yesterday'])
  expect(sessionIds(groups, 'last7Days')).toEqual(['last7'])
  expect(sessionIds(groups, 'last30Days')).toEqual(['last30'])
  expect(sessionIds(groups, 'earlier')).toEqual(['earlier'])
  expect(groups.flatMap(({ sessionIds: ids }) => ids)).toHaveLength(7)
})

test('uses local calendar days across midnight rather than elapsed hours', () => {
  const now = localTime(2026, 8, 23, 0, 10)
  const groups = buildSidebarTimeGroups([session('late-last-night', localTime(2026, 8, 22, 23, 50))], now)

  expect(groupIds(groups)).toEqual(['yesterday'])
})

test('keeps exact seven- and thirty-day boundaries and sends future timestamps to today', () => {
  const now = localTime(2026, 8, 23)
  const groups = buildSidebarTimeGroups(
    [
      session('future', localTime(2026, 8, 25)),
      session('seven-days', localTime(2026, 8, 16)),
      session('eight-days', localTime(2026, 8, 15)),
      session('thirty-days', localTime(2026, 7, 24)),
      session('thirty-one-days', localTime(2026, 7, 23)),
    ],
    now,
  )

  expect(groupIds(groups)).toEqual(['today', 'last7Days', 'last30Days', 'earlier'])
  expect(sessionIds(groups, 'today')).toEqual(['future'])
  expect(sessionIds(groups, 'last7Days')).toEqual(['seven-days'])
  expect(sessionIds(groups, 'last30Days')).toEqual(['eight-days', 'thirty-days'])
  expect(sessionIds(groups, 'earlier')).toEqual(['thirty-one-days'])
})

test('orders ties by stable session id and ignores duplicate feed ids', () => {
  const now = localTime(2026, 8, 23)
  const timestamp = localTime(2026, 8, 23, 10)
  const groups = buildSidebarTimeGroups(
    [session('z-session', timestamp), session('a-session', timestamp), session('a-session', localTime(2026, 8, 22))],
    now,
  )

  expect(sessionIds(groups, 'today')).toEqual(['a-session', 'z-session'])
  expect(groupIds(groups)).toEqual(['today'])
})

test('omits empty groups and keeps malformed timestamps in earlier', () => {
  const now = localTime(2026, 8, 23)

  expect(buildSidebarTimeGroups([], now)).toEqual([])
  expect(groupIds(buildSidebarTimeGroups([session('invalid', Number.NaN)], now))).toEqual(['earlier'])
})
