'use client'
import * as React from 'react'
import { LumenChoiceSelect } from '../forms'
import { Check, LockKeyhole, ShieldCheck } from './glyphs'
import type { LumenIntegrationsCompositionProps } from './primitives'
import type { LumenIntegrationConsentContent } from './content'
import { selectLumenIntegrationItem, uniqueLumenIntegrationItems } from './content'
import { IntegrationButton, IntegrationFrame, IntegrationIcon } from './primitives'

export default function ConsentIntegration({
  spec,
  onAction,
  content,
}: LumenIntegrationsCompositionProps & {
  readonly content: LumenIntegrationConsentContent
}) {
  const workspaces = React.useMemo(() => uniqueLumenIntegrationItems(content.workspaces), [content.workspaces])
  const initialWorkspace = selectLumenIntegrationItem(workspaces, content.initialWorkspaceId)
  const [workspaceId, setWorkspaceId] = React.useState(initialWorkspace?.id ?? '')
  const [authorized, setAuthorized] = React.useState(false)

  return (
    <IntegrationFrame spec={spec} className="hbar-app-ui-integration-consent-surface">
      <main className="hbar-app-ui-integration-consent-page">
        <section className="hbar-app-ui-integration-consent-card">
          <div className="hbar-app-ui-integration-consent-brands">
            <span className="hbar-app-ui-integration-avatar">{content.requesterInitials}</span>
            <span className="hbar-app-ui-integration-avatar hbar-app-ui-integration-avatar-bright">
              {content.workspaceInitials}
            </span>
          </div>
          <header className="hbar-app-ui-integration-consent-title">
            <h1>{content.title}</h1>
            <p>{content.description}</p>
          </header>
          <div className="hbar-app-ui-integration-field">
            <span>{content.labels.workspaceLabel}</span>
            <span className="hbar-app-ui-integration-workspace-select">
              <IntegrationIcon tier="sm">
                <ShieldCheck />
              </IntegrationIcon>
              <LumenChoiceSelect
                id={`hbar-app-ui-integration-workspace-${spec.id}`}
                label={content.labels.workspaceLabel}
                options={workspaces}
                value={workspaceId}
                onValueChange={(id) => {
                  setWorkspaceId(id)
                  onAction?.({
                    variantId: spec.id,
                    actionId: 'select-workspace',
                    value: id,
                  })
                }}
              />
            </span>
          </div>
          <ul
            className="hbar-app-ui-integration-permission-list"
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          >
            {content.permissions.map((permission) => (
              <li className="hbar-app-ui-integration-consent-permission" key={permission.id}>
                <i aria-hidden="true" />
                <div>
                  <strong>{permission.title}</strong>
                  <p>{permission.description}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="hbar-app-ui-integration-consent-assurance">
            <IntegrationIcon tier="sm">
              <LockKeyhole />
            </IntegrationIcon>
            <span>{content.assurance}</span>
          </p>
          <div className="hbar-app-ui-integration-consent-actions">
            <IntegrationButton
              type="button"
              onClick={() => onAction?.({ variantId: spec.id, actionId: 'deny', value: workspaceId })}
            >
              {content.labels.cancel}
            </IntegrationButton>
            <IntegrationButton
              type="button"
              tone="accent"
              disabled={authorized || !workspaceId}
              onClick={() => {
                setAuthorized(true)
                onAction?.({ variantId: spec.id, actionId: 'authorize', value: workspaceId })
              }}
            >
              {authorized ? (
                <IntegrationIcon tier="sm">
                  <Check />
                </IntegrationIcon>
              ) : null}
              {authorized ? content.labels.authorized : content.labels.authorize}
            </IntegrationButton>
          </div>
          <footer className="hbar-app-ui-integration-consent-footer">
            <IntegrationIcon tier="sm">
              <LockKeyhole />
            </IntegrationIcon>
            <span>{content.labels.redirectNotice}</span>
          </footer>
        </section>
      </main>
    </IntegrationFrame>
  )
}
