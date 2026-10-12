export interface LumenEmptyStateItem {
  readonly id: string
}

export interface LumenEmptyStateListStrategy {
  readonly kind: 'content-grown'
  /** Reference collections are short; hosts page unbounded data before projecting it here. */
  readonly expectedMaximum: number
}

export interface LumenEmptyStateChoice extends LumenEmptyStateItem {
  readonly title: string
  readonly description: string
  readonly meta?: string | undefined
  readonly icon: 'database' | 'upload' | 'sample' | 'clock' | 'draft' | 'inbox'
}

export interface LumenEmptyStateFirstRunContent {
  readonly labels: {
    readonly title: string
    readonly description: string
    readonly addSource: string
    readonly setupGuide: string
    readonly emptyChoices: string
  }
  readonly choices: readonly LumenEmptyStateChoice[]
  readonly listStrategy: LumenEmptyStateListStrategy
}

export interface LumenEmptyStateFilter extends LumenEmptyStateItem {
  readonly label: string
  readonly value: string
}

export interface LumenEmptyStateSuggestion extends LumenEmptyStateItem {
  readonly label: string
  readonly query: string
  readonly count: string
}

export interface LumenEmptyStateNoResultsContent {
  readonly labels: {
    readonly search: string
    readonly title: (query: string) => string
    readonly description: (filterCount: number) => string
    readonly removeFilter: (label: string) => string
    readonly clearAll: string
    readonly footer: string
    readonly emptySuggestions: string
  }
  readonly query: string
  readonly filters: readonly LumenEmptyStateFilter[]
  readonly suggestions: readonly LumenEmptyStateSuggestion[]
  readonly listStrategy: LumenEmptyStateListStrategy
  readonly onQueryChange: (query: string) => void
  readonly onRemoveFilter: (id: string) => void
  readonly onClear: () => void
  readonly onSuggestionSelect: (id: string) => void
}

export interface LumenEmptyStateMetric extends LumenEmptyStateItem {
  readonly label: string
  readonly value: string
}

export interface LumenEmptyStateCaughtUpContent {
  readonly labels: {
    readonly title: string
    readonly description: string
    readonly prompt: string
    readonly footer: string
    readonly emptyChoices: string
  }
  readonly metrics: readonly LumenEmptyStateMetric[]
  readonly choices: readonly LumenEmptyStateChoice[]
  readonly listStrategy: LumenEmptyStateListStrategy
}

export interface LumenEmptyStateDetail extends LumenEmptyStateItem {
  readonly label: string
  readonly value: string
}

export interface LumenEmptyStateLoadFailureContent {
  readonly labels: {
    readonly title: string
    readonly description: string
    readonly retry: string
    readonly retrying: string
    readonly retryUnverified: string
    readonly serviceStatus: string
    readonly footer: string
  }
  readonly details: readonly LumenEmptyStateDetail[]
  readonly listStrategy: LumenEmptyStateListStrategy
  readonly retrying: boolean
  readonly error: string | null
  readonly onRetry: () => void
}

export interface LumenEmptyStateFolderContent {
  readonly labels: {
    readonly breadcrumb: string
    readonly title: string
    readonly description: string
    readonly upload: string
    readonly importLink: string
    readonly release: string
    readonly selected: (fileCount: number) => string
    readonly footer: string
  }
  readonly breadcrumbs: readonly { readonly id: string; readonly label: string }[]
  readonly fileTypes: readonly { readonly id: string; readonly label: string }[]
  readonly accept: string
  readonly multiple: boolean
  readonly listStrategy: LumenEmptyStateListStrategy
  readonly feedback: string | null
  readonly onUpload: (files: readonly File[], origin: 'drop' | 'picker') => void
}

/** Host-owned copy, content, state and actions for the five independent reference surfaces. */
export interface LumenEmptyStateContent {
  readonly firstRun?: LumenEmptyStateFirstRunContent | undefined
  readonly noResults?: LumenEmptyStateNoResultsContent | undefined
  readonly caughtUp?: LumenEmptyStateCaughtUpContent | undefined
  readonly loadFailure?: LumenEmptyStateLoadFailureContent | undefined
  readonly folder?: LumenEmptyStateFolderContent | undefined
}

export interface LumenEmptyStateAction {
  readonly actionId: string
  readonly value?: string
}
