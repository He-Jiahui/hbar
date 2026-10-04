type SupportedLocale = 'zh-CN' | 'en-US'
import type { GoalStatus } from '@hbar/contracts'
interface GoalCopy {
  readonly title: string
  readonly objective: string
  readonly objectiveHint: string
  readonly budget: string
  readonly unlimited: string
  readonly save: string
  readonly create: string
  readonly reset: string
  readonly stale: string
  readonly loading: string
  readonly saving: string
  readonly status: string
  readonly used: string
  readonly remaining: string
  readonly summary: string
  readonly description: string
  readonly pause: string
  readonly resume: string
  readonly clear: string
  readonly confirmTitle: string
  readonly confirmDescription: string
  readonly cancel: string
  readonly invalidObjective: string
  readonly invalidBudget: string
  readonly failed: string
  readonly states: Readonly<Record<GoalStatus, string>>
}
const copy: Readonly<Record<SupportedLocale, GoalCopy>> = {
  'zh-CN': {
    title: 'Goal 设置',
    objective: '目标',
    objectiveHint: '描述此会话需要完成的目标',
    budget: 'Token 预算（可选）',
    unlimited: '不限',
    save: '保存 Goal',
    create: '创建 Goal',
    reset: '载入最新 Goal',
    stale: 'Goal 已在其他位置更改。草稿仍保留，请载入最新状态后重新核对。',
    loading: '正在读取会话状态',
    saving: '正在保存',
    status: '状态',
    used: '已用 tokens',
    remaining: '剩余 tokens',
    summary: '当前 Goal',
    description: '统计属于当前 Goal 的完整执行过程。',
    pause: '暂停',
    resume: '恢复',
    clear: '清除',
    confirmTitle: '清除当前 Goal？',
    confirmDescription: '清除后将停止继续推进此目标，已有会话消息会保留。',
    cancel: '取消',
    invalidObjective: '请输入符合长度限制的目标。',
    invalidBudget: '预算必须是正整数。',
    failed: '操作失败，草稿已保留，请重试。',
    states: {
      active: '进行中',
      paused: '已暂停',
      blocked: '已阻塞',
      usage_limited: '用量受限',
      budget_limited: '预算受限',
      complete: '已完成',
    },
  },
  'en-US': {
    title: 'Goal settings',
    objective: 'Objective',
    objectiveHint: 'Describe what this session should accomplish',
    budget: 'Token budget (optional)',
    unlimited: 'Unlimited',
    save: 'Save Goal',
    create: 'Create Goal',
    reset: 'Load latest Goal',
    stale: 'The Goal changed elsewhere. Your draft is preserved; load the latest state and review it before saving.',
    loading: 'Loading session state',
    saving: 'Saving',
    status: 'Status',
    used: 'Used tokens',
    remaining: 'Remaining tokens',
    summary: 'Current Goal',
    description: 'Statistics cover the complete execution of the current Goal.',
    pause: 'Pause',
    resume: 'Resume',
    clear: 'Clear',
    confirmTitle: 'Clear the current Goal?',
    confirmDescription: 'This stops further work on the objective. Existing session messages are retained.',
    cancel: 'Cancel',
    invalidObjective: 'Enter an objective within the length limit.',
    invalidBudget: 'The budget must be a positive integer.',
    failed: 'The operation failed. Your draft is preserved; please retry.',
    states: {
      active: 'Active',
      paused: 'Paused',
      blocked: 'Blocked',
      usage_limited: 'Usage limited',
      budget_limited: 'Budget limited',
      complete: 'Complete',
    },
  },
}
export const getGoalCopy = (locale: SupportedLocale): GoalCopy => copy[locale]
