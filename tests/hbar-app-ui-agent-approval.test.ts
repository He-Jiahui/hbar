import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiAgentApprovalProvider,
  selectHbarAppUiAgentApprovalItem,
  uniqueHbarAppUiAgentApprovalItems,
  type HbarAppUiAgentApprovalContent,
  type HbarAppUiAgentApprovalHistoryContent,
  type HbarAppUiAgentApprovalInlineContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiAgentApprovalLocalizedFixtures,
  HBAR_APP_UI_AGENT_APPROVAL_FIXTURES,
} from './fixtures/hbar-app-ui-agent-approval-fixtures'

function renderApproval(
  variant: number,
  content: HbarAppUiAgentApprovalContent = HBAR_APP_UI_AGENT_APPROVAL_FIXTURES,
): string {
  const component = getHbarAppUiVariant('agent-approval', variant).component
  return renderToStaticMarkup(
    createElement(HbarAppUiAgentApprovalProvider, { content, children: createElement(component, {}) }),
  )
}

function requiredInline(content: HbarAppUiAgentApprovalContent): HbarAppUiAgentApprovalInlineContent {
  if (!content.inline) throw new Error('Expected inline approval fixture')
  return content.inline
}

function requiredHistory(content: HbarAppUiAgentApprovalContent): HbarAppUiAgentApprovalHistoryContent {
  if (!content.history) throw new Error('Expected approval history fixture')
  return content.history
}

describe('hbar-app-ui agent approval surfaces', () => {
  test('renders six independent approval surfaces from host-provided content', () => {
    const markup = Array.from({ length: 6 }, (_, index) => renderApproval(index + 1))

    expect(markup[0]).toContain('hbar-app-ui-agent-approval-inline')
    expect(markup[0]).toContain('Delete 12 archived projects and their build history')
    expect(markup[1]).toContain('hbar-app-ui-agent-approval-diff')
    expect(markup[1]).toContain('Retention window')
    expect(markup[2]).toContain('hbar-app-ui-agent-approval-queue')
    expect(markup[2]).toContain('Refund 3 duplicate charges to Acme Logistics')
    expect(markup[3]).toContain('hbar-app-ui-agent-approval-permission')
    expect(markup[3]).toContain('Read customer records')
    expect(markup[4]).toContain('hbar-app-ui-agent-approval-cost')
    expect(markup[4]).toContain('Run the Q4 demand forecast')
    expect(markup[5]).toContain('hbar-app-ui-agent-approval-history')
    expect(markup[5]).toContain('Refunded 3 duplicate charges to Acme Logistics')
    expect(new Set(markup).size).toBe(6)

    expect(markup[0]).toContain('data-boundary="none"')
    expect(markup[1]).toContain('data-boundary="none"')
    expect(markup[2]).toContain('data-boundary="none"')
    expect(markup[3]).toContain('data-boundary="none"')
    expect(markup[4]).toContain('data-boundary="none"')
    for (const surface of markup.slice(5)) {
      expect(surface).toContain('data-boundary="horizontal"')
    }
    for (const surface of markup) {
      const normalized = surface.toLocaleLowerCase()
      expect(normalized).not.toContain('react-bits')
      expect(normalized).not.toContain('reactbits')
    }
  })

  test('preserves reference reading order and flex-owned alignment semantics', () => {
    const inline = renderApproval(1)
    const diff = renderApproval(2)
    const queue = renderApproval(3)
    const permission = renderApproval(4)
    const history = renderApproval(6)

    expect(inline).toContain('Today')
    expect(inline).toContain('Clean up the archived projects: we’re over the storage quota again.')
    expect(inline).toContain('Needs approval')
    expect(inline).toContain('aria-expanded="false"')
    expect(inline).toContain('aria-label="Delete 12 archived projects and their build history"')
    expect(inline).not.toContain('<main')
    expect(inline).not.toContain('<h2')
    expect(inline).not.toContain('<pre')
    expect(diff).toContain('<dl class="hbar-app-ui-agent-approval-change-list">')
    expect(diff).toContain('<span>180 days</span>')
    expect(diff).toContain('<span>45 days</span>')
    expect(diff).toContain('hbar-app-ui-agent-approval-diff-arrow')
    expect(diff).toContain('aria-expanded="false"')
    expect(diff).not.toContain('<pre')
    expect(diff).toContain('aria-label="Change the invoice retention window from 180 to 45 days"')
    expect(queue).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(permission).toContain('class="hbar-app-ui-agent-approval-scope-list"')
    expect(permission).toContain('data-hbar-app-ui-list-strategy="content-grown"')
    expect(permission).toContain('<h3')
    expect(permission).not.toContain('<pre')
    expect(history).toContain('aria-label="Search history"')
    expect(history).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  })

  test('renders long non-default host locale data without package fallback copy', () => {
    const localized = createHbarAppUiAgentApprovalLocalizedFixtures()
    const inline = renderApproval(1, localized)
    const queue = renderApproval(3, localized)
    const history = renderApproval(6, localized)

    expect(inline).toContain('Vollständigen Antrag anzeigen')
    expect(inline).toContain('Zwölf archivierte Projekte und ihre Build-Historie dauerhaft löschen')
    expect(queue).toContain('Ausstehende Genehmigungen')
    expect(history).toContain('Genehmigungsverlauf für diesen Arbeitsbereich')
    expect(history).toContain('Entscheidungen mit langen Beschreibungen durchsuchen')
    expect(inline).not.toContain('Show request')
  })

  test('handles empty, stale, duplicate, boundary, and over-bound approval data', () => {
    const inline = requiredInline(HBAR_APP_UI_AGENT_APPROVAL_FIXTURES)
    const history = requiredHistory(HBAR_APP_UI_AGENT_APPROVAL_FIXTURES)

    const empty: HbarAppUiAgentApprovalContent = {
      ...HBAR_APP_UI_AGENT_APPROVAL_FIXTURES,
      inline: { ...inline, userMessage: '', detailMessage: '', requestDescription: '' },
    }
    expect(renderApproval(1, empty)).toContain('hbar-app-ui-agent-approval-inline')
    expect(renderApproval(1, empty)).not.toContain('Clean up the archived projects')

    const duplicateHistory: HbarAppUiAgentApprovalContent = {
      ...HBAR_APP_UI_AGENT_APPROVAL_FIXTURES,
      history: {
        ...history,
        entries: [
          {
            id: 'same',
            title: 'Kept approval',
            detail: 'Owner',
            state: 'approved',
            stateLabel: 'Approved',
            when: 'now',
            filterIds: ['all', 'approved'],
          },
          {
            id: 'same',
            title: 'Duplicate approval',
            detail: 'Owner',
            state: 'expired',
            stateLabel: 'Expired',
            when: 'later',
            filterIds: ['all', 'expired'],
          },
        ],
      },
    }
    const duplicateMarkup = renderApproval(6, duplicateHistory)
    expect(duplicateMarkup).toContain('Kept approval')
    expect(duplicateMarkup).not.toContain('Duplicate approval')

    const boundary = Array.from({ length: history.listStrategy.expectedMaximum }, (_, index) => ({
      id: `boundary-${index}`,
      title: `Boundary decision ${index}`,
      detail: 'Owner',
      state: 'approved' as const,
      stateLabel: 'Approved',
      when: 'now',
      filterIds: ['all', 'approved'],
    }))
    const overBoundary = [
      ...boundary,
      {
        id: 'over',
        title: 'Over-bound decision',
        detail: 'Owner',
        state: 'approved' as const,
        stateLabel: 'Approved',
        when: 'now',
        filterIds: ['all', 'approved'],
      },
    ]
    expect(
      renderApproval(6, { ...HBAR_APP_UI_AGENT_APPROVAL_FIXTURES, history: { ...history, entries: boundary } }).match(
        /Boundary decision/g,
      ),
    ).toHaveLength(history.listStrategy.expectedMaximum)
    expect(
      renderApproval(6, {
        ...HBAR_APP_UI_AGENT_APPROVAL_FIXTURES,
        history: { ...history, entries: overBoundary },
      }).match(/Boundary decision|Over-bound decision/g),
    ).toHaveLength(history.listStrategy.expectedMaximum + 1)
  })

  test('uses stable-ID de-duplication and first-item fallback after host mutation', () => {
    const items = [
      { id: 'kept', value: 'first' },
      { id: 'kept', value: 'duplicate' },
      { id: 'other', value: 'second' },
    ]
    const unique = uniqueHbarAppUiAgentApprovalItems(items)

    expect(unique).toEqual([
      { id: 'kept', value: 'first' },
      { id: 'other', value: 'second' },
    ])
    expect(selectHbarAppUiAgentApprovalItem(unique, 'missing')).toEqual({ id: 'kept', value: 'first' })
    expect(selectHbarAppUiAgentApprovalItem([], 'missing')).toBeUndefined()
  })

  test('keeps diff summary rows content-grown for empty, boundary and over-bound host lists', () => {
    const diff = HBAR_APP_UI_AGENT_APPROVAL_FIXTURES.diff
    if (!diff) throw new Error('Expected diff approval fixture')
    for (const count of [0, 1, diff.listStrategy.expectedMaximum, diff.listStrategy.expectedMaximum + 1]) {
      const changes = Array.from({ length: count }, (_, index) => ({
        id: `change-${index}`,
        label: `Host row ${index}`,
        previousValue: 'Old',
        nextValue: 'New',
      }))
      const markup = renderApproval(2, { ...HBAR_APP_UI_AGENT_APPROVAL_FIXTURES, diff: { ...diff, changes } })
      expect(markup.match(/<dt>/g) ?? []).toHaveLength(count)
      expect(markup).toContain('data-hbar-app-ui-list-strategy="content-grown"')
    }
    const first = diff.changes[0]
    if (!first) throw new Error('Expected first diff row')
    const markup = renderApproval(2, {
      ...HBAR_APP_UI_AGENT_APPROVAL_FIXTURES,
      diff: { ...diff, changes: [first, { ...first, label: 'Duplicate row must not render' }] },
    })
    expect(markup.match(/<dt>/g)).toHaveLength(1)
    expect(markup).not.toContain('Duplicate row must not render')
    const localized = renderApproval(2, createHbarAppUiAgentApprovalLocalizedFixtures())
    expect(localized).toContain('Vollständige Änderungsliste anzeigen')
    expect(localized).not.toContain('Show diff')
  })
})
