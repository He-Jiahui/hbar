import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ToolOutcome } from '@hbar/contracts'
import { HbarMessageBlocks } from '../packages/app-react/src/session-message'
import type { SessionToolResult } from '../packages/app-react/src/session-message-model'
import { getShellCopy } from '../apps/web/src/shell-copy'

const kinds: readonly ToolOutcome['kind'][] = ['succeeded', 'failed', 'denied', 'cancelled', 'interrupted', 'unknown']
function result(kind: ToolOutcome['kind']): SessionToolResult {
  return {
    type: 'tool_result',
    callId: kind,
    name: 'fixture',
    text: 'Original output <script>unsafe</script>',
    isError: kind !== 'succeeded',
    outcome: { kind, executionStarted: kind === 'succeeded' || kind === 'failed' || kind === 'unknown' },
  }
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`host-owned outcome labels survive an initially collapsed tool: ${locale}`, () => {
    const labels = getShellCopy(locale).session.messageBlocks
    for (const kind of kinds) {
      const original = result(kind)
      const html = renderToStaticMarkup(
        <HbarMessageBlocks sessionId="s" messageId="m" blocks={[original]} labels={labels} />,
      )
      expect(html).toContain(kind === 'succeeded' ? labels.resultAvailable : labels[kind])
      expect(html).toContain(`data-outcome="${kind}"`)
      expect(html).toContain(
        `data-status-tone="${kind === 'failed' ? 'danger' : kind === 'succeeded' ? 'success' : 'warning'}"`,
      )
      expect(html).toContain(`data-tool-call-id="${kind}"`)
      expect(html).toContain('aria-expanded="false"')
      expect(html.includes('data-failed="true"')).toBe(kind === 'failed')
      expect(html).not.toContain('<pre')
      expect(html).not.toContain('<script>')
      expect(html).not.toContain('hbar-session-tool-result-copy-action')
      expect(original.text).toBe('Original output <script>unsafe</script>')
    }
  })

  test(`mixed activity counts keep cancellation and unknown effects out of failures: ${locale}`, () => {
    const labels = getShellCopy(locale).session.messageBlocks
    const blocks: SessionToolResult[] = [
      ...kinds.map(result),
      { type: 'tool_result', callId: 'legacy', name: 'old', text: 'cancelled', isError: true },
    ]
    const html = renderToStaticMarkup(<HbarMessageBlocks sessionId="s" messageId="m" blocks={blocks} labels={labels} />)
    const summaries =
      locale === 'zh-CN'
        ? ['1 项失败', '1 项拒绝', '1 项取消', '1 项中断', '1 项结果未知', '1 项未完成']
        : ['1 failed', '1 denied', '1 cancelled', '1 interrupted', '1 unknown', '1 incomplete']
    for (const summary of summaries) expect(html).toContain(summary)
    expect(html).not.toContain(locale === 'zh-CN' ? '6 项失败' : '6 failed')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('hbar-session-tool-section')
  })

  test(`active tools receive localized blue progress while settled or missing results keep their own tones: ${locale}`, () => {
    const labels = getShellCopy(locale).session.messageBlocks
    const call = { type: 'tool_call' as const, callId: 'active', name: 'fixture', args: {} }
    const props = { sessionId: 's', messageId: 'm', blocks: [call], labels }
    const idle = renderToStaticMarkup(<HbarMessageBlocks {...props} />)
    expect(idle).toContain(labels.awaitingResult)
    expect(idle).toContain('data-status-tone="warning"')
    expect(idle).not.toContain('data-lumen-state="running"')
    const active = renderToStaticMarkup(<HbarMessageBlocks {...props} streaming />)
    expect(active).toContain(labels.running)
    expect(active).toContain('data-status-tone="info"')
    expect(active).toContain('data-lumen-state="running"')
    expect(active).not.toContain(labels.awaitingResult)
    for (const kind of ['succeeded', 'failed'] as const) {
      const settled = renderToStaticMarkup(
        <HbarMessageBlocks {...props} blocks={[{ ...result(kind), callId: call.callId }]} streaming />,
      )
      expect(settled).toContain(`data-status-tone="${kind === 'succeeded' ? 'success' : 'danger'}"`)
      expect(settled).not.toContain('data-lumen-state="running"')
      expect(settled).not.toContain(labels.running)
    }
  })
}

test('legacy error and missing result receive honest localized labels without fabricating a cause', () => {
  const labels = getShellCopy('zh-CN').session.messageBlocks
  const legacy = renderToStaticMarkup(
    <HbarMessageBlocks
      sessionId="s"
      messageId="m"
      blocks={[
        { type: 'tool_result', callId: 'old', name: 'old', text: 'USER_CANCELLED denied failed', isError: true },
      ]}
      labels={{ ...labels, incomplete: '历史结果没有记录准确的终止原因，请展开查看原始输出' }}
    />,
  )
  expect(legacy).toContain('历史结果没有记录准确的终止原因，请展开查看原始输出')
  expect(legacy).toContain('data-outcome="legacy-error"')
  expect(legacy).toContain('data-status-tone="warning"')
  expect(legacy).not.toContain('data-failed="true"')
  const missing = renderToStaticMarkup(
    <HbarMessageBlocks
      sessionId="s"
      messageId="m"
      blocks={[{ type: 'tool_call', callId: 'missing', name: 'tool', args: {} }]}
      labels={labels}
    />,
  )
  expect(missing).toContain(labels.awaitingResult)
  expect(missing).toContain('data-outcome="pending"')
  expect(missing).not.toContain(labels.cancelled)
})
