import {
  LumenAppDialog,
  LumenAppDialogProvider as HbarAppUiAppDialogProvider,
  type LumenAppDialogContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiAppDialogProps = HbarAppUiVariantProps & {
  readonly appDialogContent?: LumenAppDialogContent | undefined
}
export { HbarAppUiAppDialogProvider }
export {
  selectLumenAppDialogItem as selectHbarAppUiAppDialogItem,
  uniqueLumenAppDialogItems as uniqueHbarAppUiAppDialogItems,
  useLumenAppDialogContent as useHbarAppUiAppDialogContent,
} from '@lumen/app-ui'
export type {
  LumenAppDialogAction as HbarAppUiAppDialogAction,
  LumenAppDialogAlertContent as HbarAppUiAppDialogAlertContent,
  LumenAppDialogChoice as HbarAppUiAppDialogChoice,
  LumenAppDialogContent as HbarAppUiAppDialogContent,
  LumenAppDialogControl as HbarAppUiAppDialogControl,
  LumenAppDialogDeleteContent as HbarAppUiAppDialogDeleteContent,
  LumenAppDialogDetail as HbarAppUiAppDialogDetail,
  LumenAppDialogEvidenceContent as HbarAppUiAppDialogEvidenceContent,
  LumenAppDialogHistory as HbarAppUiAppDialogHistory,
  LumenAppDialogInviteContent as HbarAppUiAppDialogInviteContent,
  LumenAppDialogListStrategy as HbarAppUiAppDialogListStrategy,
  LumenAppDialogMenuContent as HbarAppUiAppDialogMenuContent,
  LumenAppDialogMenuItem as HbarAppUiAppDialogMenuItem,
  LumenAppDialogMetric as HbarAppUiAppDialogMetric,
  LumenAppDialogPlanContent as HbarAppUiAppDialogPlanContent,
  LumenAppDialogProviderProps as HbarAppUiAppDialogProviderProps,
  LumenAppDialogRow as HbarAppUiAppDialogRow,
  LumenAppDialogWizardContent as HbarAppUiAppDialogWizardContent,
  LumenAppDialogWizardStep as HbarAppUiAppDialogWizardStep,
} from '@lumen/app-ui'

export function AppDialog({ spec, onAction, appDialogContent, className }: HbarAppUiAppDialogProps) {
  return (
    <LumenAppDialog
      variant={spec.variant}
      variantId={spec.id}
      content={appDialogContent}
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
