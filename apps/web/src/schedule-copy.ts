import type { ScheduleDefinition, ScheduleOccurrence } from '@hbar/contracts/commands/schedules'
import type { ShellLocale } from './shell-copy'

export interface ScheduleCopy {
  readonly sessionsFailed: string
  readonly sessionCapacity: string
  readonly title: string
  readonly unavailable: string
  readonly create: string
  readonly save: string
  readonly edit: string
  readonly cancel: string
  readonly refresh: string
  readonly name: string
  readonly prompt: string
  readonly model: string
  readonly chooseModel: string
  readonly noModels: string
  readonly type: string
  readonly kinds: Readonly<Record<ScheduleDefinition['spec']['kind'], string>>
  readonly once: string
  readonly time: string
  readonly weekdays: string
  readonly weekdayNames: readonly string[]
  readonly cron: string
  readonly timezone: string
  readonly target: string
  readonly newSession: string
  readonly existingSession: string
  readonly chooseSession: string
  readonly preview: string
  readonly previewTitle: string
  readonly empty: string
  readonly enabled: string
  readonly paused: string
  readonly enable: string
  readonly pause: string
  readonly delete: string
  readonly deleteConfirm: (name: string) => string
  readonly occurrences: string
  readonly unknown: string
  readonly validation: string
  readonly saved: string
  readonly more: string
  readonly reconcile: string
  readonly capacity: string
  readonly occurrenceStatus: Readonly<Record<ScheduleOccurrence['status'], string>>
  readonly formatDate: (timestamp: number, timezone: string) => string
  readonly modelLabel: (provider: string, model: string) => string
  readonly summary: (kind: string, timezone: string) => string
  readonly occurrenceSummary: (date: string, status: string) => string
}

export function scheduleCopy(locale: ShellLocale): ScheduleCopy {
  const date = (timestamp: number, timezone: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(timestamp)
  return locale === 'zh-CN'
    ? {
        title: '排期',
        unavailable: '排期服务不可用',
        create: '创建排期',
        save: '保存更改',
        edit: '编辑',
        cancel: '取消',
        refresh: '刷新',
        name: '名称',
        prompt: '提示词',
        model: '模型',
        chooseModel: '选择模型',
        noModels: '请先配置可用模型',
        type: '重复方式',
        kinds: { once: '单次', daily: '每日', weekly: '每周', cron: '高级 Cron' },
        once: '日期与时间',
        time: '时间',
        weekdays: '执行日期',
        weekdayNames: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
        cron: '五字段 Cron 表达式',
        timezone: 'IANA 时区',
        target: '执行会话',
        newSession: '每次新建会话',
        existingSession: '继续已有会话',
        chooseSession: '选择会话',
        preview: '预览执行时间',
        previewTitle: '未来执行时间',
        empty: '暂无排期',
        enabled: '已启用',
        paused: '已暂停',
        enable: '启用',
        pause: '暂停',
        delete: '删除',
        deleteConfirm: (name) => `确认删除“${name}”`,
        occurrences: '执行记录',
        unknown: '写入结果未知，请刷新核对已保存的排期；不要重复提交。',
        validation: '请填写有效的提示词、模型、时间和执行目标。',
        saved: '已保存',
        more: '加载更多',
        reconcile: '核对写入结果',
        capacity: '已达到 400 条显示上限，可刷新查看最新排期',
        sessionsFailed: '会话列表加载失败，请重试',
        sessionCapacity: '已显示前 400 个会话',
        occurrenceStatus: {
          pending: '等待执行',
          running: '执行中',
          completed: '已完成',
          failed: '失败',
          cancelled: '已取消',
          unknown: '结果未知',
        },
        formatDate: date,
        modelLabel: (provider, model) => `${provider} / ${model}`,
        summary: (kind, timezone) => `${kind} · ${timezone}`,
        occurrenceSummary: (date, status) => `${date} · ${status}`,
      }
    : {
        title: 'Schedules',
        unavailable: 'Schedules are unavailable',
        create: 'Create schedule',
        save: 'Save changes',
        edit: 'Edit',
        cancel: 'Cancel',
        refresh: 'Refresh',
        name: 'Name',
        prompt: 'Prompt',
        model: 'Model',
        chooseModel: 'Choose a model',
        noModels: 'Configure an available model first',
        type: 'Repeat',
        kinds: { once: 'Once', daily: 'Daily', weekly: 'Weekly', cron: 'Advanced Cron' },
        once: 'Date and time',
        time: 'Time',
        weekdays: 'Days',
        weekdayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        cron: 'Five-field Cron expression',
        timezone: 'IANA timezone',
        target: 'Run target',
        newSession: 'Create a new session each time',
        existingSession: 'Continue an existing session',
        chooseSession: 'Choose a session',
        preview: 'Preview execution times',
        previewTitle: 'Upcoming executions',
        empty: 'No schedules',
        enabled: 'Enabled',
        paused: 'Paused',
        enable: 'Enable',
        pause: 'Pause',
        delete: 'Delete',
        deleteConfirm: (name) => `Confirm deleting “${name}”`,
        occurrences: 'Execution history',
        unknown: 'The write result is unknown. Refresh to inspect saved schedules before submitting again.',
        validation: 'Provide a valid prompt, model, time and run target.',
        saved: 'Saved',
        more: 'Load more',
        reconcile: 'Check write result',
        capacity: 'The 400 item display limit was reached; refresh to see the latest schedules',
        sessionsFailed: 'Sessions could not be loaded. Try again.',
        sessionCapacity: 'Showing the first 400 sessions',
        occurrenceStatus: {
          pending: 'Pending',
          running: 'Running',
          completed: 'Completed',
          failed: 'Failed',
          cancelled: 'Cancelled',
          unknown: 'Unknown result',
        },
        formatDate: date,
        modelLabel: (provider, model) => `${provider} / ${model}`,
        summary: (kind, timezone) => `${kind} · ${timezone}`,
        occurrenceSummary: (date, status) => `${date} · ${status}`,
      }
}
