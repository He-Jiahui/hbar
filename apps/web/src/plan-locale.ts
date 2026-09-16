import type { HbarAppUiAgentPlanEditableContent } from 'hbar-app-ui'
import type { SupportedLocale } from './locale'

export function getPlanCopy(locale: SupportedLocale) {
  const en = locale === 'en-US'
  const labels: HbarAppUiAgentPlanEditableContent['labels'] = {
    title: en ? 'Review the plan' : '核对计划',
    summary: '',
    review: en ? 'Review changes before saving.' : '核对修改后保存。',
    addPlaceholder: en ? 'Add a step' : '添加计划步骤',
    add: en ? 'Add step' : '添加步骤',
    start: () => (en ? 'Save plan' : '保存计划'),
    moveUp: (title) => (en ? `Move ${title} up` : `上移 ${title}`),
    moveDown: (title) => (en ? `Move ${title} down` : `下移 ${title}`),
    skip: (title) => (en ? `Delete ${title}` : `删除 ${title}`),
    restore: (title) => (en ? `Restore ${title}` : `恢复 ${title}`),
    newStepStateLabel: en ? 'Pending' : '待处理',
    empty: en ? 'No plan steps' : '暂无计划',
  }
  return {
    labels,
    title: en ? 'Plan settings' : 'Plan 设置',
    mode: en ? 'Run mode' : '运行模式',
    defaultMode: en ? 'Default mode' : '默认模式',
    planMode: en ? 'Plan mode' : 'Plan 模式',
    step: (index: number) => (en ? `Plan step ${index}` : `计划步骤 ${index}`),
    status: (index: number) => (en ? `Plan step ${index} status` : `计划步骤 ${index} 状态`),
    pending: en ? 'Pending' : '待处理',
    running: en ? 'In progress' : '进行中',
    completed: en ? 'Completed' : '已完成',
    note: en ? 'Notes' : '备注',
    optional: en ? 'Optional' : '可选',
    clear: en ? 'Clear plan' : '清除计划',
    clearConfirm: en ? 'Clear the current plan?' : '清除当前计划？',
    stale: en
      ? 'The saved plan changed. Your draft is retained; review it against the latest plan before saving.'
      : '已保存的计划发生变化。草稿已保留，请对照最新计划重新核对后保存。',
    latest: en ? 'Latest saved plan' : '最新已保存计划',
    acknowledged: en ? 'Reviewed; keep my draft' : '已核对，保留草稿',
    reset: en ? 'Load the latest plan' : '载入最新计划',
    loading: en ? 'Loading plan' : '正在读取计划',
    saving: en ? 'Saving plan' : '正在保存计划',
    errors: {
      empty: en ? 'Keep at least one step.' : '至少保留一个计划步骤',
      limit: en ? 'The plan exceeds the step limit.' : '计划超过步骤数量上限',
      invalid: en ? 'Every step needs a valid, nonempty description.' : '每个步骤都需要有效且非空的描述',
      stale: en ? 'Review the updated plan first.' : '请先核对更新后的计划',
      failed: en ? 'Unable to save the plan. Retry your draft.' : '计划保存失败，请重试草稿',
    },
  }
}
