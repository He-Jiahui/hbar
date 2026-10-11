import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarMessageBlocks, messageActivitySummary } from '../packages/app-react/src/session-message'
import { buildMessageRows } from '../packages/app-react/src/session-message-model'
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
  test(`localized settled activity styles category counts and outcomes while retaining original identities: ${locale}`, () => {
    const labels = getShellCopy(locale).session.messageBlocks
    const first = {
      type: 'tool_call' as const,
      callId: 'a',
      name: 'original-a',
      args: { path: 'first.ts' },
      presentation: { version: 1 as const, kind: 'file-read' as const, pathField: 'path' },
    }
    const second = { ...first, callId: 'b', name: 'original-b' }
    const succeeded = {
      type: 'tool_result' as const,
      callId: first.callId,
      name: first.name,
      text: 'original success',
      isError: false,
      outcome: { kind: 'succeeded' as const, executionStarted: true },
    }
    const failed = {
      type: 'tool_result' as const,
      callId: 'b',
      name: second.name,
      text: 'original failure',
      isError: true,
      outcome: { kind: 'failed' as const, executionStarted: true },
    }
    const blocks = [{ type: 'thinking' as const, text: '**Focus**' }, first, succeeded, second, failed]
    const describeTool = createSessionToolPresenter(locale)
    const rows = buildMessageRows(blocks).filter((row) => row.kind === 'thinking' || row.kind === 'tool')
    const summary = messageActivitySummary(rows, labels, describeTool)
    expect(summary.toolCounts.map(({ name, count }) => ({ name, count }))).toEqual([
      { name: first.name, count: 1 },
      { name: second.name, count: 1 },
    ])
    const html = renderToStaticMarkup(
      <HbarMessageBlocks sessionId="s" messageId="m" blocks={blocks} labels={labels} describeTool={describeTool} />,
    )
    expect(html).toContain('data-activity-role="thinking"')
    expect(html).toContain('data-activity-role="tool"')
    expect(html).toContain('data-activity-role="count"')
    expect(html).toContain('data-activity-role="danger"')
    expect(html).toContain(locale === 'zh-CN' ? '读取文件 × 2' : 'Read files × 2')
    expect(html).toContain(locale === 'zh-CN' ? '1 项失败' : '1 failed')
    expect(html).toContain('data-activity-role="success"')
    expect(html).toContain(locale === 'zh-CN' ? '成功率 50%' : 'Success rate 50%')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('<pre')
    const details = renderToStaticMarkup(
      <HbarMessageBlocks
        sessionId="s"
        messageId="m"
        blocks={blocks}
        labels={labels}
        describeTool={describeTool}
        activityDisplay="rows"
      />,
    )
    expect(details).toContain('data-tool-call-id="a" data-tool-name="original-a" data-outcome="succeeded"')
    expect(details).toContain('data-tool-call-id="b" data-tool-name="original-b" data-outcome="failed"')
  })
}
