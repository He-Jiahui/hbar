'use client'
import * as React from 'react'
import { AlertTriangle, Pause, Play, RefreshCw } from './glyphs'
import type { LumenIntegrationsCompositionProps } from './primitives'
import type { LumenIntegrationSyncContent, LumenIntegrationSyncSource } from './content'
import { uniqueLumenIntegrationItems } from './content'
import {
  IntegrationButton,
  IntegrationEmpty,
  IntegrationFrame,
  IntegrationIcon,
  IntegrationIconButton,
  IntegrationProgress,
  IntegrationStatus,
} from './primitives'

function statusForSource(
  source: LumenIntegrationSyncSource,
  paused: boolean,
  pausedLabel: string,
): { readonly label: string; readonly tone: LumenIntegrationSyncSource['statusTone'] } {
  return paused ? { label: pausedLabel, tone: 'neutral' } : { label: source.status, tone: source.statusTone }
}

export default function SyncIntegration({
  spec,
  onAction,
  content,
}: LumenIntegrationsCompositionProps & {
  readonly content: LumenIntegrationSyncContent
}) {
  const sources = React.useMemo(() => uniqueLumenIntegrationItems(content.sources), [content.sources])
  const [pausedIds, setPausedIds] = React.useState<ReadonlySet<string>>(() => new Set())
  const failures = sources.filter((source) => source.statusTone === 'danger' && !pausedIds.has(source.id))

  const toggleSource = (source: LumenIntegrationSyncSource) => {
    const paused = pausedIds.has(source.id)
    setPausedIds((current) => {
      const next = new Set(current)
      if (next.has(source.id)) {
        next.delete(source.id)
      } else {
        next.add(source.id)
      }
      return next
    })
    onAction?.({
      variantId: spec.id,
      actionId: paused ? 'resume-source' : 'pause-source',
      value: source.id,
    })
  }

  return (
    <IntegrationFrame spec={spec} className="hbar-app-ui-integration-sync-surface">
      <main className="hbar-app-ui-integration-sync-page">
        <header className="hbar-app-ui-integration-topbar">
          <div>
            <h1>{content.labels.pageTitle}</h1>
            <p>{content.labels.pageDescription}</p>
          </div>
          <div className="hbar-app-ui-integration-actions">
            <IntegrationButton type="button" onClick={() => onAction?.({ variantId: spec.id, actionId: 'sync-all' })}>
              <IntegrationIcon tier="sm">
                <RefreshCw />
              </IntegrationIcon>
              {content.labels.syncAll}
            </IntegrationButton>
          </div>
        </header>
        <dl className="hbar-app-ui-integration-sync-metrics">
          {content.metrics.map((metric) => (
            <div
              className={`hbar-app-ui-integration-sync-metric hbar-app-ui-integration-tone-${metric.tone ?? 'neutral'}`}
              key={metric.id}
            >
              <dt>{metric.label}</dt>
              <dd>
                <b>{metric.value}</b>
              </dd>
            </div>
          ))}
        </dl>
        {sources.length ? (
          <div
            className="hbar-app-ui-integration-sync-list hbar-app-ui-integration-pane-scroll"
            role="list"
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          >
            {sources.map((source) => {
              const paused = pausedIds.has(source.id)
              const status = statusForSource(source, paused, content.labels.paused)
              return (
                <article
                  className="hbar-app-ui-integration-panel hbar-app-ui-integration-sync-source"
                  role="listitem"
                  key={source.id}
                  data-hbar-app-ui-item-id={source.id}
                >
                  <header>
                    <span className="hbar-app-ui-integration-avatar">{source.initials}</span>
                    <div className="hbar-app-ui-integration-sync-source-title">
                      <strong>
                        {source.name}
                        <span>{source.destination}</span>
                      </strong>
                      <small>{source.detail}</small>
                    </div>
                    <IntegrationStatus value={status.label} tone={status.tone} />
                    <IntegrationIconButton
                      type="button"
                      label={paused ? content.labels.resume(source.name) : content.labels.pause(source.name)}
                      onClick={() => toggleSource(source)}
                    >
                      {paused ? <Play /> : <Pause />}
                    </IntegrationIconButton>
                  </header>
                  <IntegrationProgress
                    value={paused ? Math.max(0, source.progress - 8) : source.progress}
                    label={content.labels.progress(source.name)}
                    tone={status.tone}
                  />
                  {source.failure && !paused && (
                    <p className="hbar-app-ui-integration-failure">
                      <IntegrationIcon tier="sm">
                        <AlertTriangle />
                      </IntegrationIcon>
                      <span>{source.failure}</span>
                      <IntegrationButton
                        type="button"
                        tone="quiet"
                        onClick={() =>
                          onAction?.({
                            variantId: spec.id,
                            actionId: 'retry-source',
                            value: source.id,
                          })
                        }
                      >
                        <IntegrationIcon tier="sm">
                          <RefreshCw />
                        </IntegrationIcon>
                        {content.labels.retry}
                      </IntegrationButton>
                    </p>
                  )}
                </article>
              )
            })}
          </div>
        ) : (
          <IntegrationEmpty message={content.labels.empty} />
        )}
        <footer className="hbar-app-ui-integration-sync-footer">
          <span>{content.labels.footer}</span>
          <strong>{content.labels.failureSummary(failures.length)}</strong>
        </footer>
      </main>
    </IntegrationFrame>
  )
}
