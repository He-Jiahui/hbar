import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarMessageBlocks } from '../packages/app-react/src/session-message'
import { MessageInlineMarkdown } from '../packages/app-react/src/message-markdown'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { createSessionToolPresenter } from '../apps/web/src/session-tool-presentation'

test('collapsed thinking parses inline Markdown without nested controls, image requests or executable HTML', () => {
  const html = renderToStaticMarkup(
    <MessageInlineMarkdown
      text={
        '**重点** `code` [链接](https://example.invalid) ![说明](https://example.invalid/a.png) <script>evil()</script>'
      }
    />,
  )
  expect(html).toContain('<strong>重点</strong>')
  expect(html).toContain('<code>code</code>')
  expect(html).toContain('hbar-session-inline-link')
  expect(html).toContain('说明')
  expect(html).not.toMatch(/<(?:a|button|img|script|p|pre|h[1-6])(?:\s|>)/)
  expect(html).not.toContain('**重点**')
})

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`localized folded activity preserves name collisions and styles counts and true outcomes: ${locale}`, () => {
    const labels = getShellCopy(locale).session.messageBlocks
    const first = {
      type: 'tool_call' as const,
      callId: 'a',
      name: 'original-a',
      args: { path: 'first.ts' },
      presentation: { version: 1 as const, kind: 'file-read' as const, pathField: 'path' },
    }
    const second = { ...first, callId: 'b', name: 'original-b' }
    const failed = {
      type: 'tool_result' as const,
      callId: 'b',
      name: second.name,
      text: 'original failure',
      isError: true,
      outcome: { kind: 'failed' as const, executionStarted: true },
    }
    const html = renderToStaticMarkup(
      <HbarMessageBlocks
        sessionId="s"
        messageId="m"
        blocks={[{ type: 'thinking', text: '**Focus**' }, first, second, failed]}
        labels={labels}
        describeTool={createSessionToolPresenter(locale)}
      />,
    )
    expect(html).toContain('data-activity-role="thinking"')
    expect(html).toContain('data-activity-role="tool"')
    expect(html).toContain('data-activity-role="count"')
    expect(html).toContain('data-activity-role="danger"')
    expect(html).toContain('(original-a)')
    expect(html).toContain('(original-b)')
    expect(html).toContain(locale === 'zh-CN' ? '1 项失败' : '1 failed')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('<pre')
  })
}
