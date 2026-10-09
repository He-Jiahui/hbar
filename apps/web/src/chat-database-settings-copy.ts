import type { ChatDatabasePolicy } from '@hbar/contracts/commands/chat-database'
import type { ShellLocale } from './shell-copy'

type FieldCopy = Readonly<Record<keyof ChatDatabasePolicy, { readonly label: string; readonly help: string }>>
const chinese: FieldCopy = {
  retentionDays: { label: '聊天保留天数', help: '按最后消息或运行活动计算，重命名和归档不会延长保留期限。' },
  archivedOnly: { label: '仅清理已归档聊天', help: '关闭后，符合其他条件的未归档聊天也可以清理。' },
  autoEnabled: { label: '自动清理', help: '按已保存的规则执行；关闭可保护此层范围免受上层自动清理。' },
  scheduleEnabled: { label: '定时触发', help: '启用自动清理后，在设定的时间执行。' },
  scheduleKind: { label: '执行周期', help: '选择每天或每周执行。' },
  scheduleHour: { label: '执行时（0–23）', help: '使用下方设置的时区。' },
  scheduleMinute: { label: '执行分（0–59）', help: '配置定时任务的分钟。' },
  scheduleWeekdays: { label: '每周执行日', help: '每周周期至少选择一天；0 为周日，1–6 为周一至周六。' },
  timezone: { label: '执行时区', help: '使用 IANA 时区，例如 Asia/Shanghai。' },
  capacityEnabled: { label: '容量触发', help: '完整统计超过总容量上限时触发清理，目标降至上限的 90%。' },
  capacityLimitMiB: { label: '总容量上限（MiB）', help: '全局按实际文件占用计算，项目和会话按可归属数据量计算。' },
  capacityFirst: { label: '容量优先', help: '允许超限时提前清理尚未超过保留天数的聊天；仍遵守归档筛选和运行保护。' },
  cacheRetentionDays: { label: '缓存保留天数', help: '仅在全局配置，只处理可重建且未被使用的磁盘缓存。' },
  attachmentRetentionDays: {
    label: '无引用附件保留天数',
    help: '只有确认没有聊天、主题、任务或草稿引用的附件才可以回收。',
  },
}
const english: FieldCopy = {
  retentionDays: {
    label: 'Chat retention days',
    help: 'Measured from the last message or Run activity. Renaming and archiving do not extend retention.',
  },
  archivedOnly: {
    label: 'Archived chats only',
    help: 'When disabled, unarchived chats meeting the other conditions can also be cleaned.',
  },
  autoEnabled: {
    label: 'Automatic cleanup',
    help: 'Uses saved rules. Disabling protects this scope from automatic cleanup by a parent scope.',
  },
  scheduleEnabled: {
    label: 'Scheduled trigger',
    help: 'Runs at the configured time when automatic cleanup is enabled.',
  },
  scheduleKind: { label: 'Schedule frequency', help: 'Choose daily or weekly.' },
  scheduleHour: { label: 'Hour (0–23)', help: 'Uses the timezone configured below.' },
  scheduleMinute: { label: 'Minute (0–59)', help: 'Configure the scheduled minute.' },
  scheduleWeekdays: {
    label: 'Weekly execution days',
    help: 'Choose at least one day. 0 is Sunday; 1–6 are Monday through Saturday.',
  },
  timezone: { label: 'Execution timezone', help: 'Use an IANA timezone, such as Asia/Shanghai.' },
  capacityEnabled: {
    label: 'Capacity trigger',
    help: 'Triggers when complete statistics exceed the total limit, targeting 90% of the limit.',
  },
  capacityLimitMiB: {
    label: 'Total capacity limit (MiB)',
    help: 'Global limits use physical file sizes. Workspace and session limits use attributable data.',
  },
  capacityFirst: {
    label: 'Prioritize capacity',
    help: 'Allows early cleanup of chats within the retention period. Archive filters and execution protection still apply.',
  },
  cacheRetentionDays: {
    label: 'Cache retention days',
    help: 'Global only. Includes rebuildable disk caches that are not in use.',
  },
  attachmentRetentionDays: {
    label: 'Unreferenced attachment retention days',
    help: 'An attachment can be reclaimed only when no chat, theme, task or draft references it.',
  },
}
export function resolveChatDatabaseSettingCopy(locale: ShellLocale, key: string): string | undefined {
  if (key === 'i18n:settings.groups.chatDatabase') return locale === 'zh-CN' ? '聊天数据库' : 'Chat database'
  const prefix = 'i18n:settings.chatDatabase.'
  if (!key.startsWith(prefix)) return undefined
  const suffix = key.slice(prefix.length)
  const fields = locale === 'zh-CN' ? chinese : english
  for (const [name, copy] of Object.entries(fields)) {
    if (suffix === `${name}.label`) return copy.label
    if (suffix === `${name}.help`) return copy.help
  }
  return undefined
}

export function resolveChatDatabaseChoiceCopy(locale: ShellLocale, field: string, value: unknown): string | undefined {
  const zh = locale === 'zh-CN'
  if (field === 'f:chatDatabase.scheduleKind') {
    if (value === 'daily') return zh ? '每天' : 'Daily'
    if (value === 'weekly') return zh ? '每周' : 'Weekly'
  }
  if (field === 'f:chatDatabase.scheduleWeekdays' && typeof value === 'number' && value >= 0 && value <= 6) {
    return (
      zh
        ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
        : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    )[value]
  }
  return undefined
}
