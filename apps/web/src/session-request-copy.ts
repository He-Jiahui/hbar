import type { HbarCodeBlockLabels, HbarSessionRequestLabels } from '@hbar/app-react'
import type { Message, Run } from '@hbar/contracts'

export function createSessionRequestLabels(
  locale: 'zh-CN' | 'en-US',
  codeBlock: HbarCodeBlockLabels,
): HbarSessionRequestLabels {
  const zh = locale === 'zh-CN'
  const choose = (chinese: string, english: string) => (zh ? chinese : english)
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  const timestamp = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const currency = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 6 })
  const unavailable = choose('不可用', 'Unavailable')
  const time = (value: number | null) => (value === null ? unavailable : timestamp.format(value))
  const duration = (value: number | null) => (value === null ? unavailable : `${number.format(value)} ms`)
  const cost: HbarSessionRequestLabels['cost'] = (value) =>
    value.availability === 'available' && value.value !== null
      ? value.estimated
        ? choose(`估算 ${currency.format(value.value)}`, `Estimated ${currency.format(value.value)}`)
        : currency.format(value.value)
      : unavailable
  const statuses: Readonly<Record<Run['status'], string>> = {
    queued: choose('排队中', 'Queued'),
    running: choose('运行中', 'Running'),
    waiting_approval: choose('等待审批', 'Waiting for approval'),
    guided: choose('已引导', 'Guided'),
    completed: choose('已完成', 'Completed'),
    cancelled: choose('已取消', 'Cancelled'),
    failed: choose('失败', 'Failed'),
    interrupted: choose('已中断', 'Interrupted'),
  }
  const roles: Readonly<Record<Message['role'], string>> = {
    user: choose('用户', 'User'),
    assistant: choose('助手', 'Assistant'),
    tool: choose('工具', 'Tool'),
    system: choose('系统', 'System'),
  }
  return {
    title: choose('请求明细', 'Request details'),
    loading: choose('正在加载请求明细…', 'Loading request details…'),
    empty: choose('当前会话还没有模型请求记录。', 'No model requests in this session yet.'),
    refresh: choose('刷新请求', 'Refresh requests'),
    more: choose('加载更多请求', 'Load more requests'),
    offline: choose('连接恢复后可刷新请求记录。', 'Reconnect to refresh request records.'),
    gap: choose(
      '请求记录存在缺口，当前列表可能不完整。',
      'Request records contain a gap; this list may be incomplete.',
    ),
    limit: (count) =>
      choose(`已显示最近 ${number.format(count)} 次请求。`, `Showing the latest ${number.format(count)} requests.`),
    error: (code) => choose(`无法加载明细：${code}。请重试。`, `Could not load details: ${code}. Try again.`),
    unavailable,
    number: (value) => number.format(value),
    time,
    duration,
    cost,
    status: (value) => (value === null ? unavailable : statuses[value]),
    source: (value) =>
      value === 'compaction' ? choose('上下文压缩', 'Context compaction') : choose('模型请求', 'Model request'),
    summary: (tokens, elapsed, amount) =>
      [
        `${number.format(tokens)} tokens`,
        elapsed === null ? null : duration(elapsed),
        amount.availability === 'available' && amount.value !== null ? cost(amount) : null,
      ]
        .filter((value) => value !== null)
        .join(' · '),
    fields: {
      provider: choose('供应商', 'Provider'),
      model: choose('模型', 'Model'),
      attempt: choose('请求 ID', 'Attempt ID'),
      run: choose('运行编号', 'Run ID'),
      source: choose('来源', 'Source'),
      status: choose('运行状态', 'Run status'),
      started: choose('开始时间', 'Started'),
      ended: choose('结束时间', 'Ended'),
      input: choose('输入词元', 'Input tokens'),
      output: choose('输出词元', 'Output tokens'),
      cacheRead: choose('缓存读取', 'Cache read'),
      cacheWrite: choose('缓存写入', 'Cache write'),
      billable: choose('计费词元', 'Billable tokens'),
      cost: choose('费用', 'Cost'),
      pricing: choose('计价版本', 'Pricing version'),
      response: choose('完整响应', 'Full response'),
      firstProviderEvent: choose('首个供应商事件', 'First provider event'),
      firstThinking: choose('首个思考片段', 'First thinking'),
      firstText: choose('首个文本词元', 'First text token'),
    },
    raw: {
      request: choose('原始用量记录', 'Raw usage record'),
      runMessages: choose('此运行的原始消息', 'Raw messages from this run'),
      sessionMessages: choose('会话原始消息', 'Raw session messages'),
      scope: choose(
        '展示此运行已载入的原始消息及工具参数。宿主尚未保存供应商的原始请求载荷。',
        'Loaded messages and tool arguments from this run. The Host has not recorded the original provider request payload.',
      ),
      empty: choose('已载入的记录中没有相关消息。', 'No matching messages in the loaded history.'),
      unavailable: choose('当前面板尚未载入此会话的消息。', 'Messages for this session are not loaded in this pane.'),
      more: (count) => choose(`再显示 ${number.format(count)} 条消息`, `Show ${number.format(count)} more messages`),
      older: choose('载入更早的会话消息', 'Load older session messages'),
      olderLimit: choose('已达到会话消息的载入上限。', 'The session history loading limit has been reached.'),
      count: (visible, loaded) =>
        choose(
          `已显示 ${number.format(visible)} / ${number.format(loaded)} 条已载入消息`,
          `Showing ${number.format(visible)} of ${number.format(loaded)} loaded messages`,
        ),
      message: (role, value, id) => `${roles[role]} · ${time(value)} · ${id}`,
    },
    codeBlock,
  }
}
