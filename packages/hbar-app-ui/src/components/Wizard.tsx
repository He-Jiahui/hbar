import { LumenWizard, LumenWizardProvider as HbarAppUiWizardProvider, type LumenWizardContent } from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiWizardProps = HbarAppUiVariantProps & {
  readonly wizardContent?: LumenWizardContent | undefined
}
export { HbarAppUiWizardProvider }
export {
  selectLumenWizardItem as selectHbarAppUiWizardItem,
  uniqueLumenWizardItems as uniqueHbarAppUiWizardItems,
  useLumenWizardContent as useHbarAppUiWizardContent,
} from '@lumen/app-ui'
export type {
  LumenWizardAction as HbarAppUiWizardAction,
  LumenWizardChoice as HbarAppUiWizardChoice,
  LumenWizardContent as HbarAppUiWizardContent,
  LumenWizardEnvironmentContent as HbarAppUiWizardEnvironmentContent,
  LumenWizardFieldValue as HbarAppUiWizardFieldValue,
  LumenWizardInformationContent as HbarAppUiWizardInformationContent,
  LumenWizardInvoiceContent as HbarAppUiWizardInvoiceContent,
  LumenWizardListStrategy as HbarAppUiWizardListStrategy,
  LumenWizardMigrationContent as HbarAppUiWizardMigrationContent,
  LumenWizardMigrationItem as HbarAppUiWizardMigrationItem,
  LumenWizardPlan as HbarAppUiWizardPlan,
  LumenWizardProviderProps as HbarAppUiWizardProviderProps,
  LumenWizardReviewContent as HbarAppUiWizardReviewContent,
  LumenWizardReviewSection as HbarAppUiWizardReviewSection,
  LumenWizardService as HbarAppUiWizardService,
  LumenWizardShippingContent as HbarAppUiWizardShippingContent,
  LumenWizardStep as HbarAppUiWizardStep,
  LumenWizardSummaryRow as HbarAppUiWizardSummaryRow,
  LumenWizardUpgradeContent as HbarAppUiWizardUpgradeContent,
} from '@lumen/app-ui'

export function Wizard({ spec, onAction, wizardContent, className }: HbarAppUiWizardProps) {
  return (
    <LumenWizard
      variant={spec.variant}
      variantId={spec.id}
      content={wizardContent}
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
