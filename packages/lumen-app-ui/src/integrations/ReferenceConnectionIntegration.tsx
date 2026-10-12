'use client'

import { LumenToggleControl } from '../forms'
import type { LumenIntegrationConnectionContent } from './content'
import { uniqueLumenIntegrationItems } from './content'
import type { LumenIntegrationConnectionReferenceLayout } from './reference-content'
import type { LumenIntegrationsCompositionProps } from './primitives'
import { IntegrationButton, IntegrationEmpty, IntegrationFrame, IntegrationIcon, IntegrationStatus } from './primitives'
import { ArrowUpRight, RefreshCw, Unplug } from './glyphs'
import './reference-connection.css'

export interface ReferenceConnectionIntegrationProps extends LumenIntegrationsCompositionProps {
  readonly content: LumenIntegrationConnectionContent
  readonly layout: LumenIntegrationConnectionReferenceLayout
}

export function ReferenceConnectionIntegration({
  spec,
  onAction,
  content,
  layout,
}: ReferenceConnectionIntegrationProps) {
  const scopes = uniqueLumenIntegrationItems(content.scopes)
  const activities = uniqueLumenIntegrationItems(content.activities)
  const validScopeIds = new Set(scopes.map((scope) => scope.id))
  const enabledById = new Map<string, boolean>()
  for (const state of content.referenceFlow?.scopes ?? []) {
    if (validScopeIds.has(state.scopeId) && !enabledById.has(state.scopeId)) {
      enabledById.set(state.scopeId, state.enabled)
    }
  }

  return (
    <IntegrationFrame spec={spec} onAction={onAction} className="hbar-app-ui-integration-connection-reference-surface">
      <main className="hbar-app-ui-integration-connection-reference" data-hbar-app-ui-owner-id={layout.ownerId}>
        <header className="hbar-app-ui-integration-connection-reference-header">
          <span className="hbar-app-ui-integration-connection-reference-avatar">{content.initials}</span>
          <div className="hbar-app-ui-integration-connection-reference-title">
            <h2>
              {content.name}
              <IntegrationStatus
                value={content.initiallyConnected ? content.labels.connected : content.labels.disconnected}
                tone={content.initiallyConnected ? 'positive' : 'neutral'}
              />
            </h2>
            <p>{content.description}</p>
          </div>
          <div className="hbar-app-ui-integration-connection-reference-actions">
            <IntegrationButton
              type="button"
              disabled={!content.initiallyConnected}
              data-hbar-app-ui-action="integration-connection:sync"
              onClick={() => onAction?.({ variantId: spec.id, actionId: 'sync', value: layout.ownerId })}
            >
              <IntegrationIcon tier="sm">
                <RefreshCw />
              </IntegrationIcon>
              {content.labels.sync}
            </IntegrationButton>
            <IntegrationButton
              type="button"
              tone="danger"
              disabled={!content.initiallyConnected}
              data-hbar-app-ui-action="integration-connection:disconnect"
              onClick={() => onAction?.({ variantId: spec.id, actionId: 'disconnect', value: layout.ownerId })}
            >
              <IntegrationIcon tier="sm">
                <Unplug />
              </IntegrationIcon>
              {content.labels.disconnect}
            </IntegrationButton>
          </div>
        </header>

        <div className="hbar-app-ui-integration-connection-reference-layout">
          <section
            className="hbar-app-ui-integration-connection-reference-panel hbar-app-ui-integration-connection-reference-permissions"
            data-hbar-app-ui-region="integration-permissions"
          >
            <header>
              <h3>{content.labels.permissionsTitle}</h3>
              <p>{content.labels.permissionsDescription}</p>
            </header>
            {scopes.length ? (
              <ul
                className="hbar-app-ui-integration-connection-reference-scope-list"
                data-hbar-app-ui-list-strategy={content.scopeListStrategy.kind}
              >
                {scopes.map((scope) => {
                  const checked = scope.required ? scope.enabled : (enabledById.get(scope.id) ?? scope.enabled)
                  return (
                    <li
                      className="hbar-app-ui-integration-connection-reference-scope"
                      key={scope.id}
                      data-hbar-app-ui-item-id={scope.id}
                    >
                      <div>
                        <strong>
                          {scope.label}
                          {scope.required ? (
                            <span className="hbar-app-ui-integration-connection-reference-required">
                              {content.labels.required}
                            </span>
                          ) : null}
                        </strong>
                        <p>{scope.description}</p>
                      </div>
                      <LumenToggleControl
                        className="hbar-app-ui-integration-connection-reference-switch"
                        aria-label={scope.label}
                        checked={checked}
                        disabled={scope.required || !content.referenceFlow}
                        data-hbar-app-ui-action="integration-connection:scope"
                        data-hbar-app-ui-field={scope.id}
                        onChange={(event) =>
                          content.referenceFlow?.onScopeChange(scope.id, event.currentTarget.checked)
                        }
                      />
                    </li>
                  )
                })}
              </ul>
            ) : (
              <IntegrationEmpty message={content.labels.emptyScopes} />
            )}
          </section>

          <aside
            className="hbar-app-ui-integration-connection-reference-panel hbar-app-ui-integration-connection-reference-activity"
            data-hbar-app-ui-region="integration-activity"
          >
            <header>
              <h3>{content.labels.activityTitle}</h3>
            </header>
            {activities.length ? (
              <ol
                className="hbar-app-ui-integration-connection-reference-activity-list"
                data-hbar-app-ui-list-strategy={content.activityListStrategy.kind}
              >
                {activities.map((activity) => (
                  <li
                    className={`hbar-app-ui-integration-connection-reference-activity-item hbar-app-ui-integration-connection-reference-tone-${activity.tone ?? 'neutral'}`}
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
            <a
              className="hbar-app-ui-integration-connection-reference-audit-link"
              href={layout.auditLogHref}
              data-hbar-app-ui-action="integration-connection:audit-log"
            >
              {content.labels.fullAuditLog}
              <IntegrationIcon tier="sm">
                <ArrowUpRight />
              </IntegrationIcon>
            </a>
          </aside>
        </div>
      </main>
    </IntegrationFrame>
  )
}
