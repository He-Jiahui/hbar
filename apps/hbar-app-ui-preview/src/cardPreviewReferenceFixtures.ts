import type { LumenCardContent, LumenCardReferenceContent } from '@lumen/app-ui/catalog'
import { HBAR_APP_UI_CARD_FIXTURES } from '../../../tests/fixtures/hbar-app-ui-card-fixtures'

const grown = { kind: 'content-grown', expectedMaximum: 12 } as const
const empty = { empty: 'No records' }

/** Reference UI data stays in the preview host, never in the reusable package. */
export function createCardPreviewReferenceContent(variant: number, mode: string): LumenCardContent {
  const localized = mode === 'localized'
  const copy = (en: string, de: string) => (localized ? de : en)
  let reference: LumenCardReferenceContent
  switch (variant) {
    case 1:
      reference = {
        kind: 'members',
        listStrategy: grown,
        copy: {
          empty: copy('No members', 'Keine Mitglieder'),
          connect: copy('Connect', 'Verbinden'),
          connected: copy('Connected', 'Verbunden'),
          toggle: (name, value) =>
            `${copy(value ? 'Connected with' : 'Connect with', value ? 'Verbunden mit' : 'Verbinden mit')} ${name}`,
        },
        items: [
          {
            id: 'sam',
            initials: 'SR',
            name: 'Sam Rivera',
            role: 'Product Lead · Lisbon',
            description: 'Runs discovery and roadmap for the payments surface.',
            online: true,
            connected: false,
          },
          {
            id: 'imani',
            initials: 'IH',
            name: 'Imani Hale',
            role: 'Staff Engineer · Berlin',
            description: 'Owns the ledger service and the move to event sourcing.',
            online: true,
            connected: true,
          },
          {
            id: 'dana',
            initials: 'DO',
            name: 'Dana Okafor',
            role: 'Design Director · New York',
            description: 'Sets the visual system and reviews every shipped surface.',
            online: false,
            connected: false,
          },
          {
            id: 'rowan',
            initials: 'RM',
            name: 'Rowan Moss',
            role: 'Data Scientist · Toronto',
            description: 'Builds the forecasting models behind the revenue dashboard.',
            online: false,
            connected: false,
          },
          {
            id: 'nina',
            initials: 'NS',
            name: 'Nina Silva',
            role: 'Support Manager · São Paulo',
            description: 'Leads the escalation desk across three regions.',
            online: true,
            connected: false,
          },
          {
            id: 'tomas',
            initials: 'TA',
            name: 'Tomas Abara',
            role: 'Solutions Architect · Singapore',
            description: 'Pairs with enterprise accounts through their first integration.',
            online: false,
            connected: false,
          },
        ],
      }
      break
    case 2:
      reference = {
        kind: 'integrations',
        listStrategy: grown,
        copy: { ...empty, toggle: (name) => `Connect ${name}` },
        items: [
          {
            id: 'repositories',
            name: 'Repositories',
            description: 'Link branches and pull requests to the work item that opened them.',
            icon: 'branch',
            connected: true,
          },
          {
            id: 'chat',
            name: 'Team chat',
            description: 'Post status changes into the channel that owns each project.',
            icon: 'chat',
            connected: true,
          },
          {
            id: 'calendar',
            name: 'Calendar',
            description: "Keep milestones and review sessions on everyone's calendar.",
            icon: 'calendar',
            connected: true,
          },
          {
            id: 'warehouse',
            name: 'Data warehouse',
            description: 'Stream every event into your warehouse on a fifteen minute cadence.',
            premium: 'Premium',
            icon: 'warehouse',
            connected: false,
          },
          {
            id: 'help',
            name: 'Help desk',
            description: 'Turn escalated conversations into tracked issues automatically.',
            icon: 'ticket',
            connected: false,
          },
          {
            id: 'storage',
            name: 'Object storage',
            description: 'Archive exports and attachments into a bucket you control.',
            premium: 'Premium',
            icon: 'cloud',
            connected: false,
          },
        ],
      }
      break
    case 3:
      reference = {
        kind: 'onboarding',
        listStrategy: grown,
        copy: {
          empty: copy('No onboarding steps', 'Keine Einführungsschritte'),
          progress: (complete, total) =>
            copy(`${complete} of ${total} steps complete`, `${complete} von ${total} Schritten abgeschlossen`),
          reset: copy('Reset', 'Zurücksetzen'),
          completed: copy('Completed', 'Abgeschlossen'),
          start: copy('Mark complete', 'Als abgeschlossen markieren'),
          toggle: (title, complete) =>
            `${copy(complete ? 'Completed' : 'Mark complete', complete ? 'Abgeschlossen' : 'Als abgeschlossen markieren')}: ${title}`,
        },
        items: [
          {
            id: 'source',
            number: '0.1',
            title: copy('Connect a source', 'Eine gemeinsame Datenquelle verbinden'),
            description: copy(
              'Point the workspace at the repository or warehouse you work in.',
              'Verbinden Sie den Arbeitsbereich mit dem Repository oder dem Data Warehouse, in dem Ihr gesamtes Team zusammenarbeitet.',
            ),
            complete: true,
          },
          {
            id: 'team',
            number: '0.2',
            title: copy('Invite your team', 'Das gesamte Veröffentlichungsteam einladen'),
            description: copy(
              'Anyone with an invitation can open the workspace immediately.',
              'Alle eingeladenen Personen können den gemeinsamen Arbeitsbereich unmittelbar öffnen.',
            ),
            complete: false,
          },
          {
            id: 'rules',
            number: '0.3',
            title: copy('Set review rules', 'Gemeinsame Freigaberegeln festlegen'),
            description: copy(
              'Decide what needs approval before it reaches production.',
              'Legen Sie fest, welche Änderungen vor der Veröffentlichung eine gemeinsame Freigabe benötigen.',
            ),
            complete: false,
          },
          {
            id: 'ship',
            number: '0.4',
            title: copy('Ship the first change', 'Die erste Änderung vollständig veröffentlichen'),
            description: copy(
              'Run it end to end so you can see the whole trail in one place.',
              'Führen Sie den Ablauf vollständig aus, damit alle Schritte an einem Ort nachvollziehbar bleiben.',
            ),
            complete: false,
          },
        ],
      }
      break
    case 4:
      reference = {
        kind: 'agenda',
        listStrategy: grown,
        copy: {
          ...empty,
          going: 'Going',
          decline: 'Decline',
          respond: (title, going) => (going ? `Going to ${title}` : `Decline ${title}`),
        },
        items: [
          {
            id: 'roadmap',
            day: '14',
            month: 'MON',
            title: 'Roadmap review',
            time: '09:30 – 10:15',
            location: 'Studio A',
            attendees: '7',
            going: true,
            declined: false,
          },
          {
            id: 'standup',
            day: '14',
            month: 'MON',
            title: 'Platform standup',
            time: '11:00 – 11:15',
            location: 'Video call',
            attendees: '8',
            going: false,
            declined: false,
          },
          {
            id: 'critique',
            day: '14',
            month: 'MON',
            title: 'Design critique',
            time: '14:00 – 15:00',
            location: 'Studio B',
            attendees: '4',
            going: false,
            declined: false,
          },
          {
            id: 'pricing',
            day: '15',
            month: 'TUE',
            title: 'Pricing working group',
            time: '10:00 – 10:50',
            location: 'Video call',
            attendees: '5',
            going: false,
            declined: false,
          },
          {
            id: 'retro',
            day: '17',
            month: 'THU',
            title: 'Sprint retrospective',
            time: '16:00 – 16:45',
            location: 'Studio A',
            attendees: '8',
            going: false,
            declined: false,
          },
          {
            id: 'onsite',
            day: '18',
            month: 'FRI',
            title: 'Customer onsite prep',
            time: '08:30 – 09:00',
            location: 'Video call',
            attendees: '2',
            going: false,
            declined: false,
          },
        ],
      }
      break
    case 5:
      reference = {
        kind: 'plans',
        listStrategy: grown,
        copy: { ...empty, choose: (name) => `Choose ${name}`, current: 'Current plan' },
        items: [
          {
            id: 'starter',
            name: 'Starter',
            price: '$0',
            suffix: 'forever',
            description: 'For a single person keeping one project tidy.',
            current: false,
            metadata: [
              { id: 'seats', label: 'Seats', value: '1' },
              { id: 'projects', label: 'Projects', value: '3' },
              { id: 'history', label: 'History', value: '30 days' },
              { id: 'support', label: 'Support', value: 'Community' },
            ],
            features: [
              { id: 'items', label: 'Unlimited work items' },
              { id: 'integrations', label: 'Two integrations' },
            ],
          },
          {
            id: 'team',
            name: 'Team',
            price: '$18',
            suffix: 'per seat / month',
            description: 'For a working team that ships on a weekly cadence.',
            badge: 'Recommended',
            current: true,
            metadata: [
              { id: 'seats', label: 'Seats', value: 'Up to 50' },
              { id: 'projects', label: 'Projects', value: 'Unlimited' },
              { id: 'history', label: 'History', value: '2 years' },
              { id: 'support', label: 'Support', value: 'Next business day' },
            ],
            features: [
              { id: 'starter', label: 'Everything in Starter' },
              { id: 'roles', label: 'Roles and approvals' },
              { id: 'audit', label: 'Audit trail' },
            ],
          },
          {
            id: 'enterprise',
            name: 'Enterprise',
            price: 'Custom',
            suffix: 'billed annually',
            description: 'For organisations with procurement and residency rules.',
            current: false,
            metadata: [
              { id: 'seats', label: 'Seats', value: 'Unlimited' },
              { id: 'projects', label: 'Projects', value: 'Unlimited' },
              { id: 'history', label: 'History', value: 'Unlimited' },
              { id: 'support', label: 'Support', value: 'Dedicated' },
            ],
            features: [
              { id: 'team', label: 'Everything in Team' },
              { id: 'sso', label: 'SSO and SCIM' },
              { id: 'residency', label: 'Data residency' },
            ],
          },
        ],
      }
      break
    case 6:
      reference = {
        kind: 'accounts',
        listStrategy: grown,
        selectedRangeId: '30d',
        copy: { ...empty, title: 'Accounts overview', ranges: 'Date range' },
        ranges: ['7d', '30d', '90d'].map((id) => ({
          id,
          label: id,
          summary:
            id === '90d'
              ? 'No data for this date range.'
              : `Net movement across all four accounts over the last ${id}: ${id === '7d' ? '3.1' : '5.6'}%.`,
          metrics:
            id === '90d'
              ? []
              : [
                  {
                    id: 'balance',
                    label: 'Available balance',
                    value: id === '7d' ? '18,420' : '74,910',
                    change: id === '7d' ? '+3.2%' : '+8.6%',
                    comparison: `vs previous ${id}`,
                    positive: true,
                    icon: 'card' as const,
                    bars: [14, 20, 18, 26, 34, 32, 40],
                  },
                  {
                    id: 'spend',
                    label: 'Card spend',
                    value: id === '7d' ? '4,180' : '16,240',
                    change: id === '7d' ? '-1.8%' : '-5.4%',
                    comparison: `vs previous ${id}`,
                    positive: false,
                    icon: 'card' as const,
                    bars: [40, 36, 32, 28, 26, 22, 18],
                  },
                  {
                    id: 'revenue',
                    label: 'Recurring revenue',
                    value: id === '7d' ? '9,760' : '38,900',
                    change: id === '7d' ? '+1.1%' : '+4.7%',
                    comparison: `vs previous ${id}`,
                    positive: true,
                    icon: 'repeat' as const,
                    bars: [20, 24, 26, 28, 32, 36, 40],
                  },
                  {
                    id: 'payers',
                    label: 'Active payers',
                    value: id === '7d' ? '1,284' : '1,342',
                    change: id === '7d' ? '+0.6%' : '-2.3%',
                    comparison: `vs previous ${id}`,
                    positive: id === '7d',
                    icon: 'user' as const,
                    bars: [42, 40, 36, 33, 30, 28, 25],
                  },
                ],
        })),
      }
      break
    case 7:
      reference = {
        kind: 'updates',
        listStrategy: grown,
        copy: { ...empty, bookmark: (title, value) => (value ? `Remove bookmark from ${title}` : `Bookmark ${title}`) },
        items: [
          {
            id: 'exports',
            meta: '2.9 · 12 MARCH',
            title: 'Scheduled exports',
            body: 'Any saved view can now run on a schedule and drop a CSV into your warehouse without a manual export step.',
            initials: 'NS',
            author: 'Nina Sørensen',
            reading: '3 min read',
            bookmarked: false,
            href: '#',
          },
          {
            id: 'search',
            meta: '2.8 · 27 FEBRUARY',
            title: 'Faster search across long-running workspaces',
            body: 'Search now returns in under 200ms on workspaces with more than a million records, and matches highlight in place.',
            initials: 'DO',
            author: 'Dmitri Oyelaran',
            reading: '4 min read',
            bookmarked: true,
            href: '#',
          },
          {
            id: 'roles',
            meta: '2.7 · 9 FEBRUARY',
            title: 'Roles you can define yourself',
            body: 'Build a role from individual permissions instead of choosing between admin and member, and apply it per project.',
            initials: 'RM',
            author: 'Rita Marchetti',
            reading: '6 min read',
            bookmarked: false,
            href: '#',
          },
          {
            id: 'comments',
            meta: '2.6 · 22 JANUARY',
            title: 'Comment threads on every record',
            body: 'Discussion moved out of the activity feed and onto the record itself, so context stays where the work happens.',
            initials: 'TA',
            author: 'Tomas Alvarez',
            reading: '2 min read',
            bookmarked: false,
            href: '#',
          },
          {
            id: 'drafts',
            meta: '2.5 · 8 JANUARY',
            title: 'Offline drafts',
            body: 'Edits made without a connection are kept locally and merged when you reconnect, with conflicts surfaced inline.',
            initials: 'IH',
            author: 'Iris Haddad',
            reading: '5 min read',
            bookmarked: false,
            href: '#',
          },
          {
            id: 'notifications',
            meta: '2.4 · 18 DECEMBER',
            title: 'A quieter notification model',
            body: 'Notifications group by project and collapse duplicates, so a busy morning arrives as four items instead of forty.',
            initials: 'NS',
            author: 'Nina Sørensen',
            reading: '3 min read',
            bookmarked: false,
            href: '#',
          },
        ],
      }
      break
    case 8:
      reference = {
        kind: 'files',
        listStrategy: grown,
        copy: {
          ...empty,
          count: (selected, total) => (selected ? `${selected} selected of ${total} files` : `${total} files`),
          clear: 'Clear',
          download: 'Download',
        },
        items: [
          {
            id: 'narrative',
            name: 'Q3-narrative.pdf',
            meta: 'Document · 2.4 MB',
            edited: 'Edited 2h ago',
            selected: true,
          },
          {
            id: 'table',
            name: 'cap-table.xlsx',
            meta: 'Spreadsheet · 480 KB',
            edited: 'Edited Yesterday',
            selected: false,
          },
          { id: 'brand', name: 'brand-mark.svg', meta: 'Vector · 16 KB', edited: 'Edited 3d ago', selected: false },
          { id: 'video', name: 'walkthrough.mp4', meta: 'Video · 184 MB', edited: 'Edited 3d ago', selected: false },
          {
            id: 'deck',
            name: 'board-deck.key',
            meta: 'Presentation · 31 MB',
            edited: 'Edited 1w ago',
            selected: false,
          },
          { id: 'schema', name: 'schema.prisma', meta: 'Source · 9 KB', edited: 'Edited 1w ago', selected: false },
          { id: 'hero', name: 'hero-still.png', meta: 'Image · 6.1 MB', edited: 'Edited 2w ago', selected: false },
          { id: 'policy', name: 'policy-v4.pdf', meta: 'Document · 1.1 MB', edited: 'Edited 3w ago', selected: false },
        ],
      }
      break
    case 9:
      reference = {
        kind: 'profile',
        id: 'sam',
        initials: 'SR',
        name: 'Sam Rivera',
        role: 'Product designer at Meridian',
        location: 'Lisbon, Portugal',
        body: 'Works on the payments surface. Currently rewriting the checkout flow and writing about it as it happens.',
        tags: [
          { id: 'design', label: 'Design systems' },
          { id: 'prototyping', label: 'Prototyping' },
          { id: 'accessibility', label: 'Accessibility' },
        ],
        metrics: [
          { id: 'projects', label: 'Projects', value: '24' },
          { id: 'reviews', label: 'Reviews', value: '318' },
          { id: 'following', label: 'Following', value: '1.2k' },
        ],
        following: false,
        messageHref: '#',
        copy: {
          follow: 'Follow',
          following: 'Following',
          toggle: (name, following) => `${following ? 'Following' : 'Follow'} ${name}`,
          verified: 'Verified account',
          message: 'Message',
          tags: 'Profile tags',
        },
      }
      break
    case 10:
      reference = {
        kind: 'balance',
        id: 'operating',
        value: '$46,318.52',
        change: '+3.1%',
        detail: 'against last month · Operating · USD',
        metadata: [
          { id: 'pending', label: 'Pending', value: '$1,204.00' },
          { id: 'reserved', label: 'Reserved', value: '$380.00' },
        ],
        transactions: [
          { id: 'stripe', title: 'Stripe payout', time: 'Today, 09:14', value: '+$4,820.00', incoming: true },
          { id: 'aws', title: 'Amazon Web Services', time: 'Yesterday', value: '−$612.40', incoming: false },
          { id: 'payroll', title: 'March payroll', time: '28 February', value: '−$18,900.00', incoming: false },
        ],
        copy: { balance: 'AVAILABLE BALANCE', add: 'Add money', transfer: 'Transfer' },
      }
      break
    case 11:
      return { invoice: HBAR_APP_UI_CARD_FIXTURES.invoice }
    default:
      return {}
  }
  if (mode === 'overflow' && reference.kind === 'files')
    reference = {
      ...reference,
      listStrategy: { kind: 'pane-scroll', expectedMaximum: 60 },
      items: Array.from({ length: 61 }, (_, index) => ({
        id: `file-${index}`,
        name: `Workspace export ${index}.pdf`,
        meta: 'Document · 2.4 MB',
        edited: 'Edited today',
        selected: index === 0,
      })),
    }
  return { reference }
}

export function cardRequestNotice(localized: boolean) {
  return localized
    ? 'Vorschauanfrage erfasst; keine externe Aktion ausgeführt.'
    : 'Preview request recorded; no external action was performed.'
}
