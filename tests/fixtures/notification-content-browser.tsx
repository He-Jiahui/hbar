import { useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DEFAULT_LUMEN_APPEARANCE, LumenFrame, LumenProvider } from '@lumen/app-ui'
import { useHbarRuntimeState } from '@hbar/app-react'
import { createNotificationsRuntime, type NotificationsPort, type NotificationsRuntime } from '@hbar/app-runtime'
import { CommandError } from '@hbar/commands'
import {
  notificationPageInputSchema,
  notificationPageSchema,
  notificationPreferencesSchema,
  type NotificationRecord,
  type NotificationTarget,
} from '@hbar/contracts/commands/notifications'
import { notificationCopy, notificationNavigationCopy } from '../../apps/web/src/notification-copy'
import { NotificationPageButton } from '../../apps/web/src/NotificationPageButton'
import { NotificationsPageView } from '../../apps/web/src/notifications-page-view'
import { notificationFixtureTitle, notificationFixtureDetail } from './notification-content-data'
import '@lumen/app-ui/styles.css'

export interface NotificationContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly count: number
  readonly long?: boolean
  readonly permissionError?: boolean
  readonly permissionPending?: boolean
}
declare global {
  interface Window {
    mountNotificationContent(input: NotificationContentInput): void
    updateNotificationContent(input: NotificationContentInput): void
    populateNotificationContent(count: number, duplicate?: boolean): Promise<void>
    failNotificationContentRead(failed: boolean): Promise<void>
    failNotificationContentNavigation(failed: boolean): void
    notificationContentOpens(): readonly NotificationTarget[]
  }
}
let root: Root | undefined
let runtime: NotificationsRuntime | undefined
let records: NotificationRecord[] = []
let readFailed = false
let navigationFailed = false
let locale: NotificationContentInput['locale'] = 'zh-CN'
const opens: NotificationTarget[] = []
let preferences = notificationPreferencesSchema.parse({
  nativeEnabled: false,
  'run.completed': { inApp: true, desktop: true },
  'run.failed': { inApp: true, desktop: true },
  'approval.pending': { inApp: true, desktop: true },
  'schedule.failed': { inApp: true, desktop: true },
})
const makeRecords = (count: number): NotificationRecord[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `notification-${index}`,
    sourceEventId: `event-${index}`,
    kind: 'run.completed',
    title: notificationFixtureTitle(locale),
    detail: notificationFixtureDetail(locale),
    createdAt: 1,
    readAt: null,
    target: {
      kind: 'session',
      workspaceId: 'original-workspace',
      sessionId: `original-session-${index}`,
      runId: `original-run-${index}`,
    },
  }))
const port: NotificationsPort = {
  page: (raw) => {
    const input = notificationPageInputSchema.parse(raw)
    if (readFailed)
      return Promise.reject(new CommandError('CONNECTION_CLOSED', notificationCopy(locale).deliveryFailed.repeat(5)))
    const offset = input.after === null ? 0 : Number(input.after)
    return Promise.resolve(
      notificationPageSchema.parse({
        items: records.slice(offset, offset + input.limit),
        nextCursor: offset + input.limit < records.length ? String(offset + input.limit) : null,
        unreadCount: records.filter((record) => record.readAt === null).length,
      }),
    )
  },
  preferences: () => Promise.resolve(preferences),
  markRead: (input) => {
    const original = records.find((record) => record.id === input.id)
    if (!original) return Promise.reject(new CommandError('NOT_FOUND', notificationCopy(locale).navigationFailed))
    const updated = { ...original, readAt: input.read ? 2 : null }
    records = records.map((record) => (record.id === input.id ? updated : record))
    return Promise.resolve(updated)
  },
  markAllRead: () => {
    records = records.map((record) => ({ ...record, readAt: 2 }))
    return Promise.resolve({ updated: records.length })
  },
  setPreferences: (input) => {
    preferences = notificationPreferencesSchema.parse(input)
    return Promise.resolve(preferences)
  },
}
function Fixture({
  input,
  runtime,
}: {
  readonly input: NotificationContentInput
  readonly runtime: NotificationsRuntime
}) {
  const state = useHbarRuntimeState(runtime.reader)
  const [tab, setTab] = useState<1 | 3>(1)
  const copy = notificationCopy(input.locale)
  const labels = {
    ...copy,
    title: copy.title.repeat(input.long ? 8 : 1),
    preferenceTitle: copy.preferenceTitle.repeat(input.long ? 8 : 1),
    centerTab: copy.centerTab.repeat(input.long ? 8 : 1),
    preferencesTab: copy.preferencesTab.repeat(input.long ? 8 : 1),
    markAll: copy.markAll.repeat(input.long ? 8 : 1),
    nativeEnabled: copy.nativeEnabled.repeat(input.long ? 8 : 1),
    permissionDenied: copy.permissionDenied.repeat(input.long ? 5 : 1),
    eventKinds: { ...copy.eventKinds, 'run.completed': notificationFixtureTitle(input.locale) },
    formatTime: (timestamp: number) => copy.formatTime(timestamp).repeat(input.long ? 8 : 1),
  }
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, textSize: 'l', motion: false }}>
      <LumenFrame
        as="main"
        style={{
          display: 'flex',
          flexDirection: 'column',
          blockSize: 'calc(100dvh / 1.25)',
          minInlineSize: 0,
          minBlockSize: 0,
          boxSizing: 'border-box',
          padding: '.5rem',
        }}
      >
        <NotificationPageButton
          labels={notificationNavigationCopy(input.locale)}
          unreadCount={state.unreadCount}
          selected
          onOpen={() => setTab(1)}
        />
        <NotificationsPageView
          runtime={runtime}
          state={state}
          labels={labels}
          tab={tab}
          onTab={setTab}
          nativeAvailable
          permissionError={Boolean(input.permissionError)}
          permissionPending={Boolean(input.permissionPending)}
          reconciling={false}
          onToggleNative={() => {
            if (state.preferences)
              void runtime.setPreferences({ ...state.preferences, nativeEnabled: !state.preferences.nativeEnabled })
          }}
          onReconcile={() => {
            void runtime.reconcile()
          }}
          onLoadMore={() => {
            void runtime.loadMore()
          }}
          onNavigate={(target) => {
            opens.push(target)
            if (navigationFailed) return Promise.reject(new CommandError('NOT_FOUND', labels.navigationFailed))
            return undefined
          }}
        />
      </LumenFrame>
    </LumenProvider>
  )
}
window.mountNotificationContent = (input) => {
  root?.unmount()
  runtime?.dispose()
  readFailed = false
  navigationFailed = false
  preferences = { ...preferences, nativeEnabled: false }
  locale = input.locale
  records = makeRecords(input.count)
  opens.splice(0)
  runtime = createNotificationsRuntime(port)
  const element = document.getElementById('notification-content-fixture')
  if (!element) throw new Error('Missing notification fixture mount')
  root = createRoot(element)
  root.render(<Fixture input={input} runtime={runtime} />)
}
window.updateNotificationContent = (input) => {
  locale = input.locale
  if (runtime) root?.render(<Fixture input={input} runtime={runtime} />)
}
window.populateNotificationContent = async (count, duplicate = false) => {
  records = makeRecords(count)
  const first = records[0]
  if (duplicate && first) records.splice(1, 0, first)
  await runtime?.refresh()
  while (runtime?.reader.getSnapshot().nextCursor && runtime.reader.getSnapshot().items.length < 400)
    await runtime.loadMore()
}
window.failNotificationContentRead = async (failed) => {
  readFailed = failed
  await runtime?.refresh()
}
window.failNotificationContentNavigation = (failed) => {
  navigationFailed = failed
}
window.notificationContentOpens = () => opens
