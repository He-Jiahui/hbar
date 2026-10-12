import type { LumenNavbarChoice, LumenNavbarContent, LumenNavbarNavigation } from '@lumen/app-ui/catalog'
import type { NavbarPreviewSeed } from './navbarPreviewModel'

const primaryIds = ['overview', 'revenue', 'customers', 'usage', 'reports'] as const
const secondaryIds = ['mrr', 'expansion', 'churn'] as const

function navigation(title: string, localized: boolean): LumenNavbarNavigation {
  return {
    title,
    label: localized ? `${title} Navigation` : `${title} navigation`,
    close: localized ? 'Menü schließen' : 'Close menu',
  }
}

export const navbarSearchItems: readonly LumenNavbarChoice[] = [
  { id: 'billing-retry-policy', label: 'Billing retry policy' },
  { id: 'checkout-drop-off-study', label: 'Checkout drop-off study' },
]

export function matchNavbarSearchItems(query: string): readonly LumenNavbarChoice[] {
  const normalized = query.trim().toLocaleLowerCase()
  // The observed preview keeps single-character queries empty; known results remain Host-owned.
  return normalized.length < 2
    ? []
    : navbarSearchItems.filter(({ label }) => label.toLocaleLowerCase().includes(normalized))
}

const boardColumns: NonNullable<NonNullable<LumenNavbarContent['projectBoard']>['tabColumns']> = [
  {
    tabId: 'discussion',
    columns: [
      { id: 'open-threads', label: 'Open threads', cards: ['Payment retries', 'Guest checkout'] },
      { id: 'mentions', label: 'Mentions', cards: ['Refund copy review'] },
      { id: 'resolved', label: 'Resolved', cards: ['Address autofill', 'Coupon field'] },
    ],
  },
  {
    tabId: 'timeline',
    columns: [
      { id: 'this-week', label: 'This week', cards: ['Design freeze', 'Copy handoff'] },
      { id: 'next-week', label: 'Next week', cards: ['Beta rollout'] },
      { id: 'later', label: 'Later', cards: ['Wallet support', 'Split payments'] },
    ],
  },
  {
    tabId: 'files',
    columns: [
      { id: 'specs', label: 'Specs', cards: ['checkout-flow.pdf', 'states.fig'] },
      { id: 'research', label: 'Research', cards: ['drop-off-study.md'] },
      { id: 'assets', label: 'Assets', cards: ['icons.zip', 'brand-marks.svg'] },
    ],
  },
  {
    tabId: 'overview',
    columns: [
      { id: 'goal', label: 'Goal', cards: ['Cut checkout drop-off by 12%'] },
      { id: 'owners', label: 'Owners', cards: ['Payments', 'Growth'] },
      { id: 'status', label: 'Status', cards: ['On track for the July release'] },
    ],
  },
]

const analyticsSections: NonNullable<NonNullable<LumenNavbarContent['analytics']>['sections']> = [
  {
    primaryId: 'overview',
    initialSecondaryId: 'summary',
    secondaryOptions: [
      { id: 'summary', label: 'Summary' },
      { id: 'activity', label: 'Activity' },
      { id: 'goals', label: 'Goals' },
    ],
    metrics: [
      { label: 'Active accounts', value: '1,284', detail: '+38 this week' },
      { label: 'Open tasks', value: '62', detail: '9 overdue' },
      { label: 'Weekly sessions', value: '18.4k', detail: '+6.1%' },
    ],
  },
  {
    primaryId: 'revenue',
    initialSecondaryId: 'mrr',
    secondaryOptions: [
      { id: 'mrr', label: 'MRR' },
      { id: 'expansion', label: 'Expansion' },
      { id: 'churn', label: 'Churn' },
    ],
    metrics: [
      { label: 'MRR', value: '$248k', detail: '+4.2% MoM' },
      { label: 'Expansion', value: '$31k', detail: '22 upgrades' },
      { label: 'Net churn', value: '-1.1%', detail: 'Best this year' },
    ],
  },
  {
    primaryId: 'customers',
    initialSecondaryId: 'accounts',
    secondaryOptions: [
      { id: 'accounts', label: 'Accounts' },
      { id: 'segments', label: 'Segments' },
      { id: 'health', label: 'Health' },
    ],
    metrics: [
      { label: 'Accounts', value: '1,284', detail: '412 on Scale' },
      { label: 'At risk', value: '17', detail: 'Health below 40' },
      { label: 'Renewals', value: '38', detail: 'Next 30 days' },
    ],
  },
  {
    primaryId: 'usage',
    initialSecondaryId: 'requests',
    secondaryOptions: [
      { id: 'requests', label: 'Requests' },
      { id: 'storage', label: 'Storage' },
      { id: 'seats', label: 'Seats' },
    ],
    metrics: [
      { label: 'Requests', value: '94.2M', detail: 'Rolling 30 days' },
      { label: 'Storage', value: '8.1 TB', detail: '+240 GB' },
      { label: 'Seats used', value: '3,910', detail: 'of 4,500' },
    ],
  },
  {
    primaryId: 'reports',
    initialSecondaryId: 'saved',
    secondaryOptions: [
      { id: 'saved', label: 'Saved' },
      { id: 'scheduled', label: 'Scheduled' },
      { id: 'exports', label: 'Exports' },
    ],
    metrics: [
      { label: 'Saved reports', value: '46', detail: '12 shared' },
      { label: 'Scheduled', value: '9', detail: 'Next run 06:00' },
      { label: 'Exports', value: '214', detail: 'Last 90 days' },
    ],
  },
]

/** Stable technical identities are separate from the labels supplied by the preview host. */
export function navbarAnalyticsChoices(
  labels: readonly string[],
  group: 'primary' | 'secondary',
): readonly LumenNavbarChoice[] {
  const ids = group === 'primary' ? primaryIds : secondaryIds
  return labels.flatMap((label, index) => {
    const id = ids[index]
    return id ? [{ id, label }] : []
  })
}

/** Allocate a store and detailed projection only for the currently visible composition. */
export function createNavbarPreviewContent(
  base: LumenNavbarContent,
  variant: number,
  localized: boolean,
): LumenNavbarContent {
  switch (variant) {
    case 1:
      return {
        projectBoard: base.projectBoard
          ? {
              ...base.projectBoard,
              tabColumns: [{ tabId: 'tasks', columns: base.projectBoard.columns }, ...boardColumns],
            }
          : undefined,
      }
    case 2:
      return { taskList: base.taskList }
    case 3:
      return {
        deployment: base.deployment
          ? {
              ...base.deployment,
              actions: { ...base.deployment.actions, helpLabel: localized ? 'Dokumentation' : 'Documentation' },
              summaryLabel: localized
                ? (workspace, environment) => `${workspace} · Bereitstellung: ${environment}`
                : (workspace, environment) => `${workspace} · ${environment.toLowerCase()} deployment`,
              workspaceMenu: {
                label: localized ? 'Organisation auswählen' : 'Choose organisation',
                items: [
                  { id: 'northwind', label: 'Northwind' },
                  { id: 'cedar', label: 'Cedar Labs' },
                  { id: 'harbor', label: 'Harbor Coffee' },
                  { id: 'create', label: localized ? 'Organisation erstellen' : 'Create organisation' },
                ],
              },
              projectMenu: {
                label: localized ? 'Projekt auswählen' : 'Choose project',
                items: [
                  { id: 'web-app', label: 'web-app' },
                  { id: 'marketing-site', label: 'marketing-site' },
                  { id: 'billing-api', label: 'billing-api' },
                  { id: 'mobile-client', label: 'mobile-client' },
                ],
              },
              environmentMenu: {
                label: localized ? 'Umgebung auswählen' : 'Choose environment',
                items: [
                  { id: 'production', label: 'Production' },
                  { id: 'staging', label: 'Staging' },
                  { id: 'preview', label: 'Preview' },
                ],
              },
            }
          : undefined,
      }
    case 4:
      return {
        landingPrimary: base.landingPrimary
          ? {
              ...base.landingPrimary,
              navigation: navigation(base.landingPrimary.brand, localized),
              dropdowns: [
                {
                  id: 'product',
                  label: base.landingPrimary.navItems[0] ?? '',
                  items: [
                    { id: 'platform', label: 'Platform', description: 'The workspace your team runs on' },
                    { id: 'automations', label: 'Automations', description: 'Rules that move work forward' },
                    { id: 'integrations', label: 'Integrations', description: 'Connect the tools you already use' },
                    { id: 'security', label: 'Security', description: 'Controls, audit logs and SSO' },
                  ],
                },
                {
                  id: 'company',
                  label: base.landingPrimary.navItems[1] ?? '',
                  items: [
                    { id: 'about', label: 'About', description: 'Who we are and what we build' },
                    { id: 'blog', label: 'Blog', description: 'Product notes and engineering posts' },
                    { id: 'careers', label: 'Careers', description: 'Nine open roles across four teams' },
                    { id: 'support', label: 'Support', description: 'Reach a human within one hour' },
                  ],
                },
              ],
            }
          : undefined,
      }
    case 5:
      return {
        landingSecondary: base.landingSecondary
          ? {
              ...base.landingSecondary,
              navigation: navigation(base.landingSecondary.brand, localized),
              dropdowns: [
                {
                  id: 'platform',
                  label: base.landingSecondary.navItems[0] ?? '',
                  groups: [
                    { id: 'build', label: 'BUILD', itemIds: ['runtime', 'preview-branches', 'webhooks'] },
                    { id: 'operate', label: 'OPERATE', itemIds: ['live-metrics', 'managed-data', 'secrets'] },
                  ],
                  items: [
                    { id: 'runtime', label: 'Runtime', description: 'Deploy in nine regions' },
                    { id: 'preview-branches', label: 'Preview branches', description: 'One URL per pull request' },
                    { id: 'webhooks', label: 'Webhooks', description: 'Signed, retried, replayable' },
                    { id: 'live-metrics', label: 'Live metrics', description: 'Second-level resolution' },
                    { id: 'managed-data', label: 'Managed data', description: 'Backups every six hours' },
                    { id: 'secrets', label: 'Secrets', description: 'Scoped per environment' },
                  ],
                  footer: {
                    text: 'Migrating from a self-hosted stack? Our team will move your first three services for free.',
                    action: { id: 'talk', label: 'Talk to us' },
                  },
                },
                {
                  id: 'solutions',
                  label: base.landingSecondary.navItems[1] ?? '',
                  groups: [
                    { id: 'team', label: 'BY TEAM', itemIds: ['platform-teams', 'data-teams', 'agencies'] },
                    { id: 'stage', label: 'BY STAGE', itemIds: ['startups', 'scale-ups', 'enterprise'] },
                  ],
                  items: [
                    { id: 'platform-teams', label: 'Platform teams', description: 'Golden paths, not gates' },
                    { id: 'data-teams', label: 'Data teams', description: 'Pipelines you can read' },
                    { id: 'agencies', label: 'Agencies', description: 'Ship client work faster' },
                    { id: 'startups', label: 'Startups', description: 'Free for the first year' },
                    { id: 'scale-ups', label: 'Scale-ups', description: 'Usage that grows with you' },
                    { id: 'enterprise', label: 'Enterprise', description: 'SSO, audit logs, DPA' },
                  ],
                },
              ],
            }
          : undefined,
      }
    case 6:
      return {
        activity: base.activity
          ? {
              ...base.activity,
              labels: {
                ...base.activity.labels,
                searchLabel: localized ? `In ${base.activity.brand} suchen` : `Search ${base.activity.brand}`,
              },
            }
          : undefined,
      }
    case 7:
      return {
        analytics: base.analytics
          ? {
              ...base.analytics,
              primaryOptions: navbarAnalyticsChoices(base.analytics.primaryTabs, 'primary'),
              secondaryOptions: navbarAnalyticsChoices(base.analytics.secondaryTabs, 'secondary'),
              sections: analyticsSections,
            }
          : undefined,
      }
    case 8:
      return { filterList: base.filterList }
    case 9:
      return {
        commerce: base.commerce
          ? {
              ...base.commerce,
              navigation: navigation(base.commerce.brand, localized),
              dropdowns: [
                {
                  id: 'brewing',
                  label: base.commerce.navItems[0] ?? '',
                  groups: [
                    { id: 'machines', label: 'Machines', itemIds: ['espresso', 'filter', 'grinders', 'kettles'] },
                    { id: 'manual', label: 'Manual', itemIds: ['pour-over', 'press', 'moka', 'siphon'] },
                    { id: 'accessories', label: 'Accessories', itemIds: ['scales', 'tampers', 'filters', 'jugs'] },
                  ],
                  items: [
                    'Espresso',
                    'Filter',
                    'Grinders',
                    'Kettles',
                    'Pour over',
                    'Press',
                    'Moka',
                    'Siphon',
                    'Scales',
                    'Tampers',
                    'Filters',
                    'Jugs',
                  ].map((label, index) => ({
                    id:
                      [
                        'espresso',
                        'filter',
                        'grinders',
                        'kettles',
                        'pour-over',
                        'press',
                        'moka',
                        'siphon',
                        'scales',
                        'tampers',
                        'filters',
                        'jugs',
                      ][index] ?? '',
                    label,
                  })),
                },
                {
                  id: 'beans',
                  label: base.commerce.navItems[1] ?? '',
                  groups: [
                    { id: 'roast', label: 'Roast', itemIds: ['light', 'medium', 'dark', 'decaf'] },
                    { id: 'origin', label: 'Origin', itemIds: ['ethiopia', 'colombia', 'kenya', 'brazil'] },
                    { id: 'format', label: 'Format', itemIds: ['whole-bean', 'ground', 'capsules', 'sample'] },
                  ],
                  items: [
                    'Light',
                    'Medium',
                    'Dark',
                    'Decaf',
                    'Ethiopia',
                    'Colombia',
                    'Kenya',
                    'Brazil',
                    'Whole bean',
                    'Ground',
                    'Capsules',
                    'Sample',
                  ].map((label, index) => ({
                    id:
                      [
                        'light',
                        'medium',
                        'dark',
                        'decaf',
                        'ethiopia',
                        'colombia',
                        'kenya',
                        'brazil',
                        'whole-bean',
                        'ground',
                        'capsules',
                        'sample',
                      ][index] ?? '',
                    label,
                  })),
                },
              ],
            }
          : undefined,
      }
    case 10:
      return {
        docs: base.docs
          ? {
              ...base.docs,
              navigation: {
                label: localized ? 'Dokumentationsnavigation' : 'Documentation navigation',
                title: localized ? 'Dokumentation' : 'Docs',
                close: localized ? 'Navigation schließen' : 'Close navigation',
              },
            }
          : undefined,
      }
    case 11:
      return { document: base.document }
    case 12:
      return {
        landingCentered: base.landingCentered
          ? { ...base.landingCentered, navigation: navigation(base.landingCentered.brand, localized) }
          : undefined,
      }
    case 13:
      return {
        portfolio: base.portfolio
          ? { ...base.portfolio, navigation: navigation(base.portfolio.brand, localized) }
          : undefined,
      }
    case 14:
      return { article: base.article }
    default:
      return {}
  }
}

export interface NavbarPreviewCopy {
  readonly requestNotice: string
  readonly addStar: string
  readonly removeStar: string
  readonly addBookmark: string
  readonly removeBookmark: string
  readonly searchResults: string
  readonly searchEmpty: (query: string) => string
  readonly searchClose: string
  readonly projectSearch: string
  readonly projectEmpty: string
}

export function createNavbarPreviewCopy(localized: boolean): NavbarPreviewCopy {
  return {
    requestNotice: localized
      ? 'Vorschauanfrage erfasst. Es wurde keine externe Aktion ausgeführt.'
      : 'Preview request recorded. No external action was performed.',
    addStar: localized ? 'Projekt markieren' : 'Add to starred',
    removeStar: localized ? 'Projektmarkierung entfernen' : 'Remove from starred',
    addBookmark: localized ? 'Artikel als Lesezeichen speichern' : 'Bookmark article',
    removeBookmark: localized ? 'Lesezeichen entfernen' : 'Remove bookmark',
    searchResults: localized ? 'ERGEBNISSE' : 'RESULTS',
    searchEmpty: localized ? (query) => `Keine Treffer für „${query}“.` : (query) => `Nothing matches “${query}”.`,
    searchClose: localized ? 'Suche schließen' : 'Close search',
    projectSearch: localized ? 'Projekte suchen' : 'Search projects',
    projectEmpty: localized ? 'Keine passenden Projekte.' : 'No matching projects.',
  }
}

function requests(actionId: string, ids: readonly string[]): NavbarPreviewSeed['requestActions'] {
  return ids.map((targetId) => ({ actionId, targetId }))
}

function actions(...actionIds: readonly string[]): NavbarPreviewSeed['requestActions'] {
  return actionIds.map((actionId) => ({ actionId }))
}

export function createNavbarPreviewSeed(
  content: LumenNavbarContent,
  variant: number,
  ownerId: string,
  fixtureId: string,
  primaryId?: string,
): NavbarPreviewSeed {
  let slots: NavbarPreviewSeed['slots'] = []
  let drafts: NavbarPreviewSeed['drafts'] = []
  let requestActions: NavbarPreviewSeed['requestActions'] = []
  switch (variant) {
    case 1:
      if (content.projectBoard) {
        slots = [
          {
            id: 'project-tab',
            items: ['discussion', 'tasks', 'timeline', 'files', 'overview'].map((id) => ({ id })),
            initialSelectedId: content.projectBoard.initialTab,
          },
        ]
        requestActions = actions('search', 'star', 'more', 'invite')
      }
      break
    case 2:
      if (content.taskList)
        requestActions = [
          ...actions('invite', 'filter', 'sort', 'more'),
          ...requests(
            'open',
            content.taskList.rows.map(({ id }) => id),
          ),
        ]
      break
    case 3:
      if (content.deployment) {
        requestActions = [
          ...actions('workspace', 'project', 'environment', 'help', 'settings', 'upgrade', 'account'),
          ...requests('workspace', content.deployment.workspaceMenu?.items.map(({ id }) => id) ?? []),
        ]
        slots = [
          {
            id: 'workspace',
            items: content.deployment.workspaceMenu?.items.filter(({ id }) => id !== 'create') ?? [],
            initialSelectedId: 'northwind',
          },
          { id: 'project', items: content.deployment.projectMenu?.items ?? [], initialSelectedId: 'web-app' },
          {
            id: 'environment',
            items: content.deployment.environmentMenu?.items ?? [],
            initialSelectedId: 'production',
          },
        ]
        drafts = [{ id: 'project-search', value: '' }]
      }
      break
    case 4:
    case 5:
    case 12: {
      const landing =
        variant === 4 ? content.landingPrimary : variant === 5 ? content.landingSecondary : content.landingCentered
      if (landing)
        requestActions = [
          ...actions('menu', 'primary', ...(variant === 12 ? [] : ['sign-in'])),
          ...requests('navigate', landing.navItems),
          ...requests(
            'navigate-menu',
            landing.dropdowns?.flatMap((menu) =>
              [...menu.items, ...(menu.footer ? [menu.footer.action] : [])].map(({ id }) =>
                JSON.stringify([menu.id, id]),
              ),
            ) ?? [],
          ),
        ]
      break
    }
    case 6:
      if (content.activity) {
        drafts = [{ id: 'search', value: '' }]
        requestActions = [
          ...actions('search', 'new', 'help', 'notifications', 'account'),
          ...requests(
            'open',
            content.activity.items.map(({ id }) => id),
          ),
          ...requests(
            'search-result',
            navbarSearchItems.map(({ id }) => id),
          ),
        ]
      }
      break
    case 7:
      if (content.analytics) {
        const analytics = content.analytics
        const activePrimaryId =
          primaryId ?? analytics.primaryOptions?.find(({ label }) => label === analytics.activePrimaryTab)?.id
        const section = analytics.sections?.find((item) => item.primaryId === activePrimaryId)
        slots = [
          {
            id: 'primary',
            items: analytics.primaryOptions ?? [],
            initialSelectedId: analytics.primaryOptions?.find(({ label }) => label === analytics.activePrimaryTab)?.id,
          },
          {
            id: 'secondary',
            items: section?.secondaryOptions ?? analytics.secondaryOptions ?? [],
            initialSelectedId:
              section?.initialSecondaryId ??
              analytics.secondaryOptions?.find(({ label }) => label === analytics.activeSecondaryTab)?.id,
          },
        ]
        requestActions = actions('workspace', 'search', 'help', 'settings', 'account', 'feedback')
      }
      break
    case 8:
      if (content.filterList) {
        slots = [
          { id: 'filter', items: content.filterList.filters, initialSelectedId: content.filterList.activeFilter },
        ]
        requestActions = [
          ...actions('more', 'filter', 'display', 'export'),
          ...requests(
            'open',
            content.filterList.items.map(({ id }) => id),
          ),
        ]
      }
      break
    case 9:
      if (content.commerce)
        requestActions = [
          ...actions('menu', 'search', 'account', 'wishlist', 'cart'),
          ...requests('navigate', content.commerce.navItems),
          ...requests(
            'navigate-menu',
            content.commerce.dropdowns?.flatMap((menu) => menu.items.map(({ id }) => JSON.stringify([menu.id, id]))) ??
              [],
          ),
          ...requests(
            'open',
            content.commerce.products.map(({ id }) => id),
          ),
        ]
      break
    case 10:
      if (content.docs)
        requestActions = [
          ...actions('menu', 'version', 'search', 'theme', 'repository'),
          ...requests('navigate', [...content.docs.navItems, ...content.docs.sidebar.flatMap(({ items }) => items)]),
          ...requests('open', content.docs.links),
        ]
      break
    case 11:
      if (content.document)
        requestActions = [
          ...actions('back', 'title', 'history', 'share', 'more'),
          ...requests(
            'open',
            content.document.outline.map(({ id }) => id),
          ),
        ]
      break
    case 13:
      if (content.portfolio)
        requestActions = [
          ...actions('menu'),
          ...requests('navigate', [...content.portfolio.leftNav, ...content.portfolio.rightNav]),
          ...requests(
            'open',
            content.portfolio.projects.map(({ id }) => id),
          ),
        ]
      break
    case 14:
      if (content.article)
        requestActions = [
          ...actions('back', 'contents', 'bookmark', 'copy', 'share'),
          ...requests(
            'section',
            content.article.sections.map(({ id }) => id),
          ),
        ]
      break
  }
  return {
    ownerId,
    variant,
    fixtureId,
    slots,
    drafts,
    requestActions,
    flags:
      variant === 1 ? [{ id: 'starred', value: false }] : variant === 14 ? [{ id: 'bookmarked', value: false }] : [],
  }
}
