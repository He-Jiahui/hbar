import { LumenChat, LumenChatProvider as HbarAppUiChatProvider, type LumenChatContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiChatProps = HbarAppUiVariantProps & {
  readonly chatContent?: LumenChatContent | undefined
}

export { HbarAppUiChatProvider }
export { selectLumenChatItem as selectHbarAppUiChatItem, uniqueLumenChatItems as uniqueHbarAppUiChatItems, useLumenChatContent as useHbarAppUiChatContent } from '@lumen/app-ui/catalog'
export type { LumenChatAction as HbarAppUiChatAction, LumenChatAttachment as HbarAppUiChatAttachment, LumenChatChoice as HbarAppUiChatChoice, LumenChatContact as HbarAppUiChatContact, LumenChatContent as HbarAppUiChatContent, LumenChatDirectContent as HbarAppUiChatDirectContent, LumenChatGroupContent as HbarAppUiChatGroupContent, LumenChatListStrategy as HbarAppUiChatListStrategy, LumenChatLiveContent as HbarAppUiChatLiveContent, LumenChatLiveMessage as HbarAppUiChatLiveMessage, LumenChatMessage as HbarAppUiChatMessage, LumenChatParticipant as HbarAppUiChatParticipant, LumenChatProviderProps as HbarAppUiChatProviderProps, LumenChatSocialContent as HbarAppUiChatSocialContent, LumenChatSupportContent as HbarAppUiChatSupportContent, LumenChatTeamContent as HbarAppUiChatTeamContent } from '@lumen/app-ui/catalog'

export function Chat({ spec, onAction, chatContent, className }: HbarAppUiChatProps) {
  return (
    <LumenChat
      variant={spec.variant}
      variantId={spec.id}
      content={chatContent}
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
