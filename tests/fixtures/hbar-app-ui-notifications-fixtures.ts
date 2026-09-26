import type { HbarAppUiNotificationsContent } from '../../packages/hbar-app-ui/src/index'

const scroll = { kind: 'pane-scroll', expectedMaximum: 80 } as const
const grown = { kind: 'content-grown', expectedMaximum: 16 } as const

export const HBAR_APP_UI_NOTIFICATIONS_FIXTURES: HbarAppUiNotificationsContent = {
  center: {
    labels: {
      title: 'Notifications',
      unread: (count) => `${count} unread`,
      markAll: 'Mark all read',
      filters: 'Filter notifications',
      all: 'All',
      unreadFilter: 'Unread',
      mentions: 'Mentions',
      markRead: () => 'Mark as read',
      markUnread: () => 'Mark unread',
      dismiss: () => 'Dismiss notification',
      empty: 'No notifications',
      count: (count) => String(count),
    },
    groups: [
      { id: 'today', label: 'Today' },
      { id: 'yesterday', label: 'Yesterday' },
      { id: 'earlier', label: 'Earlier' },
    ],
    entries: [
      {
        id: 'ana-mention',
        groupId: 'today',
        kind: 'Mention', icon: 'mention',
        title: 'Ana Reyes mentioned you in Q3 rollout plan',
        titleParts: [{ text: 'Ana Reyes', strong: true }, { text: ' mentioned you in ' }, { text: 'Q3 rollout plan', strong: true }],
        detail: 'Can you confirm the migration window before we lock the schedule with Northwind?',
        time: '12m',
        unread: true,
        mention: true,
      },
      {
        id: 'wei-review',
        groupId: 'today',
        kind: 'Review', icon: 'review',
        title: 'Wei Chen requested review on Billing usage meter',
        titleParts: [{ text: 'Wei Chen', strong: true }, { text: ' requested review on ' }, { text: 'Billing usage meter', strong: true }],
        detail: '14 files changed across the metering service and the invoice job.',
        time: '48m',
        unread: true,
      },
      {
        id: 'marco-reply', groupId: 'today', kind: 'Reply', icon: 'reply',
        title: 'Marco Silva replied in Onboarding checklist',
        titleParts: [{ text: 'Marco Silva', strong: true }, { text: ' replied in ' }, { text: 'Onboarding checklist', strong: true }],
        detail: 'Moved the workspace step ahead of the invite step. Looks cleaner.',
        time: '2h', unread: true,
      },
      {
        id: 'priya-member', groupId: 'today', kind: 'Member', icon: 'member',
        title: 'Priya Nandakumar joined Cedar Labs',
        titleParts: [{ text: 'Priya Nandakumar', strong: true }, { text: ' joined ' }, { text: 'Cedar Labs', strong: true }],
        detail: 'Invited by you as an editor.',
        time: '5h', unread: false,
      },
      {
        id: 'halcyon-security', groupId: 'yesterday', kind: 'Security', icon: 'security',
        title: 'Halcyon signed in from a new device on macOS · Lisbon',
        titleParts: [{ text: 'Halcyon', strong: true }, { text: ' signed in from a new device on ' }, { text: 'macOS · Lisbon', strong: true }],
        detail: 'If this was not you, revoke the session and rotate your keys.',
        time: 'Yesterday',
        unread: true,
      },
      {
        id: 'sofia-mention', groupId: 'yesterday', kind: 'Mention', icon: 'mention',
        title: 'Sofia Alvarez mentioned you in Retention teardown',
        titleParts: [{ text: 'Sofia Alvarez', strong: true }, { text: ' mentioned you in ' }, { text: 'Retention teardown', strong: true }],
        detail: 'Pulled your cohort chart into the summary. Shout if that is stale.',
        time: 'Yesterday', unread: false, mention: true,
      },
      {
        id: 'marco-resolved', groupId: 'earlier', kind: 'Resolved', icon: 'resolved',
        title: 'Marco Silva resolved your comment in Meridian import',
        titleParts: [{ text: 'Marco Silva', strong: true }, { text: ' resolved your comment in ' }, { text: 'Meridian import', strong: true }],
        time: '2d', unread: false,
      },
      {
        id: 'ana-approved', groupId: 'earlier', kind: 'Approved', icon: 'approved',
        title: 'Ana Reyes approved Sidebar density pass',
        titleParts: [{ text: 'Ana Reyes', strong: true }, { text: ' approved ' }, { text: 'Sidebar density pass', strong: true }],
        time: '3d', unread: false,
      },
    ],
    listStrategy: scroll,
  },
  toasts: {
    labels: {
      title: 'Toast notifications',
      detail: 'Transient messages stack in the corner, collapse when idle and expand on hover.',
      dismiss: () => 'Dismiss',
      paused: 'Timer paused',
      automatic: 'Dismisses automatically',
      empty: 'No active toasts',
      clear: 'Clear all',
      active: (count) => `${count} active`,
    },
    choices: [
      { id: 'success', label: 'Success', title: 'Deployment live', detail: 'halcyon-web · production · 42s', tone: 'success', action: 'Undo' },
      { id: 'error', label: 'Error', title: 'Import failed', detail: 'Row 118 has an unmapped column.', tone: 'danger' },
      { id: 'info', label: 'Info', title: 'Wei Chen shared a board', detail: 'Q3 rollout · you have edit access.', tone: 'info' },
      { id: 'progress', label: 'Progress', title: 'Uploading contacts', detail: '2,480 records from Northwind.', tone: 'warning' },
    ],
    maximum: 4,
  },
  preferences: {
    labels: {
      title: 'Notification preferences',
      detail: (enabled, total) => `${enabled} of ${total} deliveries enabled for this workspace.`,
      event: 'Event',
      toggle: (event, channel) => `${event}: ${channel}`,
      all: 'All',
      none: 'None',
      quietTitle: 'Quiet hours',
      quietDetail: 'Hold email and push between 20:00 and 08:00. In-app stays on.',
      quietToggle: 'Quiet hours',
      days: 'Quiet hour days',
      saved: 'All changes saved',
      unsaved: 'Unsaved changes',
      saving: 'Saving preferences',
      saveFailed: 'Could not save preferences. Try again.',
      saveUnavailable: 'Saving is unavailable',
      reset: 'Reset',
      save: 'Save preferences',
      empty: 'No preferences',
    },
    channels: [
      { id: 'in-app', label: 'In-app' },
      { id: 'email', label: 'Email' },
      { id: 'push', label: 'Push' },
    ],
    groups: [
      { id: 'collaboration', label: 'Collaboration' },
      { id: 'account', label: 'Account' },
      { id: 'security', label: 'Security' },
    ],
    preferences: [
      {
        id: 'mentions-replies',
        groupId: 'collaboration',
        label: 'Mentions and replies',
        detail: 'Someone names you in a comment or thread.',
        enabledChannelIds: ['in-app', 'email', 'push'],
      },
      {
        id: 'assigned',
        groupId: 'collaboration',
        label: 'Assigned to you',
        detail: 'A task, review or ticket lands in your queue.',
        enabledChannelIds: ['in-app', 'email'],
      },
      {
        id: 'shared',
        groupId: 'collaboration',
        label: 'Shared with you',
        detail: 'A board, document or dashboard is shared.',
        enabledChannelIds: ['in-app'],
      },
      {
        id: 'invoices',
        groupId: 'account',
        label: 'Invoices and receipts',
        detail: 'Monthly statements for Cedar Labs.',
        enabledChannelIds: ['email'],
      },
      {
        id: 'seats',
        groupId: 'account',
        label: 'Seat changes',
        detail: 'A member joins, leaves or changes role.',
        enabledChannelIds: ['in-app', 'email'],
      },
      {
        id: 'sign-in',
        groupId: 'security',
        label: 'New sign-in',
        detail: 'A session starts on an unrecognised device.',
        enabledChannelIds: ['in-app', 'email', 'push'],
      },
      {
        id: 'api-key',
        groupId: 'security',
        label: 'API key activity',
        detail: 'A key is created, rotated or revoked.',
        enabledChannelIds: ['in-app', 'email'],
      },
    ],
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => ({ id: label.toLowerCase(), label })),
    initialDayIds: ['sat', 'sun'],
    initialQuiet: true,
    listStrategy: scroll,
    savePreferences: async () => {},
  },
  activity: {
    labels: {
      title: 'Activity',
      views: 'Activity views',
      back: 'Back',
      snooze: 'Snooze',
      archive: 'Archive',
      emptyList: 'No activity',
      emptyTitle: 'Nothing selected',
      emptyDetail: 'Choose an item from the list to see its context and actions.',
      emptyFacts: 'No facts',
      unavailable: 'Action unavailable',
      moving: 'Updating activity…',
      moveFailed: 'Could not update activity. Try again.',
      count: (count) => String(count),
    },
    views: [
      { id: 'inbox', label: 'Inbox' },
      { id: 'snoozed', label: 'Snoozed' },
      { id: 'archived', label: 'Archived' },
    ],
    inboxViewId: 'inbox',
    snoozedViewId: 'snoozed',
    archivedViewId: 'archived',
    snoozeChoices: [
      { id: 'later', label: 'Later today' },
      { id: 'tomorrow', label: 'Tomorrow 09:00' },
      { id: 'next-week', label: 'Next week' },
      { id: 'pick-date', label: 'Pick a date' },
    ],
    initialViewId: 'inbox',
    initialEntryId: 'priya-access',
    entries: [
      {
        id: 'priya-access',
        viewId: 'inbox', icon: 'access', person: 'Priya Nandakumar',
        time: '9m',
        summary: 'requested admin access to Cedar Labs billing',
        introduction: 'requested admin access to',
        title: 'Cedar Labs billing',
        detail: 'Priya needs to reconcile the October statement and issue two credits before the close on Friday. Access can be time-boxed to 7 days.',
        primaryAction: { id: 'grant', label: 'Grant access' },
        facts: [
          { id: 'requested', label: 'Requested role', value: 'Billing admin' },
          { id: 'current', label: 'Current role', value: 'Member' },
          { id: 'duration', label: 'Duration', value: '7 days' },
          { id: 'approver', label: 'Approver', value: 'You' },
        ],
        link: { label: 'Open in console', href: '#' },
      },
      {
        id: 'wei-review', viewId: 'inbox', icon: 'review', person: 'Wei Chen', time: '52m',
        summary: 'requested your review on Usage metering rewrite',
        introduction: 'requested your review on', title: 'Usage metering rewrite',
        detail: 'Replaces the nightly aggregation job with a streaming counter. Adds a backfill script and a feature flag so we can roll back per workspace.',
        primaryAction: { id: 'start-review', label: 'Start review' },
        facts: [
          { id: 'repository', label: 'Repository', value: 'halcyon/metering' },
          { id: 'files', label: 'Files changed', value: '14' },
          { id: 'checks', label: 'Checks', value: '8 passing' },
          { id: 'base', label: 'Base', value: 'main' },
        ],
        link: { label: 'Open in repository', href: '#' },
      },
      {
        id: 'halcyon-alert', viewId: 'inbox', icon: 'alert', person: 'Halcyon', time: '3h',
        summary: 'raised a latency alert on eu-west ingest',
        introduction: 'raised a latency alert on', title: 'eu-west ingest',
        detail: 'p95 crossed 800ms for 12 minutes and recovered without intervention. The queue depth peaked at 4,120 messages during the window.',
        primaryAction: { id: 'open-incident', label: 'Open incident' },
        facts: [
          { id: 'severity', label: 'Severity', value: 'Warning' },
          { id: 'duration', label: 'Duration', value: '12m' },
          { id: 'p95', label: 'Peak p95', value: '812ms' },
          { id: 'status', label: 'Status', value: 'Recovered' },
        ], link: { label: 'Open in console', href: '#' },
      },
      {
        id: 'ana-changes', viewId: 'snoozed', icon: 'comment', person: 'Ana Reyes', time: '1d',
        summary: 'left changes requested on Sidebar density pass',
        introduction: 'left changes requested on', title: 'Sidebar density pass',
        detail: 'Two comments on the collapsed rail widths and one on the tooltip delay. Everything else is approved.',
        primaryAction: { id: 'open-pull-request', label: 'Open pull request' },
        facts: [
          { id: 'repository', label: 'Repository', value: 'halcyon/web' },
          { id: 'comments', label: 'Comments', value: '3' },
          { id: 'checks', label: 'Checks', value: '6 passing' },
          { id: 'until', label: 'Snoozed until', value: 'Tomorrow 09:00' },
        ],
        link: { label: 'Open in repository', href: '#' },
      },
      {
        id: 'marco-member', viewId: 'archived', icon: 'member', person: 'Marco Silva', time: '2d',
        summary: 'was added to Northwind workspace',
        introduction: 'was added to', title: 'Northwind workspace',
        detail: 'Marco accepted the invite and completed device enrolment. No further action is needed.',
        primaryAction: { id: 'view-member', label: 'View member' },
        facts: [
          { id: 'role', label: 'Role', value: 'Editor' },
          { id: 'invited', label: 'Invited by', value: 'You' },
          { id: 'device', label: 'Device', value: 'Enrolled' },
          { id: 'status', label: 'Status', value: 'Active' },
        ],
        link: { label: 'Open in console', href: '#' },
      },
    ],
    listStrategy: scroll,
    moveEntry: async () => {},
  },
  system: {
    labels: {
      title: 'System messages',
      detail: 'Persistent banners for account, billing and platform state.',
      restore: 'Restore all',
      dismiss: (title) => `Dismiss: ${title}`,
      show: 'Show details',
      hide: 'Hide details',
      progress: (title) => `${title} usage`,
      empty: 'No system messages',
    },
    messages: [
      {
        id: 'maintenance',
        tone: 'info',
        title: 'Scheduled maintenance on Sunday',
        detail: 'Halcyon will be read-only from 02:00 to 04:00 UTC.',
        primary: 'Read the notice',
      },
      {
        id: 'card',
        tone: 'warning',
        title: 'Your card expires in 6 days',
        detail: 'Update the payment method to avoid an interruption.',
        primary: 'Update card',
        secondary: 'Remind me later',
      },
      {
        id: 'imports',
        tone: 'danger',
        title: '3 of 5 imports failed',
        detail: 'The Northwind sync stopped after repeated schema errors.',
        primary: 'Retry failed',
        expandable: true,
        expandedDetail: 'Three source files need a schema mapping before the next retry.',
      },
      {
        id: 'domain',
        tone: 'success',
        title: 'meridian.example is verified',
        detail: 'DNS records propagated and the certificate was issued.',
        primary: 'View DNS',
      },
      {
        id: 'usage',
        tone: 'usage',
        title: 'You have used 84% of your monthly events',
        detail: 'At the current rate the workspace reaches its limit around 26 November.',
        primary: 'Increase limit',
        usage: { value: 84, label: '4.2 of 5 M events' },
      },
    ],
    listStrategy: scroll,
  },
  bell: {
    labels: {
      brand: 'Halcyon',
      navigation: 'Primary',
      bell: (count) => `Notifications, ${count} unread`,
      dialog: 'Notifications',
      close: 'Close notifications',
      markAll: 'Mark all read',
      settings: 'Settings',
      hint: 'Open the bell to review recent activity. The panel closes on Escape or outside click.',
      empty: 'No notifications',
    },
    navItems: [
      { id: 'overview', label: 'Overview' },
      { id: 'projects', label: 'Projects' },
      { id: 'reports', label: 'Reports' },
    ],
    selectedNavId: 'overview',
    messages: [
      { id: 'access', title: 'Priya requested access', time: '9m ago', unread: true },
      { id: 'report', title: 'Billing report is ready', time: '42m ago', unread: true },
      { id: 'signin', title: 'New sign-in detected', time: 'Yesterday', unread: true },
    ],
    avatar: 'AR',
    listStrategy: grown,
  },
}

export function createHbarAppUiNotificationPreferencesFixture(mode: string | null): HbarAppUiNotificationsContent {
  const base = HBAR_APP_UI_NOTIFICATIONS_FIXTURES.preferences!
  switch (mode) {
    case 'localized':
      return {
        ...HBAR_APP_UI_NOTIFICATIONS_FIXTURES,
        preferences: {
          ...base,
          labels: {
            ...base.labels,
            title: 'Benachrichtigungseinstellungen',
            detail: (enabled, total) => `${enabled} von ${total} Zustellungen für diesen Arbeitsbereich aktiviert.`,
            event: 'Ereignis',
            all: 'Alle',
            none: 'Keine',
            toggle: (event, channel) => `${event}: ${channel}`,
            quietTitle: 'Ruhezeiten',
            quietDetail: 'E-Mail und Push-Nachrichten während der Ruhezeiten anhalten.',
            quietToggle: 'Ruhezeiten',
            days: 'Wochentage',
            saved: 'Alle Änderungen gespeichert',
            unsaved: 'Nicht gespeicherte Änderungen',
            saving: 'Änderungen werden gespeichert',
            saveFailed: 'Speichern fehlgeschlagen. Erneut versuchen.',
            saveUnavailable: 'Speichern nicht verfügbar',
            reset: 'Zurücksetzen',
            save: 'Einstellungen speichern',
            empty: 'Keine Ereignisse',
          },
          preferences: base.preferences.map((item, index) => ({
            ...item,
            label: index === 0 ? 'Erwähnungen und Antworten in gemeinsam bearbeiteten Projekten' : item.label,
            detail: `${item.detail} Besonders ausführliche lokalisierte Beschreibung für den Arbeitsbereich.`,
          })),
          days: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((label, index) => ({
            id: base.days[index]!.id,
            label,
          })),
        },
      }
    case 'empty':
      return { ...HBAR_APP_UI_NOTIFICATIONS_FIXTURES, preferences: { ...base, preferences: [] } }
    case 'one':
      return {
        ...HBAR_APP_UI_NOTIFICATIONS_FIXTURES,
        preferences: { ...base, preferences: base.preferences.slice(0, 1) },
      }
    case 'overflow':
      return {
        ...HBAR_APP_UI_NOTIFICATIONS_FIXTURES,
        preferences: {
          ...base,
          preferences: Array.from({ length: 81 }, (_, index) => ({
            id: `event-${index}`,
            groupId: 'collaboration',
            label: `Event ${index}`,
            detail: `Delivery policy for event ${index}`,
            enabledChannelIds: index % 2 ? ['email'] : ['in-app'],
          })),
        },
      }
    case 'duplicate':
      return {
        ...HBAR_APP_UI_NOTIFICATIONS_FIXTURES,
        preferences: { ...base, preferences: [...base.preferences, base.preferences[0]!] },
      }
    case 'unavailable':
      return {
        ...HBAR_APP_UI_NOTIFICATIONS_FIXTURES,
        preferences: { ...base, savePreferences: undefined },
      }
    case 'retry': {
      let attempts = 0
      return {
        ...HBAR_APP_UI_NOTIFICATIONS_FIXTURES,
        preferences: {
          ...base,
          savePreferences: async () => {
            attempts += 1
            if (attempts === 1) throw new Error('Preview-only failed save')
          },
        },
      }
    }
    case null:
    default:
      return HBAR_APP_UI_NOTIFICATIONS_FIXTURES
  }
}

export function createHbarAppUiNotificationActivityFixture(
  mode: string | null,
  base: HbarAppUiNotificationsContent = HBAR_APP_UI_NOTIFICATIONS_FIXTURES,
): HbarAppUiNotificationsContent {
  const activity = base.activity!
  switch (mode) {
    case 'localized':
      return {
        ...base,
        activity: {
          ...activity,
          labels: {
            ...activity.labels,
            title: 'Aktivitäten', views: 'Aktivitätsansichten',
            back: 'Zurück', snooze: 'Später', archive: 'Archivieren',
            emptyList: 'Keine Aktivitäten', emptyTitle: 'Nichts ausgewählt',
            emptyDetail: 'Wählen Sie einen Eintrag, um Details und Aktionen anzuzeigen.',
            emptyFacts: 'Keine Angaben', unavailable: 'Aktion nicht verfügbar',
            moving: 'Aktivität wird aktualisiert…', moveFailed: 'Aktualisierung fehlgeschlagen.',
            count: (count) => `${count} Einträge`,
          },
          views: [
            { id: 'inbox', label: 'Posteingang' }, { id: 'snoozed', label: 'Später' },
            { id: 'archived', label: 'Archiviert' },
          ],
          snoozeChoices: activity.snoozeChoices.map((choice, index) => ({ ...choice, label: ['Heute später', 'Morgen 09:00', 'Nächste Woche', 'Datum wählen'][index]! })),
          entries: activity.entries.map((item) => ({
            ...item,
            summary: `${item.summary} — ausführliche Beschreibung für einen lokalisierten Arbeitsbereich`,
            detail: `${item.detail} Zusätzliche Informationen für diesen Arbeitsbereich.`,
          })),
        },
      }
    case 'empty': return { ...base, activity: { ...activity, entries: [], initialEntryId: '' } }
    case 'one': return { ...base, activity: { ...activity, entries: activity.entries.slice(0, 1) } }
    case 'overflow': return {
      ...base,
      activity: {
        ...activity,
        entries: Array.from({ length: 81 }, (_, index) => ({
          ...activity.entries[0]!, id: `activity-${index}`, person: `Workspace member ${index}`,
          summary: `requested access to a workspace with a very long descriptive name ${index}`,
        })),
      },
    }
    case 'duplicate': return { ...base, activity: { ...activity, entries: [...activity.entries, activity.entries[0]!] } }
    case 'unavailable': return { ...base, activity: { ...activity, moveEntry: undefined } }
    case 'retry': {
      let attempts = 0
      return {
        ...base,
        activity: {
          ...activity,
          moveEntry: async () => {
            attempts += 1
            if (attempts === 1) throw new Error('Preview-only failed move')
          },
        },
      }
    }
    case null:
    default: return base
  }
}

export function createHbarAppUiNotificationsLocalizedFixtures(): HbarAppUiNotificationsContent {
  return {
    ...HBAR_APP_UI_NOTIFICATIONS_FIXTURES,
    center: {
      ...HBAR_APP_UI_NOTIFICATIONS_FIXTURES.center!,
      labels: {
        ...HBAR_APP_UI_NOTIFICATIONS_FIXTURES.center!.labels,
        title: '通知',
        unread: (count) => `${count} 条未读`,
        markAll: '全部标为已读',
        filters: '通知筛选',
        all: '全部',
        unreadFilter: '未读',
        mentions: '提及',
        markRead: () => '标为已读',
        markUnread: () => '标为未读',
        dismiss: () => '移除通知',
        empty: '暂无通知',
      },
      groups: [{ id: 'today', label: '今天' }],
      entries: [
        {
          id: 'mention',
          groupId: 'today',
          kind: '提及',
          title: 'Priya 在预算审阅中提到了你',
          time: '9 分钟',
          unread: true,
          mention: true,
        },
      ],
    },
  }
}
