import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { LumenAgentActivityViewModel } from '@lumen/app-ui/catalog'
import {
  getHbarAppUiVariant,
  HbarAppUiAgentActivityProvider,
  type HbarAppUiAgentActivityContent,
} from '../packages/hbar-app-ui/src/index'
import {
  HBAR_APP_UI_AGENT_ACTIVITY_FIXTURES,
  createHbarAppUiAgentActivityLocalizedFixtures,
} from './fixtures/hbar-app-ui-agent-activity-fixtures'

const controlled: LumenAgentActivityViewModel = {
  ownerId: 'test-owner',
  openGroupIds: [],
  activeFilterId: 'all',
  liveStopped: false,
  deploymentStopped: false,
  retryQueued: false,
  log: { visibleCount: 26, running: false, lineCount: '26 lines' },
}
function render(
  variant: number,
  viewModel: LumenAgentActivityViewModel,
  content: HbarAppUiAgentActivityContent = HBAR_APP_UI_AGENT_ACTIVITY_FIXTURES,
) {
  return renderToStaticMarkup(
    createElement(HbarAppUiAgentActivityProvider, {
      content: { ...content, viewModel },
      children: createElement(getHbarAppUiVariant('agent-activity', variant).component, {}),
    }),
  )
}

describe('Host-controlled Agent Activity surfaces', () => {
  test('uses supplied disclosure and log snapshot state instead of internal defaults', () => {
    const nested = render(2, { ...controlled, openGroupIds: ['load', 'stale'] })
    expect(nested).toContain('aria-expanded="true"')
    expect(nested.match(/aria-expanded="true"/g)).toHaveLength(1)
    expect(nested).toContain('Stage to temp table')
    expect(nested).not.toContain('Validate source schema')
    const log = render(5, { ...controlled, activeFilterId: 'error' })
    expect(log).toContain('Write to reporting.accounts timed out after 30s')
    expect(log).not.toContain('Loaded 3 source connectors')
    expect(log).toContain('26 lines')
    expect(log).not.toContain('aria-label="Stop"')
    const all = render(5, controlled)
    expect(all).toContain('Run complete, 2,244 records processed')
  })

  test('renders confirmed Host phases and local notice without inventing missing record values', () => {
    const deployment = render(3, { ...controlled, deploymentStopped: true, notice: 'Local preview only' })
    expect(deployment).toContain('Run again')
    expect(deployment).toContain('Stopped')
    expect(deployment).toContain('role="status"')
    expect(deployment).toContain('Local preview only')
    const queued = render(7, { ...controlled, retryQueued: true })
    expect(queued).toContain('Cancel retry')
    expect(queued).toContain('Retry queued')
    expect(queued).toContain('Timed out writing 2,244 rows')
    expect(queued).toContain('ledger-partial.csv')
    const failed = render(7, controlled)
    expect(failed).toContain('Warehouse write timed out')
    expect(failed).not.toContain('Retry queued')
  })

  test('keeps localized empty log copy Host-owned and accepts controlled empty groups', () => {
    const localized = createHbarAppUiAgentActivityLocalizedFixtures()
    const empty = render(
      5,
      { ...controlled, log: { visibleCount: 0, running: false, lineCount: 'Keine Zeilen' } },
      {
        ...localized,
        log: localized.log ? { ...localized.log, entries: [] } : undefined,
      },
    )
    expect(empty).toContain('Keine Zeilen')
    expect(empty).not.toContain('26 Zeilen')
    expect(empty).not.toContain('Run complete')
    const collapsed = render(2, controlled)
    expect(collapsed.match(/aria-expanded="false"/g)).toHaveLength(5)
    expect(collapsed).not.toContain('Read subscriptions')
  })
})
