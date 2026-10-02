import { LumenNotifications, type LumenNotificationsContent, type LumenNotificationEntry } from '@lumen/app-ui'
import { notificationKindSchema, type NotificationRecord } from '@hbar/contracts/commands/notifications'
import type { NotificationsRuntime, NotificationsState } from '@hbar/app-runtime'
import { useEffect, useMemo } from 'react'
import { useHbarRuntimeState } from './runtime'

export interface HbarNotificationsLabels {
  readonly title: string
  readonly unread: (count: number) => string
  readonly markAll: string
  readonly filters: string
  readonly unreadFilter: string
  readonly mentions: string
  readonly markRead: (title: string) => string
  readonly markUnread: (title: string) => string
  readonly dismiss: (title: string) => string
  readonly empty: string
  readonly preferenceTitle: string
  readonly inApp: string
  readonly desktop: string
  readonly eventKinds: Record<NotificationRecord['kind'], string>
  readonly preferenceDetail: (enabled: number, total: number) => string
  readonly event: string
  readonly toggle: (event: string, channel: string) => string
  readonly all: string
  readonly none: string
  readonly quietTitle: string
  readonly quietDetail: string
  readonly quietToggle: string
  readonly days: string
  readonly saved: string
  readonly unsaved: string
  readonly saving: string
  readonly saveFailed: string
  readonly saveUnavailable: string
  readonly reset: string
  readonly save: string
  readonly centerTab: string
  readonly preferencesTab: string
  readonly loadMore: string
  readonly capacity: (count: number) => string
  readonly permissionDenied: string
  readonly nativeEnabled: string
  readonly deliveryFailed: string
}

export interface HbarNotificationsProps {
  readonly runtime: NotificationsRuntime
  readonly labels: HbarNotificationsLabels
  readonly onNavigate: (target: NotificationRecord['target']) => void
  readonly variant?: 1 | 3 | 4 | 5 | 6
}

function content(
  state: NotificationsState,
  labels: HbarNotificationsLabels,
  runtime: NotificationsRuntime,
): LumenNotificationsContent {
  const visibleItems = state.items.filter((item) => state.preferences?.[item.kind]?.inApp !== false)
  const entries: LumenNotificationEntry[] = visibleItems.map((item) => ({
    id: item.id,
    groupId: item.kind,
    kind: item.kind,
    title: item.title,
    detail: item.detail,
    time: new Date(item.createdAt).toLocaleString(),
    unread: item.readAt === null,
    icon:
      item.kind === 'run.completed'
        ? ('approved' as const)
        : item.kind === 'run.failed' || item.kind === 'schedule.failed'
          ? ('security' as const)
          : ('review' as const),
  }))
  const groups = [...new Set(visibleItems.map((item) => item.kind))].map((id) => ({ id, label: labels.eventKinds[id] }))
  return {
    center: {
      labels: {
        title: labels.title,
        unread: labels.unread,
        markAll: labels.markAll,
        filters: labels.filters,
        all: labels.all,
        unreadFilter: labels.unreadFilter,
        mentions: labels.mentions,
        markRead: labels.markRead,
        markUnread: labels.markUnread,
        dismiss: labels.dismiss,
        empty: labels.empty,
      },
      groups,
      entries,
      listStrategy: { kind: 'pane-scroll', expectedMaximum: 400 },
    },
    preferences: state.preferences
      ? {
          labels: {
            title: labels.preferenceTitle,
            detail: labels.preferenceDetail,
            event: labels.event,
            toggle: labels.toggle,
            all: labels.all,
            none: labels.none,
            quietTitle: labels.quietTitle,
            quietDetail: labels.quietDetail,
            quietToggle: labels.quietToggle,
            days: labels.days,
            saved: labels.saved,
            unsaved: labels.unsaved,
            saving: labels.saving,
            saveFailed: labels.saveFailed,
            saveUnavailable: labels.saveUnavailable,
            reset: labels.reset,
            save: labels.save,
            empty: labels.empty,
          },
          channels: [
            { id: 'inApp', label: labels.inApp },
            { id: 'desktop', label: labels.desktop },
          ],
          groups: [{ id: 'notifications', label: labels.preferenceTitle }],
          preferences: notificationKindSchema.options.map((kind) => ({
            id: kind,
            groupId: 'notifications',
            label: labels.eventKinds[kind],
            detail: labels.eventKinds[kind],
            enabledChannelIds: Object.entries(state.preferences?.[kind] ?? {})
              .filter(([, enabled]) => enabled)
              .map(([channel]) => channel),
          })),
          days: [],
          initialDayIds: [],
          initialQuiet: false,
          quietHoursVisible: false,
          listStrategy: { kind: 'pane-scroll', expectedMaximum: 4 },
          savePreferences: async (draft) => {
            const current = runtime.reader.getSnapshot().preferences
            if (!current) return
            const next = { ...current }
            for (const entry of draft.deliveries) {
              const parsed = notificationKindSchema.safeParse(entry.preferenceId)
              if (parsed.success && (entry.channelId === 'inApp' || entry.channelId === 'desktop'))
                next[parsed.data] = { ...next[parsed.data], [entry.channelId]: entry.enabled }
            }
            await runtime.setPreferences(next)
          },
        }
      : undefined,
  }
}

export function HbarNotifications({ runtime, labels, onNavigate, variant = 1 }: HbarNotificationsProps) {
  const state = useHbarRuntimeState(runtime.reader)
  useEffect(() => {
    void runtime.refresh({})
  }, [runtime])
  const view = useMemo(() => content(state, labels, runtime), [labels, runtime, state])
  return (
    <LumenNotifications
      variant={variant}
      variantId={`hbar.notifications.${variant}`}
      content={view}
      onAction={(event) => {
        if (event.actionId === 'read' || event.actionId === 'unread')
          void runtime.markRead(event.value ?? '', event.actionId === 'read')
        else if (event.actionId === 'read-all') void runtime.markAllRead()
        else if (event.actionId === 'open' && event.value) {
          const target = state.items.find((item) => item.id === event.value)?.target
          if (target) onNavigate(target)
        }
      }}
    />
  )
}
