import type {HbarAppUiNavbarContent} from '../../packages/hbar-app-ui/src/index'

const commonActions = {
    searchLabel: 'Search',
    helpLabel: 'Help',
    settingsLabel: 'Settings',
    accountLabel: 'Account menu',
}

/**
 * Preview and behavior-test content only. The reusable navbar package keeps
 * all user-visible text and records in its typed host contract.
 */
export const HBAR_APP_UI_NAVBAR_FIXTURES: HbarAppUiNavbarContent = {
    projectBoard: {
        title: 'Checkout Flow',
        breadcrumbs: ['Products', 'Mobile', 'Checkout Flow'],
        labels: {
            searchProject: 'Search this project',
            starProject: 'Add to starred',
            moreActions: 'More project actions',
            discussion: 'Discussion',
            tasks: 'Tasks',
            timeline: 'Timeline',
            files: 'Files',
            overview: 'Overview',
            invitePeople: 'Invite people to this project',
        },
        discussionCount: 3,
        avatars: ['AM', 'RK', 'TN', 'JD'],
        extraAvatarLabel: '+9',
        columns: [
            {id: 'in-progress', label: 'In progress', cards: ['Wallet sheet', 'Card vaulting']},
            {id: 'in-review', label: 'In review', cards: ['Step-up challenge state']},
            {id: 'done', label: 'Done', cards: ['Order summary', 'Tax breakdown']},
        ],
        listStrategy: {kind: 'content-grown', expectedMaximum: 3},
        initialTab: 'tasks',
    },
    taskList: {
        breadcrumbs: ['Home', 'Projects', 'Sprint 24'],
        avatars: ['NV', 'MS', 'PP'],
        extraAvatarLabel: '+8',
        labels: {
            invite: 'Invite',
            filter: 'Filter tasks',
            sort: 'Sort tasks',
            more: 'More actions',
            sortedBy: 'Sorted by recently updated',
            metadataSeparator: ' · ',
            breadcrumbLabel: (items) => items.join(' / '),
        },
        rows: [
            {id: 'payment-retries', title: 'Payment retries', sprint: 'Sprint 24', owner: 'Nadia V.'},
            {id: 'guest-checkout', title: 'Guest checkout polish', sprint: 'Sprint 24', owner: 'Marcus S.'},
            {id: 'address-autofill', title: 'Address autofill', sprint: 'Sprint 23', owner: 'Priya P.'},
            {id: 'order-summary', title: 'Order summary copy', sprint: 'Sprint 23', owner: 'Tom P.'},
        ],
        listStrategy: {kind: 'pane-scroll', expectedMaximum: 48},
    },
    deployment: {
        workspace: 'Northwind',
        workspaceInitial: 'N',
        accountInitial: 'EM',
        project: 'web-app',
        environment: 'Production',
        actions: {...commonActions, upgrade: 'Upgrade', breadcrumbSeparator: '/'},
        deploymentLabel: 'web-app',
        deploymentSummary: 'Northwind · production deployment',
        stats: [
            {label: 'Deployments', value: '128'},
            {label: 'Median build', value: '42s'},
            {label: 'Last release', value: '6h ago'},
        ],
        statsStrategy: {kind: 'content-grown', expectedMaximum: 3},
    },
    landingPrimary: {
        brand: 'Halcyon',
        brandMark: 'H',
        navItems: ['Product', 'Company', 'Pricing', 'Changelog'],
        labels: {
            signIn: 'Sign in',
            primaryAction: 'Get started',
            menu: 'Open menu',
            eyebrow: 'SHIP WITH CONFIDENCE',
        },
        title: 'One workspace for the whole release',
        description: 'Plan the work, run the automations and watch it land, without stitching six tools together.',
        placeholderCount: 1,
    },
    landingSecondary: {
        brand: 'Meridian',
        brandMark: 'M',
        navItems: ['Platform', 'Solutions', 'Docs', 'Pricing'],
        labels: {
            signIn: 'Sign in',
            primaryAction: 'Start building',
            menu: 'Open menu',
            eyebrow: '',
        },
        title: 'Infrastructure that stays out of the way',
        description: 'Push a branch, get an environment. Every service, region and secret managed from a single control plane.',
        stats: [
            {label: 'Regions', value: '9'},
            {label: 'Median cold start', value: '34ms'},
            {label: 'Uptime', value: '99.99%'},
        ],
        statsStrategy: {kind: 'content-grown', expectedMaximum: 3},
        placeholderCount: 0,
    },
    activity: {
        brand: 'Northwind',
        brandInitial: 'N',
        labels: {
            ...commonActions,
            searchPlaceholder: 'Search projects, docs and people...',
            openSearch: 'Open search',
            newItem: 'New',
            notifications: 'Notifications, 4 unread',
            today: 'Today',
            shortcut: '⌘K',
            accountInitial: 'EM',
        },
        items: [
            {id: 'review', actor: 'Nadia V.', message: 'requested review on Billing retry policy', age: '4m ago'},
            {id: 'deploy', actor: 'Deploy bot', message: 'shipped web-app 24.6.1 to production', age: '26m ago'},
            {id: 'comments', actor: 'Marcus S.', message: 'left three comments on Checkout copy', age: '1h ago'},
            {id: 'plan', actor: 'Harbor Coffee', message: 'upgraded to the Scale plan', age: '3h ago'},
        ],
        listStrategy: {kind: 'pane-scroll', expectedMaximum: 48},
    },
    analytics: {
        workspace: 'Cedar Labs',
        workspaceInitial: 'C',
        workspaceLabel: 'Growth workspace',
        initials: 'RK',
        labels: commonActions,
        primaryTabs: ['Overview', 'Revenue', 'Customers', 'Usage', 'Reports'],
        secondaryTabs: ['MRR', 'Expansion', 'Churn'],
        activePrimaryTab: 'Revenue',
        activeSecondaryTab: 'MRR',
        metrics: [
            {label: 'MRR', value: '$248k', detail: '+4.2% MoM'},
            {label: 'Expansion', value: '$31k', detail: '22 upgrades'},
            {label: 'Net churn', value: '-1.1%', detail: 'Best this year'},
        ],
        metricsStrategy: {kind: 'content-grown', expectedMaximum: 3},
        feedbackLabel: 'Feedback',
        titleLabel: (primary, secondary) => `${primary} · ${secondary}`,
    },
    filterList: {
        filters: [
            {id: 'all', label: 'All', count: 248},
            {id: 'open', label: 'Open', count: 46},
            {id: 'review', label: 'In review', count: 12},
            {id: 'done', label: 'Done', count: 190},
        ],
        labels: {
            moreViews: 'More views',
            filter: 'Filter',
            display: 'Display',
            export: 'Export',
            itemCount: (count, state) => `${count} items in ${state.toLowerCase()}`,
        },
        activeFilter: 'open',
        itemCount: 46,
        items: [
            {id: 'webhooks', title: 'Retry failed webhooks after backoff', actor: 'Nadia V.', age: '12m'},
            {id: 'checkout', title: 'Split checkout bundle by route', actor: 'Marcus S.', age: '1h'},
            {id: 'tax', title: 'Backfill invoice tax regions', actor: 'Priya R.', age: '3h'},
            {id: 'keys', title: 'Rotate signing keys for Harbor Coffee', actor: 'Tom A.', age: '6h'},
            {id: 'email', title: 'Trim onboarding email sequence', actor: 'Elena M.', age: '1d'},
        ],
        listStrategy: {kind: 'pane-scroll', expectedMaximum: 46},
    },
    commerce: {
        announcement: 'Free shipping on orders over $60',
        brand: 'Harbor Coffee',
        navItems: ['Brewing', 'Beans', 'Subscriptions', 'Gifting', 'Journal'],
        labels: {
            menu: 'Open menu',
            search: 'Search',
            account: 'Account',
            wishlist: 'Wishlist, 3 saved',
            cart: 'Cart, 3 items',
        },
        cartCount: 3,
        products: [
            {id: 'grinder', name: 'Meridian grinder', price: 'From $32'},
            {id: 'blend', name: 'Harbor blend', price: 'From $32'},
            {id: 'pour-over', name: 'Pour-over set', price: 'From $32'},
        ],
        productStrategy: {kind: 'content-grown', expectedMaximum: 3},
    },
    docs: {
        brand: 'Meridian',
        version: 'v4.2',
        navItems: ['Docs', 'Reference', 'Guides', 'Changelog'],
        labels: {
            openNavigation: 'Open navigation',
            switchTheme: 'Switch to light theme',
            sourceRepository: 'Source repository',
            search: 'Search docs',
            searchShortcut: '/',
            latest: 'latest',
            documentMeta: (_brand, version, latest) => `Docs · ${version} (${latest})`,
            nextMarker: '›',
        },
        sidebar: [
            {group: 'GETTING STARTED', items: ['Installation', 'Project structure', 'First request']},
            {group: 'CORE CONCEPTS', items: ['Routing', 'Data loading', 'Caching', 'Streaming']},
            {group: 'DEPLOYMENT', items: ['Runtimes', 'Edge regions', 'Observability']},
        ],
        sidebarStrategy: {kind: 'pane-scroll', expectedMaximum: 16},
        title: 'Data loading',
        description: 'Loaders run on the server before a route renders. They can stream partial results, revalidate on a schedule, and share a cache with every nested segment on the same request.',
        links: ['Reading from a loader', 'Revalidation', 'Streaming'],
        linkStrategy: {kind: 'content-grown', expectedMaximum: 3},
    },
    document: {
        title: 'Q3 pricing experiment',
        labels: {
            back: 'Back to documents',
            versionHistory: 'Version history',
            share: 'Share',
            actions: 'Document actions',
            saved: 'Saved',
        },
        avatars: ['NV', 'MS', 'PR'],
        description: 'We are testing a usage-weighted tier against the current seat price for accounts above 40 seats. The goal is to hold net revenue flat while removing the seat ceiling that blocks expansion in the mid-market segment.',
        outline: [
            {id: 'hypothesis', label: 'Hypothesis and success metric'},
            {id: 'segment', label: 'Segment definition'},
            {id: 'rollout', label: 'Rollout plan'},
        ],
        outlineStrategy: {kind: 'content-grown', expectedMaximum: 3},
    },
    landingCentered: {
        brand: 'Halcyon',
        brandMark: 'H',
        navItems: ['Product', 'Customers', 'Pricing', 'Docs'],
        labels: {
            signIn: 'Sign in',
            primaryAction: 'Get started',
            menu: 'Open menu',
            eyebrow: 'PRODUCT',
        },
        title: 'One workspace for the whole release',
        description: 'Plan, review and ship from a single timeline. Every change carries its own context, so nobody has to reconstruct the story later.',
        placeholderCount: 2,
    },
    portfolio: {
        brand: 'ALDER',
        leftNav: ['Work', 'Studio', 'Journal'],
        rightNav: ['Services', 'Careers', 'Contact'],
        labels: {menu: 'Open menu', eyebrow: 'WORK'},
        title: 'A studio for careful, long-lived work.',
        projects: [
            {id: 'harbor', name: 'Harbor Coffee', detail: 'Brand identity', year: '2024'},
            {id: 'meridian', name: 'Meridian', detail: 'Product design', year: '2024'},
            {id: 'cedar', name: 'Cedar Labs', detail: 'Site and motion', year: '2023'},
            {id: 'northwind', name: 'Northwind', detail: 'Design system', year: '2023'},
        ],
        projectStrategy: {kind: 'content-grown', expectedMaximum: 4},
    },
    article: {
        title: 'Error budgets that actually change behaviour',
        authorMeta: 'Priya Raman · 9 min read',
        labels: {
            back: 'Back to journal',
            contents: 'Contents',
            bookmark: 'Bookmark article',
            copyLink: 'Copy link',
            share: 'Share article',
        },
        description: 'Most teams publish an objective, watch the number, and change nothing when it slips. A budget is only useful if spending it is expensive.',
        sections: [
            {id: 'scheduling', title: 'Error budgets are a scheduling tool', body: 'A budget only changes behaviour if it is allowed to run out. When it does, the team stops shipping features and spends the week on reliability instead. That trade has to be agreed before the incident, not during it.', placeholder: true},
            {id: 'window', title: 'Pick the window before the target', body: 'A thirty-day rolling window forgives a bad Tuesday by the end of the month. A calendar quarter does not. Choose the window that matches how the team plans, then set a target you are willing to defend in a review.', placeholder: false},
            {id: 'burn', title: 'Alert on burn rate, not on breach', body: 'By the time the objective is breached the conversation is already about blame. Multi-window burn-rate alerts fire while there is still budget left to spend, which keeps the response technical.', placeholder: false},
            {id: 'review', title: 'Review the objective, not just the misses', body: 'If an objective has never been close to breaching in a year, it is measuring something nobody depends on. Retire it and write one that would actually change a decision.', placeholder: false},
        ],
        sectionStrategy: {kind: 'content-grown', expectedMaximum: 4},
    },
}

function requiredFixture<T>(value: T | undefined): T {
    if (!value) throw new Error('Expected navbar fixture')
    return value
}

const baseTaskList = requiredFixture(HBAR_APP_UI_NAVBAR_FIXTURES.taskList)
const baseFilterList = requiredFixture(HBAR_APP_UI_NAVBAR_FIXTURES.filterList)
const baseDocs = requiredFixture(HBAR_APP_UI_NAVBAR_FIXTURES.docs)

/** Exercises each pane-owned scroll path without bundling demo rows in the package. */
export function createHbarAppUiNavbarOverflowFixtures(): HbarAppUiNavbarContent {
    return {
        ...HBAR_APP_UI_NAVBAR_FIXTURES,
        taskList: {
            ...baseTaskList,
            rows: Array.from({length: 64}, (_, index) => {
                const source = baseTaskList.rows[index % baseTaskList.rows.length]
                if (!source) throw new Error('Expected task row source')
                return {...source, id: `overflow-task-${index}`, title: `${source.title} ${index}`}
            }),
        },
        filterList: {
            ...baseFilterList,
            items: Array.from({length: 64}, (_, index) => {
                const source = baseFilterList.items[index % baseFilterList.items.length]
                if (!source) throw new Error('Expected filter item source')
                return {...source, id: `overflow-filter-${index}`, title: `${source.title} ${index}`}
            }),
        },
        docs: {
            ...baseDocs,
            sidebar: Array.from({length: 14}, (_, index) => {
                const source = baseDocs.sidebar[index % baseDocs.sidebar.length]
                if (!source) throw new Error('Expected sidebar group source')
                return {...source, group: `${source.group} ${index}`}
            }),
        },
    }
}

/** Deliberately long non-default locale labels validate responsive host i18n. */
export function createHbarAppUiNavbarLocalizedFixtures(): HbarAppUiNavbarContent {
    const landing = requiredFixture(HBAR_APP_UI_NAVBAR_FIXTURES.landingPrimary)
    const filterList = requiredFixture(HBAR_APP_UI_NAVBAR_FIXTURES.filterList)
    return {
        ...HBAR_APP_UI_NAVBAR_FIXTURES,
        landingPrimary: {
            ...landing,
            labels: {
                ...landing.labels,
                signIn: 'Bei einem vorhandenen Arbeitsbereich anmelden',
                primaryAction: 'Kostenlosen Arbeitsbereich jetzt erstellen',
                menu: 'Vollstaendiges Navigationsmenue oeffnen',
                eyebrow: 'VEROEFFENTLICHUNGEN MIT VERTRAUEN AUSLIEFERN',
            },
            title: 'Ein gemeinsamer Arbeitsbereich fuer den gesamten Veroeffentlichungsprozess',
            description: 'Planen Sie die Arbeit, fuehren Sie Automatisierungen aus und verfolgen Sie die Auslieferung ohne mehrere Werkzeuge miteinander zu verbinden.',
        },
        filterList: {
            ...filterList,
            labels: {
                ...filterList.labels,
                moreViews: 'Weitere gespeicherte Ansichten anzeigen',
                filter: 'Erweiterte Filtereinstellungen',
                display: 'Darstellungsoptionen',
                export: 'Aktuelle gefilterte Ergebnisse exportieren',
                itemCount: (count, state) => `${count} Eintraege im Status ${state}`,
            },
        },
    }
}
