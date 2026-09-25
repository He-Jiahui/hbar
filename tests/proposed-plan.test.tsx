import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
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
  feedback: '规划反馈（用于继续规划）',
  feedbackPlaceholder: '说明需要完善的内容',
  submitting: '正在提交请求',
  accepted: '请求已受理',
  unknown: '提交结果尚未确认，请先核对',
  reconcile: '核对提交结果',
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
    state: { status: 'idle', canSubmit: true, error: null, unavailable: null },
    onSubmit: () => {},
    onReconcile: () => {},
  }
}

test('proposal is a document with nearby explicit actions, localized labels and sanitized host Markdown', () => {
  const html = renderToStaticMarkup(<HbarProposedPlan {...props()} />)
  expect(html).toContain('真实计划')
  expect(html).toContain('按此计划执行')
  expect(html).toContain('继续规划')
  expect(html).toContain('role="region"')
  expect(html).toContain('aria-label="计划文档"')
  expect(html).toContain('maxLength="4000"')
  expect(html).not.toContain('<script>')
  expect(html).not.toContain('update_plan')
  expect(html).not.toContain('Goal')
})

test('pending and accepted states disable actions without falsely claiming execution completed', () => {
  for (const status of ['submitting', 'accepted'] as const) {
    const input = props()
    const html = renderToStaticMarkup(<HbarProposedPlan {...input} state={{ ...input.state, status }} />)
    expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(2)
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
      state={{ status: 'failed', canSubmit: false, error: '模型配置尚未确认', unavailable: '原计划已经被新方案替代' }}
    />,
  )
  expect(failed).toContain('role="alert"')
  expect(failed).toContain('模型配置尚未确认')
  expect(failed).toContain('原计划已经被新方案替代')
  expect(failed).toContain('按这份已经确认的完整计划开始执行并保留当前输入草稿')
})
