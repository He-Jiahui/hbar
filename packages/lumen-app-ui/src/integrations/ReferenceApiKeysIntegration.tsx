'use client'

import * as React from 'react'
import { Copy, Eye, EyeOff, KeyRound, Plus, RotateCcw, Trash2 } from './glyphs'
import type { LumenIntegrationApiKeysContent } from './content'
import type { LumenIntegrationsCompositionProps } from './primitives'
import type { LumenIntegrationApiKeysReferenceLayout } from './reference-content'
import {
  IntegrationButton,
  IntegrationEmpty,
  IntegrationFrame,
  IntegrationIcon,
  IntegrationIconButton,
} from './primitives'
import './reference-api-keys.css'

export interface ReferenceApiKeysIntegrationProps extends LumenIntegrationsCompositionProps {
  readonly content: LumenIntegrationApiKeysContent
  readonly layout: LumenIntegrationApiKeysReferenceLayout
}

function uniqueById<Item extends { readonly id: string }>(items: readonly Item[]): Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id.trim() || seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function ReferenceApiKeysIntegration({ spec, onAction, content, layout }: ReferenceApiKeysIntegrationProps) {
  const keys = uniqueById(content.keys)
  const validIds = new Set(keys.map((key) => key.id))
  const revealedIds = new Set<string>()
  for (const keyId of content.referenceFlow?.revealedIds ?? []) {
    if (validIds.has(keyId)) {
      revealedIds.add(keyId)
    }
  }
  const tableScrollRegionProps: React.HTMLAttributes<HTMLDivElement> = {
    role: 'region',
    'aria-label': content.labels.pageTitle,
    tabIndex: 0,
  }

  return (
    <IntegrationFrame spec={spec} onAction={onAction} className="hbar-app-ui-integration-reference-api-keys-surface">
      <main className="hbar-app-ui-integration-reference-api-keys-page" data-hbar-app-ui-owner-id={layout.ownerId}>
        <header className="hbar-app-ui-integration-reference-api-keys-topbar">
          <div>
            <h1>{content.labels.pageTitle}</h1>
            <p>{content.labels.pageDescription}</p>
          </div>
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
        </header>

        <div
          {...tableScrollRegionProps}
          className="hbar-app-ui-integration-reference-api-keys-scroll"
          data-hbar-app-ui-list-strategy={content.listStrategy.kind}
        >
          <table className="hbar-app-ui-integration-reference-api-keys-table" aria-label={content.labels.pageTitle}>
            <thead>
              <tr>
                <th scope="col">{content.labels.nameColumn}</th>
                <th scope="col">{content.labels.keyColumn}</th>
                <th scope="col">{content.labels.scopeColumn}</th>
                <th scope="col">{content.labels.lastUsedColumn}</th>
                <th scope="col" aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {keys.length ? (
                keys.map((key) => {
                  const revealed = revealedIds.has(key.id)
                  return (
                    <tr key={key.id} data-hbar-app-ui-item-id={key.id}>
                      <td className="hbar-app-ui-integration-reference-api-keys-name">
                        <strong>{key.name}</strong>
                        <small>{key.meta}</small>
                      </td>
                      <td className="hbar-app-ui-integration-reference-api-keys-key">
                        <div className="hbar-app-ui-integration-reference-api-keys-value">
                          <IntegrationIcon tier="sm">
                            <KeyRound />
                          </IntegrationIcon>
                          <code>{revealed ? key.revealedKey : key.maskedKey}</code>
                          <IntegrationIconButton
                            type="button"
                            disabled={!content.referenceFlow}
                            aria-pressed={revealed}
                            label={revealed ? content.labels.hide(key.name) : content.labels.reveal(key.name)}
                            onClick={() => content.referenceFlow?.onToggleReveal(key.id)}
                          >
                            <IntegrationIcon tier="sm">{revealed ? <EyeOff /> : <Eye />}</IntegrationIcon>
                          </IntegrationIconButton>
                          <IntegrationIconButton
                            type="button"
                            label={content.labels.copy(key.name)}
                            onClick={() => onAction?.({ variantId: spec.id, actionId: 'copy', value: key.id })}
                          >
                            <IntegrationIcon tier="sm">
                              <Copy />
                            </IntegrationIcon>
                          </IntegrationIconButton>
                        </div>
                      </td>
                      <td>
                        <span className="hbar-app-ui-integration-reference-api-keys-scope">{key.scope}</span>
                      </td>
                      <td>{key.lastUsed}</td>
                      <td className="hbar-app-ui-integration-reference-api-keys-actions">
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
                          onClick={() => onAction?.({ variantId: spec.id, actionId: 'revoke', value: key.id })}
                        >
                          <IntegrationIcon tier="sm">
                            <Trash2 />
                          </IntegrationIcon>
                        </IntegrationIconButton>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={5}>
                    <IntegrationEmpty message={content.labels.empty} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="hbar-app-ui-integration-reference-api-keys-footer">
          {content.labels.footer(keys.length)}
        </footer>
      </main>
    </IntegrationFrame>
  )
}
