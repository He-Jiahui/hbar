'use client'

import * as React from 'react'
import { AlertTriangle, ArrowUpRight, Pause, Play, RefreshCw } from './glyphs'
import type { LumenIntegrationSyncContent, LumenIntegrationSyncSource } from './content'
import { uniqueLumenIntegrationItems } from './content'
import type {
  LumenIntegrationSyncReferencePhase,
  LumenIntegrationSyncReferenceState,
  LumenIntegrationSyncReferenceLayout,
} from './reference-content'
import type { LumenIntegrationsCompositionProps } from './primitives'
import {
  IntegrationButton,
  IntegrationEmpty,
  IntegrationFrame,
  IntegrationIcon,
  IntegrationIconButton,
  IntegrationProgress,
  IntegrationStatus,
} from './primitives'
import './reference-sync.css'

export interface ReferenceSyncIntegrationProps extends LumenIntegrationsCompositionProps {
  readonly content: LumenIntegrationSyncContent
  readonly layout: LumenIntegrationSyncReferenceLayout
}

function uniqueSyncStates(
  states: readonly LumenIntegrationSyncReferenceState[],
): readonly LumenIntegrationSyncReferenceState[] {
  const seen = new Set<string>()
  return states.filter((state) => {
    if (!state.sourceId.trim() || seen.has(state.sourceId)) {
      return false
    }
    seen.add(state.sourceId)
    return true
  })
}

function statusForPhase(
  phase: LumenIntegrationSyncReferencePhase,
  layout: LumenIntegrationSyncReferenceLayout,
  pausedLabel: string,
): { readonly label: string; readonly tone: 'neutral' | 'positive' | 'warning' | 'danger' } {
  const phaseLabels: Record<
    LumenIntegrationSyncReferencePhase,
    { readonly label: string; readonly tone: 'neutral' | 'positive' | 'warning' | 'danger' }
  > = {
    healthy: { label: layout.labels.healthy, tone: 'positive' },
    syncing: { label: layout.labels.syncing, tone: 'neutral' },
    failed: { label: layout.labels.failed, tone: 'danger' },
    paused: { label: pausedLabel, tone: 'neutral' },
  }
  return phaseLabels[phase]
}

export function ReferenceSyncIntegration({ spec, onAction, content, layout }: ReferenceSyncIntegrationProps) {
  const sources = React.useMemo(() => uniqueLumenIntegrationItems(content.sources), [content.sources])
  const metrics = React.useMemo(() => uniqueLumenIntegrationItems(content.metrics), [content.metrics])
  const layoutStates = React.useMemo(() => uniqueSyncStates(layout.states), [layout.states])
  const flowStates = React.useMemo(
    () => uniqueSyncStates(content.referenceFlow?.states ?? []),
    [content.referenceFlow?.states],
  )
  const phaseForSource = (source: LumenIntegrationSyncSource): LumenIntegrationSyncReferencePhase | undefined => {
    const flowState = flowStates.find((state) => state.sourceId === source.id)
    const layoutState = layoutStates.find((state) => state.sourceId === source.id)
    return flowState?.phase ?? layoutState?.phase
  }
  const requestToggle = (sourceId: string, action: 'pause-source' | 'resume-source') => {
    if (content.referenceFlow) {
      content.referenceFlow.onToggleSource(sourceId)
      return
    }
    onAction?.({
      variantId: spec.id,
      actionId: action,
      value: sourceId,
    })
  }

  const requestSyncAll = () => {
    if (content.referenceFlow) {
      content.referenceFlow.onSyncAll()
      return
    }
    onAction?.({ variantId: spec.id, actionId: 'sync-all' })
  }

  return (
    <IntegrationFrame spec={spec} onAction={onAction} className="lumen-integration-sync-reference-surface">
      <main className="lumen-integration-sync-reference" data-hbar-app-ui-owner={layout.ownerId}>
        <header className="lumen-integration-sync-reference-header">
          <div>
            <h2>{content.labels.pageTitle}</h2>
            <p>{content.labels.pageDescription}</p>
          </div>
          <IntegrationButton
            data-hbar-app-ui-action="sync-all"
            data-hbar-app-ui-target={layout.ownerId}
            onClick={requestSyncAll}
            type="button"
          >
            <IntegrationIcon tier="sm">
              <RefreshCw />
            </IntegrationIcon>
            {content.labels.syncAll}
          </IntegrationButton>
        </header>

        <dl className="lumen-integration-sync-reference-metrics">
          {metrics.map((metric) => (
            <div
              className={`lumen-integration-sync-reference-metric hbar-app-ui-integration-tone-${metric.tone ?? 'neutral'}`}
              key={metric.id}
            >
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
            </div>
          ))}
        </dl>

        {sources.length > 0 ? (
          <ul
            className={`lumen-integration-sync-reference-list lumen-integration-sync-reference-list-${content.listStrategy.kind}`}
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          >
            {sources.map((source) => {
              const phase = phaseForSource(source)
              const status = phase
                ? statusForPhase(phase, layout, content.labels.paused)
                : { label: source.status, tone: source.statusTone }
              let action: 'pause-source' | 'resume-source' = 'pause-source'
              if (phase === 'paused' || phase === 'failed') {
                action = 'resume-source'
              } else if (!phase && source.statusTone === 'danger') {
                action = 'resume-source'
              }
              const resumed = action === 'resume-source'
              return (
                <li
                  className="lumen-integration-sync-reference-item"
                  data-hbar-app-ui-item-id={source.id}
                  key={source.id}
                >
                  <div className="lumen-integration-sync-reference-row">
                    <span className="lumen-integration-sync-reference-avatar">{source.initials}</span>
                    <div className="lumen-integration-sync-reference-source">
                      <div className="lumen-integration-sync-reference-destination">
                        <strong>{source.name}</strong>
                        <IntegrationIcon tier="xs">
                          <ArrowUpRight />
                        </IntegrationIcon>
                        <span>{source.destination}</span>
                      </div>
                      <small>{source.detail}</small>
                    </div>
                    <IntegrationStatus value={status.label} tone={status.tone} />
                    <IntegrationIconButton
                      aria-label={resumed ? content.labels.resume(source.name) : content.labels.pause(source.name)}
                      data-hbar-app-ui-action={resumed ? 'resume-source' : 'pause-source'}
                      data-hbar-app-ui-target={source.id}
                      label={resumed ? content.labels.resume(source.name) : content.labels.pause(source.name)}
                      onClick={() => requestToggle(source.id, action)}
                      type="button"
                    >
                      <IntegrationIcon tier="sm">{resumed ? <Play /> : <Pause />}</IntegrationIcon>
                    </IntegrationIconButton>
                  </div>
                  <IntegrationProgress
                    value={source.progress}
                    label={content.labels.progress(source.name)}
                    tone={status.tone}
                  />
                  {source.failure && (
                    <p className="lumen-integration-sync-reference-failure">
                      <IntegrationIcon tier="sm">
                        <AlertTriangle />
                      </IntegrationIcon>
                      <span>{source.failure}</span>
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <IntegrationEmpty message={content.labels.empty} />
        )}

        <footer className="lumen-integration-sync-reference-footer">
          <span>{content.labels.footer}</span>
        </footer>
      </main>
    </IntegrationFrame>
  )
}
