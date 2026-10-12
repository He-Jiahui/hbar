'use client'

import * as React from 'react'
import { Copy, Ellipsis, Eye, EyeOff, Plus } from 'lucide-react'
import { LumenButton, LumenIconButton } from './primitives'
import LumenSurface from './LumenSurface'
import './settings-form-5-reference.css'

export type LumenSettingsForm5KeyAction = 'rotate' | 'revoke'

export interface LumenSettingsForm5KeyRow {
  readonly id: string
  readonly name: string
  readonly metadata: string
  readonly displayValue: string
  readonly revealed: boolean
  readonly actionMenuOpen: boolean
  readonly actionsAccessibleName: string
  readonly revealAccessibleName: string
  readonly copyAccessibleName: string
}

export interface LumenSettingsForm5IntegrationRow {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly enabled: boolean
  readonly connectedLabel: string | undefined
}

export interface LumenSettingsForm5Content {
  readonly pageTitle: string
  readonly createKey: string
  readonly secretKeysTitle: string
  readonly secretKeysDescription: string
  readonly integrationsTitle: string
  readonly integrationsDescription: string
  readonly connected: string
  readonly auditNote: string
  readonly rotateKey: string
  readonly revokeKey: string
  readonly keys: readonly LumenSettingsForm5KeyRow[]
  readonly integrations: readonly LumenSettingsForm5IntegrationRow[]
}

export interface LumenSettingsForm5Props {
  readonly instanceId: string
  readonly content: LumenSettingsForm5Content
  readonly onCreateKeyRequested: () => void
  readonly onKeyActionsToggle: (keyId: string) => void
  readonly onKeyRevealToggle: (keyId: string) => void
  readonly onKeyCopyRequested: (keyId: string) => void
  readonly onKeyActionRequested: (event: {
    readonly keyId: string
    readonly actionId: LumenSettingsForm5KeyAction
  }) => void
  readonly onIntegrationChange: (integrationId: string, enabled: boolean) => void
}

export type LumenSettingsForm5ViewModel = Omit<LumenSettingsForm5Props, 'instanceId'>

function SettingsForm5KeyRow({
  row,
  copy,
  onActionsToggle,
  onRevealToggle,
  onCopyRequested,
  onKeyActionRequested,
}: {
  readonly row: LumenSettingsForm5KeyRow
  readonly copy: Pick<LumenSettingsForm5Content, 'rotateKey' | 'revokeKey'>
  readonly onActionsToggle: (keyId: string) => void
  readonly onRevealToggle: (keyId: string) => void
  readonly onCopyRequested: (keyId: string) => void
  readonly onKeyActionRequested: (event: {
    readonly keyId: string
    readonly actionId: LumenSettingsForm5KeyAction
  }) => void
}) {
  return (
    <li className="lumen-settings-form-5-key" data-hbar-app-ui-region="api-key-row">
      <div className="lumen-settings-form-5-key-heading">
        <div className="lumen-settings-form-5-key-copy">
          <p className="lumen-settings-form-5-key-name">{row.name}</p>
          <p className="lumen-settings-form-5-key-metadata">{row.metadata}</p>
        </div>
        <div className="lumen-settings-form-5-actions-wrap">
          <LumenIconButton
            className="lumen-settings-form-5-icon-button"
            size="s"
            label={row.actionsAccessibleName}
            aria-haspopup="menu"
            aria-expanded={row.actionMenuOpen}
            onClick={() => onActionsToggle(row.id)}
          >
            <Ellipsis className="lumen-settings-form-5-icon" aria-hidden="true" strokeWidth={1.8} />
          </LumenIconButton>
          {row.actionMenuOpen ? (
            <div className="lumen-settings-form-5-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => onKeyActionRequested({ keyId: row.id, actionId: 'rotate' })}
              >
                {copy.rotateKey}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => onKeyActionRequested({ keyId: row.id, actionId: 'revoke' })}
              >
                {copy.revokeKey}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="lumen-settings-form-5-token-row">
        <code className="lumen-settings-form-5-token" data-hbar-app-ui-region="masked-key-display">
          {row.displayValue}
        </code>
        <div className="lumen-settings-form-5-token-actions">
          <LumenIconButton
            className="lumen-settings-form-5-icon-button"
            size="s"
            label={row.revealAccessibleName}
            onClick={() => onRevealToggle(row.id)}
          >
            {row.revealed ? (
              <EyeOff className="lumen-settings-form-5-icon" aria-hidden="true" strokeWidth={1.8} />
            ) : (
              <Eye className="lumen-settings-form-5-icon" aria-hidden="true" strokeWidth={1.8} />
            )}
          </LumenIconButton>
          <LumenIconButton
            className="lumen-settings-form-5-icon-button"
            size="s"
            label={row.copyAccessibleName}
            onClick={() => onCopyRequested(row.id)}
          >
            <Copy className="lumen-settings-form-5-icon" aria-hidden="true" strokeWidth={1.8} />
          </LumenIconButton>
        </div>
      </div>
      <span className="lumen-settings-form-5-status" role="status" />
    </li>
  )
}

export function LumenSettingsForm5Reference({
  instanceId,
  content,
  onCreateKeyRequested,
  onKeyActionsToggle,
  onKeyRevealToggle,
  onKeyCopyRequested,
  onKeyActionRequested,
  onIntegrationChange,
}: LumenSettingsForm5Props): React.ReactElement {
  return (
    <LumenSurface
      as="div"
      className="lumen-settings-form-5-surface"
      contentClassName="lumen-settings-form-5-reference"
      material="solid"
      data-hbar-app-ui-component="hbar-app-ui-settings-form-5"
    >
      <div className="lumen-settings-form-5-page">
        <header className="lumen-settings-form-5-page-heading" data-hbar-app-ui-region="page-heading">
          <h2>{content.pageTitle}</h2>
          <LumenButton
            className="lumen-settings-form-5-create-key"
            size="s"
            indicator="none"
            onClick={onCreateKeyRequested}
          >
            <Plus className="lumen-settings-form-5-icon" aria-hidden="true" strokeWidth={1.8} />
            <span>{content.createKey}</span>
          </LumenButton>
        </header>

        <div className="lumen-settings-form-5-panel" data-hbar-app-ui-region="secret-keys-panel">
          <div className="lumen-settings-form-5-panel-heading">
            <h3>{content.secretKeysTitle}</h3>
            <p>{content.secretKeysDescription}</p>
          </div>
          <ul
            className="lumen-settings-form-5-list lumen-settings-form-5-key-list"
            data-hbar-app-ui-list-strategy="content-grown"
            data-hbar-app-ui-region="api-keys"
          >
            {content.keys.map((row) => (
              <SettingsForm5KeyRow
                key={row.id}
                row={row}
                copy={content}
                onActionsToggle={onKeyActionsToggle}
                onRevealToggle={onKeyRevealToggle}
                onCopyRequested={onKeyCopyRequested}
                onKeyActionRequested={onKeyActionRequested}
              />
            ))}
          </ul>
        </div>

        <div className="lumen-settings-form-5-panel" data-hbar-app-ui-region="integrations-panel">
          <div className="lumen-settings-form-5-panel-heading">
            <h3>{content.integrationsTitle}</h3>
            <p>{content.integrationsDescription}</p>
          </div>
          <ul
            className="lumen-settings-form-5-list lumen-settings-form-5-integration-list"
            data-hbar-app-ui-list-strategy="content-grown"
            data-hbar-app-ui-region="integrations"
          >
            {content.integrations.map((integration) => {
              const nameId = `${instanceId}-${integration.id}-name`
              const descriptionId = `${instanceId}-${integration.id}-description`
              return (
                <li
                  className="lumen-settings-form-5-integration"
                  key={integration.id}
                  data-hbar-app-ui-region="integration-row"
                >
                  <div className="lumen-settings-form-5-integration-copy">
                    <div className="lumen-settings-form-5-integration-heading">
                      <span id={nameId}>{integration.name}</span>
                      {integration.connectedLabel ? (
                        <span className="lumen-settings-form-5-connected">
                          <span aria-hidden="true" />
                          {integration.connectedLabel}
                        </span>
                      ) : null}
                    </div>
                    <p id={descriptionId}>{integration.description}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-labelledby={nameId}
                    aria-describedby={descriptionId}
                    aria-checked={integration.enabled}
                    className="lumen-settings-form-5-switch"
                    onClick={() => onIntegrationChange(integration.id, !integration.enabled)}
                  >
                    <span className="lumen-settings-form-5-switch-thumb" aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="lumen-settings-form-5-audit-note" data-hbar-app-ui-region="audit-note">
            {content.auditNote}
          </div>
        </div>
      </div>
    </LumenSurface>
  )
}

export function projectLumenSettingsForm5ViewModel(props: LumenSettingsForm5Props): LumenSettingsForm5ViewModel {
  const { instanceId, ...viewModel } = props
  void instanceId
  return viewModel
}
