import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { LumenEmptyStateProvider, type LumenEmptyStateContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import {
  createEmptyStatePreviewSeed,
  createEmptyStatePreviewStore,
  type EmptyStatePreviewRequest,
  type EmptyStatePreviewSeed,
} from './emptyStatePreviewStore'

const PREVIEW_RETRY_DELAY_MS = 1_000

interface EmptyStatePreviewHostProps extends HbarAppUiVariantProps {
  readonly content: LumenEmptyStateContent
  readonly children: ReactNode
}

function uniqueRows<Item extends { readonly id: string }>(items: readonly Item[]): readonly Item[] {
  const seen = new Set<string>()
  const unique: Item[] = []
  for (const item of items) {
    const id = item.id.trim()
    if (id.length === 0 || seen.has(id)) continue
    seen.add(id)
    unique.push(id === item.id ? item : { ...item, id })
  }
  return unique
}

function isEmptyStateVariant(spec: HbarAppUiVariantProps['spec']): boolean {
  return spec.category === 'empty-state' && spec.variant >= 1 && spec.variant <= 5
}

/** Copy-only changes keep the current local drafts; a different scene replaces this owner. */
export function EmptyStatePreviewHost(props: EmptyStatePreviewHostProps) {
  if (!isEmptyStateVariant(props.spec)) return props.children
  const seed = createEmptyStatePreviewSeed(props.spec, props.content)
  return <EmptyStateDraftOwner key={JSON.stringify(seed)} {...props} seed={seed} />
}

interface EmptyStateDraftOwnerProps extends EmptyStatePreviewHostProps {
  readonly seed: EmptyStatePreviewSeed
}

function EmptyStateDraftOwner({ content, onAction, seed, children }: EmptyStateDraftOwnerProps) {
  const [store] = useState(() => createEmptyStatePreviewStore(seed))
  const activeOwnerRef = useRef(false)
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction

  const query = useStore(store, (state) => state.query)
  const activeFilterIds = useStore(store, (state) => state.activeFilterIds)
  const suggestions = useStore(store, (state) => state.suggestions)
  const pendingRetry = useStore(store, (state) => state.pendingRetry)
  const retryOutcome = useStore(store, (state) => state.retryOutcome)
  const selectedFileCount = useStore(store, (state) => state.selectedFileCount)

  const firstRunChoiceIds = useMemo(
    () => uniqueRows(content.firstRun?.choices ?? []).map(({ id }) => id),
    [content.firstRun?.choices],
  )
  const caughtUpChoiceIds = useMemo(
    () => uniqueRows(content.caughtUp?.choices ?? []).map(({ id }) => id),
    [content.caughtUp?.choices],
  )
  const filterIds = useMemo(
    () => uniqueRows(content.noResults?.filters ?? []).map(({ id }) => id),
    [content.noResults?.filters],
  )
  const suggestionTargets = useMemo(
    () =>
      uniqueRows(content.noResults?.suggestions ?? []).map(({ id, query: suggestionQuery }) => ({
        id,
        query: suggestionQuery,
      })),
    [content.noResults?.suggestions],
  )

  useLayoutEffect(() => {
    activeOwnerRef.current = true
    return () => {
      activeOwnerRef.current = false
      store.getState().clearOwner()
    }
  }, [store])

  useLayoutEffect(() => {
    store.getState().replaceFirstRunChoiceIds(firstRunChoiceIds)
    store.getState().replaceCaughtUpChoiceIds(caughtUpChoiceIds)
    store.getState().replaceFilterIds(filterIds)
    store.getState().replaceSuggestions(suggestionTargets)
  }, [caughtUpChoiceIds, filterIds, firstRunChoiceIds, store, suggestionTargets])

  function notify(request: EmptyStatePreviewRequest): void {
    if (!activeOwnerRef.current) return
    onActionRef.current?.({
      variantId: request.variantId,
      actionId: request.actionId,
      value: JSON.stringify(request),
    })
  }

  useEffect(() => {
    if (!pendingRetry) return undefined
    const timer = setTimeout(() => {
      if (!activeOwnerRef.current || !store.getState().completeRetry(pendingRetry.requestId)) return
      const completedRequest = { ...pendingRetry, actionId: 'retry-unverified' }
      onActionRef.current?.({
        variantId: completedRequest.variantId,
        actionId: completedRequest.actionId,
        value: JSON.stringify(completedRequest),
      })
    }, PREVIEW_RETRY_DELAY_MS)
    return () => clearTimeout(timer)
  }, [pendingRetry, store])

  const projectedContent: LumenEmptyStateContent = {
    ...content,
    firstRun: content.firstRun && {
      ...content.firstRun,
      choices: uniqueRows(content.firstRun.choices),
    },
    noResults: content.noResults && {
      ...content.noResults,
      query,
      filters: uniqueRows(content.noResults.filters).filter(({ id }) => activeFilterIds.includes(id)),
      suggestions: uniqueRows(content.noResults.suggestions).filter(({ id }) =>
        suggestions.some((suggestion) => suggestion.id === id),
      ),
      onQueryChange: (value) => {
        if (activeOwnerRef.current) store.getState().setQuery(value)
      },
      onRemoveFilter: (id) => {
        if (!activeOwnerRef.current || !store.getState().removeFilter(id)) return
        notify(store.getState().createIntent('remove-filter', id))
      },
      onClear: () => {
        if (!activeOwnerRef.current) return
        const removedIds = store.getState().clearFilters()
        if (removedIds.length > 0)
          notify(store.getState().createIntent('clear-filters', undefined, JSON.stringify(removedIds)))
      },
      onSuggestionSelect: (id) => {
        if (!activeOwnerRef.current) return
        const request = store.getState().chooseSuggestion(id)
        if (request) notify(request)
      },
    },
    caughtUp: content.caughtUp && {
      ...content.caughtUp,
      choices: uniqueRows(content.caughtUp.choices),
    },
    loadFailure: content.loadFailure && {
      ...content.loadFailure,
      retrying: pendingRetry !== null,
      error: retryOutcome === 'unverified' ? content.loadFailure.labels.retryUnverified : content.loadFailure.error,
      onRetry: () => {
        if (!activeOwnerRef.current) return
        const ticket = store.getState().startRetry()
        if (ticket) notify(ticket)
      },
    },
    folder: content.folder && {
      ...content.folder,
      breadcrumbs: uniqueRows(content.folder.breadcrumbs),
      fileTypes: uniqueRows(content.folder.fileTypes),
      feedback: selectedFileCount > 0 ? content.folder.labels.selected(selectedFileCount) : content.folder.feedback,
      onUpload: (files, origin) => {
        if (!activeOwnerRef.current) return
        const fileMetadata = files.map((file) => ({ name: file.name, type: file.type, size: file.size }))
        store.getState().setSelectedFileCount(fileMetadata.length)
        const request = store
          .getState()
          .createIntent('files-selected', undefined, JSON.stringify({ origin, files: fileMetadata }), 'selection-only')
        notify(request)
      },
    },
  }

  return <LumenEmptyStateProvider content={projectedContent}>{children}</LumenEmptyStateProvider>
}
