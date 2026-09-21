import { LumenSupport, LumenSupportProvider as HbarAppUiSupportProvider, type LumenSupportContent } from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiSupportProps = HbarAppUiVariantProps & {
  readonly supportContent?: LumenSupportContent | undefined
}
export { HbarAppUiSupportProvider }
export {
  selectLumenSupportItem as selectHbarAppUiSupportItem,
  uniqueLumenSupportItems as uniqueHbarAppUiSupportItems,
  useLumenSupportContent as useHbarAppUiSupportContent,
} from '@lumen/app-ui'
export type {
  LumenSupportAction as HbarAppUiSupportAction,
  LumenSupportArticle as HbarAppUiSupportArticle,
  LumenSupportAssistantAction as HbarAppUiSupportAssistantAction,
  LumenSupportAssistantContent as HbarAppUiSupportAssistantContent,
  LumenSupportChatMessage as HbarAppUiSupportChatMessage,
  LumenSupportChoice as HbarAppUiSupportChoice,
  LumenSupportContent as HbarAppUiSupportContent,
  LumenSupportHelpContent as HbarAppUiSupportHelpContent,
  LumenSupportListStrategy as HbarAppUiSupportListStrategy,
  LumenSupportMessage as HbarAppUiSupportMessage,
  LumenSupportProviderProps as HbarAppUiSupportProviderProps,
  LumenSupportRequest as HbarAppUiSupportRequest,
  LumenSupportRequestsContent as HbarAppUiSupportRequestsContent,
  LumenSupportThreadContent as HbarAppUiSupportThreadContent,
  LumenSupportTicketContext as HbarAppUiSupportTicketContext,
  LumenSupportTicketFormContent as HbarAppUiSupportTicketFormContent,
  LumenSupportTopic as HbarAppUiSupportTopic,
} from '@lumen/app-ui'

export function Support({ spec, onAction, supportContent, className }: HbarAppUiSupportProps) {
  return (
    <LumenSupport
      variant={spec.variant}
      variantId={spec.id}
      content={supportContent}
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
