import {
  LumenNotifications,
  LumenNotificationsProvider as HbarAppUiNotificationsProvider,
  type LumenNotificationsContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiNotificationsProps = HbarAppUiVariantProps & {
  readonly notificationsContent?: LumenNotificationsContent | undefined
}
export { HbarAppUiNotificationsProvider }
export {
  selectLumenNotificationsItem as selectHbarAppUiNotificationsItem,
  uniqueLumenNotificationsItems as uniqueHbarAppUiNotificationsItems,
  useLumenNotificationsContent as useHbarAppUiNotificationsContent,
} from '@lumen/app-ui'
export type {
  LumenNotificationActivityContent as HbarAppUiNotificationActivityContent,
  LumenNotificationActivityEntry as HbarAppUiNotificationActivityEntry,
  LumenNotificationBellContent as HbarAppUiNotificationBellContent,
  LumenNotificationBellMessage as HbarAppUiNotificationBellMessage,
  LumenNotificationCenterContent as HbarAppUiNotificationCenterContent,
  LumenNotificationChannel as HbarAppUiNotificationChannel,
  LumenNotificationEntry as HbarAppUiNotificationEntry,
  LumenNotificationFact as HbarAppUiNotificationFact,
  LumenNotificationGroup as HbarAppUiNotificationGroup,
  LumenNotificationPreference as HbarAppUiNotificationPreference,
  LumenNotificationPreferenceGroup as HbarAppUiNotificationPreferenceGroup,
  LumenNotificationPreferencesContent as HbarAppUiNotificationPreferencesContent,
  LumenNotificationsAction as HbarAppUiNotificationsAction,
  LumenNotificationsChoice as HbarAppUiNotificationsChoice,
  LumenNotificationsContent as HbarAppUiNotificationsContent,
  LumenNotificationsListStrategy as HbarAppUiNotificationsListStrategy,
  LumenNotificationsProviderProps as HbarAppUiNotificationsProviderProps,
  LumenNotificationSystemContent as HbarAppUiNotificationSystemContent,
  LumenNotificationSystemMessage as HbarAppUiNotificationSystemMessage,
  LumenNotificationToastChoice as HbarAppUiNotificationToastChoice,
  LumenNotificationToastsContent as HbarAppUiNotificationToastsContent,
} from '@lumen/app-ui'

export function Notifications({ spec, onAction, notificationsContent, className }: HbarAppUiNotificationsProps) {
  return (
    <LumenNotifications
      variant={spec.variant}
      variantId={spec.id}
      content={notificationsContent}
      className={className}
      density={spec.density}
      surface={spec.profile.surface}
      state={spec.profile.initialState}
      visualMode={spec.profile.visualMode}
      onAction={
        onAction
          ? ({ actionId, value }) =>
              onAction(value === undefined ? { variantId: spec.id, actionId } : { variantId: spec.id, actionId, value })
          : undefined
      }
    />
  )
}
