import * as React from 'react'

/**
 * Navbar collections are deliberately small, UI-owned lists.  The contract
 * makes the overflow decision explicit so a host cannot accidentally hide a
 * growing list behind a fixed screenshot-sized box.  A pane-scroll list is
 * used where the reference keeps the toolbar fixed; content-grown is used for
 * boards, cards and document sections.  None of the reference navbars has an
 * unbounded stream, so virtualization is intentionally not exposed here.
 */
export type LumenNavbarListStrategy =
  | { readonly kind: 'content-grown'; readonly expectedMaximum: number }
  | { readonly kind: 'pane-scroll'; readonly expectedMaximum: number }

export function uniqueLumenNavbarItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id.trim() || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

export function selectLumenNavbarItem<
  T extends {
    readonly id: string
  },
>(items: readonly T[], selectedId: string): T | undefined {
  const validItems = uniqueLumenNavbarItems(items)
  return validItems.find((item) => item.id === selectedId) ?? validItems[0]
}

export interface LumenNavbarChoice {
  readonly id: string
  readonly label: string
}

export interface LumenNavbarNavigation {
  readonly label: string
  readonly close: string
  readonly title: string
}

export interface LumenNavbarPopup {
  readonly label: string
  readonly selectionId?: string | undefined
  readonly search?:
    | {
        readonly label: string
        readonly query: string
        readonly empty: string
        readonly onChange: (value: string) => void
      }
    | undefined
  readonly groups?:
    | readonly {
        readonly id: string
        readonly label: string
        readonly itemIds: readonly string[]
      }[]
    | undefined
  readonly footer?: { readonly text: string; readonly action: LumenNavbarChoice } | undefined
  readonly items: readonly {
    readonly id: string
    readonly label: string
    readonly description?: string | undefined
  }[]
}

export interface LumenNavbarActionLabelSet {
  readonly searchLabel: string
  readonly helpLabel: string
  readonly settingsLabel: string
  readonly accountLabel: string
}

export interface LumenNavbarProjectColumn {
  readonly id: string
  readonly label: string
  readonly cards: readonly string[]
}

export interface LumenNavbarProjectBoardContent {
  readonly starred?:
    | {
        readonly value: boolean
        readonly label: string
        readonly onChange: (value: boolean) => void
      }
    | undefined
  readonly tabColumns?:
    | readonly {
        readonly tabId: LumenNavbarProjectBoardContent['initialTab']
        readonly columns: readonly LumenNavbarProjectColumn[]
      }[]
    | undefined
  readonly selection?:
    | {
        readonly tabId: LumenNavbarProjectBoardContent['initialTab']
        readonly onTabChange: (id: LumenNavbarProjectBoardContent['initialTab']) => void
      }
    | undefined
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
  readonly columns: readonly LumenNavbarProjectColumn[]
  readonly listStrategy: LumenNavbarListStrategy
  readonly initialTab: 'discussion' | 'tasks' | 'timeline' | 'files' | 'overview'
}

export interface LumenNavbarTaskRow {
  readonly id: string
  readonly title: string
  readonly sprint: string
  readonly owner: string
}

export interface LumenNavbarTaskListContent {
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
    readonly inviteTitle?: string | undefined
    readonly emptyMenu?: string | undefined
  }
  readonly members?:
    | readonly {
        readonly id: string
        readonly name: string
        readonly detail: string
      }[]
    | undefined
  readonly filterOptions?: readonly { readonly id: string; readonly label: string }[] | undefined
  readonly sortOptions?: readonly { readonly id: string; readonly label: string }[] | undefined
  readonly moreActions?: readonly { readonly id: string; readonly label: string }[] | undefined
  readonly rows: readonly LumenNavbarTaskRow[]
  readonly listStrategy: LumenNavbarListStrategy
}

export interface LumenNavbarDeploymentStat {
  readonly label: string
  readonly value: string
}

export interface LumenNavbarDeploymentContent {
  readonly summaryLabel?: ((workspace: string, environment: string) => string) | undefined
  readonly workspaceMenu?: LumenNavbarPopup | undefined
  readonly projectMenu?: LumenNavbarPopup | undefined
  readonly environmentMenu?: LumenNavbarPopup | undefined
  readonly workspace: string
  readonly workspaceInitial: string
  readonly accountInitial: string
  readonly project: string
  readonly environment: string
  readonly actions: LumenNavbarActionLabelSet & {
    readonly upgrade: string
    readonly breadcrumbSeparator: string
    readonly projectSearch?: string | undefined
    readonly projectEmpty?: string | undefined
    readonly selectorOpen?: string | undefined
    readonly selectorLoading?: string | undefined
  }
  readonly initialWorkspaceId?: string | undefined
  readonly initialProjectId?: string | undefined
  readonly initialEnvironmentId?: string | undefined
  readonly workspaceOptions?: readonly {
    readonly id: string
    readonly label: string
    readonly detail?: string | undefined
  }[]
  readonly projectOptions?: readonly {
    readonly id: string
    readonly label: string
    readonly detail?: string | undefined
  }[]
  readonly environmentOptions?: readonly {
    readonly id: string
    readonly label: string
    readonly detail?: string | undefined
  }[]
  readonly deploymentLabel: string
  readonly deploymentSummary: string
  readonly stats: readonly LumenNavbarDeploymentStat[]
  readonly statsStrategy: LumenNavbarListStrategy
}

export interface LumenNavbarLandingContent {
  readonly navigation?: LumenNavbarNavigation | undefined
  readonly dropdowns?: readonly (LumenNavbarPopup & { readonly id: string })[] | undefined
  readonly brand: string
  readonly brandMark: string
  readonly navItems: readonly string[]
  readonly labels: {
    readonly signIn: string
    readonly primaryAction: string
    readonly menu: string
    readonly menuTitle?: string | undefined
    readonly closeMenu?: string | undefined
    readonly footerAction?: string | undefined
    readonly eyebrow?: string | undefined
  }
  readonly menuPanels?:
    | readonly {
        readonly id: string
        readonly trigger: string
        readonly groups: readonly {
          readonly id: string
          readonly title: string
          readonly links: readonly {
            readonly id: string
            readonly label: string
            readonly detail: string
          }[]
        }[]
      }[]
    | undefined
  readonly title: string
  readonly description: string
  readonly stats?: readonly LumenNavbarDeploymentStat[] | undefined
  readonly statsStrategy?: LumenNavbarListStrategy | undefined
  readonly placeholderCount: number
}

export interface LumenNavbarActivityItem {
  readonly id: string
  readonly actor: string
  readonly message: string
  readonly age: string
}

export interface LumenNavbarActivityContent {
  readonly search?:
    | {
        readonly query: string
        readonly onQueryChange: (query: string) => void
        readonly resultsLabel: string
        readonly empty: (query: string) => string
        readonly results: readonly LumenNavbarChoice[]
        readonly onResult: (id: string) => void
        readonly closeLabel: string
      }
    | undefined
  readonly brand: string
  readonly brandInitial: string
  readonly labels: LumenNavbarActionLabelSet & {
    readonly searchPlaceholder: string
    readonly openSearch: string
    readonly newItem: string
    readonly notifications: string
    readonly today: string
    readonly shortcut: string
    readonly accountInitial: string
    readonly notificationsTitle?: string | undefined
    readonly accountMenu?: string | undefined
    readonly signOut?: string | undefined
    readonly emptyMenu?: string | undefined
  }
  readonly items: readonly LumenNavbarActivityItem[]
  readonly listStrategy: LumenNavbarListStrategy
}

export interface LumenNavbarMetric {
  readonly label: string
  readonly value: string
  readonly detail: string
}

export interface LumenNavbarAnalyticsContent {
  readonly sections?:
    | readonly {
        readonly primaryId: string
        readonly secondaryOptions: readonly LumenNavbarChoice[]
        readonly initialSecondaryId: string
        readonly metrics: readonly LumenNavbarMetric[]
      }[]
    | undefined
  readonly primaryOptions?: readonly LumenNavbarChoice[] | undefined
  readonly secondaryOptions?: readonly LumenNavbarChoice[] | undefined
  readonly selection?:
    | {
        readonly primaryId?: string | undefined
        readonly secondaryId?: string | undefined
        readonly onPrimaryChange: (id: string) => void
        readonly onSecondaryChange: (id: string) => void
      }
    | undefined
  readonly workspace: string
  readonly workspaceInitial: string
  readonly workspaceLabel: string
  readonly initials: string
  readonly labels: LumenNavbarActionLabelSet
  readonly primaryTabs: readonly string[]
  readonly secondaryTabs: readonly string[]
  readonly activePrimaryTab: string
  readonly activeSecondaryTab: string
  readonly metrics: readonly LumenNavbarMetric[]
  readonly metricsStrategy: LumenNavbarListStrategy
  readonly feedbackLabel: string
  readonly titleLabel: (primary: string, secondary: string) => string
}

export interface LumenNavbarFilterItem {
  readonly id: string
  readonly title: string
  readonly actor: string
  readonly age: string
}

export interface LumenNavbarFilterContent {
  readonly selection?:
    | {
        readonly filterId?: string | undefined
        readonly onFilterChange: (id: string) => void
      }
    | undefined
  readonly filters: readonly {
    readonly id: string
    readonly label: string
    readonly count: number
  }[]
  readonly labels: {
    readonly moreViews: string
    readonly filter: string
    readonly display: string
    readonly export: string
    readonly itemCount: (count: number, state: string) => string
  }
  readonly activeFilter: string
  readonly itemCount: number
  readonly items: readonly LumenNavbarFilterItem[]
  readonly listStrategy: LumenNavbarListStrategy
}

export interface LumenNavbarProduct {
  readonly id: string
  readonly name: string
  readonly price: string
}

export interface LumenNavbarCommerceContent {
  /** Compatibility count for hosts that own the cart outside this surface. */
  readonly cartCount?: string | number | undefined
  readonly navigation?: LumenNavbarNavigation | undefined
  readonly dropdowns?: readonly (LumenNavbarPopup & { readonly id: string })[] | undefined
  readonly announcement: string
  readonly brand: string
  readonly navItems: readonly string[]
  readonly labels: {
    readonly menu: string
    readonly search: string
    readonly account: string
    readonly wishlist: string
    readonly cart: string
    readonly megaMenu?: string | undefined
    readonly searchTitle?: string | undefined
    readonly searchPlaceholder?: string | undefined
    readonly noSearchResults?: string | undefined
    readonly wishlistTitle?: string | undefined
    readonly wishlistEmpty?: string | undefined
    readonly cartTitle?: string | undefined
    readonly emptyCart?: string | undefined
    readonly subtotal?: string | undefined
    readonly checkout?: string | undefined
    readonly closeMenu?: string | undefined
    readonly mobileMenuTitle?: string | undefined
    readonly decreaseQuantity?: ((name: string) => string) | undefined
    readonly increaseQuantity?: ((name: string) => string) | undefined
    readonly itemCount?: ((count: number) => string) | undefined
  }
  readonly megaPanels?:
    | readonly {
        readonly id: string
        readonly trigger: string
        readonly groups: readonly {
          readonly id: string
          readonly title: string
          readonly items: readonly { readonly id: string; readonly label: string }[]
        }[]
      }[]
    | undefined
  readonly wishlistIds?: readonly string[] | undefined
  readonly cartItems?: readonly LumenNavbarCommerceCartItem[] | undefined
  readonly formatPrice?: ((amount: number) => string) | undefined
  readonly products: readonly LumenNavbarProduct[]
  readonly productStrategy: LumenNavbarListStrategy
}

export interface LumenNavbarDocsContent {
  readonly navigation?: { readonly label: string; readonly close: string; readonly title: string } | undefined
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
    readonly versionMenu?: string | undefined
    readonly searchTitle?: string | undefined
    readonly closeSearch?: string | undefined
    readonly searchPlaceholder?: string | undefined
    readonly searchEmpty?: string | undefined
    readonly mobileNavigation?: string | undefined
    readonly closeNavigation?: string | undefined
    readonly lightTheme?: string | undefined
    readonly darkTheme?: string | undefined
    readonly emptyMenu?: string | undefined
  }
  readonly versions?: readonly { readonly id: string; readonly label: string }[] | undefined
  readonly searchItems?:
    | readonly {
        readonly id: string
        readonly label: string
        readonly detail: string
      }[]
    | undefined
  readonly sidebar: readonly { readonly group: string; readonly items: readonly string[] }[]
  readonly sidebarStrategy: LumenNavbarListStrategy
  readonly title: string
  readonly description: string
  readonly links: readonly string[]
  readonly linkStrategy: LumenNavbarListStrategy
}

export interface LumenNavbarDocumentContent {
  readonly title: string
  readonly labels: {
    readonly back: string
    readonly versionHistory: string
    readonly share: string
    readonly actions: string
    readonly saved: string
    readonly unsaved?: string
    readonly titleInput?: string
    readonly shareTitle?: string
    readonly shareDescription?: string
    readonly shareLink?: string
    readonly copy?: string
    readonly copied?: string
    readonly historyTitle?: string
    readonly actionsMenu?: string
    readonly emptyMenu?: string
  }
  readonly avatars: readonly string[]
  readonly shareUrl?: string
  readonly history?: readonly {
    readonly id: string
    readonly label: string
    readonly detail: string
  }[]
  readonly actions?: readonly { readonly id: string; readonly label: string }[]
  readonly description: string
  readonly outline: readonly { readonly id: string; readonly label: string }[]
  readonly outlineStrategy: LumenNavbarListStrategy
}

export interface LumenNavbarPortfolioContent {
  readonly navigation?: LumenNavbarNavigation | undefined
  readonly brand: string
  readonly leftNav: readonly string[]
  readonly rightNav: readonly string[]
  readonly labels: {
    readonly menu: string
    readonly closeMenu?: string | undefined
    readonly overlayTitle?: string | undefined
    readonly overlayDescription?: string | undefined
    readonly eyebrow: string
  }
  readonly title: string
  readonly projects: readonly {
    readonly id: string
    readonly name: string
    readonly detail: string
    readonly year: string
  }[]
  readonly projectStrategy: LumenNavbarListStrategy
}

export interface LumenNavbarArticleContent {
  readonly bookmarked?:
    | {
        readonly value: boolean
        readonly label: string
        readonly onChange: (value: boolean) => void
      }
    | undefined
  readonly title: string
  readonly authorMeta: string
  readonly labels: {
    readonly back: string
    readonly contents: string
    readonly closeContents?: string | undefined
    readonly bookmark: string
    readonly copyLink: string
    readonly share: string
  }
  readonly description: string
  readonly sections: readonly {
    readonly id: string
    readonly title: string
    readonly body: string
    readonly placeholder: boolean
  }[]
  readonly sectionStrategy: LumenNavbarListStrategy
}

export interface LumenNavbarContent {
  readonly onAction?: ((event: { readonly actionId: string; readonly value?: string | undefined }) => void) | undefined
  readonly presentation?:
    | {
        readonly ownerId: string
        readonly notice?: string | undefined
      }
    | undefined
  readonly projectBoard?: LumenNavbarProjectBoardContent | undefined
  readonly taskList?: LumenNavbarTaskListContent | undefined
  readonly deployment?: LumenNavbarDeploymentContent | undefined
  readonly landingPrimary?: LumenNavbarLandingContent | undefined
  readonly landingSecondary?: LumenNavbarLandingContent | undefined
  readonly activity?: LumenNavbarActivityContent | undefined
  readonly analytics?: LumenNavbarAnalyticsContent | undefined
  readonly filterList?: LumenNavbarFilterContent | undefined
  readonly commerce?: LumenNavbarCommerceContent | undefined
  readonly docs?: LumenNavbarDocsContent | undefined
  readonly document?: LumenNavbarDocumentContent | undefined
  readonly landingCentered?: LumenNavbarLandingContent | undefined
  readonly portfolio?: LumenNavbarPortfolioContent | undefined
  readonly article?: LumenNavbarArticleContent | undefined
}

export interface LumenNavbarProviderProps {
  readonly content: LumenNavbarContent
  readonly children: React.ReactNode
}

const navbarContentContext = React.createContext<LumenNavbarContent | undefined>(undefined)

export function LumenNavbarProvider({ content, children }: LumenNavbarProviderProps) {
  return <navbarContentContext.Provider value={content}>{children}</navbarContentContext.Provider>
}

export function useLumenNavbarContent(): LumenNavbarContent | undefined {
  return React.useContext(navbarContentContext)
}
;('use client')

export interface LumenNavbarCommerceCartItem extends LumenNavbarProduct {
  readonly unitPrice: number
  readonly initialQuantity: number
}
