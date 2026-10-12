import { createMessageScope } from './messages'
import type { HbarNotificationsLabels } from './notifications'

export type NotificationCenterLabels = Pick<
  HbarNotificationsLabels,
  | 'title'
  | 'unread'
  | 'markAll'
  | 'filters'
  | 'all'
  | 'unreadFilter'
  | 'mentions'
  | 'markRead'
  | 'markUnread'
  | 'dismiss'
  | 'empty'
  | 'eventKinds'
  | 'formatTime'
  | 'open'
  | 'navigationFailed'
>
export type NotificationPreferencesLabels = Pick<
  HbarNotificationsLabels,
  | 'preferenceTitle'
  | 'inApp'
  | 'desktop'
  | 'eventKinds'
  | 'preferenceDetail'
  | 'event'
  | 'toggle'
  | 'all'
  | 'none'
  | 'quietTitle'
  | 'quietDetail'
  | 'quietToggle'
  | 'days'
  | 'saved'
  | 'unsaved'
  | 'saving'
  | 'saveFailed'
  | 'saveUnavailable'
  | 'reset'
  | 'save'
  | 'empty'
>
export type NotificationBellLabels = Pick<
  HbarNotificationsLabels,
  | 'bell'
  | 'title'
  | 'filters'
  | 'all'
  | 'unreadFilter'
  | 'markAll'
  | 'preferenceTitle'
  | 'empty'
  | 'saving'
  | 'saveFailed'
  | 'saveUnavailable'
  | 'eventKinds'
  | 'formatTime'
>

export const notificationCenterMessages = createMessageScope<NotificationCenterLabels>()
export const notificationPreferencesMessages = createMessageScope<NotificationPreferencesLabels>()
export const notificationBellMessages = createMessageScope<NotificationBellLabels>()
