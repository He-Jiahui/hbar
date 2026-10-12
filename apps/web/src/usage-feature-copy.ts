import type { ShellLocale } from './shell-copy'
import type { HbarUsageFeaturesLabels } from '@hbar/app-react'
import type { RunStatus } from '@hbar/contracts'

export function usageFeatureCopy(locale: ShellLocale): HbarUsageFeaturesLabels {
  const zh = locale === 'zh-CN'
  const text = (chinese: string, english: string) => (zh ? chinese : english)
  const statuses: Readonly<Record<RunStatus, string>> = {
    queued: text('排队中', 'Queued'),
    running: text('运行中', 'Running'),
    waiting_approval: text('等待批准', 'Waiting for approval'),
    completed: text('已完成', 'Completed'),
    failed: text('失败', 'Failed'),
    cancelled: text('已取消', 'Cancelled'),
    interrupted: text('已中断', 'Interrupted'),
    guided: text('已指导', 'Guided'),
  }
  const error = (code: string) =>
    code === 'TIMEOUT'
      ? text('读取超时，请重试。', 'The request timed out. Retry to reload.')
      : code === 'DISCONNECTED'
        ? text('连接已断开，请重新连接后重试。', 'The connection closed. Reconnect and retry.')
        : code === 'COMMAND_CONFLICT'
          ? text('预算已被更新，请重新读取。', 'The budget changed. Reload before saving.')
          : code === 'INVALID_INPUT'
      ? text('请输入有效的正整数词元上限。', 'Enter a valid positive whole token limit.')
            : code === 'INVALID_OUTPUT'
              ? text(
                  '返回结果未能确认，请核对原操作。',
                  'The result could not be confirmed. Check the original update.',
                )
              : text(
                  '操作未完成，请重试或核对原结果。',
                  'The action did not complete. Retry or check the original result.',
                )
  return {
    requests: {
      title: text('请求记录', 'Requests'),
      description: text('查看请求用量、费用和原始会话。', 'Inspect request usage, costs and the original session.'),
      request: text('请求', 'Request'),
      timeLabel: text('时间', 'Time'),
      filterOptions: [
        { id: 'all', label: text('全部', 'All') },
        { id: 'model', label: text('模型请求', 'Model requests') },
        { id: 'compaction', label: text('上下文压缩', 'Context compaction') },
      ],
      model: text('模型', 'Model'),
      tokens: text('词元', 'Tokens'),
      latency: text('延迟', 'Latency'),
      cost: text('费用', 'Cost'),
      empty: text('当前范围没有请求记录。', 'No requests in this window.'),
      open: text('打开原会话', 'Open original session'),
      previous: text('上一页', 'Previous'),
      next: text('加载更多', 'Load more'),
      retry: text('重试', 'Retry'),
      error,
      page: (from, to, total) => text(`${from}–${to}，已加载 ${total} 条`, `${from}–${to}, ${total} loaded`),
      time: (value) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(value),
      tokenCount: (value) => new Intl.NumberFormat(locale).format(value),
      duration: (value) => (value === null ? text('不可用', 'Unavailable') : text(`${value} 毫秒`, `${value} ms`)),
      costValue: (value) =>
        value.availability === 'available' && value.value !== null
          ? new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 6 }).format(
              value.value,
            )
          : text('不可用', 'Unavailable'),
      status: (value) => (value === null ? text('未记录', 'Not recorded') : statuses[value]),
      source: (value) =>
        value === 'model' ? text('模型请求', 'Model request') : text('上下文压缩', 'Context compaction'),
      detail: {
        attempt: text('请求尝试', 'Attempt'),
        session: text('会话', 'Session'),
        provider: text('提供方', 'Provider'),
        source: text('来源', 'Source'),
        status: text('状态', 'Status'),
      },
    },
    budget: {
      title: text('会话预算', 'Session budget'),
    description: text('为此会话设置词元上限。', 'Set a token limit for this session.'),
    cap: text('词元上限', 'Token limit'),
      save: text('保存预算', 'Save budget'),
      saving: text('保存中…', 'Saving…'),
      unknown: text('原操作结果尚未确认', 'Original result unconfirmed'),
      reconcile: text('核对原操作结果', 'Check original result'),
      pendingTarget: (id) => text(`待核对的原会话：${id}`, `Original session awaiting confirmation: ${id}`),
      retry: text('重新读取预算', 'Reload budget'),
      error,
    },
  }
}
