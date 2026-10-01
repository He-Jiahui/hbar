import type { HbarAppUiMobileContent } from '../../packages/hbar-app-ui/src/index'

const scroll = { kind: 'pane-scroll', expectedMaximum: 80 } as const
const grown = { kind: 'content-grown', expectedMaximum: 16 } as const

export const HBAR_APP_UI_MOBILE_FIXTURES: HbarAppUiMobileContent = {
  activity: {
    labels: {
      brand: 'Meridian',
      filterAll: 'Show all activity',
      filterArea: 'Show deal activity',
      title: 'Today',
      detailAll: '4 updates since you last looked',
      detailFiltered: 'Deal updates since you last looked',
      navigation: 'Primary navigation',
      open: (title) => `Open ${title}`,
      route: (label) => `Open ${label.toLowerCase()} from the mobile workspace.`,
      empty: 'No activity',
    },
    avatar: 'AR',
    filterAreaId: 'Deals',
    items: [
      { id: 'northwind', title: 'Northwind renewed for 12 months', detail: 'Deals · 8m ago', area: 'Deals' },
      { id: 'summary', title: 'Weekly summary is ready', detail: 'Reports · 40m ago', area: 'Reports' },
      { id: 'ticket', title: 'Cedar Labs opened a ticket', detail: 'Support · 1h ago', area: 'Support' },
      { id: 'payout', title: 'Payout of $4,120 settled', detail: 'Billing · 3h ago', area: 'Billing' },
      { id: 'seats', title: 'Harbor Coffee added two seats', detail: 'Accounts · 5h ago', area: 'Accounts' },
      { id: 'overdue', title: 'Two invoices moved to overdue', detail: 'Billing · 6h ago', area: 'Billing' },
      { id: 'pilot', title: 'Meridian pilot enters week three', detail: 'Deals · 9h ago', area: 'Deals' },
    ],
    tabs: [
      { id: 'home', label: 'Home' },
      { id: 'search', label: 'Search' },
      { id: 'activity', label: 'Activity', badge: '3' },
      { id: 'saved', label: 'Saved' },
      { id: 'you', label: 'You' },
    ],
    initialTabId: 'home',
    listStrategy: scroll,
  },
  tasks: {
    labels: {
      title: 'Inbox',
      searchOpen: 'Search tasks',
      searchClose: 'Close task search',
      searchPlaceholder: 'Search tasks',
      openCount: (count) => `${count} OPEN`,
      toggle: (title) => `Complete ${title}`,
      noResults: 'No open tasks match this search.',
      add: 'Add task',
      newTask: 'New follow-up task',
      noDue: 'No due date',
    },
    tasks: [
      { id: 'quote', title: 'Send the Northwind renewal quote', due: 'Due today', complete: false },
      { id: 'notes', title: 'Review Cedar Labs onboarding notes', due: 'Due today', complete: false },
      { id: 'refund', title: 'Approve the refund for order 4192', due: 'Tomorrow', complete: false },
      { id: 'pipeline', title: 'Draft the Q3 pipeline summary', due: 'Thursday', complete: false },
      { id: 'seats', title: 'Call Harbor Coffee about seat count', due: 'Friday', complete: false },
      { id: 'checklist', title: 'Close out the Meridian pilot checklist', due: 'Friday', complete: false },
      { id: 'forecast', title: 'Update the Q3 forecast assumptions', due: 'Next week', complete: false },
    ],
    listStrategy: scroll,
  },
  home: {
    labels: {
      title: 'Home',
      navigation: 'Primary navigation',
      open: (title) => `Open ${title}`,
      empty: 'No home updates',
    },
    avatar: 'AR',
    cards: [
      {
        id: 'pilot',
        title: 'Alder Group signed the pilot',
        description: 'Two regions go live on Monday. Provisioning is already queued.',
        detail: 'Deals · 14m ago',
      },
      {
        id: 'latency',
        title: 'Latency back under target',
        description: 'The eu-west read replica caught up after the reindex finished.',
        detail: 'Platform · 1h ago',
      },
      {
        id: 'digest',
        title: 'Weekly digest is ready',
        description: 'Retention held at 94% and three accounts moved into expansion.',
        detail: 'Reports · 3h ago',
      },
      {
        id: 'reply',
        title: 'Harbor Coffee replied',
        description: 'They want the invoice split across two cost centres from July.',
        detail: 'Support · 5h ago',
      },
      {
        id: 'seats',
        title: 'Two seats freed on the Cedar Labs plan',
        description: 'Both were dormant for 60 days, so the July invoice drops by $180.',
        detail: 'Billing · 8h ago',
      },
    ],
    tabs: [
      { id: 'home', label: 'Home' },
      { id: 'inbox', label: 'Inbox' },
      { id: 'schedule', label: 'Schedule' },
      { id: 'reports', label: 'Reports' },
      { id: 'search', label: 'Search' },
    ],
    initialTabId: 'home',
    listStrategy: scroll,
  },
  orders: {
    labels: {
      title: 'Northwind Supply',
      recent: 'Recent orders',
      navigation: 'Order navigation',
      open: (account, detail) => `${account}, ${detail}`,
      empty: 'No orders',
    },
    avatar: 'NS',
    orders: [
      { id: '4192', account: 'Northwind', detail: 'Order 4192 · Packed · 3 items' },
      { id: '4188', account: 'Cedar Labs', detail: 'Order 4188 · In transit · 1 item' },
      { id: '4181', account: 'Harbor Coffee', detail: 'Order 4181 · Delivered · 5 items' },
      { id: '4174', account: 'Alder Group', detail: 'Order 4174 · Delivered · 2 items' },
      { id: '4169', account: 'Meridian', detail: 'Order 4169 · Delivered · 4 items' },
      { id: '4162', account: 'Northwind', detail: 'Order 4162 · Returned · 1 item' },
    ],
    tabs: [
      { id: 'home', label: 'Home' },
      { id: 'orders', label: 'Orders' },
      { id: 'messages', label: 'Messages' },
      { id: 'more', label: 'More' },
    ],
    initialTabId: 'home',
    listStrategy: scroll,
  },
  runs: {
    labels: {
      title: 'Runs',
      openMenu: 'Open menu',
      closeMenu: 'Close menu',
      newRun: 'New run',
      statuses: 'Run status',
      menu: 'Menu',
      empty: (label) => `No ${label.toLowerCase()} runs are available.`,
      queuedTitle: 'New workspace run',
      queuedDetail: 'Queued · Ready to start',
      open: (title) => `Open ${title}`,
    },
    states: [
      { id: 'queue', label: 'Queue' },
      { id: 'running', label: 'Running' },
      { id: 'done', label: 'Done' },
    ],
    initialStateId: 'running',
    runs: [
      { id: 'warehouse', title: 'Warehouse sync', detail: 'Running · 4m 12s elapsed', stateId: 'running' },
      { id: 'dedupe', title: 'Contact dedupe', detail: 'Running · 58s elapsed', stateId: 'running' },
      { id: 'import', title: 'Harbor Coffee import', detail: 'Running · 2m 04s elapsed', stateId: 'running' },
      { id: 'usage', title: 'Usage rollup', detail: 'Running · 6m 41s elapsed', stateId: 'running' },
      { id: 'invoice', title: 'Invoice PDF batch', detail: 'Running · 1m 19s elapsed', stateId: 'running' },
      { id: 'mapping', title: 'Northwind field mapping', detail: 'Running · 3m 55s elapsed', stateId: 'running' },
      { id: 'alert', title: 'Alert rule evaluation', detail: 'Running · 22s elapsed', stateId: 'running' },
      { id: 'ledger', title: 'Ledger checksum', detail: 'Running · 8m 02s elapsed', stateId: 'running' },
      { id: 'export', title: 'Nightly ledger export', detail: 'Queued · Starts in 12m', stateId: 'queue' },
      { id: 'backfill', title: 'Cedar Labs backfill', detail: 'Queued · Starts in 40m', stateId: 'queue' },
      { id: 'reconciliation', title: 'Invoice reconciliation', detail: 'Queued · Starts at 02:00', stateId: 'queue' },
    ],
    listStrategy: grown,
  },
}

export function createHbarAppUiMobileLocalizedFixtures(): HbarAppUiMobileContent {
  return {
    ...HBAR_APP_UI_MOBILE_FIXTURES,
    activity: {
      ...HBAR_APP_UI_MOBILE_FIXTURES.activity!,
      labels: {
        ...HBAR_APP_UI_MOBILE_FIXTURES.activity!.labels,
        brand: '水星工作台',
        filterAll: '显示全部动态',
        filterArea: '只看商机动态',
        title: '今天',
        detailAll: '你离开后有 4 条更新',
        detailFiltered: '你离开后的商机更新',
        navigation: '主导航',
        empty: '暂无动态',
      },
      items: [{ id: 'northwind', title: 'Northwind 续约 12 个月', detail: '商机 · 8 分钟前', area: 'Deals' }],
    },
    tasks: {
      ...HBAR_APP_UI_MOBILE_FIXTURES.tasks!,
      labels: {
        ...HBAR_APP_UI_MOBILE_FIXTURES.tasks!.labels,
        title: 'Aufgaben für die gemeinsame Veröffentlichung',
        searchOpen: 'Aufgaben durchsuchen',
        searchClose: 'Aufgabensuche schließen',
        searchPlaceholder: 'Aufgaben und nächste Schritte durchsuchen',
        openCount: (count) => `${count} OFFENE AUFGABEN`,
        toggle: (title) => `Aufgabe abschließen: ${title}`,
        noResults: 'Keine offenen Aufgaben entsprechen dieser Suche.',
        add: 'Schnellaktionen öffnen',
        newTask: 'Neue Folgeaufgabe',
        noDue: 'Kein Fälligkeitsdatum',
      },
      tasks: HBAR_APP_UI_MOBILE_FIXTURES.tasks!.tasks.map((task) => ({
        ...task,
        title: `${task.title} — Abstimmung mit dem gesamten Veröffentlichungsteam`,
        due: 'Heute mit dem Team abstimmen',
      })),
    },
  }
}

export function createHbarAppUiMobileOverflowFixtures(): HbarAppUiMobileContent {
  const activity = HBAR_APP_UI_MOBILE_FIXTURES.activity!
  return {
    ...HBAR_APP_UI_MOBILE_FIXTURES,
    activity: {
      ...activity,
      items: Array.from({ length: 81 }, (_, index) => ({
        id: `activity-${index}`,
        title: `Workspace activity ${index}`,
        detail: `Operations · event ${index}`,
        area: 'Deals',
      })),
    },
  }
}
