import {createContext, useContext, type ReactNode} from 'react'

/**
 * Navbar collections are deliberately small, UI-owned lists.  The contract
 * makes the overflow decision explicit so a host cannot accidentally hide a
 * growing list behind a fixed screenshot-sized box.  A pane-scroll list is
 * used where the reference keeps the toolbar fixed; content-grown is used for
 * boards, cards and document sections.  None of the reference navbars has an
 * unbounded stream, so virtualization is intentionally not exposed here.
 */
export type HbarAppUiNavbarListStrategy =
    | {readonly kind: 'content-grown'; readonly expectedMaximum: number}
    | {readonly kind: 'pane-scroll'; readonly expectedMaximum: number}

export function uniqueHbarAppUiNavbarItems<T extends {readonly id: string}>(items: readonly T[]): readonly T[] {
    const seen = new Set<string>()
    return items.filter((item) => {
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
    })
}

export function selectHbarAppUiNavbarItem<T extends {readonly id: string}>(items: readonly T[], selectedId: string): T | undefined {
    return items.find((item) => item.id === selectedId) ?? items[0]
}

export interface HbarAppUiNavbarActionLabelSet {
    readonly searchLabel: string
    readonly helpLabel: string
    readonly settingsLabel: string
    readonly accountLabel: string
}

export interface HbarAppUiNavbarProjectColumn {
    readonly id: string
    readonly label: string
    readonly cards: readonly string[]
}

export interface HbarAppUiNavbarProjectBoardContent {
    readonly title: string
    readonly breadcrumbs: readonly string[]
    readonly labels: {
        readonly searchProject: string
        readonly starProject: string
        readonly moreActions: string
        readonly discussion: string
        readonly tasks: string
        readonly timeline: string
        readonly files: string
        readonly overview: string
        readonly invitePeople: string
    }
    readonly discussionCount: number
    readonly avatars: readonly string[]
    readonly extraAvatarLabel: string
    readonly columns: readonly HbarAppUiNavbarProjectColumn[]
    readonly listStrategy: HbarAppUiNavbarListStrategy
    readonly initialTab: 'discussion' | 'tasks' | 'timeline' | 'files' | 'overview'
}

export interface HbarAppUiNavbarTaskRow {
    readonly id: string
    readonly title: string
    readonly sprint: string
    readonly owner: string
}

export interface HbarAppUiNavbarTaskListContent {
    readonly breadcrumbs: readonly string[]
    readonly avatars: readonly string[]
    readonly extraAvatarLabel: string
    readonly labels: {
        readonly invite: string
        readonly filter: string
        readonly sort: string
        readonly more: string
        readonly sortedBy: string
        readonly metadataSeparator: string
        readonly breadcrumbLabel: (items: readonly string[]) => string
    }
    readonly rows: readonly HbarAppUiNavbarTaskRow[]
    readonly listStrategy: HbarAppUiNavbarListStrategy
}

export interface HbarAppUiNavbarDeploymentStat {
    readonly label: string
    readonly value: string
}

export interface HbarAppUiNavbarDeploymentContent {
    readonly workspace: string
    readonly workspaceInitial: string
    readonly accountInitial: string
    readonly project: string
    readonly environment: string
    readonly actions: HbarAppUiNavbarActionLabelSet & {
        readonly upgrade: string
        readonly breadcrumbSeparator: string
    }
    readonly deploymentLabel: string
    readonly deploymentSummary: string
    readonly stats: readonly HbarAppUiNavbarDeploymentStat[]
    readonly statsStrategy: HbarAppUiNavbarListStrategy
}

export interface HbarAppUiNavbarLandingContent {
    readonly brand: string
    readonly brandMark: string
    readonly navItems: readonly string[]
    readonly labels: {
        readonly signIn: string
        readonly primaryAction: string
        readonly menu: string
        readonly eyebrow?: string
    }
    readonly title: string
    readonly description: string
    readonly stats?: readonly HbarAppUiNavbarDeploymentStat[]
    readonly statsStrategy?: HbarAppUiNavbarListStrategy
    readonly placeholderCount: number
}

export interface HbarAppUiNavbarActivityItem {
    readonly id: string
    readonly actor: string
    readonly message: string
    readonly age: string
}

export interface HbarAppUiNavbarActivityContent {
    readonly brand: string
    readonly brandInitial: string
    readonly labels: HbarAppUiNavbarActionLabelSet & {
        readonly searchPlaceholder: string
        readonly openSearch: string
        readonly newItem: string
        readonly notifications: string
        readonly today: string
        readonly shortcut: string
        readonly accountInitial: string
    }
    readonly items: readonly HbarAppUiNavbarActivityItem[]
    readonly listStrategy: HbarAppUiNavbarListStrategy
}

export interface HbarAppUiNavbarMetric {
    readonly label: string
    readonly value: string
    readonly detail: string
}

export interface HbarAppUiNavbarAnalyticsContent {
    readonly workspace: string
    readonly workspaceInitial: string
    readonly workspaceLabel: string
    readonly initials: string
    readonly labels: HbarAppUiNavbarActionLabelSet
    readonly primaryTabs: readonly string[]
    readonly secondaryTabs: readonly string[]
    readonly activePrimaryTab: string
    readonly activeSecondaryTab: string
    readonly metrics: readonly HbarAppUiNavbarMetric[]
    readonly metricsStrategy: HbarAppUiNavbarListStrategy
    readonly feedbackLabel: string
    readonly titleLabel: (primary: string, secondary: string) => string
}

export interface HbarAppUiNavbarFilterItem {
    readonly id: string
    readonly title: string
    readonly actor: string
    readonly age: string
}

export interface HbarAppUiNavbarFilterContent {
    readonly filters: readonly {readonly id: string; readonly label: string; readonly count: number}[]
    readonly labels: {
        readonly moreViews: string
        readonly filter: string
        readonly display: string
        readonly export: string
        readonly itemCount: (count: number, state: string) => string
    }
    readonly activeFilter: string
    readonly itemCount: number
    readonly items: readonly HbarAppUiNavbarFilterItem[]
    readonly listStrategy: HbarAppUiNavbarListStrategy
}

export interface HbarAppUiNavbarProduct {
    readonly id: string
    readonly name: string
    readonly price: string
}

export interface HbarAppUiNavbarCommerceContent {
    readonly announcement: string
    readonly brand: string
    readonly navItems: readonly string[]
    readonly labels: {
        readonly menu: string
        readonly search: string
        readonly account: string
        readonly wishlist: string
        readonly cart: string
    }
    readonly cartCount: number
    readonly products: readonly HbarAppUiNavbarProduct[]
    readonly productStrategy: HbarAppUiNavbarListStrategy
}

export interface HbarAppUiNavbarDocsContent {
    readonly brand: string
    readonly version: string
    readonly navItems: readonly string[]
    readonly labels: {
        readonly openNavigation: string
        readonly switchTheme: string
        readonly sourceRepository: string
        readonly search: string
        readonly searchShortcut: string
        readonly latest: string
        readonly documentMeta: (brand: string, version: string, latest: string) => string
        readonly nextMarker: string
    }
    readonly sidebar: readonly {readonly group: string; readonly items: readonly string[]}[]
    readonly sidebarStrategy: HbarAppUiNavbarListStrategy
    readonly title: string
    readonly description: string
    readonly links: readonly string[]
    readonly linkStrategy: HbarAppUiNavbarListStrategy
}

export interface HbarAppUiNavbarDocumentContent {
    readonly title: string
    readonly labels: {
        readonly back: string
        readonly versionHistory: string
        readonly share: string
        readonly actions: string
        readonly saved: string
    }
    readonly avatars: readonly string[]
    readonly description: string
    readonly outline: readonly {readonly id: string; readonly label: string}[]
    readonly outlineStrategy: HbarAppUiNavbarListStrategy
}

export interface HbarAppUiNavbarPortfolioContent {
    readonly brand: string
    readonly leftNav: readonly string[]
    readonly rightNav: readonly string[]
    readonly labels: {readonly menu: string; readonly eyebrow: string}
    readonly title: string
    readonly projects: readonly {readonly id: string; readonly name: string; readonly detail: string; readonly year: string}[]
    readonly projectStrategy: HbarAppUiNavbarListStrategy
}

export interface HbarAppUiNavbarArticleContent {
    readonly title: string
    readonly authorMeta: string
    readonly labels: {
        readonly back: string
        readonly contents: string
        readonly bookmark: string
        readonly copyLink: string
        readonly share: string
    }
    readonly description: string
    readonly sections: readonly {readonly id: string; readonly title: string; readonly body: string; readonly placeholder: boolean}[]
    readonly sectionStrategy: HbarAppUiNavbarListStrategy
}

export interface HbarAppUiNavbarContent {
    readonly projectBoard?: HbarAppUiNavbarProjectBoardContent | undefined
    readonly taskList?: HbarAppUiNavbarTaskListContent | undefined
    readonly deployment?: HbarAppUiNavbarDeploymentContent | undefined
    readonly landingPrimary?: HbarAppUiNavbarLandingContent | undefined
    readonly landingSecondary?: HbarAppUiNavbarLandingContent | undefined
    readonly activity?: HbarAppUiNavbarActivityContent | undefined
    readonly analytics?: HbarAppUiNavbarAnalyticsContent | undefined
    readonly filterList?: HbarAppUiNavbarFilterContent | undefined
    readonly commerce?: HbarAppUiNavbarCommerceContent | undefined
    readonly docs?: HbarAppUiNavbarDocsContent | undefined
    readonly document?: HbarAppUiNavbarDocumentContent | undefined
    readonly landingCentered?: HbarAppUiNavbarLandingContent | undefined
    readonly portfolio?: HbarAppUiNavbarPortfolioContent | undefined
    readonly article?: HbarAppUiNavbarArticleContent | undefined
}

export interface HbarAppUiNavbarProviderProps {
    readonly content: HbarAppUiNavbarContent
    readonly children: ReactNode
}

const navbarContentContext = createContext<HbarAppUiNavbarContent | undefined>(undefined)

export function HbarAppUiNavbarProvider({content, children}: HbarAppUiNavbarProviderProps) {
    return <navbarContentContext.Provider value={content}>{children}</navbarContentContext.Provider>
}

export function useHbarAppUiNavbarContent(): HbarAppUiNavbarContent | undefined {
    return useContext(navbarContentContext)
}
