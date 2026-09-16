import type { SupportedLocale } from './locale'
export function getBudgetCopy(locale: SupportedLocale) {
  const en = locale === 'en-US'
  return {
    title: en ? 'Budget settings' : 'Budget 设置',
    description: en ? 'Token limit for this session' : '当前会话的 token 上限',
    cap: en ? 'Token limit' : 'Token 上限',
    save: en ? 'Set budget' : '设置预算',
    increase: en ? 'Increase limit' : '增加上限',
    saving: en ? 'Saving budget' : '正在保存预算',
    loading: en ? 'Loading budget' : '正在读取预算',
    usage: en ? 'Budget usage' : '预算使用情况',
    exhausted: en ? 'Budget exhausted' : '预算已耗尽',
    empty: en ? 'No budget is set for this session' : '当前会话未设置预算',
    used: en ? 'Used tokens' : '已用 tokens',
    remaining: en ? 'Remaining tokens' : '剩余 tokens',
    limit: en ? 'Token allowance' : 'Token 配额',
    clear: en ? 'Clear budget' : '清除预算',
    confirmClear: en ? 'Clear the current token budget?' : '清除当前 token 预算？',
    stale: en
      ? 'The saved budget changed. Your input is retained; load the latest budget before editing.'
      : '已保存预算发生变化，输入已保留，请载入最新预算后继续编辑。',
    reset: en ? 'Load latest budget' : '载入最新预算',
    invalid: en ? 'The budget must be a positive integer.' : '预算必须是正整数',
    failed: en ? 'Unable to save the budget. Retry your draft.' : '预算保存失败，请重试草稿',
  }
}
