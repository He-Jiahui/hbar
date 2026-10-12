import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ReferenceConsentIntegration,
  type ReferenceConsentIntegrationProps,
} from '../packages/lumen-app-ui/src/integrations/ReferenceConsentIntegration'
import {
  ReferenceSyncIntegration,
  type ReferenceSyncIntegrationProps,
} from '../packages/lumen-app-ui/src/integrations/ReferenceSyncIntegration'
import { createIntegrationConsentReferenceFixture } from './fixtures/hbar-app-ui-integrations-consent-reference-fixtures'
import { createIntegrationSyncReferenceFixture } from './fixtures/hbar-app-ui-integrations-sync-reference-fixtures'

function renderConsent(props: Omit<ReferenceConsentIntegrationProps, 'spec'>): string {
  return renderToStaticMarkup(
    createElement(ReferenceConsentIntegration, {
      ...props,
      spec: { id: 'hbar-app-ui-integrations-5', variant: 5, profile: {} },
    }),
  )
}

function renderSync(props: Omit<ReferenceSyncIntegrationProps, 'spec'>): string {
  return renderToStaticMarkup(
    createElement(ReferenceSyncIntegration, {
      ...props,
      spec: { id: 'hbar-app-ui-integrations-6', variant: 6, profile: {} },
    }),
  )
}

describe('Integrations source Consent and Sync references', () => {
  test('renders host-provided Consent copy and the selected workspace without implying authorization succeeded', () => {
    const content = createIntegrationConsentReferenceFixture()
    const layout = content.referenceLayout
    if (!layout) throw new Error('Expected a consent reference layout')
    const html = renderConsent({ content, layout })

    expect(html).toContain('Northwind wants access to your Halcyon workspace')
    expect(html).toContain('aria-label="Workspace: HA Halcyon · Owner"')
    expect(html).toContain('data-hbar-app-ui-action="authorize"')
    expect(html).toContain('Read your profile')
    expect(html).toContain('Trigger deploys')
    expect(html).toContain('data-hbar-app-ui-list-strategy="content-grown"')
    expect(html).not.toContain(content.labels.authorized)
  })

  test('localizes Consent workspace empty state and disables authorization when no workspace exists', () => {
    const fixture = createIntegrationConsentReferenceFixture('de-long')
    const content = { ...fixture, workspaces: [], initialWorkspaceId: 'missing' }
    const layout = fixture.referenceLayout
    if (!layout) throw new Error('Expected a consent reference layout')
    const html = renderConsent({ content, layout })

    expect(html).toContain('Keine Arbeitsbereiche verfügbar')
    expect(html).toContain('disabled=""')
    expect(html).toContain('Autorisieren und fortfahren')
    expect(html).not.toContain('HA Halcyon · Owner')
  })

  test('renders the source Sync rows and retains the failure message without adding a retry control', () => {
    const content = createIntegrationSyncReferenceFixture()
    const layout = content.referenceLayout
    if (!layout) throw new Error('Expected a sync reference layout')
    const html = renderSync({ content, layout })

    expect(html.match(/class="lumen-integration-sync-reference-item"/g)).toHaveLength(5)
    expect(html).toContain('42,918 rows · running now')
    expect(html).toContain('Bucket rejected the write: missing s3:PutObject on the export prefix.')
    expect(html).toContain('aria-valuenow="41"')
    expect(html).toContain('data-hbar-app-ui-action="sync-all"')
    expect(html).not.toContain('data-hbar-app-ui-action="retry-source"')
    expect(html).not.toContain('1 failing sync')
  })

  test('uses controlled source phases and preserves the failure copy when a source is resumed', () => {
    const fixture = createIntegrationSyncReferenceFixture('de-long')
    const layout = fixture.referenceLayout
    if (!layout) throw new Error('Expected a sync reference layout')
    const content = {
      ...fixture,
      referenceFlow: {
        states: [
          { sourceId: 'meridian', phase: 'syncing' as const },
          { sourceId: 'quarry', phase: 'paused' as const },
        ],
        onToggleSource() {},
        onSyncAll() {},
      },
    }
    const html = renderSync({ content, layout })

    expect(html).toContain('aria-label="Meridian pausieren"')
    expect(html).toContain('aria-label="Quarry fortsetzen"')
    expect(html).toContain('Der Bucket hat den Schreibvorgang abgelehnt')
    expect(html).toContain('Synchronisierung läuft')
    expect(html).not.toContain('Erneut versuchen')
  })

  test('renders safe empty and over-bound Sync collections without truncating host data', () => {
    const fixture = createIntegrationSyncReferenceFixture()
    const layout = fixture.referenceLayout
    if (!layout) throw new Error('Expected a sync reference layout')
    const emptyHtml = renderSync({ content: { ...fixture, sources: [] }, layout })
    expect(emptyHtml).toContain('No connected sources.')

    const extraSources = Array.from({ length: 36 }, (_, index) => ({
      id: `overflow-${index}`,
      initials: 'OV',
      name: `Overflow source ${index + 1}`,
      destination: 'warehouse.records',
      detail: 'Queued by the host',
      status: 'Healthy',
      statusTone: 'positive' as const,
      progress: 100,
    }))
    const firstMetric = fixture.metrics[0]
    if (!firstMetric) throw new Error('Expected source Sync metrics')
    const overBound = {
      ...fixture,
      metrics: [...fixture.metrics, firstMetric],
      sources: [...fixture.sources, ...extraSources],
    }
    const overflowHtml = renderSync({ content: overBound, layout })
    expect(overflowHtml).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(overflowHtml.match(/class="lumen-integration-sync-reference-item"/g)).toHaveLength(41)
    expect(overflowHtml).toContain('Overflow source 36')
    expect(overflowHtml.match(/class="lumen-integration-sync-reference-metric /g)).toHaveLength(4)
  })
})
