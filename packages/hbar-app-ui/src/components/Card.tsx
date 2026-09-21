import { LumenCard, LumenCardProvider as HbarAppUiCardProvider, type LumenCardContent } from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiCardProps = HbarAppUiVariantProps & {
  readonly cardContent?: LumenCardContent | undefined
}

export { HbarAppUiCardProvider }
export {
  selectLumenCardItem as selectHbarAppUiCardItem,
  uniqueLumenCardItems as uniqueHbarAppUiCardItems,
  useLumenCardContent as useHbarAppUiCardContent,
} from '@lumen/app-ui'
export type {
  LumenCardAction as HbarAppUiCardAction,
  LumenCardAgendaContent as HbarAppUiCardAgendaContent,
  LumenCardBalanceContent as HbarAppUiCardBalanceContent,
  LumenCardChangelogContent as HbarAppUiCardChangelogContent,
  LumenCardChoice as HbarAppUiCardChoice,
  LumenCardContent as HbarAppUiCardContent,
  LumenCardFile as HbarAppUiCardFile,
  LumenCardFilesContent as HbarAppUiCardFilesContent,
  LumenCardIntegration as HbarAppUiCardIntegration,
  LumenCardIntegrationsContent as HbarAppUiCardIntegrationsContent,
  LumenCardInvoiceContent as HbarAppUiCardInvoiceContent,
  LumenCardInvoiceLine as HbarAppUiCardInvoiceLine,
  LumenCardListStrategy as HbarAppUiCardListStrategy,
  LumenCardMemberContent as HbarAppUiCardMemberContent,
  LumenCardMetric as HbarAppUiCardMetric,
  LumenCardMetricsContent as HbarAppUiCardMetricsContent,
  LumenCardOnboardingContent as HbarAppUiCardOnboardingContent,
  LumenCardOnboardingStep as HbarAppUiCardOnboardingStep,
  LumenCardPlan as HbarAppUiCardPlan,
  LumenCardPlansContent as HbarAppUiCardPlansContent,
  LumenCardProfileContent as HbarAppUiCardProfileContent,
  LumenCardProviderProps as HbarAppUiCardProviderProps,
} from '@lumen/app-ui'

export function Card({ spec, onAction, cardContent, className }: HbarAppUiCardProps) {
  return (
    <LumenCard
      variant={spec.variant}
      variantId={spec.id}
      content={cardContent}
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
