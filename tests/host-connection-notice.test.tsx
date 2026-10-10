import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarHostConnectionNotice } from '../packages/app-react/src/host-connection-notice'
import { getShellCopy } from '../apps/web/src/shell-copy'

for (const locale of ['zh-CN', 'en-US'] as const) {
  const labels = getShellCopy(locale).shell.connectionNotice
  test(`a confirmed connection has no workbench notice: ${locale}`, () => {
    expect(
      renderToStaticMarkup(<HbarHostConnectionNotice connection="connected" labels={labels} onReconnect={() => {}} />),
    ).toBe('')
  })
  for (const connection of ['disconnected', 'connecting', 'pairing'] as const)
    test(`one localized notice owns ${connection} feedback: ${locale}`, () => {
      const html = renderToStaticMarkup(
        <HbarHostConnectionNotice connection={connection} labels={labels} onReconnect={() => {}} />,
      )
      expect(html).toContain(
        connection === 'connecting'
          ? labels.connecting
          : connection === 'pairing'
            ? labels.pairing
            : labels.interrupted,
      )
      expect(html).toContain(labels.preserved)
      expect(html.match(/role="status"/g)).toHaveLength(1)
      expect(html).not.toContain('role="alert"')
      expect(html).not.toContain('DISCONNECTED')
      expect(html.match(/<button[^>]*disabled=""/g)?.length ?? 0).toBe(connection === 'connecting' ? 1 : 0)
    })
}

test('long Host copy stays in text flow and preserves a named recovery action', () => {
  const labels = {
    ...getShellCopy('zh-CN').shell.connectionNotice,
    preserved: '现有会话、未发送草稿和已完成结果保留，恢复连接后继续操作。🛰️'.repeat(40),
  }
  const html = renderToStaticMarkup(
    <HbarHostConnectionNotice connection="disconnected" labels={labels} onReconnect={() => {}} />,
  )
  expect(html).toContain(labels.preserved)
  expect(html).toContain(labels.reconnect)
  expect(html).not.toContain('style=')
})
