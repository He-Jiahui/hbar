import {
  LumenPromptInput,
  LumenPromptInputProvider as HbarAppUiPromptInputProvider,
  type LumenPromptInputContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from '../types'
import { useHbarAppUiPromptContent } from './prompt-input/Composer'

export type HbarAppUiPromptInputProps = HbarAppUiVariantProps & {
  readonly promptInputContent?: LumenPromptInputContent | undefined
}

export { HbarAppUiPromptInputProvider }
export {
  selectLumenPromptInputItem as selectHbarAppUiPromptInputItem,
  uniqueLumenPromptInputItems as uniqueHbarAppUiPromptInputItems,
  useLumenPromptInputContent as useHbarAppUiPromptInputContent,
} from '@lumen/app-ui'
export type {
  LumenPromptInputAction as HbarAppUiPromptInputAction,
  LumenPromptInputChoice as HbarAppUiPromptInputChoice,
  LumenPromptInputContent as HbarAppUiPromptInputContent,
  LumenPromptInputHeroContent as HbarAppUiPromptInputHeroContent,
  LumenPromptInputListStrategy as HbarAppUiPromptInputListStrategy,
  LumenPromptInputModeContent as HbarAppUiPromptInputModeContent,
  LumenPromptInputProviderProps as HbarAppUiPromptInputProviderProps,
  LumenPromptInputScopeContent as HbarAppUiPromptInputScopeContent,
  LumenPromptInputSource as HbarAppUiPromptInputSource,
  LumenPromptInputTemplateContent as HbarAppUiPromptInputTemplateContent,
  LumenPromptInputToolContent as HbarAppUiPromptInputToolContent,
  LumenPromptInputUpload as HbarAppUiPromptInputUpload,
  LumenPromptInputUploadContent as HbarAppUiPromptInputUploadContent,
  LumenPromptInputVariable as HbarAppUiPromptInputVariable,
} from '@lumen/app-ui'

export function PromptInput({ spec, onAction, promptInputContent, className }: HbarAppUiPromptInputProps) {
  const composer = useHbarAppUiPromptContent()
  return (
    <LumenPromptInput
      variant={spec.variant}
      variantId={spec.id}
      content={promptInputContent}
      composer={composer}
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
