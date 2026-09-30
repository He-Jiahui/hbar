import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { HbarAppUiIntegrationContent } from '../packages/hbar-app-ui/src/index'
import { ReferenceApiKeysIntegration } from '../hbar-ui/packages/lumen-app-ui/src/integrations/ReferenceApiKeysIntegration'
import { createIntegrationApiKeysReferenceFixture } from './fixtures/hbar-app-ui-integrations-api-keys-reference-fixtures'

type ApiKeysContent = NonNullable<HbarAppUiIntegrationContent['apiKeys']>

function renderApiKeys(content: ApiKeysContent): string {
  return renderToStaticMarkup(
    createElement(ReferenceApiKeysIntegration, {
      spec: { id: 'integrations-api-keys-preview', variant: 3, profile: {} },
      content,
      layout: content.referenceLayout ?? { ownerId: 'integrations:api-keys:test' },
      onAction: () => undefined,
    }),
  )
}

function withApiKeyFlow(content: ApiKeysContent, revealedIds: readonly string[] = []): ApiKeysContent {
  return {
    ...content,
    referenceFlow: { revealedIds, onToggleReveal: () => undefined },
  }
}

function expandedKeys(content: ApiKeysContent, count: number): ApiKeysContent {
  const source = content.keys[0]
  if (!source) return { ...content, keys: [] }
  return {
    ...withApiKeyFlow(content),
    keys: Array.from({ length: count }, (_, index) => ({
      ...source,
      id: `overflow-key-${index + 1}`,
      name: `Preview key ${index + 1}`,
    })),
  }
}

describe('integrations reference API keys', () => {
  test('renders the native five-column source table and keeps each key action reachable in its scroll region', () => {
    const content = withApiKeyFlow(createIntegrationApiKeysReferenceFixture())
    const markup = renderApiKeys(content)

    expect(markup).toContain('API keys')
    expect(markup).toContain('Keys inherit the permissions of the workspace they belong to.')
    expect(markup).toContain('role="region"')
    expect(markup).toContain('tabindex="0"')
    expect(markup.match(/<th\b/g)).toHaveLength(5)
    expect(markup.match(/<tr data-hbar-app-ui-item-id=/g)).toHaveLength(4)
    expect(markup.match(/aria-label="Reveal key"/g)).toHaveLength(4)
    expect(markup.match(/aria-label="Copy key"/g)).toHaveLength(4)
    expect(markup.match(/>Rotate<span data-edge/g)).toHaveLength(4)
    expect(markup).toContain('Revoke Billing worker')
    expect(markup).toContain('4 keys · revoking takes effect immediately')
    expect(markup).not.toContain('preview-only-key-for-billing-worker')
  })

  test('renders reveal state only from valid host IDs and never exposes a key through an action value', () => {
    const base = createIntegrationApiKeysReferenceFixture()
    const hidden = renderApiKeys(withApiKeyFlow(base, ['stale-key-id']))
    const revealed = renderApiKeys(withApiKeyFlow(base, ['billing-worker', 'stale-key-id']))

    expect(hidden).toContain('aria-label="Reveal key"')
    expect(hidden).not.toContain('aria-label="Hide key"')
    expect(hidden).not.toContain('preview-only-key-for-billing-worker')
    expect(revealed).toContain('aria-label="Hide key"')
    expect(revealed).toContain('preview-only-key-for-billing-worker')
    expect(revealed.match(/aria-pressed="true"/g)).toHaveLength(1)
  })

  test('handles long localization, empty and one-key lists, duplicates, and the pane boundary without truncating rows', () => {
    const base = createIntegrationApiKeysReferenceFixture()
    const localized = withApiKeyFlow(createIntegrationApiKeysReferenceFixture('de-long'))
    expect(renderApiKeys(localized)).toContain('ausdrücklich autorisierten Diensten')
    expect(renderApiKeys(localized)).toContain('Schlüssel kopieren')

    const empty = withApiKeyFlow({ ...base, keys: [] })
    expect(renderApiKeys(empty)).toContain(base.labels.empty)
    expect(renderApiKeys(empty)).toContain('0 keys · revoking takes effect immediately')

    const oneKey = withApiKeyFlow({ ...base, keys: base.keys.slice(0, 1) })
    expect(renderApiKeys(oneKey).match(/<tr data-hbar-app-ui-item-id=/g)).toHaveLength(1)

    const duplicate = withApiKeyFlow({
      ...base,
      keys: [...base.keys, { ...base.keys[0]!, name: 'Duplicate billing key' }, { ...base.keys[1]!, id: '' }],
    })
    const duplicateMarkup = renderApiKeys(duplicate)
    expect(duplicateMarkup).not.toContain('Duplicate billing key')
    expect(duplicateMarkup.match(/<tr data-hbar-app-ui-item-id=/g)).toHaveLength(4)

    const boundary = expandedKeys(base, 32)
    const overflow = expandedKeys(base, 33)
    expect(renderApiKeys(boundary).match(/<tr data-hbar-app-ui-item-id=/g)).toHaveLength(32)
    expect(renderApiKeys(overflow)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(renderApiKeys(overflow).match(/<tr data-hbar-app-ui-item-id=/g)).toHaveLength(33)
    expect(renderApiKeys(overflow)).toContain('Preview key 33')
  })
})
