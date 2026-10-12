import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { HbarAppUiIntegrationContent } from '../packages/hbar-app-ui/src/index'
import { ReferenceConnectionIntegration } from '../packages/lumen-app-ui/src/integrations/ReferenceConnectionIntegration'
import { createIntegrationConnectionReferenceFixture } from './fixtures/hbar-app-ui-integrations-connection-reference-fixtures'

type ConnectionContent = NonNullable<HbarAppUiIntegrationContent['connection']>

function render(content: ConnectionContent): string {
  return renderToStaticMarkup(
    createElement(ReferenceConnectionIntegration, {
      spec: { id: 'hbar-app-ui-integrations-2', variant: 2, profile: {} },
      content,
      layout: content.referenceLayout ?? { ownerId: 'cedar', auditLogHref: '#' },
    }),
  )
}

function activity(id: string): ConnectionContent['activities'][number] {
  return {
    id,
    title: `Activity ${id}`,
    date: 'Today 10:00',
    tone: 'neutral',
  }
}

function switchFor(markup: string, label: string): string {
  return (
    markup.match(new RegExp(`<input[^>]*role="switch"[^>]*aria-label="${label}"[^>]*>`))?.[0] ??
    markup.match(new RegExp(`<input[^>]*aria-label="${label}"[^>]*role="switch"[^>]*>`))?.[0] ??
    ''
  )
}

describe('integrations connection reference view', () => {
  test('renders source connection header, four native switches, four activities and audit link', () => {
    const content = createIntegrationConnectionReferenceFixture()
    const markup = render({
      ...content,
      referenceFlow: {
        scopes: content.scopes.map((permission) => ({
          scopeId: permission.id,
          enabled: permission.enabled,
        })),
        onScopeChange: () => {},
      },
    })

    expect(markup).toContain('Cedar Labs')
    expect(markup).toContain('Connected')
    expect(markup).toContain('data-hbar-app-ui-owner-id="cedar"')
    expect(markup).toContain('Sync now')
    expect(markup).toContain('Disconnect')
    expect(markup).toContain('Permissions')
    expect(markup).toContain('Activity')
    expect((markup.match(/role="switch"/g) ?? []).length).toBe(4)
    expect((markup.match(/<li[^>]*data-hbar-app-ui-item-id=/g) ?? []).length).toBe(8)
    expect(markup).toContain('data-hbar-app-ui-region="integration-permissions"')
    expect(markup).toContain('data-hbar-app-ui-region="integration-activity"')
    expect(markup).toContain('href="#"')
    expect(markup).toContain('>Full audit log<span')

    const requiredSwitch = switchFor(markup, 'Read repositories')
    const issueSwitch = switchFor(markup, 'Write issues')
    expect(requiredSwitch).toContain('checked=""')
    expect(requiredSwitch).toContain('disabled=""')
    expect(issueSwitch).not.toContain('disabled')
    expect(issueSwitch).toContain('checked=""')
  })

  test('uses host-controlled scope values, ignores duplicate and stale scope state, and disables read-only controls without a flow', () => {
    const content = createIntegrationConnectionReferenceFixture()
    const controlledMarkup = render({
      ...content,
      referenceFlow: {
        scopes: [
          { scopeId: 'issues', enabled: false },
          { scopeId: 'issues', enabled: true },
          { scopeId: 'members', enabled: true },
          { scopeId: 'removed-scope', enabled: true },
        ],
        onScopeChange: () => {},
      },
    })
    const readOnlyMarkup = render(content)

    expect(switchFor(controlledMarkup, 'Read repositories')).toContain('aria-label="Read repositories"')
    expect(switchFor(controlledMarkup, 'Read repositories')).toContain('disabled=""')
    expect(switchFor(controlledMarkup, 'Write issues')).not.toContain('checked=""')
    expect(switchFor(controlledMarkup, 'Write issues')).not.toContain('disabled')
    expect(switchFor(controlledMarkup, 'Read organization members')).toContain('checked=""')
    const readOnlySwitches = readOnlyMarkup.match(/<input[^>]*role="switch"[^>]*>/g) ?? []
    expect(readOnlySwitches.filter((input) => input.includes('disabled=""')).length).toBe(4)
  })

  test('keeps empty, one-item, deduplicated and over-bound content visible', () => {
    const content = createIntegrationConnectionReferenceFixture()
    const firstScope = content.scopes[0]
    const firstActivity = content.activities[0]
    if (!firstScope || !firstActivity) throw new Error('The connection fixture needs initial rows.')
    const emptyMarkup = render({ ...content, scopes: [], activities: [] })
    const oneMarkup = render({
      ...content,
      scopes: [firstScope],
      activities: [firstActivity],
    })
    const duplicateMarkup = render({
      ...content,
      scopes: [...content.scopes, { ...firstScope, label: 'Duplicate scope' }],
      activities: [...content.activities, { ...firstActivity, title: 'Duplicate activity' }],
    })
    const expectedActivityMaximum = content.activityListStrategy.expectedMaximum
    const boundaryActivities = Array.from({ length: expectedActivityMaximum }, (_, index) =>
      activity(`boundary-${index}`),
    )
    const overflowActivities = [...boundaryActivities, activity('over-bound')]
    const overflowMarkup = render({ ...content, activities: overflowActivities })

    expect(emptyMarkup).toContain(content.labels.emptyScopes)
    expect(emptyMarkup).toContain(content.labels.emptyActivity)
    expect(oneMarkup).toContain('Read repositories')
    expect(oneMarkup).toContain('Scopes updated by Ana Reyes')
    expect(duplicateMarkup).not.toContain('Duplicate scope')
    expect(duplicateMarkup).not.toContain('Duplicate activity')
    expect((overflowMarkup.match(/<li[^>]*data-hbar-app-ui-item-id="boundary-/g) ?? []).length).toBe(
      expectedActivityMaximum,
    )
    expect(overflowMarkup).toContain('data-hbar-app-ui-item-id="over-bound"')
    expect(overflowMarkup).toContain('data-hbar-app-ui-list-strategy="content-grown"')
  })

  test('keeps long German connection labels and activity copy host-owned', () => {
    const content = createIntegrationConnectionReferenceFixture('de-long')
    const markup = render(content)

    expect(markup).toContain('Verbunden')
    expect(markup).toContain('Berechtigungen')
    expect(markup).toContain(
      'Cedar Labs verwendet ausschließlich die Berechtigungen, die Sie für diese Verbindung aktiviert lassen.',
    )
    expect(markup).toContain('Vollständiges Prüfprotokoll öffnen')
    expect(markup).toContain('Berechtigungen von Ana Reyes aktualisiert')
    expect(markup).toContain('Repositorys lesen')
  })
})
