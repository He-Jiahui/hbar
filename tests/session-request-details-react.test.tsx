import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  HbarSessionRawMessages,
  HbarSessionRequestRecord,
  sessionRequestLatency,
} from '../packages/app-react/src/session-request-details'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { ReactNode } from 'react'
import { sessionRequestMessages } from '../packages/app-react/src/session-request-details'
import { sessionRequestItem, sessionRequestMessage } from './fixtures/session-request-fixtures'

test('per-request latency keeps a valid zero timestamp and distinguishes missing or inconsistent facts', () => {
  const item = sessionRequestItem()
  expect(sessionRequestLatency(item, 0)).toBe(0)
  expect(sessionRequestLatency(item, null)).toBeNull()
  expect(sessionRequestLatency({ ...item, startedAt: null }, 20)).toBeNull()
  expect(sessionRequestLatency({ ...item, startedAt: 30 }, 20)).toBeNull()
})

for (const locale of ['zh-CN', 'en-US'] as const) {
  const renderWithMessages = (labels: ReturnType<typeof getShellCopy>['monitoring']['requests'], view: ReactNode) =>
    renderToStaticMarkup(<sessionRequestMessages.Provider messages={labels}>{view}</sessionRequestMessages.Provider>)
  test(`compact request copy omits missing facts without hiding measured zero values: ${locale}`, () => {
    const labels = getShellCopy(locale).monitoring.requests
    const item = sessionRequestItem()
    const missing = labels.summary(140, null, { ...item.cost, availability: 'unavailable', value: null })
    expect(missing).toBe('140 tokens')
    expect(missing).not.toContain(labels.unavailable)
    const measured = labels.summary(0, 0, { ...item.cost, availability: 'available', value: 0, estimated: false })
    expect(measured).toContain('0 tokens')
    expect(measured).toContain('0 ms')
    expect(measured).toContain(labels.cost({ ...item.cost, availability: 'available', value: 0, estimated: false }))
  })
  test(`request details preserve cache accounting, unavailable cost and lazy raw data: ${locale}`, () => {
    const labels = getShellCopy(locale).monitoring.requests
    const item = sessionRequestItem()
    const html = renderWithMessages(labels, <HbarSessionRequestRecord item={item} messages={[]} />)
    expect(html).toContain(labels.fields.cacheRead)
    expect(html).toContain(labels.fields.cacheWrite)
    expect(html).toContain('120')
    expect(html).toContain(labels.fields.firstProviderEvent)
    expect(html).toContain('0 ms')
    expect(html).toContain(`<dd>${labels.unavailable}</dd>`)
    expect(html).not.toContain('$0.00')
    expect(html).toContain(labels.raw.request)
    expect(html).toContain(labels.raw.runMessages)
    expect(html).not.toContain('<pre')
    expect(labels.cost({ ...item.cost, availability: 'available', value: 0, estimated: false })).toContain('0.00')
    expect(labels.cost({ ...item.cost, availability: 'available', value: 0.125, estimated: true })).toContain(
      locale === 'zh-CN' ? '估算' : 'Estimated',
    )
  })
  for (const count of [0, 1, 20, 21, 1_000]) {
    test(`raw messages render bounded lazy rows without truncating their source: ${locale}, ${count}`, () => {
      const labels = getShellCopy(locale).monitoring.requests
      const messages = Array.from({ length: count }, (_, index) => sessionRequestMessage(`message-${index}`, index + 1))
      const html = renderWithMessages(labels, <HbarSessionRawMessages messages={messages} identity="session-A" />)
      expect((html.match(/data-message-id=/g) ?? []).length).toBe(Math.min(20, count))
      expect(html).toContain(labels.raw.count(Math.min(20, count), count))
      expect(html).not.toContain('Original content')
      expect(html).not.toContain('<pre')
      if (count > 20) expect(html).toContain(labels.raw.more(Math.min(20, count - 20)))
      if (count === 0) expect(html).toContain(labels.raw.empty)
    })
  }
}
