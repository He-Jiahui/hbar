import { LumenToggleControl } from '../forms'
import { ArrowUpRight, RefreshCw, Unplug } from './glyphs'
import { useMemo, useState } from 'react'
import {
  type LumenIntegrationsCompositionProps,
  IntegrationButton,
  IntegrationEmpty,
  IntegrationFrame,
  IntegrationIcon,
  IntegrationStatus,
} from './primitives'
import { type LumenIntegrationConnectionContent, uniqueLumenIntegrationItems } from './content'

export function ConnectionIntegration({
  spec,
  onAction,
  content,
}: LumenIntegrationsCompositionProps & {
  readonly content: LumenIntegrationConnectionContent
}) {
  const scopes = useMemo(() => uniqueLumenIntegrationItems(content.scopes), [content.scopes])
  const activities = useMemo(() => uniqueLumenIntegrationItems(content.activities), [content.activities])
  const [connected, setConnected] = useState(content.initiallyConnected)
  const [scopeValues, setScopeValues] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(scopes.map((scope) => [scope.id, scope.enabled])),
  )

  const updateScope = (scopeId: string, enabled: boolean) => {
    setScopeValues((current) => ({ ...current, [scopeId]: enabled }))
    onAction?.({ variantId: spec.id, actionId: 'toggle-scope', value: `${scopeId}:${enabled}` })
  }

  return (
    <IntegrationFrame spec={spec} onAction={onAction} className="hbar-app-ui-integration-connection-surface">
      <main className="hbar-app-ui-integration-connection-page">
        <header className="hbar-app-ui-integration-connection-header">
          <span className="hbar-app-ui-integration-avatar">{content.initials}</span>
          <div className="hbar-app-ui-integration-connection-title">
            <h1>
              {content.name}
              <IntegrationStatus
                value={connected ? content.labels.connected : content.labels.disconnected}
                tone={connected ? 'positive' : 'neutral'}
              />
            </h1>
            <p>{content.description}</p>
          </div>
          <div className="hbar-app-ui-integration-actions">
            <IntegrationButton
              type="button"
              disabled={!connected}
              onClick={() => onAction?.({ variantId: spec.id, actionId: 'sync' })}
            >
              <IntegrationIcon tier="sm">
                <RefreshCw />
              </IntegrationIcon>
              {content.labels.sync}
            </IntegrationButton>
            <IntegrationButton
              type="button"
              tone="danger"
              disabled={!connected}
              onClick={() => {
                setConnected(false)
                onAction?.({ variantId: spec.id, actionId: 'disconnect' })
              }}
            >
              <IntegrationIcon tier="sm">
                <Unplug />
              </IntegrationIcon>
              {content.labels.disconnect}
            </IntegrationButton>
          </div>
        </header>
        <div className="hbar-app-ui-integration-connection-layout">
          <section className="hbar-app-ui-integration-panel hbar-app-ui-integration-permissions">
            <header>
              <h2>{content.labels.permissionsTitle}</h2>
              <p>{content.labels.permissionsDescription}</p>
            </header>
            {scopes.length ? (
              <div
                className="hbar-app-ui-integration-scope-list"
                role="list"
                data-hbar-app-ui-list-strategy={content.scopeListStrategy.kind}
              >
                {scopes.map((scope) => (
                  <label
                    className="hbar-app-ui-integration-scope"
                    role="listitem"
                    key={scope.id}
                    data-hbar-app-ui-item-id={scope.id}
                  >
                    <div>
                      <strong>
                        {scope.label}
                        {scope.required && (
                          <span className="hbar-app-ui-integration-badge">{content.labels.required}</span>
                        )}
                      </strong>
                      <p>{scope.description}</p>
                    </div>
                    <LumenToggleControl
                      className="hbar-app-ui-integration-switch"
                      aria-label={content.labels.toggleScope(scope.label)}
                      checked={scopeValues[scope.id] ?? scope.enabled}
                      disabled={scope.required || !connected}
                      onChange={(event) => updateScope(scope.id, event.target.checked)}
                    />
                  </label>
                ))}
              </div>
            ) : (
              <IntegrationEmpty message={content.labels.emptyScopes} />
            )}
          </section>
          <aside className="hbar-app-ui-integration-panel hbar-app-ui-integration-activity-panel">
            <header>
              <h2>{content.labels.activityTitle}</h2>
            </header>
            {activities.length ? (
              <ol
                className="hbar-app-ui-integration-activity-list"
                data-hbar-app-ui-list-strategy={content.activityListStrategy.kind}
              >
                {activities.map((activity) => (
                  <li
                    className={`hbar-app-ui-integration-activity-item hbar-app-ui-integration-tone-${activity.tone ?? 'neutral'}`}
                    key={activity.id}
                    data-hbar-app-ui-item-id={activity.id}
                  >
                    <i aria-hidden="true" />
                    <div>
                      <strong>{activity.title}</strong>
                      <small>{activity.date}</small>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <IntegrationEmpty message={content.labels.emptyActivity} />
            )}
            <IntegrationButton
              type="button"
              tone="quiet"
              onClick={() => onAction?.({ variantId: spec.id, actionId: 'audit-log' })}
            >
              {content.labels.fullAuditLog}
              <IntegrationIcon tier="sm">
                <ArrowUpRight />
              </IntegrationIcon>
            </IntegrationButton>
          </aside>
        </div>
      </main>
    </IntegrationFrame>
  )
}
;('use client')
