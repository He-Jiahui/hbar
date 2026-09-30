import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import type { LumenAgentActivityAction, LumenAgentActivityContent, LumenAgentActivityViewModel } from '@lumen/app-ui'
import { HbarAppUiAgentActivityProvider, type HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { createAgentActivityPreviewStore, type AgentActivityPreviewSeed } from './agentActivityPreviewStore'

interface AgentActivityPreviewHostProps extends Pick<HbarAppUiVariantProps, 'spec' | 'onAction'> {
  readonly content: LumenAgentActivityContent
  readonly localized: boolean
  readonly children: ReactNode
}
function seedFor(content: LumenAgentActivityContent, variant: number): AgentActivityPreviewSeed {
  const entryIds = variant === 5 ? (content.log?.entries.map(({ id }) => id) ?? []) : []
  return {
    ownerId: `activity-preview-${variant}`,
    variant,
    groupIds: variant === 2 ? (content.nested?.groups.map(({ id }) => id) ?? []) : [],
    initialOpenGroupIds:
      variant === 2
        ? (content.nested?.groups.filter(({ openByDefault }) => openByDefault).map(({ id }) => id) ?? [])
        : [],
    filterIds: variant === 5 ? (content.log?.filters.map(({ id }) => id) ?? []) : [],
    initialFilterId: variant === 5 ? (content.log?.activeFilterId ?? null) : null,
    entryIds,
    initialVisibleCount: Math.max(0, entryIds.length - 2),
    initiallyRunning: variant === 5 && entryIds.length > 0,
    historyIds: variant === 4 ? (content.history?.rows.map(({ id }) => id) ?? []) : [],
    outputIds: variant === 7 ? (content.failure?.outputs.map(({ id }) => id) ?? []) : [],
  }
}
export function AgentActivityPreviewHost(props: AgentActivityPreviewHostProps) {
  if (props.spec.category !== 'agent-activity') return props.children
  return <AgentActivityPreviewOwner key={props.spec.id} {...props} />
}
function AgentActivityPreviewOwner({ content, spec, onAction, localized, children }: AgentActivityPreviewHostProps) {
  const seed = useMemo(() => seedFor(content, spec.variant), [content, spec.variant])
  const [store] = useState(() => createAgentActivityPreviewStore(seed))
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
  useEffect(() => {
    if (!state.running || spec.variant !== 5) return
    // Only the two remaining, already supplied fixture rows are replayed locally.
    const timer = setTimeout(() => {
      if (active.current) store.getState().advanceLog()
    }, 1200)
    return () => clearTimeout(timer)
  }, [store, state.running, state.visibleCount, spec.variant])
  const report = (event: LumenAgentActivityAction) => {
    if (!active.current) return
    const current = store.getState()
    if (event.actionId === 'toggle-nested-group') {
      if (!event.value || !current.toggleGroup(event.value)) return
    } else if (event.actionId === 'filter-log') {
      if (!event.value || !current.selectFilter(event.value)) return
    } else if (event.actionId === 'stop' && spec.variant === 5) {
      current.stopLog()
    } else if (event.actionId !== 'jump-to-latest' && !current.recordIntent(event.actionId, event.value)) return
    onAction?.({
      variantId: spec.id,
      actionId: event.actionId,
      value: JSON.stringify({
        ownerId: seed.ownerId,
        targetId: event.value ?? null,
        outcome:
          event.actionId === 'toggle-nested-group' || event.actionId === 'filter-log' || spec.variant === 5
            ? 'local-preview'
            : 'intent-only',
      }),
    })
  }
  const viewModel: LumenAgentActivityViewModel = {
    ownerId: seed.ownerId,
    openGroupIds: state.openGroupIds,
    activeFilterId: state.filterId,
    liveStopped: false,
    deploymentStopped: state.deploymentStopped,
    retryQueued: state.retryQueued,
    log: {
      visibleCount: state.visibleCount,
      running: state.running,
      lineCount: content.log?.labels.lineCountTemplate.replace('{count}', String(state.visibleCount)) ?? '',
    },
    onAction: report,
    notice:
      state.notice === 'intent'
        ? localized
          ? 'Nur eine Vorschau-Anfrage; kein echter Lauf wurde angehalten, gestartet oder wiederholt und keine Datei heruntergeladen.'
          : 'Preview request only. No live run was stopped, started or retried, and no file was downloaded.'
        : state.notice === 'local'
          ? localized
            ? 'Lokale Vorschau aktualisiert; kein Live-Dienst wurde aufgerufen.'
            : 'Local preview updated; no live service was called.'
          : undefined,
  }
  const projected: LumenAgentActivityContent = {
    ...content,
    viewModel,
    deployment: content.deployment
      ? {
          ...content.deployment,
          labels: {
            ...content.deployment.labels,
            stopped: localized ? 'Vorschau angehalten' : 'Preview stopped',
            runAgain: localized ? 'Vorschau erneut abspielen' : 'Replay preview',
          },
        }
      : undefined,
    failure: content.failure
      ? {
          ...content.failure,
          retryQueuedTitle: localized ? 'Vorschau-Anfrage vorgemerkt' : 'Preview retry request queued',
          retryQueuedDescription: localized
            ? 'Die Anfrage bleibt nur in der lokalen Vorschau. Kein neuer Lauf wurde gestartet.'
            : 'This request is stored only in the local preview. No new run has started.',
        }
      : undefined,
  }
  return <HbarAppUiAgentActivityProvider content={projected}>{children}</HbarAppUiAgentActivityProvider>
}
