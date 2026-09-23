import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiAgentActivityProvider,
  selectHbarAppUiAgentActivityItem,
  uniqueHbarAppUiAgentActivityItems,
  type HbarAppUiAgentActivityContent,
  type HbarAppUiAgentActivityHistoryContent,
  type HbarAppUiAgentActivityLogContent,
  type HbarAppUiAgentActivityLiveContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiAgentActivityLocalizedFixtures,
  HBAR_APP_UI_AGENT_ACTIVITY_FIXTURES,
} from './fixtures/hbar-app-ui-agent-activity-fixtures'

function renderActivity(
  variant: number,
  content: HbarAppUiAgentActivityContent = HBAR_APP_UI_AGENT_ACTIVITY_FIXTURES,
): string {
  const component = getHbarAppUiVariant('agent-activity', variant).component
  return renderToStaticMarkup(
    createElement(HbarAppUiAgentActivityProvider, { content, children: createElement(component, {}) }),
  )
}

function requiredLive(content: HbarAppUiAgentActivityContent): HbarAppUiAgentActivityLiveContent {
  if (!content.live) throw new Error('Expected live activity fixture')
  return content.live
}

function requiredHistory(content: HbarAppUiAgentActivityContent): HbarAppUiAgentActivityHistoryContent {
  if (!content.history) throw new Error('Expected history activity fixture')
  return content.history
}

function requiredLog(content: HbarAppUiAgentActivityContent): HbarAppUiAgentActivityLogContent {
  if (!content.log) throw new Error('Expected log activity fixture')
  return content.log
}

describe('hbar-app-ui agent activity surfaces', () => {
  test('renders seven independent flow surfaces from host-provided content', () => {
    const markup = Array.from({ length: 7 }, (_, index) => renderActivity(index + 1))
    expect(markup.every((surface) => !surface.includes('<main'))).toBe(true)

    expect(markup[0]).toContain('hbar-app-ui-agent-activity-live')
    expect(markup[0]).toContain('Loaded October general ledger')
    expect(markup[0]).toContain('<button')
    expect(markup[0]).toContain('Reconcile October invoices')
    expect(markup[0]).toContain('Running')
    expect(markup[1]).toContain('hbar-app-ui-agent-activity-nested')
    expect(markup[1]).toContain('Prepare export')
    expect(markup[2]).toContain('hbar-app-ui-agent-activity-deployment')
    expect(markup[2]).toContain('Build the container image')
    expect(markup[2]).not.toContain('Deploy checkout-api')
    expect((markup[2] ?? '').match(/<button/g)).toHaveLength(1)
    expect(markup[3]).toContain('hbar-app-ui-agent-activity-history')
    expect(markup[3]).toContain('Reconcile October invoices')
    expect(markup[4]).toContain('hbar-app-ui-agent-activity-log')
    expect(markup[4]).toContain('Run complete, 2,244 records processed')
    expect(markup[5]).toContain('hbar-app-ui-agent-activity-workers')
    expect(markup[5]).toContain('Import workers')
    expect(markup[6]).toContain('hbar-app-ui-agent-activity-failure')
    expect(markup[6]).toContain('Warehouse write timed out')
    expect(new Set(markup).size).toBe(7)

    for (const surface of markup) {
      const normalized = surface.toLocaleLowerCase()
      expect(normalized).not.toContain('react-bits')
      expect(normalized).not.toContain('reactbits')
    }
  })

  test('keeps reference meaning in semantic text and flow regions', () => {
    const live = renderActivity(1)
    const history = renderActivity(4)
    const failure = renderActivity(7)

    expect(live).toContain('<ol class="lumen-agent-activity-list hbar-app-ui-agent-activity-live-list"')
    expect(live).toContain('<header class="lumen-agent-activity-heading hbar-app-ui-agent-activity-live-heading"')
    expect(live).toContain('Reconcile October invoices')
    expect(live).toContain('>Stop<span data-edge="bottom"')
    expect(live).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    const nested = renderActivity(2)
    expect(nested).toContain('Weekly warehouse export')
    expect(nested).toContain('Succeeded')
    expect(nested).toContain('32.4s')
    expect(nested.match(/<button/g)).toHaveLength(5)
    expect(nested.match(/aria-expanded="true"/g)).toHaveLength(3)
    expect(nested.match(/aria-expanded="false"/g)).toHaveLength(2)
    expect(nested).not.toContain('role="progressbar"')
    expect(nested).not.toContain('Expand all')
    expect(HBAR_APP_UI_AGENT_ACTIVITY_FIXTURES.nested?.groups[3]?.children.map((child) => child.label)).toEqual([
      'Stage to temp table',
      'Merge into reporting schema',
    ])
    expect(HBAR_APP_UI_AGENT_ACTIVITY_FIXTURES.nested?.groups[4]?.children.map((child) => child.label)).toEqual([
      'Compare row counts',
      'Check referential integrity',
    ])
    expect(history).toContain('<table class="hbar-app-ui-agent-activity-history-table"')
    expect(history).toContain('Run history, newest first.')
    expect(history).toContain('hbar-app-ui-agent-activity-history-cards')
    expect(history).not.toContain('<h2')
    expect(history.match(/aria-label="Re-run /g)).toHaveLength(28)
    expect(failure).toContain('<dl class="hbar-app-ui-agent-activity-definition-list">')
    expect(failure).toContain('Warehouse write timed out')
    expect(failure).toContain('data-hbar-app-ui-list-strategy="content-grown"')
  })

  test('renders long non-default host locale data without package fallback copy', () => {
    const localized = createHbarAppUiAgentActivityLocalizedFixtures()
    const live = renderActivity(1, localized)
    const log = renderActivity(5, localized)
    const failure = renderActivity(7, localized)

    expect(live).toContain('Loaded October general ledger')
    expect(live).toContain('Ausführung sicher anhalten')
    expect(log).toContain('Ausführungsprotokoll mit absichtlich langem lokalisiertem Titel')
    expect(log).toContain('Alle Einträge')
    expect(failure).toContain('Oktoberbuch-Export fehlgeschlagen')
    expect(failure).toContain('Datei herunterladen')
    expect(live.match(/<button/g)).toHaveLength(1)
  })

  test('handles empty, stale, duplicate, boundary, and over-bound records without synthetic items', () => {
    const live = requiredLive(HBAR_APP_UI_AGENT_ACTIVITY_FIXTURES)
    const history = requiredHistory(HBAR_APP_UI_AGENT_ACTIVITY_FIXTURES)
    const log = requiredLog(HBAR_APP_UI_AGENT_ACTIVITY_FIXTURES)

    const empty: HbarAppUiAgentActivityContent = {
      ...HBAR_APP_UI_AGENT_ACTIVITY_FIXTURES,
      live: { ...live, steps: [], activeStepId: 'missing' },
    }
    expect(renderActivity(1, empty)).not.toContain('Loaded October general ledger')

    const duplicateHistory: HbarAppUiAgentActivityContent = {
      ...HBAR_APP_UI_AGENT_ACTIVITY_FIXTURES,
      history: {
        ...history,
        rows: [
          {
            id: 'same',
            name: 'Kept history row',
            state: 'complete',
            stateLabel: 'Succeeded',
            duration: '1s',
            cost: '$0',
            started: 'now',
          },
          {
            id: 'same',
            name: 'Duplicate history row',
            state: 'failed',
            stateLabel: 'Failed',
            duration: '2s',
            cost: '$1',
            started: 'later',
          },
        ],
      },
    }
    const duplicateMarkup = renderActivity(4, duplicateHistory)
    expect(duplicateMarkup).toContain('Kept history row')
    expect(duplicateMarkup).not.toContain('Duplicate history row')

    const staleLog: HbarAppUiAgentActivityContent = {
      ...HBAR_APP_UI_AGENT_ACTIVITY_FIXTURES,
      log: { ...log, activeFilterId: 'missing-filter' },
    }
    expect(renderActivity(5, staleLog)).toContain('Run complete, 2,244 records processed')

    const boundary = Array.from({ length: live.listStrategy.expectedMaximum }, (_, index) => ({
      id: `boundary-${index}`,
      label: `Boundary live step ${index}`,
      duration: '-',
      state: 'queued' as const,
    }))
    const overBoundary = [
      ...boundary,
      { id: 'boundary-over', label: 'Over-bound live step', duration: '-', state: 'queued' as const },
    ]
    expect(
      renderActivity(1, { ...HBAR_APP_UI_AGENT_ACTIVITY_FIXTURES, live: { ...live, steps: boundary } }).match(
        /Boundary live step/g,
      ),
    ).toHaveLength(live.listStrategy.expectedMaximum)
    expect(
      renderActivity(1, { ...HBAR_APP_UI_AGENT_ACTIVITY_FIXTURES, live: { ...live, steps: overBoundary } }).match(
        /live step/g,
      ),
    ).toHaveLength(live.listStrategy.expectedMaximum + 1)
  })

  test('uses stable IDs and first-item fallback after host list mutation', () => {
    const items = [
      { id: 'kept', value: 'first' },
      { id: 'kept', value: 'duplicate' },
      { id: 'other', value: 'second' },
    ]
    const unique = uniqueHbarAppUiAgentActivityItems(items)

    expect(unique).toEqual([
      { id: 'kept', value: 'first' },
      { id: 'other', value: 'second' },
    ])
    expect(selectHbarAppUiAgentActivityItem(unique, 'missing')).toEqual({ id: 'kept', value: 'first' })
    expect(selectHbarAppUiAgentActivityItem([], 'missing')).toBeUndefined()
  })
})
