import {
  LumenOnboarding,
  LumenOnboardingProvider as HbarAppUiOnboardingProvider,
  type LumenOnboardingContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiOnboardingProps = HbarAppUiVariantProps & {
  readonly onboardingContent?: LumenOnboardingContent | undefined
}
export { HbarAppUiOnboardingProvider }
export {
  selectLumenOnboardingItem as selectHbarAppUiOnboardingItem,
  uniqueLumenOnboardingItems as uniqueHbarAppUiOnboardingItems,
  useLumenOnboardingContent as useHbarAppUiOnboardingContent,
} from '@lumen/app-ui'
export type {
  LumenOnboardingAction as HbarAppUiOnboardingAction,
  LumenOnboardingChecklistContent as HbarAppUiOnboardingChecklistContent,
  LumenOnboardingChoice as HbarAppUiOnboardingChoice,
  LumenOnboardingCompleteContent as HbarAppUiOnboardingCompleteContent,
  LumenOnboardingContent as HbarAppUiOnboardingContent,
  LumenOnboardingInviteContent as HbarAppUiOnboardingInviteContent,
  LumenOnboardingInvitee as HbarAppUiOnboardingInvitee,
  LumenOnboardingListStrategy as HbarAppUiOnboardingListStrategy,
  LumenOnboardingMetric as HbarAppUiOnboardingMetric,
  LumenOnboardingProfileContent as HbarAppUiOnboardingProfileContent,
  LumenOnboardingProviderProps as HbarAppUiOnboardingProviderProps,
  LumenOnboardingSlugContent as HbarAppUiOnboardingSlugContent,
  LumenOnboardingStepsContent as HbarAppUiOnboardingStepsContent,
  LumenOnboardingUseCaseContent as HbarAppUiOnboardingUseCaseContent,
} from '@lumen/app-ui'

export function Onboarding({ spec, onAction, onboardingContent, className }: HbarAppUiOnboardingProps) {
  return (
    <LumenOnboarding
      variant={spec.variant}
      variantId={spec.id}
      content={onboardingContent}
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
