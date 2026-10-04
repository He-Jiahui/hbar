import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  LumenToolCallsProvider,
  uniqueLumenToolCallsItems,
  type LumenToolCallsContent,
  type LumenToolCallsIntent,
  type LumenToolCallsViewModel,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { createToolCallsPreviewStore, type ToolCallsPreviewSeed } from './toolCallsPreviewStore'

interface ToolCallsPreviewHostProps extends Pick<HbarAppUiVariantProps, 'spec' | 'onAction'> {
  readonly content: LumenToolCallsContent
  readonly localized: boolean
  readonly children: ReactNode
}

function seedFor(content: LumenToolCallsContent, variant: number): ToolCallsPreviewSeed {
  return {
    ownerId: `tool-calls-preview-${variant}`,
    variant,
    traceIds: variant === 1 ? (content.trace?.items.map(({ id }) => id) ?? []) : [],
    initialOpenTraceIds: variant === 1 && content.trace ? [content.trace.activeItemId] : [],
    filterIds: variant === 2 ? (content.activity?.filters.map(({ id }) => id) ?? []) : [],
    initialFilterId: variant === 2 ? (content.activity?.activeFilterId ?? null) : null,
    retryIds:
      variant === 2
        ? (content.activity?.items.filter((item) => item.state === 'failed' && item.retryLabel).map(({ id }) => id) ??
          [])
        : [],
    diffIds: variant === 3 ? (content.diff?.files.map(({ id }) => id) ?? []) : [],
    initialOpenDiffIds: variant === 3 && content.diff ? [content.diff.activeFileId] : [],
    resultIds: variant === 4 ? (content.search?.items.map(({ id }) => id) ?? []) : [],
    outputTabIds: variant === 5 ? (content.command?.tabs.map(({ id }) => id) ?? []) : [],
    initialOutputTabId: variant === 5 ? (content.command?.initialTabId ?? null) : null,
    permissionItems:
      variant === 6
        ? (uniqueLumenToolCallsItems(content.permissions?.groups ?? []).flatMap((group) =>
            uniqueLumenToolCallsItems(group.items).map((item) => ({
              groupId: group.id,
              itemId: item.id,
              kind: item.kind,
              enabled: item.enabled,
              actionIds: item.actions?.map(({ id }) => id) ?? [],
            })),
          ) ?? [])
        : [],
  }
}

export function ToolCallsPreviewHost(props: ToolCallsPreviewHostProps) {
  if (props.spec.category !== 'tool-calls')
    return <LumenToolCallsProvider content={props.content}>{props.children}</LumenToolCallsProvider>
  return <ToolCallsPreviewOwner key={props.spec.id} {...props} />
}

function ToolCallsPreviewOwner({ content, spec, onAction, localized, children }: ToolCallsPreviewHostProps) {
  const seed = useMemo(() => seedFor(content, spec.variant), [content, spec.variant])
  const [store] = useState(() => createToolCallsPreviewStore(seed))
  const state = useStore(store, (value) => value)
  const active = useRef(false)
  useLayoutEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  useLayoutEffect(() => {
    store.getState().reconcile(seed)
  }, [store, seed])
  const report = (intent: LumenToolCallsIntent) => {
    if (!active.current || !store.getState().dispatch(intent)) return
    onAction?.({
      variantId: spec.id,
      actionId: intent.actionId,
      value: JSON.stringify({ ownerId: seed.ownerId, intent, outcome: store.getState().notice }),
    })
  }
  const intentCopy = localized
    ? 'Nur eine Vorschau-Anfrage. Kein Werkzeug wurde ausgefuehrt und keine Berechtigung erteilt.'
    : 'Preview request only. No tool was executed or permission granted.'
  const permissionIntent =
    state.lastIntent?.actionId === 'permission-request-action' && state.lastIntent.optionId !== 'view'
      ? state.lastIntent
      : null
  const viewModel: LumenToolCallsViewModel = {
    ownerId: seed.ownerId,
    openTraceIds: state.openTraceIds,
    activeFilterId: state.filterId,
    openDiffIds: state.openDiffIds,
    selectedOutputTabId: state.outputTabId,
    openRequestIds: state.openRequestIds,
    permissions: state.permissions,
    requestFeedback: permissionIntent
      ? [{ groupId: permissionIntent.groupId, itemId: permissionIntent.itemId, message: intentCopy }]
      : [],
    onAction: report,
    notice:
      state.notice === 'intent'
        ? permissionIntent
          ? undefined
          : `${intentCopy} ${localized ? 'Keine Navigation oder Zwischenablage-Aenderung.' : 'No navigation or clipboard write.'}`
        : state.notice === 'local'
          ? localized
            ? 'Lokale Vorschau aktualisiert. Keine Live-Berechtigung wurde geaendert.'
            : 'Local preview updated. No live permission was changed.'
          : undefined,
  }
  const projected: LumenToolCallsContent = {
    ...content,
    viewModel,
    trace: content.trace
      ? {
          ...content.trace,
          labels: {
            ...content.trace.labels,
            callCount: `${uniqueLumenToolCallsItems(content.trace.items).length} ${localized ? 'Aufrufe' : 'calls'}`,
          },
        }
      : undefined,
    command: content.command
      ? { ...content.command, copyCommandLabel: localized ? 'Befehl kopieren' : 'Copy command' }
      : undefined,
  }
  return <LumenToolCallsProvider content={projected}>{children}</LumenToolCallsProvider>
}
