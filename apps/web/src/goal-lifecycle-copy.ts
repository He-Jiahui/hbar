import type { HbarGoalLifecycleLabels, HbarGoalHistoryLabels } from '@hbar/app-react'

export function goalHistoryCopy(zh: boolean): HbarGoalHistoryLabels {
  const choose = (chinese: string, english: string) => (zh ? chinese : english)
  return {
    loading: choose('正在读取目标记录…', 'Loading goal history…'),
    gap: (reason) =>
      ({
        unsupported: choose(
          '此 Host 不支持目标历史；这里的记录可能不完整。',
          'This Host does not support goal history; records here may be incomplete.',
        ),
        unread: choose('目标历史尚未读取完整。', 'Goal history has not finished loading.'),
        stale: choose('目标记录尚未与当前会话重新同步。', 'Goal history has not yet resynchronized with this session.'),
        error: choose(
          '目标记录读取失败；已显示的记录不代表完整历史。',
          'Goal history could not be read; visible records are not the full history.',
        ),
        limit: choose(
          '此窗口已达到目标记录上限；更早的记录尚未显示。',
          'This window reached its goal history limit; earlier records are not shown.',
        ),
        window: choose('此消息窗口的目标历史尚未读取完整。', 'Goal history for this message window is incomplete.'),
      })[reason],
    refresh: choose('重新同步目标记录', 'Resynchronize goal history'),
    loadOlder: choose('加载更早目标记录', 'Load earlier goal records'),
    loadingOlder: choose('正在加载更早目标记录…', 'Loading earlier goal records…'),
    retryOlder: choose('重试更早目标记录', 'Retry earlier goal records'),
    limit: (count) =>
      choose(
        `此窗口最多显示 ${count.toLocaleString('zh-CN')} 条目标事实。`,
        `This window holds at most ${count.toLocaleString('en-US')} goal facts.`,
      ),
  }
}

export function goalLifecycleCopy(zh: boolean): HbarGoalLifecycleLabels {
  const choose = (chinese: string, english: string) => (zh ? chinese : english)
  const locale = zh ? 'zh-CN' : 'en-US'
  const number = new Intl.NumberFormat(locale)
  const date = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return {
    titles: {
      created: choose('目标已设置', 'Goal set'),
      replaced: choose('目标已替换', 'Goal replaced'),
      updated: choose('目标已更新', 'Goal updated'),
      status: choose('目标状态', 'Goal status'),
      paused: choose('目标已暂停', 'Goal paused'),
      resumed: choose('目标已恢复', 'Goal resumed'),
      completed: choose('目标已完成', 'Goal completed'),
      cleared: choose('目标已清除', 'Goal cleared'),
    },
    statuses: {
      active: choose('进行中', 'Active'),
      paused: choose('已暂停', 'Paused'),
      blocked: choose('受阻', 'Blocked'),
      usage_limited: choose('用量受限', 'Usage limited'),
      budget_limited: choose('预算受限', 'Budget limited'),
      complete: choose('已完成', 'Complete'),
    },
    accessible: (title, time) => `${title} · ${time}`,
    objective: (objective) => choose(`目标：${objective}`, `Objective: ${objective}`),
    cleared: (objective) =>
      objective
        ? choose(`目标已清除：${objective}`, `Goal cleared: ${objective}`)
        : choose('目标已清除。', 'The goal was cleared.'),
    budget: (used, limit) =>
      choose(
        `预算：${number.format(used)} / ${limit === null ? '不限' : number.format(limit)} Token`,
        `Budget: ${number.format(used)} / ${limit === null ? 'unlimited' : number.format(limit)} tokens`,
      ),
    continuations: (count) => choose(`续作次数：${number.format(count)}`, `Continuations: ${number.format(count)}`),
    timestamp: (time) => date.format(time),
    showObjective: choose('显示完整目标', 'Show full objective'),
    hideObjective: choose('收起目标全文', 'Collapse full objective'),
    comparison: choose('目标变化', 'Goal changes'),
    previousObjective: choose('旧目标', 'Previous goal'),
    nextObjective: choose('新目标', 'New goal'),
    removed: choose('删除', 'Removed'),
    added: choose('新增', 'Added'),
    omission: '…',
    omitted: choose('部分内容已省略，展开可查看全文', 'Some content is omitted; expand to read the full objectives'),
    showComparison: choose('显示新旧目标全文', 'Show both full objectives'),
    hideComparison: choose('仅显示变化片段', 'Show change excerpts'),
  }
}
