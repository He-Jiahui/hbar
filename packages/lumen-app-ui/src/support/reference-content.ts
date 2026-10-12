export interface LumenSupportHelpReferenceLayout {
  readonly labels: { readonly searchPlaceholder: string }
  readonly topicIcons: readonly {
    readonly topicId: string
    readonly kind: 'accounts' | 'billing' | 'integrations' | 'reports'
  }[]
}

export interface LumenSupportHelpReferenceFlow {
  readonly query: string
  readonly onQueryChange: (query: string) => void
}

export interface LumenSupportAssistantReferenceLayout {
  readonly conversationId: string
  readonly initialOpen: boolean
  readonly labels: { readonly inputLabel: string }
}

export interface LumenSupportAssistantReferenceFlow {
  readonly open: boolean
  readonly draft: string
  readonly pending: boolean
  readonly limitReached?: boolean | undefined
  readonly error: string | null
  readonly feedback: string | null
  readonly onOpenChange: (open: boolean) => void
  readonly onDraftChange: (draft: string) => void
  readonly onSubmit: () => void
}

export interface LumenSupportRequestsReferenceLayout {
  readonly openFilterId: string
  readonly waitingStatusIds: readonly string[]
  readonly labels: {
    readonly searchPlaceholder: string
    readonly summary: (openCount: number, waitingCount: number) => string
  }
}

export interface LumenSupportRequestsReferenceFlow {
  readonly query: string
  readonly statusId: string | null
  readonly onQueryChange: (query: string) => void
  readonly onStatusChange: (statusId: string) => void
}
