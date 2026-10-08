import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarMessageBlocks } from '@hbar/app-react'
import { ToolBatchFeedback } from '../packages/app-react/src/session-tool-feedback'
import { getShellCopy } from '../apps/web/src/shell-copy'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`tool feedback separates keyboard reading from disclosure and retains original progress ${locale}`, async () => {
    const labels = getShellCopy(locale).session.messageBlocks
    const html = renderToStaticMarkup(
      <HbarMessageBlocks
        sessionId="original-session"
        messageId="original-message"
        labels={labels}
        blocks={[
          { type: 'tool_call', callId: 'original-call', name: 'original-tool', args: {} },
          {
            type: 'tool_result',
            callId: 'original-call',
            name: 'original-tool',
            text: 'Original output',
            isError: false,
            execution: { startedAt: 100, endedAt: 300, elapsedMs: 200, progress: { completed: 2, total: 4 } },
          },
        ]}
      />,
    )
    const descriptors: (string | null)[] = []
    const readers: (string | null)[] = []
    let nestedReaders = 0
    let progress: (string | null)[] = []
    await new HTMLRewriter()
      .on('.hbar-session-disclosure-trigger', {
        element(node) {
          descriptors.push(node.getAttribute('aria-describedby'))
        },
      })
      .on('.hbar-session-disclosure-trigger [tabindex]', {
        element() {
          nestedReaders++
        },
      })
      .on('.hbar-session-disclosure-status-reading [id]', {
        element(node) {
          readers.push(node.getAttribute('id'))
        },
      })
      .on('[role="progressbar"]', {
        element(node) {
          progress = [
            node.getAttribute('aria-valuenow'),
            node.getAttribute('aria-valuemax'),
            node.getAttribute('data-tool-progress'),
          ]
        },
      })
      .transform(new Response(html))
      .text()
    expect(nestedReaders).toBe(0)
    expect(descriptors).toEqual(readers)
    expect(descriptors[0]).not.toBeNull()
    expect(progress).toEqual(['2', '4', '50'])
    expect(html).toContain('data-tool-call-id="original-call"')
  })
  for (const total of [0, 1, 7, 8, 9, 100, 101]) {
    test(`aggregate tool feedback presents reliable counts without inventing empty progress ${locale} ${total}`, () => {
      const labels = getShellCopy(locale).session.messageBlocks.feedback
      if (!labels) throw new Error('Missing owned tool feedback labels')
      const counts = { total, settled: total, running: 0, pending: 0, skipped: 0, unknown: 0 }
      const html = renderToStaticMarkup(<ToolBatchFeedback labels={labels} counts={counts} />)
      expect(html).toContain(labels.counts(counts))
      expect(html.includes('role="progressbar"')).toBe(total > 0)
      expect(html).not.toContain('NaN')
      expect(html).not.toContain('data-tool-total-elapsed')
    })
  }
}
