import { expect, test } from 'bun:test'
import { navigateNotification, type NotificationNavigationPort } from '../apps/web/src/notification-navigation'

test('notification actions preserve original session and approval targets', async () => {
  const calls: Array<{ id: string; input: unknown }> = []
  const port: NotificationNavigationPort = {
    commands: {
      execute: async (id, input) => {
        calls.push({ id, input })
      },
    },
    sourceInstanceId: 'original-notification-center',
    getSchedule: async () => null,
  }
  await navigateNotification(
    { kind: 'approval', workspaceId: 'w-a', sessionId: 's-a', runId: 'r-a', approvalId: 'a-a' },
    port,
  )
  expect(calls).toEqual([
    { id: 'app.setSession', input: { workspaceId: 'w-a', sessionId: 's-a' } },
    { id: 'app.closePanel', input: { instanceId: 'original-notification-center' } },
  ])
})

test('schedule notification opens the persisted workspace and rejects deleted targets', async () => {
  const calls: unknown[] = []
  const port: NotificationNavigationPort = {
    commands: {
      execute: async (_id, input) => {
        calls.push(input)
      },
    },
    getSchedule: async (id) => (id === 'schedule-a' ? { id, workspaceId: 'w-a' } : null),
  }
  await navigateNotification({ kind: 'schedule', scheduleId: 'schedule-a', occurrenceId: 'occ-a' }, port)
  expect(calls).toEqual([
    {
      panelId: 'schedules',
      workspaceId: 'w-a',
      binding: 'pinned',
      params: { scheduleId: 'schedule-a', occurrenceId: 'occ-a' },
    },
  ])
  await expect(navigateNotification({ kind: 'schedule', scheduleId: 'deleted' }, port)).rejects.toThrow(
    'no longer available',
  )
  expect(calls).toHaveLength(1)
})

test('a missing original session keeps its notification center open for local recovery', async () => {
  const calls: string[] = []
  const port: NotificationNavigationPort = {
    commands: {
      execute: async (id) => {
        calls.push(id)
        throw new Error('The original session was removed')
      },
    },
    sourceInstanceId: 'original-center',
    getSchedule: async () => null,
  }
  await expect(
    navigateNotification({ kind: 'session', workspaceId: 'w-a', sessionId: 'removed-session' }, port),
  ).rejects.toThrow('removed')
  expect(calls).toEqual(['app.setSession'])
})
