import type { HbarAppUiCardContent } from '../../packages/hbar-app-ui/src/index'

const grown = { kind: 'content-grown', expectedMaximum: 12 } as const
const scroll = { kind: 'pane-scroll', expectedMaximum: 60 } as const

export const HBAR_APP_UI_CARD_FIXTURES: HbarAppUiCardContent = {
  member: {
    labels: { online: 'Online', connected: 'Connected', connect: 'Connect', disconnect: 'Disconnect' },
    member: { id: 'avery', initials: 'AC', name: 'Avery Chen', role: 'Workspace operator' },
    metrics: [
      { id: 'runs', label: 'Runs', value: '24' },
      { id: 'reviews', label: 'Reviews', value: '08' },
      { id: 'uptime', label: 'Uptime', value: '99%' },
    ],
    initiallyConnected: false,
  },
  integrations: {
    labels: { toggle: (name) => `Toggle ${name}`, empty: 'No integrations' },
    integrations: [
      {
        id: 'git',
        name: 'Git provider',
        disconnectedDetail: 'Connect this service',
        connectedDetail: 'Connected to Project Atlas',
      },
      {
        id: 'notifications',
        name: 'Notifications',
        disconnectedDetail: 'Connect this service',
        connectedDetail: 'Delivery enabled',
      },
      {
        id: 'issues',
        name: 'Issue tracker',
        disconnectedDetail: 'Connect this service',
        connectedDetail: 'Project synced',
      },
    ],
    initialConnectedIds: ['git'],
    listStrategy: scroll,
  },
  onboarding: {
    labels: {
      title: 'Get started',
      detail: (completed, total) => `${completed} of ${total} complete`,
      reset: 'Reset',
      done: 'Done',
      start: 'Start',
      empty: 'No onboarding steps',
    },
    steps: [
      { id: 'host', title: 'Connect host' },
      { id: 'workspace', title: 'Choose workspace' },
      { id: 'task', title: 'Run first task' },
      { id: 'invite', title: 'Invite teammate' },
    ],
    initialCompletedCount: 2,
    listStrategy: grown,
  },
  agenda: {
    labels: {
      rsvp: 'RSVP',
      going: 'Going',
      attendees: 'Attendees',
      overflowAttendees: (count) => `+${count}`,
    },
    date: { day: '24', month: 'SEP' },
    title: 'Workspace review',
    detail: 'Thursday · 14:00–15:00',
    attendees: [
      { id: 'avery', initials: 'A', name: 'Avery' },
      { id: 'mina', initials: 'M', name: 'Mina' },
      { id: 'jon', initials: 'J', name: 'Jon' },
      { id: 'sam', initials: 'S', name: 'Sam' },
      { id: 'noah', initials: 'N', name: 'Noah' },
    ],
    maximumVisibleAttendees: 2,
    initiallyGoing: false,
  },
  plans: {
    labels: {
      title: 'Plans',
      detail: 'Pick the right workspace capacity',
      periods: 'Billing period',
      choose: 'Choose',
      current: 'Current',
      empty: 'No plans available',
    },
    periods: [
      { id: 'monthly', label: 'Monthly' },
      { id: 'yearly', label: 'Yearly' },
    ],
    initialPeriodId: 'monthly',
    plans: [
      {
        id: 'starter',
        name: 'Starter',
        prices: { monthly: '$0', yearly: '$0' },
        priceSuffix: '/mo',
        current: true,
        features: [
          { id: 'activity', label: 'Shared activity' },
          { id: 'insights', label: 'Usage insights' },
        ],
      },
      {
        id: 'pro',
        name: 'Pro',
        prices: { monthly: '$24', yearly: '$19' },
        priceSuffix: '/mo',
        featured: true,
        features: [
          { id: 'activity', label: 'Shared activity' },
          { id: 'insights', label: 'Usage insights' },
          { id: 'approvals', label: 'Scoped approvals' },
        ],
      },
      {
        id: 'team',
        name: 'Team',
        prices: { monthly: '$48', yearly: '$38' },
        priceSuffix: '/mo',
        features: [
          { id: 'activity', label: 'Shared activity' },
          { id: 'insights', label: 'Usage insights' },
          { id: 'approvals', label: 'Scoped approvals' },
        ],
      },
    ],
    listStrategy: grown,
  },
  metrics: {
    labels: { title: 'Account metrics', ranges: 'Date range', empty: 'No metrics' },
    ranges: [
      { id: '24h', label: '24h' },
      { id: '7d', label: '7d' },
      { id: '30d', label: '30d' },
    ],
    initialRangeId: '7d',
    metrics: [
      { id: 'members', label: 'Active members', value: '128', detail: '+12%', tone: 'success' },
      { id: 'tasks', label: 'Tasks shipped', value: '64', detail: '+8%', tone: 'success' },
      { id: 'review', label: 'Review time', value: '2.4h', detail: '−18%', tone: 'success' },
    ],
    listStrategy: grown,
  },
  changelog: {
    labels: { bookmark: 'Bookmark', removeBookmark: 'Remove bookmark' },
    meta: 'v1.4.0 · September 2026',
    title: 'Faster activity recovery',
    body: 'Runs now explain failures beside the action that can recover them.',
    author: { initials: 'MP', name: 'Mina Patel', detail: 'Product' },
    initiallyBookmarked: false,
  },
  files: {
    labels: {
      title: 'Asset library',
      detail: (name) => `${name} selected`,
      open: 'Open selection',
      files: 'Assets',
      preview: 'Selected asset preview',
      empty: 'No assets',
    },
    files: [
      { id: 'readme', name: 'README.md', meta: 'Updated today', preview: 'Project documentation and workspace notes.' },
      { id: 'report', name: 'report.csv', meta: 'Updated today', preview: 'Tabular usage report and account totals.' },
      {
        id: 'design',
        name: 'design.fig',
        meta: 'Updated yesterday',
        preview: 'Design source and component references.',
      },
      { id: 'archive', name: 'archive.zip', meta: 'Updated last week', preview: 'Archived workspace artifacts.' },
    ],
    initialFileId: 'readme',
    listStrategy: scroll,
  },
  profile: {
    labels: { follow: 'Follow', following: 'Following', message: 'Message', tags: 'Profile tags' },
    profile: { id: 'mina', initials: 'MP', name: 'Mina Patel', detail: 'Design systems · @mina' },
    tags: [
      { id: 'ui', label: 'UI' },
      { id: 'research', label: 'Research' },
      { id: 'remote', label: 'Remote' },
    ],
    metrics: [
      { id: 'projects', label: 'Projects', value: '18' },
      { id: 'followers', label: 'Followers', value: '240' },
    ],
    initiallyFollowing: false,
  },
  balance: {
    labels: {
      balance: 'Available balance',
      pending: 'Pending',
      reserved: 'Reserved',
      transfer: 'Transfer',
      deposit: 'Deposit',
    },
    value: '$12,480.00',
    pending: '$820.40',
    reserved: '$1,200.00',
    recent: 'Recent activity · +$240.00 today',
  },
  invoice: {
    labels: { eyebrow: 'INVOICE', download: 'Download PDF' },
    invoiceId: 'INV-2024-0318',
    meta: 'Meridian Fund · Issued 18 March · Due 1 April',
    status: 'Paid',
    lines: [
      { id: 'team-seats', label: 'Team seats', detail: '24 × $18.00', value: '$432.00', section: 'items' },
      {
        id: 'additional-storage',
        label: 'Additional storage',
        detail: '250 GB × $0.40',
        value: '$100.00',
        section: 'items',
      },
      { id: 'priority-support', label: 'Priority support', detail: '1 month', value: '$150.00', section: 'items' },
      { id: 'subtotal', label: 'Subtotal', value: '$682.00', section: 'summary' },
      { id: 'vat', label: 'VAT (23%)', value: '$156.86', section: 'summary' },
      { id: 'total', label: 'Total due', value: '$838.86', section: 'summary', emphasized: true },
    ],
    listStrategy: grown,
  },
}

export function createHbarAppUiCardLocalizedFixtures(): HbarAppUiCardContent {
  return {
    ...HBAR_APP_UI_CARD_FIXTURES,
    onboarding: {
      ...HBAR_APP_UI_CARD_FIXTURES.onboarding!,
      labels: {
        title: '开始使用',
        detail: (completed, total) => `已完成 ${completed}/${total}`,
        reset: '重置',
        done: '已完成',
        start: '开始',
        empty: '暂无引导步骤',
      },
    },
  }
}
