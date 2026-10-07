import { useMemo } from 'react'
import { RefreshCw, Plus } from 'lucide-react'
import {
  LumenActionMenu,
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenIcon,
  LumenIconButton,
  LumenStatus,
  LumenContentText,
} from '@lumen/app-ui'
import {
  providerListRowPresentation,
  type ProviderListViewDefaultAction,
  type ProviderListViewGlobalDefault,
  type ProviderListViewItem,
} from './provider-list-view-model'
import './provider-list-view.css'

export {
  type ProviderListViewDefaultAction,
  type ProviderListViewGlobalDefault,
  type ProviderListViewItem,
} from './provider-list-view-model'

/** `provider.list` caps the complete provider collection at this many entries. */
export const PROVIDER_LIST_EXPECTED_MAXIMUM = 256

export interface ProviderListViewLabels {
  readonly title: string
  readonly description: string
  readonly loading: string
  readonly error: (code: string) => string
  readonly empty: string
  readonly add: string
  readonly refresh: string
  readonly editAction: string
  readonly edit: (name: string) => string
  readonly actions: (name: string) => string
  readonly remove: (name: string) => string
  readonly protocol: (value: string) => string
  readonly primaryModel: (model: string) => string
  readonly modelCount: (count: number) => string
  readonly hidden: string
  readonly configured: string
  readonly notConfigured: string
  readonly setDefault: string
  readonly setDefaultFor: (providerName: string, modelName: string) => string
  readonly globalDefault: (modelName: string) => string
  readonly settingDefault: (providerName: string, modelName: string) => string
  readonly setDefaultError: (code: string) => string
  readonly reconcileDefault: string
  readonly reconcileDefaultFor: (providerName: string, modelName: string) => string
  readonly reconcilingDefault: (providerName: string, modelName: string) => string
}

export interface ProviderListViewProps {
  readonly labels: ProviderListViewLabels
  readonly items: readonly ProviderListViewItem[]
  readonly connected: boolean
  readonly busy: boolean
  readonly globalDefault: ProviderListViewGlobalDefault
  readonly defaultAction: ProviderListViewDefaultAction
  readonly reconcilingProviderId: string | null
  readonly onAdd: () => void
  readonly onRefresh: () => void
  readonly onSetDefault: (providerId: string) => void
  readonly onReconcileDefault: (providerId: string) => void
  readonly onEdit: (providerId: string) => void
  readonly onRemove: (providerId: string) => void
}

/**
 * The host supplies provider data and labels. The existing settings pane owns
 * scrolling for this bounded collection; this view does not load data or issue
 * commands.
 */
export function ProviderListView({
  labels,
  items,
  connected,
  busy,
  globalDefault,
  defaultAction,
  reconcilingProviderId,
  onAdd,
  onRefresh,
  onSetDefault,
  onReconcileDefault,
  onEdit,
  onRemove,
}: ProviderListViewProps) {
  const uniqueItems = useMemo(() => {
    const seen = new Set<string>()
    return items.filter((item) => {
      if (seen.has(item.providerId)) return false
      seen.add(item.providerId)
      return true
    })
  }, [items])
  const defaultMutationBusy = defaultAction.status === 'submitting' || defaultAction.status === 'unknown'
  const listBusy = busy || defaultMutationBusy || reconcilingProviderId !== null
  const missingUnknownProviderId =
    defaultAction.status === 'unknown' &&
    defaultAction.providerId !== null &&
    !uniqueItems.some((item) => item.providerId === defaultAction.providerId)
      ? defaultAction.providerId
      : null

  return (
    <LumenFrame
      as="section"
      className="hbar-provider-list-view"
      aria-label={labels.title}
      aria-busy={listBusy || undefined}
      data-testid="provider-settings-list"
    >
      <LumenFrame as="header" className="hbar-provider-list-view-header">
        <LumenFrame className="hbar-provider-list-view-heading">
          <LumenFrame className="hbar-provider-list-view-title" role="group" aria-label={labels.title} tabIndex={0}>
            <LumenContentText context="section.title">{labels.title}</LumenContentText>
          </LumenFrame>
          <LumenContentText context="section.description" tone="muted">
            {labels.description}
          </LumenContentText>
        </LumenFrame>
        <LumenFrame
          className="hbar-provider-list-view-header-actions"
          role="toolbar"
          aria-label={labels.title}
          tabIndex={0}
        >
          <LumenIconButton label={labels.refresh} disabled={!connected || listBusy} onClick={onRefresh}>
            <LumenIcon icon={RefreshCw} tier="sm" />
          </LumenIconButton>
          <LumenButton type="button" tone="primary" disabled={!connected || listBusy} onClick={onAdd}>
            <LumenIcon icon={Plus} tier="sm" />
            {labels.add}
          </LumenButton>
        </LumenFrame>
      </LumenFrame>

      {globalDefault.status === 'error' && globalDefault.error ? (
        <LumenContentText
          context="feedback.paragraph"
          className="hbar-provider-list-view-error"
          role="alert"
          tone="danger"
        >
          {labels.error(globalDefault.error)}
        </LumenContentText>
      ) : null}

      {missingUnknownProviderId !== null && (
        <LumenFrame
          key={missingUnknownProviderId}
          className="hbar-provider-list-view-missing-action"
          aria-busy={reconcilingProviderId === missingUnknownProviderId}
        >
          <LumenContentText
            context="feedback.paragraph"
            role={reconcilingProviderId === missingUnknownProviderId ? 'status' : 'alert'}
            tone={reconcilingProviderId === missingUnknownProviderId ? 'muted' : 'danger'}
          >
            {reconcilingProviderId === missingUnknownProviderId
              ? labels.loading
              : labels.setDefaultError(defaultAction.error ?? 'RESULT_UNKNOWN')}
          </LumenContentText>
          <LumenButton
            variant="outlined"
            disabled={!connected || busy || reconcilingProviderId !== null}
            onClick={() => onReconcileDefault(missingUnknownProviderId)}
          >
            {labels.reconcileDefault}
          </LumenButton>
        </LumenFrame>
      )}

      {uniqueItems.length === 0 ? (
        <LumenContentText context="empty.description" className="hbar-provider-list-view-empty" tone="muted">
          {labels.empty}
        </LumenContentText>
      ) : (
        <LumenCollection as="ol" className="hbar-provider-list-view-items" aria-label={labels.title}>
          {uniqueItems.map((item) => {
            const row = providerListRowPresentation({
              item,
              globalDefault,
              defaultAction,
              connected,
              busy: listBusy,
              reconcilingProviderId,
            })
            const actionError = row.actionErrorCode ? labels.setDefaultError(row.actionErrorCode) : null

            return (
              <LumenCollectionItem
                key={item.providerId}
                className="hbar-provider-list-view-item"
                data-testid="provider-row"
                data-provider-id={item.providerId}
                aria-label={item.name}
              >
                <LumenFrame className="hbar-provider-list-view-record" role="group" aria-label={item.name} tabIndex={0}>
                  {row.isGlobalDefaultProvider || !item.defaultTargetVisible ? (
                    <ProviderSummary
                      item={item}
                      labels={labels}
                      {...(row.isGlobalDefaultProvider && row.activeDefaultModelName
                        ? {
                            globalDefaultModelName: row.activeDefaultModelName,
                            globalDefaultSelectable: globalDefault.selectable,
                          }
                        : {})}
                    />
                  ) : (
                    <LumenButton
                      type="button"
                      variant="text"
                      className="hbar-provider-list-view-primary"
                      aria-label={labels.setDefaultFor(item.name, item.primaryModelName)}
                      data-testid="provider-default-action"
                      disabled={!row.canSetDefault}
                      onClick={() => onSetDefault(item.providerId)}
                    >
                      <ProviderSummaryCopy item={item} labels={labels} />
                      <LumenContentText context="control.label" className="hbar-provider-list-view-set-default">
                        {labels.setDefault}
                      </LumenContentText>
                    </LumenButton>
                  )}

                  <LumenFrame
                    className="hbar-provider-list-view-actions"
                    role="toolbar"
                    aria-label={item.name}
                    tabIndex={0}
                  >
                    {row.actionIsUnknown ? (
                      <LumenButton
                        type="button"
                        size="s"
                        variant="outlined"
                        className="hbar-provider-list-view-reconcile"
                        aria-label={labels.reconcileDefaultFor(item.name, item.primaryModelName)}
                        data-testid="provider-default-reconcile"
                        // Unknown writes lock out edits and a second switch, but
                        // the reconciliation action is the one permitted exit.
                        disabled={!connected || busy || row.reconciliationPending}
                        onClick={() => onReconcileDefault(item.providerId)}
                      >
                        {labels.reconcileDefault}
                      </LumenButton>
                    ) : null}
                    <LumenButton
                      type="button"
                      size="s"
                      variant="text"
                      aria-label={labels.edit(item.name)}
                      disabled={!connected || listBusy}
                      onClick={() => onEdit(item.providerId)}
                    >
                      {labels.editAction}
                    </LumenButton>
                    <LumenActionMenu
                      label={labels.actions(item.name)}
                      items={[
                        { id: 'remove', label: labels.remove(item.name), tone: 'danger', disabled: row.deleteDisabled },
                      ]}
                      onAction={() => onRemove(item.providerId)}
                    />
                  </LumenFrame>
                </LumenFrame>

                {row.actionIsSubmitting && !row.reconciliationPending ? (
                  <LumenContentText
                    context="feedback.paragraph"
                    className="hbar-provider-list-view-feedback"
                    role="status"
                    tone="muted"
                  >
                    {labels.settingDefault(item.name, item.primaryModelName)}
                  </LumenContentText>
                ) : null}
                {row.reconciliationPending ? (
                  <LumenContentText
                    context="feedback.paragraph"
                    className="hbar-provider-list-view-feedback"
                    role="status"
                    tone="muted"
                  >
                    {labels.reconcilingDefault(item.name, item.primaryModelName)}
                  </LumenContentText>
                ) : null}
                {actionError ? (
                  <LumenContentText
                    context="feedback.paragraph"
                    className="hbar-provider-list-view-error"
                    role="alert"
                    tone="danger"
                  >
                    {actionError}
                  </LumenContentText>
                ) : null}
              </LumenCollectionItem>
            )
          })}
        </LumenCollection>
      )}
    </LumenFrame>
  )
}

function ProviderSummary({
  item,
  labels,
  globalDefaultModelName,
  globalDefaultSelectable,
}: {
  readonly item: ProviderListViewItem
  readonly labels: ProviderListViewLabels
  readonly globalDefaultModelName?: string
  readonly globalDefaultSelectable?: boolean
}) {
  return (
    <LumenFrame className="hbar-provider-list-view-summary">
      <ProviderSummaryCopy
        item={item}
        labels={labels}
        {...(globalDefaultModelName !== undefined ? { globalDefaultModelName } : {})}
        {...(globalDefaultSelectable !== undefined ? { globalDefaultSelectable } : {})}
      />
    </LumenFrame>
  )
}

function ProviderSummaryCopy({
  item,
  labels,
  globalDefaultModelName,
  globalDefaultSelectable,
}: {
  readonly item: ProviderListViewItem
  readonly labels: ProviderListViewLabels
  readonly globalDefaultModelName?: string
  readonly globalDefaultSelectable?: boolean
}) {
  return (
    <LumenFrame as="span" className="hbar-provider-list-view-copy">
      <LumenFrame as="span" className="hbar-provider-list-view-title-row">
        <LumenContentText context="collection.title" className="hbar-provider-list-view-name">
          {item.name}
        </LumenContentText>
        {globalDefaultModelName ? (
          <LumenStatus
            value={labels.globalDefault(globalDefaultModelName)}
            tone={globalDefaultSelectable ? 'success' : 'warning'}
            className="hbar-provider-list-view-global-default"
            data-testid="provider-global-default"
          />
        ) : null}
      </LumenFrame>
      <LumenFrame as="span" className="hbar-provider-list-view-metadata">
        <LumenContentText context="metadata.detail" tone="subtle">
          {labels.protocol(item.protocol)}
        </LumenContentText>
        <LumenContentText context="metadata.detail" tone="subtle">
          {labels.primaryModel(item.primaryModelName)}
        </LumenContentText>
        <LumenContentText context="metadata.detail" tone="subtle">
          {labels.modelCount(item.modelCount)}
        </LumenContentText>
        <LumenStatus
          value={item.hasKey ? labels.configured : labels.notConfigured}
          tone={item.hasKey ? 'success' : 'neutral'}
        />
        {item.hidden ? (
          <LumenContentText context="metadata.detail" tone="subtle">
            {labels.hidden}
          </LumenContentText>
        ) : null}
      </LumenFrame>
    </LumenFrame>
  )
}
