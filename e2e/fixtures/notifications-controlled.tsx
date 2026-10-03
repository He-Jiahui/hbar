import { createRoot } from 'react-dom/client'
import { HbarNotifications } from '@hbar/app-react'
import { createNotificationsRuntime, type NotificationsPort } from '@hbar/app-runtime'
import { CommandError } from '@hbar/commands'
import {
  notificationPageInputSchema,
  notificationPageSchema,
  notificationPreferencesSchema,
  type NotificationRecord,
  type NotificationTarget,
} from '@hbar/contracts/commands/notifications'
import { notificationCopy } from '../../apps/web/src/notification-copy'

interface NotificationHarness {
  mode: 'ok' | 'conflict' | 'timeout'
  writes: number
  opens: NotificationTarget[]
  receiptReady: boolean
  refreshRead(read: boolean): Promise<void>
  reconcile(): Promise<void>
  replaceItems(count: number, duplicate: boolean): Promise<void>
  replaceTarget(): Promise<void>
  loadMore(): Promise<void>
  readonly itemIds: () => readonly string[]
}
declare global {
  interface Window {
    __notifications?: NotificationHarness
  }
}

const make = (id: string, readAt: number | null): NotificationRecord => ({
  id,
  sourceEventId: `source-${id}`,
  kind: 'run.completed',
  title: `运行 ${id}`,
  detail: '工作区中的长中文运行详情，需要在狭窄面板中自然换行而且保留完整的通知目标。'.repeat(5),
  createdAt: 1,
  readAt,
  target: { kind: 'session', workspaceId: 'workspace-original', sessionId: 'session-original', runId: 'run-original' },
})
const prefs = notificationPreferencesSchema.parse({
  nativeEnabled: false,
  'run.completed': { inApp: true, desktop: true },
  'run.failed': { inApp: true, desktop: true },
  'approval.pending': { inApp: true, desktop: true },
  'schedule.failed': { inApp: true, desktop: true },
})
let records = [make('one', null)]
let pendingInput: { id: string; read: boolean } | null = null
const controls: NotificationHarness = {
  mode: 'ok',
  writes: 0,
  opens: [],
  receiptReady: false,
  async refreshRead(read) {
    records = records.map((record) => ({ ...record, readAt: read ? 2 : null }))
    await runtime.refresh()
  },
  reconcile: () => runtime.reconcile(),
  async replaceItems(count, duplicate) {
    records = Array.from({ length: count }, (_, index) => make(`item-${index}`, null))
    if (duplicate && records[0]) records.splice(1, 0, records[0])
    await runtime.refresh()
  },
  async replaceTarget() {
    records = records.map((record) => ({
      ...record,
      target: { kind: 'session', workspaceId: 'workspace-new', sessionId: 'session-new', runId: 'run-new' },
    }))
    await runtime.refresh()
  },
  loadMore: () => runtime.loadMore(),
  itemIds: () => runtime.reader.getSnapshot().items.map((item) => item.id),
}
const port: NotificationsPort = {
  async page(raw) {
    const input = notificationPageInputSchema.parse(raw)
    const offset = input.after === null ? 0 : Number(input.after)
    return notificationPageSchema.parse({
      items: records.slice(offset, offset + input.limit),
      nextCursor: offset + input.limit < records.length ? String(offset + input.limit) : null,
      unreadCount: records.filter((item) => item.readAt === null).length,
    })
  },
  preferences: async () => prefs,
  async markRead(input) {
    controls.writes++
    if (controls.mode === 'conflict') throw new CommandError('COMMAND_CONFLICT', 'The original notification changed')
    if (controls.mode === 'timeout') {
      pendingInput = input
      throw new CommandError('TIMEOUT', 'Transport reply missing')
    }
    const previous = records.find((item) => item.id === input.id)
    if (!previous) throw new CommandError('NOT_FOUND', 'The notification no longer exists')
    const updated = { ...previous, readAt: input.read ? 2 : null }
    records = records.map((item) => (item.id === input.id ? updated : item))
    return updated
  },
  async receipt() {
    if (!controls.receiptReady || !pendingInput) return null
    const input = pendingInput
    const previous = records.find((item) => item.id === input.id)
    if (!previous) throw new CommandError('NOT_FOUND', 'The original notification no longer exists')
    const updated = { ...previous, readAt: input.read ? 2 : null }
    records = records.map((item) => (item.id === input.id ? updated : item))
    return updated
  },
  async markAllRead() {
    const updated = records.filter((item) => item.readAt === null).length
    records = records.map((item) => ({ ...item, readAt: 2 }))
    return { updated }
  },
  setPreferences: async (value) => notificationPreferencesSchema.parse(value),
}
const runtime = createNotificationsRuntime(port)
window.__notifications = controls
const root = document.getElementById('root')
if (!root) throw new Error('Missing root')
createRoot(root).render(
  <HbarNotifications
    runtime={runtime}
    labels={notificationCopy('zh-CN')}
    onNavigate={(target) => {
      controls.opens.push(target)
    }}
  />,
)
