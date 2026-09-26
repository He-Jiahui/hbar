import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { getShellCopy } from '../apps/web/src/shell-copy'
import {
  HbarProposedPlan,
  type HbarProposedPlanLabels,
  type HbarProposedPlanProps,
} from '../packages/app-react/src/proposed-plan'

const labels: HbarProposedPlanLabels = {
  title: '待确认的执行计划',
  document: '计划文档',
  implement: '按此计划执行',
  continuePlanning: '继续规划',
  scope: '开启新一轮，会话模式不变，不发送输入区草稿或附件。',
  feedback: '规划反馈（用于继续规划）',
  feedbackPlaceholder: '说明需要完善的内容',
  submitting: '正在提交请求',
  accepted: '请求已受理',
  unknown: '提交结果尚未确认，请先核对',
  checking: '正在核对原提交',
  reconcile: '核对提交结果',
  error: () => '操作尚未确认',
}
function props(): HbarProposedPlanProps {
  return {
    target: {
      sessionId: 'session',
      messageId: 'message',
      sourceRunId: 'source-run',
      sourceSeq: 1,
      fingerprint: 'a'.repeat(64),
    },
    markdown: '# 真实计划\n\n- 验证接口\n- 验证窄屏\n\n<script>unsafe()</script>',
    labels,
    state: { status: 'idle', canSubmit: true, connected: true, reconciling: false, error: null, unavailable: null },
    onSubmit: () => {},
    onReconcile: () => {},
  }
}

test('proposal is a document with nearby explicit actions, localized labels and sanitized host Markdown', () => {
  const html = renderToStaticMarkup(<HbarProposedPlan {...props()} />)
  expect(html).toContain('真实计划')
  expect(html).toContain('按此计划执行')
  expect(html).toContain('继续规划')
  expect(html).toContain(labels.scope)
  expect(html.match(/aria-describedby=/g)).toHaveLength(2)
  expect(html).toContain('role="region"')
  expect(html).toContain('aria-label="计划文档"')
  expect(html).toContain('maxLength="4000"')
  expect(html).not.toContain('<script>')
  expect(html).not.toContain('update_plan')
  expect(html).not.toContain('Goal')
})

test('pending disables actions and acceptance keeps the document without obsolete controls or false completion', () => {
  for (const status of ['submitting', 'accepted'] as const) {
    const input = props()
    const html = renderToStaticMarkup(<HbarProposedPlan {...input} state={{ ...input.state, status }} />)
    if (status === 'submitting') expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(2)
    else {
      expect(html).not.toContain('<button')
      expect(html).toContain('真实计划')
      expect(html).toContain('tabindex="-1"')
    }
    expect(html).toContain(status === 'submitting' ? labels.submitting : labels.accepted)
    expect(html).not.toContain('执行已完成')
    if (status === 'accepted') expect(html).not.toContain('<textarea')
  }
})

test('unknown offers receipt reconciliation while failures and unavailable sources stay local', () => {
  const input = props()
  const unknown = renderToStaticMarkup(<HbarProposedPlan {...input} state={{ ...input.state, status: 'unknown' }} />)
  expect(unknown).toContain(labels.reconcile)
  expect(unknown.match(/<button[^>]*disabled=""/g)).toHaveLength(2)
  const failed = renderToStaticMarkup(
    <HbarProposedPlan
      {...input}
      labels={{ ...labels, implement: '按这份已经确认的完整计划开始执行并保留当前输入草稿' }}
      state={{
        ...input.state,
        status: 'failed',
        canSubmit: false,
        error: '模型配置尚未确认',
        unavailable: '原计划已经被新方案替代',
      }}
    />,
  )
  expect(failed).toContain('role="alert"')
  expect(failed).toContain('模型配置尚未确认')
  expect(failed).toContain('原计划已经被新方案替代')
  expect(failed).toContain('按这份已经确认的完整计划开始执行并保留当前输入草稿')
})

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`proposal scope stays local and read-only recovery is independent of execution availability: ${locale}`, () => {
    const input = props()
    const copy = getShellCopy(locale).session.proposedPlan
    const unknown = { ...input.state, status: 'unknown' as const, canSubmit: false, unavailable: 'Read only' }
    const render = (patch: Partial<HbarProposedPlanProps['state']>) =>
      renderToStaticMarkup(<HbarProposedPlan {...input} labels={copy} state={{ ...unknown, ...patch }} />)
    const ready = render({})
    expect(ready).toContain(copy.scope)
    expect(ready).toContain(copy.implement)
    expect(ready).toContain(copy.continuePlanning)
    expect(ready).toContain(copy.reconcile)
    expect(ready).not.toContain(unknown.unavailable)
    // No model/archived/active-run execution gate can forbid checking an earlier request.
    expect(ready.match(/<button[^>]*disabled=""/g)).toHaveLength(2)
    const offline = render({ connected: false })
    expect(offline.match(/<button[^>]*disabled=""/g)).toHaveLength(3)
    expect(offline).toContain(copy.unknown)
    expect(offline).toContain(unknown.unavailable)
    const checking = render({ reconciling: true })
    expect(checking.match(/<button[^>]*disabled=""/g)).toHaveLength(3)
    expect(checking).toContain('aria-busy="true"')
    expect(checking).toContain(copy.checking)
    expect(checking).not.toContain(copy.unknown)
    expect(checking).not.toContain(unknown.unavailable)
    const failedRead = render({ error: 'The original receipt could not be read' })
    expect(failedRead).toContain('role="alert"')
    expect(failedRead).toContain(copy.unknown)
    expect(failedRead.match(/<button[^>]*disabled=""/g)).toHaveLength(2)
    expect(render({ status: 'accepted' })).not.toContain(unknown.unavailable)
    const opaque = 'opaque-private-provider-response'
    expect(copy.error(opaque)).not.toContain(opaque)
    expect(copy.error('TIMEOUT')).not.toContain('TIMEOUT')
  })
}
