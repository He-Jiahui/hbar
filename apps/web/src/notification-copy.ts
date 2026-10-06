import type { HbarNotificationsLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'
import type { NotificationPageButtonLabels } from './NotificationPageButton'

export function notificationNavigationCopy(locale: ShellLocale): NotificationPageButtonLabels {
  const formatter = new Intl.NumberFormat(locale)
  return {
    bell: notificationCopy(locale).bell,
    count: (count) => (count > 99 ? '99+' : formatter.format(count)),
  }
}

export function notificationCopy(locale: ShellLocale): HbarNotificationsLabels {
  const zh = locale === 'zh-CN'
  return {
    navigationFailed: zh ? '无法打开通知目标，请重试' : 'The notification target could not be opened. Try again.',
    title: zh ? '通知中心' : 'Notifications',
    unread: (count) => (zh ? `${count} 条未读` : `${count} unread`),
    markAll: zh ? '全部标为已读' : 'Mark all read',
    filters: zh ? '筛选' : 'Filters',
    all: zh ? '全部' : 'All',
    unreadFilter: zh ? '未读' : 'Unread',
    mentions: zh ? '提及' : 'Mentions',
    markRead: (title) => (zh ? `标记 ${title} 为已读` : `Mark ${title} read`),
    markUnread: (title) => (zh ? `标记 ${title} 为未读` : `Mark ${title} unread`),
    dismiss: (title) => (zh ? `关闭 ${title}` : `Dismiss ${title}`),
    empty: zh ? '暂无通知' : 'No notifications',
    preferenceTitle: zh ? '通知设置' : 'Notification preferences',
    inApp: zh ? '应用内' : 'In app',
    desktop: zh ? '系统通知' : 'Desktop',
    eventKinds: {
      'run.completed': zh ? '运行完成' : 'Run completed',
      'run.failed': zh ? '运行失败' : 'Run failed',
      'approval.pending': zh ? '等待批准' : 'Approval pending',
      'schedule.failed': zh ? '计划失败' : 'Schedule failed',
    },
    preferenceDetail: (enabled, total) =>
      zh ? `${enabled}/${total} 个渠道已启用` : `${enabled} of ${total} channels enabled`,
    event: zh ? '事件' : 'Event',
    toggle: (event, channel) => (zh ? `切换 ${event} 的 ${channel}` : `Toggle ${channel} for ${event}`),
    none: zh ? '无' : 'None',
    quietTitle: zh ? '免打扰' : 'Quiet hours',
    quietDetail: zh ? '暂不发送系统通知' : 'Pause desktop notifications',
    quietToggle: zh ? '切换免打扰' : 'Toggle quiet hours',
    days: zh ? '日期' : 'Days',
    saved: zh ? '已保存' : 'Saved',
    unsaved: zh ? '未保存' : 'Unsaved',
    saving: zh ? '保存中' : 'Saving',
    saveFailed: zh ? '保存失败' : 'Save failed',
    saveUnavailable: zh ? '保存不可用' : 'Save unavailable',
    reset: zh ? '重置' : 'Reset',
    save: zh ? '保存设置' : 'Save settings',
    centerTab: zh ? '通知' : 'Center',
    preferencesTab: zh ? '偏好' : 'Preferences',
    loadMore: zh ? '加载更多' : 'Load more',
    capacity: (count) => (zh ? `已显示 ${count} 条，达到容量上限` : `${count} shown; capacity reached`),
    permissionDenied: zh
      ? '系统通知权限被拒绝，仍保留应用内通知'
      : 'Desktop permission denied; in-app notifications remain enabled',
    nativeEnabled: zh ? '启用系统通知' : 'Enable desktop notifications',
    open: (title) => (zh ? `打开 ${title}` : `Open ${title}`),
    deliveryFailed: zh
      ? '系统未接受这次通知，通知中心仍保留记录。'
      : 'The system did not accept this notification. Its record remains in the notification center.',
    reconcile: zh ? '查询未确认的写入结果' : 'Check unconfirmed result',
    reconciling: zh ? '正在查询结果…' : 'Checking result…',
    formatTime: (timestamp) =>
      new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp),
    bell: (count) => (zh ? `通知，${count} 条未读` : `Notifications, ${count} unread`),
  }
}
