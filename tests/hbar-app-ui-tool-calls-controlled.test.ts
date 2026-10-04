import { describe, expect, test } from 'bun:test'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenToolCalls, type LumenToolCallsContent, type LumenToolCallsViewModel } from '@lumen/app-ui'
import {
  HBAR_APP_UI_TOOL_CALLS_FIXTURES,
  createHbarAppUiToolCallsLocalizedFixtures,
} from './fixtures/hbar-app-ui-tool-calls-fixtures'

function model(changes: Partial<LumenToolCallsViewModel> = {}): LumenToolCallsViewModel {
  return {
    ownerId: 'tools-owner',
    openTraceIds: [],
    activeFilterId: null,
    openDiffIds: [],
    selectedOutputTabId: null,
    openRequestIds: [],
    permissions: [],
    ...changes,
  }
}
function render(
  variant: number,
  viewModel: LumenToolCallsViewModel,
  content: LumenToolCallsContent = HBAR_APP_UI_TOOL_CALLS_FIXTURES,
): string {
  return renderToStaticMarkup(
    createElement(LumenToolCalls, { variant, variantId: `hbar-app-ui-tool-calls-${variant}`, content, viewModel }),
  )
}

describe('controlled Tool Calls contracts', () => {
  test('Host owns disclosure, supplied arguments/result, and read-only activity rows', () => {
    const trace = render(1, model({ openTraceIds: ['search-incidents'], onAction: () => undefined }))
    expect(trace).toContain('lumen-tool-calls-controlled')
    expect(trace).toContain('aria-expanded="true"')
    expect(trace).toContain('INC-2487')
    expect(trace).toContain('ARGUMENTS')
    expect(trace).toContain('RESULT')
    expect(trace).not.toContain('aria-label="Stop"')
    expect(render(1, model())).not.toContain('INC-2487')
    const filtered = render(2, model({ activeFilterId: 'failed', onAction: () => undefined }))
    expect(filtered).toContain('fetch_url')
    expect(filtered).not.toContain('codebase_search')
    expect(filtered).toContain('<div class="hbar-app-ui-tool-calls-activity-row">')
    expect(filtered).toContain('aria-label="Retry fetch URL"')
  })

  test('Host-selected output is an associated panel, while empty/stale data has safe fallback', () => {
    const stderr = render(5, model({ selectedOutputTabId: 'stderr' }))
    expect(stderr).toContain('role="tabpanel"')
    expect(stderr).toContain('aria-labelledby=')
    expect(stderr).toContain('expected status 409')
    expect(stderr).not.toContain('PASS services/payments/retry.test.ts')
    const stale = render(5, model({ selectedOutputTabId: 'removed' }))
    expect(stale).toContain('PASS services/payments/retry.test.ts')
    const command = HBAR_APP_UI_TOOL_CALLS_FIXTURES.command
    if (!command) throw new Error('Missing command fixture')
    expect(render(5, model(), { command: { ...command, tabs: [] } })).not.toContain('role="tabpanel"')
    const paired = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        createElement(LumenToolCalls, {
          variant: 5,
          variantId: 'tools-a',
          content: HBAR_APP_UI_TOOL_CALLS_FIXTURES,
          viewModel: model(),
        }),
        createElement(LumenToolCalls, {
          variant: 5,
          variantId: 'tools-b',
          content: HBAR_APP_UI_TOOL_CALLS_FIXTURES,
          viewModel: model(),
        }),
      ),
    )
    const ids = Array.from(paired.matchAll(/id="([^"]+-output)"/g), (match) => match[1])
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })

  test('Permission controls reflect their group-owned preview values, payload, and localized feedback', () => {
    const localized = createHbarAppUiToolCallsLocalizedFixtures()
    const markup = render(
      6,
      model({
        permissions: [{ groupId: 'filesystem', itemId: 'permission-read-file', enabled: false }],
        openRequestIds: [{ groupId: 'requests', itemId: 'send-email-request' }],
        requestFeedback: [
          {
            groupId: 'requests',
            itemId: 'send-email-request',
            message: 'Nur eine lokale Vorschau-Anfrage, keine echte Freigabe.',
          },
        ],
      }),
      localized,
    )
    expect(markup).toContain('Werkzeugberechtigungen fuer diesen Arbeitsbereich')
    expect(markup).toContain('2 ausstehende Freigabeanfragen')
    expect(markup).toContain('q3-renewals.pdf')
    expect(markup).toContain('Nur eine lokale Vorschau-Anfrage, keine echte Freigabe.')
    expect(markup).toContain('aria-expanded="true"')
    expect(markup).toMatch(
      /aria-label="Toggle read file permission"[^>]*aria-checked="false"|aria-checked="false"[^>]*aria-label="Toggle read file permission"/,
    )
    expect(markup).toContain('disabled')
    expect(markup).toContain('Auto-approved')
    expect(markup).toContain('Waiting for the request above')
  })

  test('Search uses native placeholder links and missing callbacks do not imply an action capability', () => {
    const enabled = render(4, model({ onAction: () => undefined }))
    expect(enabled.match(/href="#"/g)).toHaveLength(7)
    expect(enabled).toContain('Idempotency-Key')
    const disabled = render(4, model())
    expect(disabled).not.toContain('href="#"')
    expect(disabled).toContain('aria-disabled="true"')
  })
})
