import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarSessionExecutionStatus } from '../packages/app-react/src/session-execution-status'
import { getShellCopy } from '../apps/web/src/shell-copy'

for (const locale of ['zh-CN', 'en-US'] as const)
  for (const state of ['running', 'queued', 'waiting_approval', 'failed', 'unconfirmed'] as const)
    test(`confirmed running owns the spinner while ${locale} ${state} stays identifiable`, () => {
      const labels = getShellCopy(locale).session.liveStatus
      const label = state === 'unconfirmed' ? labels.offline : labels.statusLabel(state)
      const html = renderToStaticMarkup(<HbarSessionExecutionStatus state={state} label={label} tone="info" />)
      expect(html).toContain(label)
      expect(html).toContain(`data-state="${state}"`)
      expect(html.includes('hbar-session-execution-spinner')).toBe(state === 'running')
      expect(html).toContain('aria-hidden="true"')
    })
