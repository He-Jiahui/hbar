import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  HbarComposerAgentNotice,
  type HbarComposerAgentNoticeLabels,
} from '../packages/app-react/src/composer-agent-notice'

const labels: HbarComposerAgentNoticeLabels = {
  creating: '正在创建子 Agent…',
  unknown: '结果尚未确认；请核对后重试。',
  retry: '重试并核对',
  created: '子 Agent 已开始处理任务。'.repeat(20),
  open: '查看子 Agent',
}

function markup(status: 'submitting' | 'unknown' | 'succeeded' | 'failed' | 'idle', connected = true) {
  return renderToStaticMarkup(
    <HbarComposerAgentNotice
      status={status}
      agentId="agent-1"
      labels={labels}
      connected={connected}
      onRetry={() => {}}
      onOpen={() => {}}
    />,
  )
}

test('Agent result notice keeps localized progress, unknown recovery and confirmed child action distinct', () => {
  expect(markup('idle')).toBe('')
  expect(markup('failed')).toBe('')
  expect(markup('submitting')).toContain(labels.creating)
  expect(markup('unknown')).toContain('role="alert"')
  expect(markup('unknown')).toContain(labels.retry)
  expect(markup('unknown', false)).toContain('disabled=""')
  const succeeded = markup('succeeded')
  expect(succeeded).toContain(labels.created)
  expect(succeeded).toContain(labels.open)
  expect(succeeded).not.toContain(labels.retry)
})
