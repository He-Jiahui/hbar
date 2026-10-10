import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarContextCompactionNotice, HbarContextHistory } from '@hbar/app-react'
import { HbarSessionLiveStatus } from '../packages/app-react/src/session-live-status'
import { contextHistoryCopy } from '../apps/web/src/context-history-copy'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { contextRecord, contextHistoryPage } from './fixtures/context-history'

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`active notice and completed history use ${locale} Host formatting`, () => {
    const labels = contextHistoryCopy(locale)
    const active = contextRecord({ status: 'running', endedAt: null, durationMs: null, afterTokens: null })
    const notice = renderToStaticMarkup(
      <HbarContextCompactionNotice record={active} sessionId="session-one" owned connected labels={labels} />,
    )
    expect(notice).toContain(labels.notice)
    expect(notice).toContain('role="status"')
    expect(notice).toContain('80%')
    expect(
      renderToStaticMarkup(
        <HbarContextCompactionNotice
          record={contextRecord()}
          sessionId="session-one"
          owned
          connected
          labels={labels}
        />,
      ),
    ).toBe('')
    const html = renderToStaticMarkup(
      <HbarContextHistory
        sessionId="session-one"
        page={contextHistoryPage([contextRecord()])}
        before={null}
        error={null}
        labels={labels}
        onLoad={() => undefined}
      />,
    )
    expect(html).toContain(labels.title)
    expect(html).toContain('75%')
    expect(html).toContain('2,500') // cached input is not counted a second time
    expect(html).toContain('10%')
    expect(html).toContain('250')
    expect(html).toContain(labels.estimates)
  })
}

test('foreign sessions, settled runs and non-owning panes cannot display an active compaction', () => {
  const labels = contextHistoryCopy('zh-CN')
  const active = contextRecord({ status: 'running' })
  expect(
    renderToStaticMarkup(
      <HbarContextCompactionNotice record={active} sessionId="other" owned connected labels={labels} />,
    ),
  ).toBe('')
  expect(
    renderToStaticMarkup(
      <HbarContextCompactionNotice record={active} sessionId="session-one" owned={false} connected labels={labels} />,
    ),
  ).toBe('')
  const disconnected = renderToStaticMarkup(
    <HbarContextCompactionNotice record={active} sessionId="session-one" owned connected={false} labels={labels} />,
  )
  expect(disconnected).toContain(labels.offline)
  expect(disconnected).not.toContain(labels.notice)
  expect(
    renderToStaticMarkup(
      <HbarContextHistory
        sessionId="other"
        page={contextHistoryPage()}
        before={null}
        error={null}
        labels={labels}
        onLoad={() => undefined}
      />,
    ),
  ).toBe('')
})

test.each([0, 1, 10, 20, 21])('history renders a bounded page of %i records without duplicate identities', (count) => {
  const records = Array.from({ length: count }, (_, index) =>
    contextRecord({ id: `record-${index}`, seq: index + 1, window: index + 1 }),
  )
  const labels = { ...contextHistoryCopy('en-US'), title: 'Long translated window title '.repeat(15) }
  const html = renderToStaticMarkup(
    <HbarContextHistory
      sessionId="session-one"
      page={contextHistoryPage([...records, ...records])}
      before={null}
      error={null}
      labels={labels}
      onLoad={() => undefined}
    />,
  )
  expect((html.match(/data-context-history-id=/g) ?? []).length).toBe(Math.min(count, 20))
  expect(html).toContain(labels.title)
  if (!count) expect(html).toContain(labels.empty)
})

test('history keeps settled session status reachable with no Goal or Plan and preserves honest failures', () => {
  const labels = getShellCopy('zh-CN').session.liveStatus
  const page = contextHistoryPage([
    contextRecord({ status: 'failed', afterTokens: null, errorCode: 'COMPACTION_FAILED' }),
  ])
  const html = renderToStaticMarkup(
    <HbarSessionLiveStatus
      sessionId="session-one"
      timelineSessionId="session-one"
      owned
      connected
      run={undefined}
      labels={labels}
      history={{ page, before: null, error: 'Unavailable', status: 'error', onLoad: () => undefined }}
    />,
  )
  expect(html).toContain('data-visible="true"')
  expect(html).toContain('压缩失败')
  expect(html).toContain('role="alert"')
  expect(html).toContain('重新读取')
  expect(html).toContain('未知')
})
