import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarSessionDecision } from '../packages/app-react/src/session-interactions'
import { HbarMessageBlocks } from '../packages/app-react/src/session-message'
import { projectSessionDecisions, type SessionDecision } from '../packages/app-runtime/src/interaction-presentations'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { answeredTimeline, decisionApproval, decisionRequest, decisionsTimeline } from './session-decisions.fixtures'

const copy = getShellCopy('zh-CN').session
const approval: SessionDecision = {
  kind: 'approval',
  id: 'approval',
  sessionId: 'one',
  runId: 'run',
  callId: 'edit-call',
  tool: 'edit_file',
  approval: decisionApproval,
}
const callbacks = { onDecision() {}, onPlanExit() {}, onAnswer() {}, onSubmit() {}, onReconcile() {} }

test('approval shows the actual requested fragments, never invents an existing-file diff, and keeps the confirmed decision', () => {
  const render = (decision: SessionDecision) =>
    renderToStaticMarkup(<HbarSessionDecision decision={decision} labels={copy.decisions} connected {...callbacks} />)
  const html = render(approval)
  expect(html).toContain('src/example.ts')
  expect(html).toContain(copy.decisions.oldFragment)
  expect(html).toContain(copy.decisions.newFragment)
  expect(html).toContain(copy.decisions.allow)
  expect(html).not.toContain('original-args-not-reviewed')
  expect(html).toContain('tabindex="-1"')
  expect(html).toMatch(/aria-describedby="([^"]+)-status"/)
  expect(html).toMatch(/id="([^"]+)-status" role="status"/)
  const denied = render({ ...approval, approval: { ...decisionApproval, status: 'denied' } })
  expect(denied).toContain(copy.decisions.denied)
  expect(denied).not.toContain(`>${copy.decisions.allow}<`)
  const write = render({
    ...approval,
    tool: 'write_file',
    approval: { ...decisionApproval, tool: 'write_file', args: { path: 'existing.txt', text: 'Overwrite request' } },
  })
  expect(write).toContain(copy.decisions.proposedContent)
  expect(write).not.toContain(copy.decisions.oldFragment)
})

test('unknown feedback only offers a read-only check while both approval writes are disabled', () => {
  const html = renderToStaticMarkup(
    <HbarSessionDecision
      decision={approval}
      action={{
        id: 'approval:approval',
        kind: 'approval',
        sessionId: 'one',
        targetId: 'approval',
        status: 'unknown',
        error: 'RESULT_UNKNOWN',
      }}
      labels={copy.decisions}
      connected
      {...callbacks}
    />,
  )
  expect(html).toContain(copy.decisions.unknown)
  expect(html).toContain(copy.decisions.reconcile)
  expect((html.match(/disabled=""/g) ?? []).length).toBe(2)
  expect(html).not.toContain('allow_always')
})

test('questionnaire is controlled, tabbed, secret-aware and restored completed history does not expose actions', () => {
  const pending: SessionDecision = {
    kind: 'questionnaire',
    id: 'question',
    ...decisionRequest,
    tool: 'request_user_input',
    pending: true,
    fact: null,
  }
  const html = renderToStaticMarkup(
    <HbarSessionDecision decision={pending} labels={copy.decisions} connected {...callbacks} />,
  )
  expect(html).toContain('role="tablist"')
  expect(html).toContain('role="tabpanel"')
  expect(html).toContain('type="radio"')
  expect(html).toContain(copy.decisions.customAnswer)
  expect(html).toContain('disabled=""')
  const submitted = renderToStaticMarkup(
    <HbarSessionDecision
      decision={pending}
      action={{
        id: 'questionnaire:question',
        kind: 'questionnaire',
        sessionId: 'one',
        targetId: 'question',
        status: 'succeeded',
        error: null,
      }}
      labels={copy.decisions}
      connected
      {...callbacks}
    />,
  )
  expect(submitted).toContain(copy.decisions.submitted)
  expect(submitted).not.toContain(`>${copy.decisions.answered}<`)
  const completed = projectSessionDecisions({ ...answeredTimeline(), actions: {} })
    .byMessage.get('assistant')
    ?.get(JSON.stringify(['question-call', 'request_user_input']))?.[0]
  if (!completed || completed.kind !== 'questionnaire') throw new Error('Expected restored questionnaire')
  const secret = { ...completed, questions: [completed.questions[1]!] }
  const result = renderToStaticMarkup(
    <HbarSessionDecision decision={secret} labels={copy.decisions} connected {...callbacks} />,
  )
  expect(result).toContain(copy.decisions.answered)
  expect(result).toContain(copy.decisions.secretAnswer)
  expect(result).not.toContain('private-value')
  expect(result).not.toContain(copy.decisions.submit)
})

test('decisions stay after their tool summaries and outside collapsed activity/details', () => {
  const blocks = decisionsTimeline().messages[0]!.content
  const html = renderToStaticMarkup(
    <HbarMessageBlocks
      sessionId="one"
      messageId="assistant"
      blocks={blocks}
      labels={copy.messageBlocks}
      toolDecisions={
        new Map([
          [
            JSON.stringify(['edit-call', 'edit_file']),
            <HbarSessionDecision key="approval" decision={approval} labels={copy.decisions} connected {...callbacks} />,
          ],
        ])
      }
    />,
  )
  expect(html).toContain(copy.decisions.approval)
  expect(html).toContain('data-decision-id="approval"')
  expect(html.indexOf('hbar-session-tool')).toBeLessThan(html.indexOf('data-decision-id="approval"'))
  expect(html).toContain('aria-expanded="false"')
  expect(html).not.toContain('hbar-session-activity-summary')
})
