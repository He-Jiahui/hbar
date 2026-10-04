import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { SessionRosterFeedback } from '../packages/app-react/src/session-roster-feedback'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { SessionRosterRefreshEntry } from '@hbar/app-runtime'

const entry: SessionRosterRefreshEntry = {
  workspaceId: 'original-project',
  mode: 'manual',
  status: 'ready',
  error: null,
  checked: 0,
  remaining: 0,
  truncated: false,
  skipped: 0,
}
test('empty/idle and automatic complete refresh do not add repetitive prose to each project', () => {
  const labels = getShellCopy('zh-CN').shell.roster
  for (const state of [undefined, { ...entry, status: 'idle' as const }, { ...entry, mode: 'automatic' as const }])
    expect(
      renderToStaticMarkup(
        <SessionRosterFeedback entry={state} labels={labels} connected onRefresh={() => undefined} />,
      ),
    ).toBe('')
})
test('localized manual progress/result, bounded remaining count and retry are named at their original project', () => {
  for (const locale of ['zh-CN', 'en-US'] as const) {
    const labels = getShellCopy(locale).shell.roster
    const render = (change: Partial<SessionRosterRefreshEntry>, connected = true) =>
      renderToStaticMarkup(
        <SessionRosterFeedback
          entry={{ ...entry, ...change }}
          labels={labels}
          connected={connected}
          onRefresh={() => undefined}
        />,
      )
    expect(render({ status: 'loading' })).toContain(labels.refreshing)
    expect(render({})).toContain(labels.refreshed)
    expect(render({ remaining: 900 })).toContain(labels.remaining(900))
    expect(render({ truncated: true })).toContain(labels.limited)
    expect(render({ skipped: 1 })).toContain(labels.capacity(1))
    const error = render({ status: 'error', error: 'CONNECTION_CLOSED' }, false)
    expect(error).toContain('role="alert"')
    expect(error).toContain('data-roster-workspace-id="original-project"')
    expect(error).toContain(labels.retry)
    expect(error).toContain('disabled=""')
  }
})
