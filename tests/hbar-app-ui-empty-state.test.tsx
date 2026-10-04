import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenEmptyState, LumenEmptyState01 } from '@lumen/app-ui'
import { createHbarAppUiVariantSpec as createTestSpec } from '../packages/hbar-app-ui/src/catalog'
import { EmptyStatePreviewHost } from '../apps/hbar-app-ui-preview/src/EmptyStatePreviewHost'
import {
  HBAR_APP_UI_EMPTY_STATE_FIXTURES,
  createEmptyStateLocalizedFixtures,
  createEmptyStateOverflowFixtures,
} from './fixtures/hbar-app-ui-empty-state-fixtures'

function renderVariant(variant: number, content = HBAR_APP_UI_EMPTY_STATE_FIXTURES): string {
  const spec = createTestSpec('empty-state', variant)
  return renderToStaticMarkup(
    <EmptyStatePreviewHost content={content} spec={spec}>
      <LumenEmptyState variant={variant} variantId={spec.id} />
    </EmptyStatePreviewHost>,
  )
}

describe('Empty State preview Host', () => {
  test('keeps the existing explicit-prop first-run catalog API available', () => {
    const choice = { title: 'Legacy host choice', description: 'A legacy host description', action: 'Open choice' }
    const html = renderToStaticMarkup(
      <LumenEmptyState01
        copy={{
          heading: 'Legacy host heading',
          detail: 'Legacy host detail',
          connect: choice,
          create: choice,
          tour: choice,
        }}
        actions={{ onConnect() {}, onCreate() {}, onTour() {} }}
      />,
    )
    expect(html).toContain('Legacy host heading')
    expect(html.match(/Legacy host choice/g)).toHaveLength(3)
  })
  test('renders the source first-run choices and their host-owned copy', () => {
    const html = renderVariant(1)

    expect(html).toContain('Nothing in this workspace yet')
    expect(html).toContain('Connect a warehouse')
    expect(html).toContain('Upload a spreadsheet')
    expect(html).toContain('Load the sample dataset')
    expect(html.match(/data-hbar-app-ui-action="select-choice"/g)).toHaveLength(3)
  })

  test('renders no-results search, active filters, suggestion rows, and current German long copy', () => {
    const html = renderVariant(2, createEmptyStateLocalizedFixtures('de-long'))

    expect(html).toContain('Berichte, Beschreibungen und enthaltene Spalten durchsuchen')
    expect(html).toContain('quaterly revenu')
    expect(html).toContain('Für die Suche „quaterly revenu“ wurden keine passenden Berichte gefunden')
    expect(html.match(/data-hbar-app-ui-action="remove-filter"/g)).toHaveLength(4)
    expect(html.match(/data-hbar-app-ui-action="select-suggestion"/g)).toHaveLength(3)
    expect(html).toContain('Alle aktiven Berichtsfilter auf einmal entfernen')
  })

  test('keeps retry failure explicit and folder feedback empty until files are selected', () => {
    const failureHtml = renderVariant(4)
    const folderHtml = renderVariant(5)

    expect(failureHtml).toContain('We could not load your orders')
    expect(failureHtml).toContain('GET /v2/workspaces/orders')
    expect(failureHtml).toContain('Try again')
    expect(failureHtml).not.toContain('Your orders are ready')
    expect(folderHtml).toContain('This folder is empty')
    expect(folderHtml).toContain('46 GB of 100 GB used in this workspace')
    expect(folderHtml).not.toContain('selected in this preview')
    expect(folderHtml).not.toContain('Upload complete')
  })

  test('keeps content-grown choices available for the expanded host fixture', () => {
    const html = renderVariant(1, createEmptyStateOverflowFixtures())

    expect(html.match(/data-hbar-app-ui-action="select-choice"/g)).toHaveLength(17)
    expect(html).toContain('host-source-17')
    expect(html).toContain('data-hbar-app-ui-list-strategy="content-grown"')
  })

  test('passes unrelated variants through without adding empty-state content', () => {
    const spec = createTestSpec('billing', 1)
    const html = renderToStaticMarkup(
      <EmptyStatePreviewHost content={HBAR_APP_UI_EMPTY_STATE_FIXTURES} spec={spec}>
        <span data-testid="unrelated-child" />
      </EmptyStatePreviewHost>,
    )

    expect(html).toContain('data-testid="unrelated-child"')
    expect(html).not.toContain('Nothing in this workspace yet')
  })
})
