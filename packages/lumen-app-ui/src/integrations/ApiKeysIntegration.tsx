'use client'
import * as React from 'react'
import { LumenChip } from '../ui-controls'
import { Copy, Eye, EyeOff, KeyRound, Plus, RotateCcw, Trash2 } from './glyphs'
import type { LumenIntegrationsCompositionProps } from './primitives'
import type { LumenIntegrationApiKeysContent } from './content'
import { uniqueLumenIntegrationItems } from './content'
import {
  IntegrationButton,
  IntegrationEmpty,
  IntegrationFrame,
  IntegrationIcon,
  IntegrationIconButton,
} from './primitives'

export default function ApiKeysIntegration({
  spec,
  onAction,
  content,
}: LumenIntegrationsCompositionProps & {
  readonly content: LumenIntegrationApiKeysContent
}) {
  const keys = React.useMemo(() => uniqueLumenIntegrationItems(content.keys), [content.keys])
  const [revealedId, setRevealedId] = React.useState<string | undefined>()
  const [revokedIds, setRevokedIds] = React.useState<ReadonlySet<string>>(() => new Set())
  const activeKeys = keys.filter((key) => !revokedIds.has(key.id))

  const reveal = (keyId: string) => {
    setRevealedId((current) => (current === keyId ? undefined : keyId))
    onAction?.({ variantId: spec.id, actionId: 'toggle-reveal', value: keyId })
  }

  const revoke = (keyId: string) => {
    setRevokedIds((current) => new Set([...current, keyId]))
    setRevealedId((current) => (current === keyId ? undefined : current))
    onAction?.({ variantId: spec.id, actionId: 'revoke', value: keyId })
  }

  return (
    <IntegrationFrame spec={spec} className="hbar-app-ui-integration-api-keys-surface">
      <main className="hbar-app-ui-integration-keys-page">
        <header className="hbar-app-ui-integration-topbar">
          <div>
            <h1>{content.labels.pageTitle}</h1>
            <p>{content.labels.pageDescription}</p>
          </div>
          <div className="hbar-app-ui-integration-actions">
            <IntegrationButton
              tone="accent"
              type="button"
              onClick={() => onAction?.({ variantId: spec.id, actionId: 'create' })}
            >
              <IntegrationIcon tier="sm">
                <Plus />
              </IntegrationIcon>
              {content.labels.createKey}
            </IntegrationButton>
          </div>
        </header>
        <div
          className="hbar-app-ui-integration-key-table hbar-app-ui-integration-pane-scroll"
          role="table"
          aria-label={content.labels.pageTitle}
          data-hbar-app-ui-list-strategy={content.listStrategy.kind}
        >
          <div className="hbar-app-ui-integration-key-header" role="row">
            <span
              className="hbar-app-ui-integration-key-cell hbar-app-ui-integration-key-cell-name"
              role="columnheader"
            >
              {content.labels.nameColumn}
            </span>
            <span className="hbar-app-ui-integration-key-cell hbar-app-ui-integration-key-cell-key" role="columnheader">
              {content.labels.keyColumn}
            </span>
            <span className="hbar-app-ui-integration-key-cell" role="columnheader">
              {content.labels.scopeColumn}
            </span>
            <span className="hbar-app-ui-integration-key-cell" role="columnheader">
              {content.labels.lastUsedColumn}
            </span>
            <span
              className="hbar-app-ui-integration-key-cell hbar-app-ui-integration-key-cell-actions"
              role="columnheader"
              aria-hidden="true"
            />
          </div>
          {activeKeys.length ? (
            activeKeys.map((key) => {
              const revealed = revealedId === key.id
              return (
                <div
                  className="hbar-app-ui-integration-key-row"
                  role="row"
                  key={key.id}
                  data-hbar-app-ui-item-id={key.id}
                >
                  <div className="hbar-app-ui-integration-key-cell hbar-app-ui-integration-key-cell-name" role="cell">
                    <strong>{key.name}</strong>
                    <small>{key.meta}</small>
                  </div>
                  <div className="hbar-app-ui-integration-key-cell hbar-app-ui-integration-key-cell-key" role="cell">
                    <span className="hbar-app-ui-integration-key-value">
                      <IntegrationIcon tier="sm">
                        <KeyRound />
                      </IntegrationIcon>
                      <code>{revealed ? key.revealedKey : key.maskedKey}</code>
                      <IntegrationIconButton
                        type="button"
                        label={revealed ? content.labels.hide(key.name) : content.labels.reveal(key.name)}
                        onClick={() => reveal(key.id)}
                      >
                        {revealed ? <EyeOff /> : <Eye />}
                      </IntegrationIconButton>
                      <IntegrationIconButton
                        type="button"
                        label={content.labels.copy(key.name)}
                        onClick={() => onAction?.({ variantId: spec.id, actionId: 'copy', value: key.id })}
                      >
                        <Copy />
                      </IntegrationIconButton>
                    </span>
                  </div>
                  <div className="hbar-app-ui-integration-key-cell" role="cell">
                    <LumenChip label={key.scope} />
                  </div>
                  <div className="hbar-app-ui-integration-key-cell" role="cell">
                    <span>{key.lastUsed}</span>
                  </div>
                  <div
                    className="hbar-app-ui-integration-key-cell hbar-app-ui-integration-key-cell-actions"
                    role="cell"
                  >
                    <IntegrationButton
                      type="button"
                      onClick={() => onAction?.({ variantId: spec.id, actionId: 'rotate', value: key.id })}
                    >
                      <IntegrationIcon tier="sm">
                        <RotateCcw />
                      </IntegrationIcon>
                      {content.labels.rotate}
                    </IntegrationButton>
                    <IntegrationIconButton
                      type="button"
                      label={content.labels.revoke(key.name)}
                      onClick={() => revoke(key.id)}
                    >
                      <Trash2 />
                    </IntegrationIconButton>
                  </div>
                </div>
              )
            })
          ) : (
            <IntegrationEmpty message={content.labels.empty} />
          )}
        </div>
        <footer className="hbar-app-ui-integration-keys-footer">{content.labels.footer(activeKeys.length)}</footer>
      </main>
    </IntegrationFrame>
  )
}
