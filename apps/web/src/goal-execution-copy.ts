import type { HbarGoalPlanWorkspaceLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'

export function goalExecutionCopy(locale: ShellLocale): HbarGoalPlanWorkspaceLabels['goal']['execution'] {
  const choose = (zh: string, en: string) => (locale === 'zh-CN' ? zh : en)
  const number = new Intl.NumberFormat(locale)
  const time = new Intl.DateTimeFormat(locale, { timeStyle: 'medium' })
  return {
    title: choose('执行与预算', 'Execution and allowance'),
    goalRemaining: choose('目标剩余额度', 'Goal remaining tokens'),
    sessionRemaining: choose('会话剩余额度', 'Session remaining tokens'),
    effectiveRemaining: choose('有效剩余额度', 'Effective remaining tokens'),
    limitingSource: choose('当前限制来源', 'Limiting allowance'),
    sources: {
      goal: choose('目标预算', 'Goal budget'),
      session: choose('会话预算', 'Session budget'),
      both: choose('目标与会话预算', 'Goal and session budgets'),
    },
    unlimited: choose('未限定', 'Unlimited'),
    unknown: choose('尚未同步', 'Not yet synchronized'),
    noIntent: choose('尚无自动执行意图', 'No automatic execution intent'),
    phases: {
      pending: choose('待调度', 'Pending'),
      queued: choose('已排队', 'Queued'),
      running: choose('执行中', 'Running'),
      waiting: choose('等待中', 'Waiting'),
      stopped: choose('已停止', 'Stopped'),
    },
    reasons: {
      goal_active: choose('继续目标', 'Pursuing goal'),
      workflow_wait: choose('等待工作流验收或 reviewer', 'Waiting for workflow acceptance or reviewer'),
      plan_mode: choose('计划模式，仅分析', 'Plan mode: analysis only'),
      budget_exhausted: choose('执行额度耗尽', 'Execution allowance exhausted'),
      paused: choose('用户已暂停', 'Paused by user'),
      complete: choose('目标已完成', 'Goal completed'),
      blocked: choose('已验证的持续阻塞', 'Verified persistent blocker'),
      usage_limited: choose('模型服务用量受限', 'Provider usage limit'),
      no_tool_calls: choose('未调用工具，已抑制空转', 'No tool calls; idle continuation suppressed'),
      no_progress: choose('连续无实质进展', 'Repeated turns without meaningful progress'),
      continuation_limit: choose('达到配置的续跑上限', 'Configured continuation limit reached'),
      disabled: choose('自动续跑未启用', 'Automatic continuation disabled'),
      interrupted: choose('执行中断，需核对结果', 'Execution interrupted; inspect results'),
      result_unknown: choose('写入或提交结果未知，未自动重放', 'Unknown effect or commit; not automatically replayed'),
      stale_goal: choose('原目标已失效', 'Original goal is no longer current'),
      user_turn: choose('用户消息优先', 'User turn takes priority'),
      run_failed: choose('执行失败，已保留错误详情', 'Run failed; error details retained'),
      repair: choose('受限修订中', 'Restricted workflow repair'),
      repair_exhausted: choose('三轮受限修订仍未恢复', 'Three repair turns did not recover'),
      retry_wait: choose('临时错误，退避后重试', 'Transient failure; retrying after backoff'),
      retry_exhausted: choose('临时错误重试次数已耗尽', 'Transient retry allowance exhausted'),
    },
    state: (phase, reason) => `${phase} · ${reason}`,
    retryAt: (at) => choose(`下次重试：${time.format(at)}`, `Next retry: ${time.format(at)}`),
    blocker: (reason, turns, required) =>
      choose(
        `阻塞审计 ${number.format(turns)}/${number.format(required)}：${reason}`,
        `Blocker audit ${number.format(turns)}/${number.format(required)}: ${reason}`,
      ),
    number: (value) => number.format(value),
  }
}
