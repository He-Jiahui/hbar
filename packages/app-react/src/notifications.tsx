import {
  LumenContentText,
  LumenNotifications,
  type LumenNotificationsContent,
  type LumenNotificationEntry,
} from '@lumen/app-ui'
import {
  notificationKindSchema,
  notificationPreferencesSchema,
  type NotificationPreferences,
  type NotificationRecord,
} from '@hbar/contracts/commands/notifications'
import type { NotificationsRuntime, NotificationsState } from '@hbar/app-runtime'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useHbarRuntimeState } from './runtime'
import {
  notificationBellMessages,
  notificationCenterMessages,
  notificationPreferencesMessages,
  type NotificationBellLabels,
  type NotificationCenterLabels,
  type NotificationPreferencesLabels,
} from './notifications-messages'

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
  readonly open: (title: string) => string
  readonly deliveryFailed: string
  readonly reconcile: string
  readonly reconciling: string
  readonly formatTime: (timestamp: number) => string
  readonly bell: (count: number) => string
  readonly navigationFailed: string
}

export interface HbarNotificationsProps {
  readonly runtime: NotificationsRuntime
  readonly labels: HbarNotificationsLabels
  readonly onNavigate: (target: NotificationRecord['target']) => void | Promise<void>
  readonly variant?: 1 | 3 | 4 | 5 | 6
  readonly onOpenCenter?: () => void
}

function preferencesContent(
  preferences: NotificationPreferences,
  labels: NotificationPreferencesLabels,
  runtime: NotificationsRuntime,
): NonNullable<LumenNotificationsContent['preferences']> {
  return {
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
      enabledChannelIds: Object.entries(preferences[kind])
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
}

function content(
  state: NotificationsState,
  centerLabels: NotificationCenterLabels,
  bellLabels: NotificationBellLabels,
  runtime: NotificationsRuntime,
  pendingIds: ReadonlySet<string>,
  preferences: LumenNotificationsContent['preferences'],
): LumenNotificationsContent {
  const visibleItems = state.items.filter((item) => state.preferences?.[item.kind]?.inApp !== false)
  const entries: LumenNotificationEntry[] = visibleItems.map((item) => ({
    id: item.id,
    groupId: item.kind,
    kind: item.kind,
    title: centerLabels.eventKinds[item.kind],
    detail: item.detail,
    time: centerLabels.formatTime(item.createdAt),
    unread: item.readAt === null,
    icon:
      item.kind === 'run.completed'
        ? ('approved' as const)
        : item.kind === 'run.failed' || item.kind === 'schedule.failed'
          ? ('security' as const)
          : ('review' as const),
  }))
  const groups = [...new Set(visibleItems.map((item) => item.kind))].map((id) => ({
    id,
    label: centerLabels.eventKinds[id],
  }))
  return {
    center: {
      labels: {
        title: centerLabels.title,
        unread: () => centerLabels.unread(state.unreadCount),
        markAll: centerLabels.markAll,
        filters: centerLabels.filters,
        all: centerLabels.all,
        unreadFilter: centerLabels.unreadFilter,
        mentions: centerLabels.mentions,
        markRead: centerLabels.markRead,
        markUnread: centerLabels.markUnread,
        dismiss: centerLabels.dismiss,
        empty: centerLabels.empty,
      },
      groups,
      entries,
      listStrategy: { kind: 'pane-scroll', expectedMaximum: 400 },
      controlledReadState: {
        readIds: new Set(visibleItems.filter((item) => item.readAt !== null).map((item) => item.id)),
        pendingIds,
      },
      unreadCount: state.unreadCount,
      showDismiss: false,
      showMentions: false,
      openLabel: centerLabels.open,
    },
    bell: {
      presentation: 'trigger',
      unreadCount: state.unreadCount,
      labels: {
        brandMark: '',
        brand: '',
        bell: bellLabels.bell,
        dialog: bellLabels.title,
        filter: bellLabels.filters,
        all: bellLabels.all,
        unread: bellLabels.unreadFilter,
        markAll: bellLabels.markAll,
        openCenter: bellLabels.title,
        settings: bellLabels.preferenceTitle,
        hint: '',
        empty: bellLabels.empty,
        unreadEmpty: bellLabels.empty,
        pending: bellLabels.saving,
        failed: bellLabels.saveFailed,
        unavailable: bellLabels.saveUnavailable,
      },
      navItems: [],
      selectedNavId: '',
      avatar: '',
      messages: visibleItems.map((item) => ({
        id: item.id,
        actor: bellLabels.eventKinds[item.kind],
        summary: bellLabels.eventKinds[item.kind],
        time: bellLabels.formatTime(item.createdAt),
        unread: item.readAt === null,
        icon: item.kind === 'run.completed' ? 'resolved' : item.kind === 'approval.pending' ? 'review' : 'security',
      })),
      listStrategy: { kind: 'pane-scroll', expectedMaximum: 400 },
      markRead: async (ids, signal) => {
        if (signal.aborted) return 'unchanged'
        for (const id of ids) {
          if (signal.aborted) return 'unchanged'
          await runtime.markRead(id, true)
        }
        return 'confirmed'
      },
    },
    preferences,
  }
}

export function HbarNotifications({ labels, ...props }: HbarNotificationsProps) {
  const centerMessages: NotificationCenterLabels = {
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
    eventKinds: labels.eventKinds,
    formatTime: labels.formatTime,
    open: labels.open,
    navigationFailed: labels.navigationFailed,
  }
  const preferencesMessages: NotificationPreferencesLabels = {
    preferenceTitle: labels.preferenceTitle,
    inApp: labels.inApp,
    desktop: labels.desktop,
    eventKinds: labels.eventKinds,
    preferenceDetail: labels.preferenceDetail,
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
  }
  const bellMessages: NotificationBellLabels = {
    bell: labels.bell,
    title: labels.title,
    filters: labels.filters,
    all: labels.all,
    unreadFilter: labels.unreadFilter,
    markAll: labels.markAll,
    preferenceTitle: labels.preferenceTitle,
    empty: labels.empty,
    saving: labels.saving,
    saveFailed: labels.saveFailed,
    saveUnavailable: labels.saveUnavailable,
    eventKinds: labels.eventKinds,
    formatTime: labels.formatTime,
  }
  return (
    <notificationCenterMessages.Provider messages={centerMessages}>
      <notificationPreferencesMessages.Provider messages={preferencesMessages}>
        <notificationBellMessages.Provider messages={bellMessages}>
          <HbarNotificationsContent {...props} />
        </notificationBellMessages.Provider>
      </notificationPreferencesMessages.Provider>
    </notificationCenterMessages.Provider>
  )
}

function HbarNotificationsContent({
  runtime,
  onNavigate,
  variant = 1,
  onOpenCenter,
}: Omit<HbarNotificationsProps, 'labels'>) {
  const { t: center } = notificationCenterMessages.useMessages()
  const { t: preferencesCopy } = notificationPreferencesMessages.useMessages()
  const { t: bell } = notificationBellMessages.useMessages()
  const centerLabels = useMemo<NotificationCenterLabels>(
    () => ({
      title: center('title'),
      unread: center('unread'),
      markAll: center('markAll'),
      filters: center('filters'),
      all: center('all'),
      unreadFilter: center('unreadFilter'),
      mentions: center('mentions'),
      markRead: center('markRead'),
      markUnread: center('markUnread'),
      dismiss: center('dismiss'),
      empty: center('empty'),
      eventKinds: center('eventKinds'),
      formatTime: center('formatTime'),
      open: center('open'),
      navigationFailed: center('navigationFailed'),
    }),
    [center],
  )
  const preferencesLabels = useMemo<NotificationPreferencesLabels>(
    () => ({
      preferenceTitle: preferencesCopy('preferenceTitle'),
      inApp: preferencesCopy('inApp'),
      desktop: preferencesCopy('desktop'),
      eventKinds: preferencesCopy('eventKinds'),
      preferenceDetail: preferencesCopy('preferenceDetail'),
      event: preferencesCopy('event'),
      toggle: preferencesCopy('toggle'),
      all: preferencesCopy('all'),
      none: preferencesCopy('none'),
      quietTitle: preferencesCopy('quietTitle'),
      quietDetail: preferencesCopy('quietDetail'),
      quietToggle: preferencesCopy('quietToggle'),
      days: preferencesCopy('days'),
      saved: preferencesCopy('saved'),
      unsaved: preferencesCopy('unsaved'),
      saving: preferencesCopy('saving'),
      saveFailed: preferencesCopy('saveFailed'),
      saveUnavailable: preferencesCopy('saveUnavailable'),
      reset: preferencesCopy('reset'),
      save: preferencesCopy('save'),
      empty: preferencesCopy('empty'),
    }),
    [preferencesCopy],
  )
  const bellLabels = useMemo<NotificationBellLabels>(
    () => ({
      bell: bell('bell'),
      title: bell('title'),
      filters: bell('filters'),
      all: bell('all'),
      unreadFilter: bell('unreadFilter'),
      markAll: bell('markAll'),
      preferenceTitle: bell('preferenceTitle'),
      empty: bell('empty'),
      saving: bell('saving'),
      saveFailed: bell('saveFailed'),
      saveUnavailable: bell('saveUnavailable'),
      eventKinds: bell('eventKinds'),
      formatTime: bell('formatTime'),
    }),
    [bell],
  )
  const state = useHbarRuntimeState(runtime.reader)
  const [actionError, setActionError] = useState<string | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    void runtime.refresh({}).catch(() => undefined)
    return () => {
      mounted.current = false
    }
  }, [runtime])
  const pendingIds = useMemo<ReadonlySet<string>>(
    () =>
      new Set(
        state.mutation === 'submitting' || state.mutation === 'unknown' ? state.items.map((item) => item.id) : [],
      ),
    [state.items, state.mutation],
  )
  // Equal Host refreshes must not replace the editable surface's saved baseline.
  const preferenceSnapshot = state.preferences
    ? JSON.stringify(notificationPreferencesSchema.parse(state.preferences))
    : null
  const preferences = useMemo(
    () =>
      preferenceSnapshot
        ? preferencesContent(
            notificationPreferencesSchema.parse(JSON.parse(preferenceSnapshot)),
            preferencesLabels,
            runtime,
          )
        : undefined,
    [preferenceSnapshot, preferencesLabels, runtime],
  )
  const view = useMemo(
    () => content(state, centerLabels, bellLabels, runtime, pendingIds, preferences),
    [centerLabels, bellLabels, runtime, state, pendingIds, preferences],
  )
  return (
    <>
      {actionError ? (
        <LumenContentText context="message.inline" role="alert" tone="danger">
          {actionError}
        </LumenContentText>
      ) : null}
      <LumenNotifications
        variant={variant}
        variantId={`hbar.notifications.${variant}`}
        content={view}
        onAction={(event) => {
          if (event.actionId === 'read' || event.actionId === 'unread') {
            const id = event.value ?? ''
            if (!id) return
            void runtime.markRead(id, event.actionId === 'read').catch(() => undefined)
          } else if (event.actionId === 'read-all') void runtime.markAllRead().catch(() => undefined)
          else if (event.actionId === 'open-center') onOpenCenter?.()
          else if (event.actionId === 'open' && event.value) {
            const target = state.items.find((item) => item.id === event.value)?.target
            if (target) {
              setActionError(null)
              void Promise.resolve()
                .then(() => onNavigate(target))
                .catch(() => {
                  if (mounted.current) setActionError(center('navigationFailed'))
                })
            }
          }
        }}
      />
    </>
  )
}
