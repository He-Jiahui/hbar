import { LumenForms, LumenFormsProvider as HbarAppUiFormsProvider, type LumenFormsContent } from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiFormsProps = HbarAppUiVariantProps & {
  readonly formsContent?: LumenFormsContent | undefined
}
export { HbarAppUiFormsProvider }
export {
  selectLumenFormsItem as selectHbarAppUiFormsItem,
  uniqueLumenFormsItems as uniqueHbarAppUiFormsItems,
  useLumenFormsContent as useHbarAppUiFormsContent,
} from '@lumen/app-ui'
export type {
  LumenFormsAction as HbarAppUiFormsAction,
  LumenFormsApplicationContent as HbarAppUiFormsApplicationContent,
  LumenFormsBookingContent as HbarAppUiFormsBookingContent,
  LumenFormsCheckoutContent as HbarAppUiFormsCheckoutContent,
  LumenFormsChoice as HbarAppUiFormsChoice,
  LumenFormsContent as HbarAppUiFormsContent,
  LumenFormsDay as HbarAppUiFormsDay,
  LumenFormsEnvironmentContent as HbarAppUiFormsEnvironmentContent,
  LumenFormsHoursContent as HbarAppUiFormsHoursContent,
  LumenFormsLineItem as HbarAppUiFormsLineItem,
  LumenFormsListStrategy as HbarAppUiFormsListStrategy,
  LumenFormsMetric as HbarAppUiFormsMetric,
  LumenFormsPropertiesContent as HbarAppUiFormsPropertiesContent,
  LumenFormsProperty as HbarAppUiFormsProperty,
  LumenFormsProviderProps as HbarAppUiFormsProviderProps,
  LumenFormsProvisionContent as HbarAppUiFormsProvisionContent,
  LumenFormsQuoteContent as HbarAppUiFormsQuoteContent,
  LumenFormsQuoteSection as HbarAppUiFormsQuoteSection,
  LumenFormsRatingRow as HbarAppUiFormsRatingRow,
  LumenFormsRecordContent as HbarAppUiFormsRecordContent,
  LumenFormsRuleContent as HbarAppUiFormsRuleContent,
  LumenFormsRuleField as HbarAppUiFormsRuleField,
  LumenFormsSubmissionContent as HbarAppUiFormsSubmissionContent,
  LumenFormsSurveyContent as HbarAppUiFormsSurveyContent,
} from '@lumen/app-ui'

export function Forms({ spec, onAction, formsContent, className }: HbarAppUiFormsProps) {
  return (
    <LumenForms
      variant={spec.variant}
      variantId={spec.id}
      content={formsContent}
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
