import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseProposedPlan, type PlanProposalDocument } from '@hbar/app-runtime'
import { getShellCopy } from '../apps/web/src/shell-copy'
import {
  HbarHistoricalPlanMessage,
  HbarProposedPlanMessage,
  planTextSegments,
} from '../packages/app-react/src/proposed-plan-message'
import type { SessionMessageBlock } from '../packages/app-react/src/session-message-model'

const target = {
  sessionId: 'session',
  messageId: 'message',
  sourceRunId: 'run',
  sourceSeq: 3,
  fingerprint: 'a'.repeat(64),
}
const copy = getShellCopy('zh-CN').session
function document(blocks: readonly SessionMessageBlock[]): PlanProposalDocument {
  const parsed = parseProposedPlan(blocks.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n\n'))
  if (parsed.kind !== 'complete') throw new Error('Test requires a complete authored proposal')
  return { target, before: parsed.before, markdown: parsed.markdown, after: parsed.after }
}

test('proposal at the start skips empty envelopes and inserts exactly once at its original text position', () => {
  const blocks: SessionMessageBlock[] = [
    { type: 'text', text: '' },
    { type: 'text', text: '<proposed_plan>\r\n# Plan\r\n\r\nKeep draft.\r\n</proposed_plan>\r\nAfter.' },
  ]
  const segments = [...planTextSegments(blocks, document(blocks)).values()]
  expect(segments.filter((segment) => segment.insertPlan)).toHaveLength(1)
  expect(segments[0]?.insertPlan).toBe(false)
  expect(segments[1]?.after).toBe('After.')
  expect(segments[1]?.before.trim()).toBe('')
})

test('a proposal split across text blocks preserves surrounding prose, tools and their original order', () => {
  const blocks: SessionMessageBlock[] = [
    { type: 'text', text: 'Before.' },
    { type: 'text', text: '<proposed_plan>\n# Plan\n\nFirst step.' },
    { type: 'tool_call', callId: 'call', name: 'read_fixture', args: { path: 'fixture.ts' } },
    { type: 'text', text: 'Second step.\n</proposed_plan>\nAfter.' },
    { type: 'text', text: 'Last note.' },
  ]
  const html = renderToStaticMarkup(
    <HbarProposedPlanMessage
      sessionId="session"
      messageId="message"
      blocks={blocks}
      labels={copy.messageBlocks}
      document={document(blocks)}
      plan={{
        labels: copy.proposedPlan,
        state: { status: 'idle', canSubmit: true, connected: true, reconciling: false, error: null, unavailable: null },
        onSubmit: () => {},
        onReconcile: () => {},
      }}
    />,
  )
  expect(html).toContain('Before.')
  expect(html).toContain('First step.')
  expect(html).toContain('Second step.')
  expect(html).toContain('After.')
  expect(html).toContain('Last note.')
  expect(html).toContain('read_fixture')
  expect(html.indexOf('Before.')).toBeLessThan(html.indexOf('hbar-proposed-plan-heading'))
  expect(html.indexOf('hbar-proposed-plan-heading')).toBeLessThan(html.indexOf('read_fixture'))
  expect(html.indexOf('read_fixture')).toBeLessThan(html.indexOf('After.'))
  expect(html.match(/data-proposal-message=/g)).toHaveLength(1)
  expect(html).not.toContain('&lt;proposed_plan&gt;')
})

test('older plans remain sanitized readable documents without any executable target or edit controls', () => {
  const blocks: SessionMessageBlock[] = [
    {
      type: 'text',
      text: 'Before.\n<proposed_plan>\n# Earlier plan\n\n<script>unsafe()</script>\n\nKeep history.\n</proposed_plan>\nAfter.',
    },
  ]
  const html = renderToStaticMarkup(
    <HbarHistoricalPlanMessage
      sessionId="session"
      messageId="old"
      blocks={blocks}
      labels={copy.messageBlocks}
      readOnlyLabel={copy.proposedPlanReadOnly}
    />,
  )
  expect(html).toContain(copy.proposedPlanReadOnly)
  expect(html).toContain('Earlier plan')
  expect(html).toContain('Keep history.')
  expect(html).toContain('Before.')
  expect(html).toContain('After.')
  expect(html).not.toContain('<script>')
  expect(html).not.toContain('data-proposal-message=')
  expect(html).not.toContain('<button')
  expect(html).not.toContain('<textarea')
})
