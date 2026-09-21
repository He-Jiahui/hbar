import { LumenAiChat, LumenAiChatProvider as HbarAppUiAiChatProvider, type LumenAiChatContent } from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiAiChatProps = HbarAppUiVariantProps & { readonly aiChatContent?: LumenAiChatContent | undefined }
export { HbarAppUiAiChatProvider }
export {
  selectLumenAiChatItem as selectHbarAppUiAiChatItem,
  uniqueLumenAiChatItems as uniqueHbarAppUiAiChatItems,
  useLumenAiChatContent as useHbarAppUiAiChatContent,
} from '@lumen/app-ui'
export type {
  LumenAiChatAction as HbarAppUiAiChatAction,
  LumenAiChatChoice as HbarAppUiAiChatChoice,
  LumenAiChatContent as HbarAppUiAiChatContent,
  LumenAiChatListStrategy as HbarAppUiAiChatListStrategy,
  LumenAiChatMessage as HbarAppUiAiChatMessage,
  LumenAiChatProviderChoice as HbarAppUiAiChatProviderChoice,
  LumenAiChatProviderProps as HbarAppUiAiChatProviderProps,
} from '@lumen/app-ui'
export function AiChat({ spec, onAction, aiChatContent, className }: HbarAppUiAiChatProps) {
  return (
    <LumenAiChat
      variant={spec.variant}
      variantId={spec.id}
      content={aiChatContent}
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
