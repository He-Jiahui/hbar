export interface ProviderListViewItem {
  readonly providerId: string
  readonly name: string
  readonly protocol: string
  readonly primaryModelName: string
  readonly modelCount: number
  readonly hidden: boolean
  readonly hasKey: boolean
  /** True only when the provider and its configured primary model are visible. */
  readonly defaultTargetVisible: boolean
}

export interface ProviderListViewGlobalDefault {
  readonly status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'
  readonly modelSelectionId: string | null
  readonly providerId: string | null
  readonly modelId: string | null
  readonly modelName: string | null
  readonly selectable: boolean
  readonly error: string | null
}

export interface ProviderListViewDefaultAction {
  readonly status: 'idle' | 'submitting' | 'succeeded' | 'failed' | 'unknown'
  readonly providerId: string | null
  readonly modelSelectionId: string | null
  readonly error: string | null
}

export interface ProviderListRowPresentation {
  readonly isGlobalDefaultProvider: boolean
  readonly activeDefaultModelName: string | null
  readonly canSetDefault: boolean
  readonly actionIsUnknown: boolean
  readonly actionIsSubmitting: boolean
  readonly actionErrorCode: string | null
  readonly reconciliationPending: boolean
  readonly deleteDisabled: boolean
}

export function providerListRowPresentation({
  item,
  globalDefault,
  defaultAction,
  connected,
  busy,
  reconcilingProviderId,
}: {
  readonly item: ProviderListViewItem
  readonly globalDefault: ProviderListViewGlobalDefault
  readonly defaultAction: ProviderListViewDefaultAction
  readonly connected: boolean
  readonly busy: boolean
  readonly reconcilingProviderId: string | null
}): ProviderListRowPresentation {
  const isGlobalDefaultProvider = globalDefault.providerId === item.providerId
  const activeDefaultModelName = isGlobalDefaultProvider ? (globalDefault.modelName ?? globalDefault.modelId) : null
  const actionTargetsItem = defaultAction.providerId === item.providerId
  const actionIsUnknown = actionTargetsItem && defaultAction.status === 'unknown'
  const actionIsSubmitting = actionTargetsItem && defaultAction.status === 'submitting'
  const actionFailed = actionTargetsItem && defaultAction.status === 'failed'
  const reconciliationPending = reconcilingProviderId === item.providerId
  const defaultMutationBusy = defaultAction.status === 'submitting' || defaultAction.status === 'unknown'

  return {
    isGlobalDefaultProvider,
    activeDefaultModelName,
    canSetDefault:
      !isGlobalDefaultProvider &&
      item.defaultTargetVisible &&
      connected &&
      !busy &&
      !defaultMutationBusy &&
      !reconciliationPending,
    actionIsUnknown,
    actionIsSubmitting,
    actionErrorCode: actionIsUnknown
      ? (defaultAction.error ?? 'RESULT_UNKNOWN')
      : actionFailed
        ? (defaultAction.error ?? 'EXECUTION_FAILED')
        : null,
    reconciliationPending,
    deleteDisabled:
      !connected ||
      busy ||
      (actionTargetsItem && (defaultAction.status === 'submitting' || defaultAction.status === 'unknown')),
  }
}
