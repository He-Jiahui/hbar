import type {
  LumenListReferenceContent as Content,
  LumenListReferenceRow as Row,
  LumenListReferenceNode as Node,
} from '@lumen/app-ui'

const grown = { kind: 'content-grown', expectedMaximum: 16 } as const
const pane = { kind: 'pane-scroll', expectedMaximum: 80 } as const
const base = (
  title: string,
  subtitle: string,
  pairs: readonly (readonly [string, string])[] = [],
  selectedId = 'all',
) => ({
  title,
  subtitle,
  selectedId,
  choices: pairs.map(([id, label]) => ({ id, label })),
  actions: [],
  listStrategy: pane,
  labels: {
    empty: 'No records match this view.',
    unavailable: 'This public reference snapshot does not include data for this selection.',
    choices: 'View or reporting period',
  },
  onSelect: (_slot: string, _id: string) => undefined,
  onFlag: (_id: string, _value: boolean) => undefined,
  onQuery: (_value: string) => undefined,
  onMove: (_id: string, _beforeId: string | undefined) => undefined,
  onRequest: (_action: { readonly id: string }) => undefined,
})
const row = (id: string, title: string, detail: string, extra: Partial<Row> = {}): Row => ({
  id,
  title,
  detail,
  ...extra,
})
export function createListPreviewReferenceContent(variant: number, mode = 'default'): Content {
  let content: Content
  switch (variant) {
    case 1:
      content = {
        ...base(
          'Store performance',
          'Compared with the preceding period',
          [
            ['7d', '7 days'],
            ['28d', '28 days'],
            ['quarter', 'Quarter'],
          ],
          '28d',
        ),
        kind: 'metrics',
        listStrategy: grown,
        rows: [
          {
            ...row('orders', 'Orders fulfilled', 'Picked, packed and handed to a carrier', {
              value: '5,109',
              delta: '+11.2%',
              tone: 'success',
            }),
            definition: 'Picked, packed and handed to a carrier',
          },
          {
            ...row('revenue', 'Net revenue', 'Gross receipts less discounts and refunds', {
              value: '$374.8k',
              delta: '+7.8%',
              tone: 'success',
            }),
            definition: 'Gross receipts less discounts and refunds',
          },
          {
            ...row('basket', 'Average basket', 'Net revenue divided by fulfilled orders', {
              value: '$73.36',
              delta: '−1.4%',
              tone: 'danger',
            }),
            definition: 'Net revenue divided by fulfilled orders',
          },
          {
            ...row('returns', 'Return rate', 'Units sent back within the 30 day window', {
              value: '4.6%',
              delta: '+0.5%',
              tone: 'danger',
            }),
            definition: 'Units sent back within the 30 day window',
          },
        ],
        expandedIds: [],
        showLabel: (title) => `Show how ${title.toLowerCase()} is measured`,
      }
      break
    case 2:
      content = {
        ...base(
          'Infrastructure spend',
          '$98.1k across 6 services',
          [
            ['month', 'Month'],
            ['quarter', 'Quarter'],
          ],
          'month',
        ),
        kind: 'spend',
        activeId: '',
        selectedLabel: (item) => `${item.title} · ${item.detail} · ${item.value ?? ''}`,
        rows: [
          row('compute', 'Container compute', 'Platform · 18,400 vCPU hrs', {
            abbreviation: 'CC',
            value: '$42.2k',
            delta: '+4.2%',
            tone: 'danger',
          }),
          row('storage', 'Object storage', 'Data · 312 TB stored', {
            abbreviation: 'OS',
            value: '$18.7k',
            delta: '−1.8%',
            tone: 'success',
          }),
          row('warehouse', 'Query warehouse', 'Analytics · 9,860 credits', {
            abbreviation: 'QW',
            value: '$15.4k',
            delta: '+12.7%',
            tone: 'danger',
          }),
          row('egress', 'Network egress', 'Platform · 74 TB transferred', {
            abbreviation: 'NE',
            value: '$9.3k',
            delta: '−6.4%',
            tone: 'success',
          }),
          row('search', 'Search cluster', 'Product · 6 nodes', {
            abbreviation: 'SC',
            value: '$7.4k',
            delta: '+0.9%',
            tone: 'danger',
          }),
          row('observability', 'Observability', 'Platform · 1.4 TB ingested', {
            abbreviation: 'OB',
            value: '$5.1k',
            delta: '+3.6%',
            tone: 'danger',
          }),
        ],
        actions: [{ id: 'connect-billing', label: 'Connect a billing account' }],
      }
      break
    case 3:
      content = {
        ...base('Security activity', 'Access, sign-in and permission events across the workspace.', [
          ['all', 'All'],
          ['signins', 'Sign-ins'],
          ['permissions', 'Permissions'],
          ['devices', 'Devices'],
        ]),
        kind: 'security',
        flaggedOnly: false,
        flaggedLabel: 'Flagged',
        rows: [
          {
            ...row(
              'travel',
              'Impossible-travel sign-in blocked',
              'priya.nair@northwind.co · Kraków, PL then Austin, US in 22 min',
              { time: '2m ago', status: 'Blocked', tone: 'danger', abbreviation: '↛' },
            ),
            group: 'Today',
            categoryId: 'signins',
            flagged: true,
          },
          {
            ...row('device', 'New device approved', 'marcus.hale · iPhone 15 · iOS 18.2', {
              time: '16m ago',
              abbreviation: 'D',
            }),
            group: 'Today',
            categoryId: 'devices',
            flagged: false,
          },
          {
            ...row('role', 'Role raised to Workspace admin', 'granted by dana.okafor · for lars.eriksson', {
              time: '48m ago',
              abbreviation: 'P',
            }),
            group: 'Today',
            categoryId: 'permissions',
            flagged: false,
          },
          {
            ...row('token', 'Personal access token issued', 'marcus.hale · scope: repo, read:org · expires in 90d', {
              time: '1h ago',
              abbreviation: 'K',
            }),
            group: 'Today',
            categoryId: 'permissions',
            flagged: false,
          },
          {
            ...row('location', 'Sign-in from a new location', 'dana.okafor · Lisbon, PT · Chrome on macOS', {
              time: '2h ago',
              abbreviation: 'S',
            }),
            group: 'Today',
            categoryId: 'signins',
            flagged: false,
          },
          {
            ...row('sso', 'SSO enforcement enabled', 'dana.okafor · SAML now required for all members', {
              time: '18:24',
              abbreviation: 'P',
            }),
            group: 'Yesterday',
            categoryId: 'permissions',
            flagged: false,
          },
          {
            ...row('remote', 'Device signed out remotely', 'revoked by dana.okafor · Pixel 8 · last seen 6d ago', {
              time: '14:07',
              abbreviation: 'D',
            }),
            group: 'Yesterday',
            categoryId: 'devices',
            flagged: false,
          },
          {
            ...row(
              'removed',
              'Member removed from workspace',
              'removed by dana.okafor · contractor.wei, access revoked',
              { time: '11:52', abbreviation: 'P' },
            ),
            group: 'Yesterday',
            categoryId: 'permissions',
            flagged: false,
          },
          {
            ...row('passkey', 'Passkey enrolled', 'lars.eriksson · Touch ID · MacBook Pro', {
              time: '09:31',
              abbreviation: 'K',
            }),
            group: 'Yesterday',
            categoryId: 'signins',
            flagged: false,
          },
          {
            ...row('rotation', 'API key rotated', 'automation · nightly job · billing-service, previous key revoked', {
              time: '03:00',
              abbreviation: 'K',
            }),
            group: 'Tue 3 Feb',
            categoryId: 'permissions',
            flagged: false,
          },
          {
            ...row('trusted', 'Sign-in from a trusted device', 'priya.nair · Kraków, PL · Firefox on Windows', {
              time: '08:14',
              abbreviation: 'S',
            }),
            group: 'Tue 3 Feb',
            categoryId: 'signins',
            flagged: false,
          },
          {
            ...row('recovery', 'Recovery codes regenerated', 'marcus.hale · 10 new single-use codes', {
              time: '16:45',
              abbreviation: 'K',
            }),
            group: 'Tue 3 Feb',
            categoryId: 'permissions',
            flagged: false,
          },
        ],
        footer: '12 events shown',
      }
      break
    case 4:
      content = {
        ...base('Publishing queue', 'Drag a handle to change the order these 8 drafts go live.'),
        kind: 'queue',
        listStrategy: grown,
        rows: [
          row('ssr', 'The quiet return of server-side rendering', 'Nadia Whitfield · 2,140 words', {
            time: 'Today 09:00',
          }),
          row('accessibility', 'What our 2026 accessibility audit actually changed', 'Theo Marsh · 1,780 words', {
            time: 'Today 13:00',
          }),
          row('css', 'Migrating the design system to CSS cascade layers', 'Priya Raman · 3,020 words', {
            time: 'Today 17:00',
          }),
          row('pooling', 'A field guide to database connection pooling', 'Owen Castellano · 2,460 words', {
            time: 'Tue 09:00',
          }),
          row('flags', 'Why we deleted forty percent of our feature flags', 'Mara Lindqvist · 1,520 words', {
            time: 'Tue 13:00',
          }),
          row('interview', 'Interviewing engineers without a take-home', 'Devon Ashby · 2,890 words', {
            time: 'Wed 09:00',
          }),
          row('oncall', 'The economics of on-call, three years in', 'Priya Raman · 1,960 words', { time: 'Wed 15:00' }),
          row('onboarding', 'Rewriting our onboarding for the fifth time', 'Sasha Bloom · 2,310 words', {
            time: 'Thu 10:00',
          }),
        ],
        actions: [{ id: 'reset-order', label: 'Reset order' }],
        reorderLabel: (title, index, count) =>
          `Reorder ${title}. Position ${index} of ${count}. Press space or enter to pick up.`,
        moveLabel: (title, index) => `${title} moved to position ${index}.`,
        pickedLabel: (title) => `${title} picked up. Use arrow keys to move, enter to drop, escape to cancel.`,
        cancelledLabel: 'Reorder cancelled.',
      }
      break
    case 5: {
      const records: readonly (readonly [string, string, string, string, string, 'image' | 'video', string])[] = [
        [
          'hero',
          'hero-launch-loop.mp4',
          '1920 × 1080 · 1:12 · 142 MB',
          'Nadia Whitfield',
          'Feb 6, 2026',
          'video',
          'review',
        ],
        [
          'pricing',
          'pricing-table-dark.png',
          '2560 × 1440 · 1.8 MB',
          'Owen Castellano',
          'Feb 6, 2026',
          'image',
          'approved',
        ],
        [
          'onboarding',
          'onboarding-step-3.png',
          '1440 × 900 · 820 KB',
          'Priya Raman',
          'Feb 5, 2026',
          'image',
          'approved',
        ],
        [
          'tour',
          'product-tour-full.mp4',
          '3840 × 2160 · 3:48 · 512 MB',
          'Theo Marsh',
          'Feb 5, 2026',
          'video',
          'review',
        ],
        [
          'testimonial',
          'testimonial-mara-lindqvist.mp4',
          '1920 × 1080 · 0:42 · 88 MB',
          'Sasha Bloom',
          'Feb 4, 2026',
          'video',
          'approved',
        ],
        ['og', 'og-card-spring.png', '1200 × 630 · 340 KB', 'Devon Ashby', 'Feb 4, 2026', 'image', 'approved'],
        [
          'changelog',
          'changelog-header.png',
          '2880 × 1620 · 2.4 MB',
          'Nadia Whitfield',
          'Feb 3, 2026',
          'image',
          'approved',
        ],
        [
          'grid',
          'feature-grid-anim.mp4',
          '2560 × 1440 · 1:56 · 268 MB',
          'Owen Castellano',
          'Feb 3, 2026',
          'video',
          'review',
        ],
        ['avatars', 'avatar-set-neutral.png', '512 × 512 · 96 KB', 'Priya Raman', 'Feb 2, 2026', 'image', 'approved'],
        ['auth', 'docs-diagram-auth.png', '2048 × 1536 · 1.1 MB', 'Theo Marsh', 'Feb 2, 2026', 'image', 'approved'],
        [
          'release',
          'release-recap-q1.mp4',
          '1920 × 1080 · 4:20 · 356 MB',
          'Sasha Bloom',
          'Jan 30, 2026',
          'video',
          'approved',
        ],
      ]
      content = {
        ...base('Asset library', 'Uploaded media awaiting review before it ships to production.', [
          ['all', 'All'],
          ['review', 'Needs review'],
          ['approved', 'Approved'],
        ]),
        kind: 'assets',
        rows: records.map(([id, title, detail, owner, time, media, categoryId]) => ({
          ...row(id, title, detail, {
            time,
            status: categoryId === 'review' ? 'Needs review' : 'Approved',
            tone: categoryId === 'review' ? 'warning' : 'neutral',
          }),
          owner,
          media,
          categoryId,
        })),
        selectedIds: [],
        selectAllLabel: 'Select all',
        selectLabel: (title) => `Select ${title}`,
        selectionLabel: (count) => `${count} selected`,
        bulkActions: [
          { id: 'download', label: 'Download', disabled: true },
          { id: 'move', label: 'Move', disabled: true },
          { id: 'delete', label: 'Delete', disabled: true },
          { id: 'clear-selection', label: 'Clear selection', disabled: true },
        ],
        footer: '11 assets',
      }
      break
    }
    case 6: {
      const records: readonly (readonly [string, string, string, string, string, boolean, string, string])[] = [
        [
          'invoice',
          'invoice.finalized',
          'hooks.northwind.io',
          '1',
          '200 OK',
          false,
          '142 ms',
          '{ "received": true, "event_id": "evt_1P8kQz", "queued_at": "2026-08-07T20:14:11Z" }',
        ],
        [
          'subscription',
          'customer.subscription.updated',
          'api.brightledger.com',
          '1',
          '202 Accepted',
          false,
          '318 ms',
          '{ "received": true, "handler": "billing.sync", "duration_ms": 311 }',
        ],
        [
          'payout',
          'payout.paid',
          'hooks.meridian.app',
          '3',
          '500 Server Error',
          true,
          '1.24 s',
          '{ "error": { "type": "endpoint_error", "message": "Internal server error", "status": 500 } }',
        ],
        [
          'refund',
          'charge.refunded',
          'hooks.northwind.io',
          '1',
          '200 OK',
          false,
          '96 ms',
          '{ "received": true, "event_id": "evt_1P8jTa" }',
        ],
        [
          'customer',
          'customer.created',
          'ingest.parcelworks.dev',
          '1',
          '201 Created',
          false,
          '204 ms',
          '{ "received": true, "record_id": "cus_9Qh2Lm", "created": true }',
        ],
        [
          'failed-invoice',
          'invoice.payment_failed',
          'api.brightledger.com',
          '2',
          '204 No Content',
          false,
          '173 ms',
          '{ "received": true, "handler": "billing.dunning" }',
        ],
        [
          'checkout',
          'checkout.session.completed',
          'hooks.meridian.app',
          '5',
          'Timed out',
          true,
          '30.00 s',
          '{ "error": { "type": "timeout", "message": "No response after 30000 ms", "attempts": 5 } }',
        ],
        [
          'account',
          'account.updated',
          'ingest.parcelworks.dev',
          '1',
          '200 OK',
          false,
          '128 ms',
          '{ "received": true, "record_id": "acct_4Tz8Wp" }',
        ],
      ]
      const paths = [
        '/v2/events',
        '/webhooks/billing',
        '/hooks/payouts',
        '/v2/events',
        '/ingest',
        '/webhooks/billing',
        '/hooks/checkout',
        '/ingest',
      ]
      const signatures = [
        '4f2a8c…9de1',
        '7b1e0a…c42f',
        'd90c31…1aa7',
        '52ff7c…8b03',
        'ab3419…67cd',
        '10ce88…44b2',
        'c7e204…39f0',
        '90ab12…7e5c',
      ]
      content = {
        ...base('Webhook deliveries', 'Outbound attempts to your customer endpoints', [
          ['all', 'All'],
          ['delivered', 'Delivered'],
          ['failed', 'Failed'],
        ]),
        kind: 'deliveries',
        listStrategy: grown,
        rows: records.map(([id, title, endpointId, attempt, value, failed, time, response], i) => ({
          ...row(id, title, `${endpointId} · attempt ${attempt}`, { value, time, tone: failed ? 'danger' : 'neutral' }),
          endpointId,
          failed,
          response,
          request: `POST ${paths[i] ?? '/'} HTTP/1.1\nHost: ${endpointId}\nContent-Type: application/json\nWebhook-Id: msg_2Rk${9 - i}\nWebhook-Signature: v1,${signatures[i] ?? ''}`,
        })),
        expandedIds: [],
        endpointChoices: [
          { id: 'all', label: 'All endpoints' },
          ...[...new Set(records.map((item) => item[2]))].map((id) => ({ id, label: id })),
        ],
        endpointId: 'all',
        endpointLabel: 'Filter by destination endpoint',
        requestLabel: 'REQUEST',
        responseLabel: 'RESPONSE',
        replayLabel: 'Replay delivery',
      }
      break
    }
    case 7: {
      const records = [
        [
          'northwind',
          'Northwind Freight Co.',
          'Rotterdam, NL · Onboarded Mar 2021',
          'Logistics',
          'Active',
          '$1,240,000',
          '+8.2%',
        ],
        [
          'kraft',
          'Kraft & Hollow Packaging',
          'Portland, US · Onboarded Jul 2019',
          'Packaging',
          'Expiring',
          '$486,500',
          '−3.1%',
        ],
        [
          'meridian',
          'Meridian Cloud Systems',
          'Dublin, IE · Onboarded Jan 2022',
          'Cloud',
          'Active',
          '$918,300',
          '+14.6%',
        ],
        [
          'brightledger',
          'Brightledger Advisory',
          'London, UK · Onboarded Sep 2020',
          'Professional',
          'Active',
          '$212,750',
          '+2.4%',
        ],
        [
          'parcelworks',
          'Parcelworks Logistics',
          'Memphis, US · Onboarded Nov 2018',
          'Logistics',
          'Expired',
          '$74,900',
          '−18.9%',
        ],
        [
          'atlas',
          'Atlas Component Works',
          'Stuttgart, DE · Onboarded Feb 2020',
          'Manufacturing',
          'Active',
          '$1,506,200',
          '+6.7%',
        ],
        ['verdant', 'Verdant Materials', 'Malmö, SE · Onboarded May 2023', 'Manufacturing', 'In review', '$0', '0.0%'],
        [
          'harborlight',
          'Harborlight Freight',
          'Singapore, SG · Onboarded Aug 2021',
          'Logistics',
          'Active',
          '$643,100',
          '+11.3%',
        ],
        [
          'corvid',
          'Corvid Cloud Infrastructure',
          'Ashburn, US · Onboarded Oct 2022',
          'Cloud',
          'Expiring',
          '$355,000',
          '−5.4%',
        ],
        [
          'fold',
          'Fold & Crease Cartons',
          'Guadalajara, MX · Onboarded Apr 2019',
          'Packaging',
          'Active',
          '$298,400',
          '+4.1%',
        ],
        [
          'sterling',
          'Sterling Tax Partners',
          'Toronto, CA · Onboarded Dec 2020',
          'Professional',
          'Active',
          '$164,000',
          '+1.2%',
        ],
        [
          'ironvale',
          'Ironvale Fabrication',
          'Sheffield, UK · Onboarded Jun 2017',
          'Manufacturing',
          'Active',
          '$822,600',
          '+3.8%',
        ],
        [
          'swiftload',
          'Swiftload Distribution',
          'Lyon, FR · Onboarded Feb 2024',
          'Logistics',
          'In review',
          '$0',
          '0.0%',
        ],
        ['nimbus', 'Nimbus Data Platform', 'Sydney, AU · Onboarded Mar 2023', 'Cloud', 'Active', '$531,900', '+9.5%'],
      ] as const
      content = {
        ...base('Suppliers', '14 of 14 suppliers', [
          ['all', 'All categories'],
          ['Logistics', 'Logistics'],
          ['Packaging', 'Packaging'],
          ['Cloud', 'Cloud'],
          ['Manufacturing', 'Manufacturing'],
          ['Professional', 'Professional'],
        ]),
        kind: 'suppliers',
        rows: records.map(([id, title, detail, category, status, value, delta]) => ({
          ...row(id, title, detail, {
            status,
            value,
            delta: `${delta} YoY`,
            abbreviation: title
              .split(' ')
              .slice(0, 2)
              .map((part) => part[0])
              .join(''),
            tone: status === 'Expired' ? 'danger' : status === 'Expiring' ? 'warning' : 'neutral',
          }),
          categoryId: category,
          category,
        })),
        query: '',
        searchLabel: 'Search suppliers',
        searchPlaceholder: 'Search name or category',
        clearLabel: 'Clear search',
        emptyDetail: (query) => `Nothing matches “${query}”. Try a different name or category.`,
        columns: ['SUPPLIER', 'CATEGORY', 'CONTRACT', 'SPEND'],
      }
      break
    }
    case 8:
      content = {
        ...base('Inbox', '5 unread', [
          ['all', 'All'],
          ['unread', 'Unread'],
        ]),
        kind: 'inbox',
        rows: [
          {
            ...row(
              'mention-priya',
              'Priya Nair mentioned you in Checkout v3',
              'Can you take the payment-intent race here? I left a thread on the retry logic and tagged you for the final call.',
              { time: '2m' },
            ),
            unread: true,
          },
          {
            ...row(
              'review',
              'Review requested on “Split ledger writes”',
              'Marcus Feld opened a pull request in billing-core and asked for your review before the freeze.',
              { time: '11m' },
            ),
            unread: true,
          },
          {
            ...row(
              'deploy',
              'Deploy succeeded, web-app 4.18.0',
              'Production rollout finished across all three regions. Error rate is flat and latency is within budget.',
              { time: '38m' },
            ),
            unread: false,
          },
          {
            ...row(
              'quota',
              'API usage at 82% of your monthly quota',
              'At the current rate you will reach the plan limit around Aug 24. Raise the cap to avoid throttled requests.',
              { time: '1h' },
            ),
            unread: true,
          },
          {
            ...row(
              'mention-dana',
              'Dana Okafor mentioned you in Design review',
              'The empty states look great now. One note on the toast timing that I think is worth a quick pass.',
              { time: '3h' },
            ),
            unread: true,
          },
          {
            ...row(
              'merged',
              'Your pull request was approved and merged',
              '“Cache supplier lookups” passed review from two reviewers and merged into main a moment ago.',
              { time: '5h' },
            ),
            unread: false,
          },
          {
            ...row(
              'staging',
              'Staging deploy started, api-gateway 2.9.1',
              'Build 4821 is rolling out to staging. You will get a follow-up when smoke tests complete.',
              { time: 'Yesterday' },
            ),
            unread: false,
          },
          {
            ...row(
              'certificate',
              'Certificate for hooks.northwind.io renews in 6 days',
              'Auto-renewal is enabled, but the last attempt was rate-limited. Confirm DNS still points to the load balancer.',
              { time: '2d' },
            ),
            unread: true,
          },
        ],
        actions: [{ id: 'mark-all-read', label: 'Mark all read' }],
        markReadLabel: 'Mark as read',
        markUnreadLabel: 'Mark as unread',
        snoozeLabel: 'Snooze',
        archiveLabel: 'Archive',
        undoLabel: 'Undo',
      }
      break
    case 9: {
      const records = [
        ['Amara Adeyemi', 'VP Operations · Northwind Trading'],
        ['Priya Anand', 'Head of Procurement · Kestrel Labs'],
        ['Marcus Bello', 'Finance Director · Atlas Freight'],
        ['Elena Brandt', 'Account Owner · Bright Harbor'],
        ['Sofia Cardenas', 'IT Manager · Cedar & Vale'],
        ['Daniel Cho', 'Ops Lead · Meridian Health'],
        ['Nadia Duarte', 'Head of Sales · Pinewood Foods'],
        ['Grace Fenwick', 'CFO · Riverbank Capital'],
        ['Oscar Fontaine', 'Procurement Lead · Solstice Energy'],
        ['Leah Granger', 'VP Operations · Tidewater Logistics'],
        ['Tomas Guerra', 'Founder · Umbra Studio'],
        ['Ravi Hemani', 'IT Director · Vantage Aero'],
        ['Imani Hollis', 'Head of Finance · Wexford Group'],
        ['Yusuf Kaya', 'Ops Manager · Ovato Retail'],
        ['Wren Kowalski', 'Account Owner · Quill Media'],
        ['Bianca Lindqvist', 'VP Finance · Lumen Robotics'],
        ['Chloe Marchetti', 'Buyer · Cedar & Vale'],
        ['Aaron Mbeki', 'Head of Procurement · Northwind Trading'],
        ['Felix Moreau', 'Operations Lead · Atlas Freight'],
        ['Sasha Novak', 'Head of IT · Kestrel Labs'],
        ['Dana Okonkwo', 'CFO · Bright Harbor'],
        ['Nora Pashkov', 'VP Growth · Pinewood Foods'],
        ['Julian Pereira', 'Account Owner · Meridian Health'],
        ['Idris Rahman', 'Finance Director · Riverbank Capital'],
        ['Camila Rossi', 'Procurement Lead · Solstice Energy'],
        ['Victor Salgado', 'IT Manager · Umbra Studio'],
        ['Hana Sato', 'Head of Operations · Tidewater Logistics'],
        ['Marta Toledo', 'Account Owner · Vantage Aero'],
        ['Leon Vasquez', 'Founder · Wexford Group'],
        ['Greta Wallace', 'VP Operations · Ovato Retail'],
        ['Owen Whitfield', 'Head of Sales · Quill Media'],
      ] as const
      content = {
        ...base('Account contacts', '31 people across your book', [
          ['all', 'All'],
          ['customers', 'Customers'],
          ['prospects', 'Prospects'],
        ]),
        kind: 'contacts',
        rows: records.map(([title, detail], i) => ({
          ...row(`contact-${i}`, title, detail, {
            abbreviation: title
              .split(' ')
              .map((part) => part[0])
              .join(''),
          }),
          letter: title.split(' ').at(-1)?.[0] ?? '',
          categoryId: 'unknown',
        })),
        letters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
        selectedLetter: '',
        jumpLabel: (letter) => `Jump to ${letter}`,
        emailLabel: (title) => `Email ${title}`,
      }
      break
    }
    case 10:
      content = {
        ...base('Checkout latency spike: SEV2', ''),
        kind: 'runbook',
        eyebrow: 'INCIDENT RUNBOOK',
        listStrategy: grown,
        rows: [
          row('ack', 'Acknowledge the page and declare an incident', 'On-call primary · 2 min'),
          row('channel', 'Open the incident channel and post the first summary', 'Incident commander · 3 min'),
          row('blast', 'Confirm blast radius from the error-rate dashboard', 'SRE · 5 min'),
          row('rollback', 'Roll back the checkout service to the last good deploy', 'Release engineer · 8 min'),
          row('verify', 'Verify error rate and latency have recovered', 'SRE · 5 min'),
          row('status', 'Post customer-facing update to the status page', 'Support lead · 4 min'),
          row('timeline', 'Capture the timeline for the postmortem', 'Incident commander · 6 min'),
          row('close', 'Stand down responders and close the incident', 'On-call primary · 2 min'),
        ],
        completedIds: [],
        progressLabel: (count, total) => `${count} of ${total} steps complete`,
        completeLabel: (title, index) => `Mark step ${index} complete: ${title}`,
        incompleteLabel: (title, index) => `Mark step ${index} incomplete: ${title}`,
        openLabel: (title) => `Open runbook for: ${title}`,
        runbookLabel: 'Runbook',
        runbookHref: (id) => `#preview-runbook-${encodeURIComponent(id)}`,
      }
      break
    case 11: {
      const records = [
        ['priya', 'Priya Nair', 'Tier 2 support · +14 resolved vs last', 172, '1:36', 96, 4.9, '↑ 1'],
        ['marcus', 'Marcus Bello', 'Escalations · +9 resolved vs last', 168, '2:12', 132, 4.7, '↓ 1'],
        ['hana', 'Hana Sato', 'Tier 1 support · −6 resolved vs last', 151, '1:58', 118, 4.8, '—'],
        ['diego', 'Diego Ramos', 'Billing · +21 resolved vs last', 149, '3:25', 205, 4.5, '↑ 1'],
        ['amara', 'Amara Okoye', 'Onboarding · −3 resolved vs last', 138, '2:56', 176, 4.6, '↓ 1'],
        ['lena', 'Lena Fischer', 'Tier 2 support · +12 resolved vs last', 131, '2:29', 149, 4.7, '↑ 1'],
        ['sam', 'Sam Whitfield', 'Tier 1 support · −8 resolved vs last', 120, '3:41', 221, 4.4, '↓ 1'],
        ['yuki', 'Yuki Tanaka', 'Escalations · +4 resolved vs last', 109, '2:43', 163, 4.6, '—'],
        ['omar', 'Omar Haddad', 'Billing · +18 resolved vs last', 96, '4:18', 258, 4.3, '—'],
      ] as const
      content = {
        ...base(
          'Support leaderboard',
          'Ranked by conversations resolved',
          [
            ['resolved', 'Resolved'],
            ['response', 'Response time'],
            ['satisfaction', 'Satisfaction'],
          ],
          'resolved',
        ),
        kind: 'leaderboard',
        rows: records.map(([id, title, detail, resolved, response, responseSeconds, satisfaction, trend]) => ({
          ...row(id, title, detail, {
            abbreviation: title
              .split(' ')
              .map((part) => part[0])
              .join(''),
          }),
          resolved,
          response,
          responseSeconds,
          satisfaction,
          trend,
        })),
        periodChoices: [
          { id: 'week', label: 'This week' },
          { id: 'month', label: 'This month' },
        ],
        periodId: 'week',
        columns: ['#', 'TREND', 'AGENT', 'RESOLVED', 'MEDIAN FRT', 'CSAT'],
        totals: ['Team totals · 9 agents', '1,234', '2:49', '4.6'],
      }
      break
    }
    default: {
      const folder = (
        id: string,
        name: string,
        parentId: string | undefined,
        detail = '',
        childrenKnown = true,
      ): Node => ({ id, name, parentId, detail, childrenKnown, kind: 'folder' })
      const file = (id: string, name: string, parentId: string | undefined, detail: string): Node => ({
        id,
        name,
        parentId,
        detail,
        childrenKnown: true,
        kind: 'file',
      })
      content = {
        ...base('Repository', 'acme/web · main'),
        kind: 'tree',
        nodes: [
          folder('src', 'src', undefined),
          folder('components', 'components', 'src'),
          file('button', 'Button.tsx', 'components', '2.4 KB'),
          file('modal', 'Modal.tsx', 'components', '3.1 KB'),
          folder('icons', 'icons', 'components', '2 items'),
          file('logo', 'logo.svg', 'icons', '1.2 KB'),
          file('spinner', 'spinner.svg', 'icons', '0.8 KB'),
          folder('hooks', 'hooks', 'src', '2 items'),
          file('auth-hook', 'use-auth.ts', 'hooks', '1.6 KB'),
          file('theme-hook', 'use-theme.ts', 'hooks', '0.9 KB'),
          folder('lib', 'lib', 'src', '2 items'),
          file('api', 'api.ts', 'lib', '4.2 KB'),
          file('format', 'format.ts', 'lib', '1.1 KB'),
          file('styles', 'styles.css', 'src', '5.0 KB'),
          file('index', 'index.ts', 'src', '0.4 KB'),
          folder('public', 'public', undefined, '2 items'),
          file('favicon', 'favicon.png', 'public', '4.5 KB'),
          file('og-image', 'og-image.png', 'public', '88 KB'),
          file('readme', 'README.md', undefined, '6.2 KB'),
          file('package', 'package.json', undefined, '1.9 KB'),
          file('tsconfig', 'tsconfig.json', undefined, '0.6 KB'),
          file('gitignore', '.gitignore', undefined, '0.2 KB'),
        ],
        expandedIds: ['src', 'components'],
        activeId: '',
        actions: [
          { id: 'expand-all', label: 'Expand all' },
          { id: 'collapse-all', label: 'Collapse all' },
        ],
        openLabel: (name) => `Open ${name}`,
        unknownLabel: 'Child names were not included in this captured reference.',
      }
    }
  }
  if (mode === 'localized')
    content = {
      ...content,
      title: '供应商与账户联系人在较长工作区名称下的完整列表',
      labels: { empty: '当前筛选没有记录。', unavailable: '公开快照没有包含此选择的数据。', choices: '视图与报告周期' },
    }
  if ('rows' in content) {
    if (mode === 'empty') content = { ...content, rows: [] }
    if (mode === 'one' && content.kind === 'suppliers') content = { ...content, rows: content.rows.slice(0, 1) }
    if (content.kind === 'suppliers' && (mode === 'boundary' || mode === 'overflow'))
      content = {
        ...content,
        rows: Array.from({ length: mode === 'boundary' ? 80 : 81 }, (_, i) => ({
          ...row(`capacity-supplier-${i}`, `Synthetic capacity supplier ${i + 1}`, 'Test fixture only', {
            status: 'Active',
            value: '$0',
            abbreviation: 'T',
          }),
          categoryId: 'Cloud',
          category: 'Cloud',
        })),
      }
  }
  return content
}
export function listPreviewNotice(actionId: string, value?: string): string {
  return `${actionId}${value ? ` · ${value}` : ''}: preview intent recorded; no external connection, delivery, file, or message operation has been confirmed.`
}

/** Values captured after selecting the source's seven-day store period. */
export function listPreviewCapturedSelection(content: Content, selectedId: string): Content | undefined {
  if (content.kind !== 'metrics' || selectedId !== '7d') return undefined
  const values = ['1,284', '$92.4k', '$71.96', '4.1%']
  const deltas = ['+6.4%', '+3.1%', '−2.9%', '−0.8%']
  return {
    ...content,
    selectedId,
    rows: content.rows.map((item, i) => ({
      ...item,
      value: values[i] ?? item.value,
      delta: deltas[i] ?? item.delta,
      tone: i === 2 ? 'danger' : 'success',
    })),
  }
}
