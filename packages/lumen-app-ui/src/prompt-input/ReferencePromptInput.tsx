import * as React from 'react'
import type { LumenPromptReferenceViewProps } from './reference-content'
import { ReferenceRichPrompt } from './ReferenceRichPrompt'
import { ReferenceToolsPrompt } from './ReferenceToolsPrompt'
import { ReferenceHeroPrompt } from './ReferenceHeroPrompt'
import { ReferenceTemplatePrompt } from './ReferenceTemplatePrompt'
import { ReferenceUploadPrompt } from './ReferenceUploadPrompt'
import ReferenceScopePrompt from './ReferenceScopePrompt'
import ReferenceModesPrompt from './ReferenceModesPrompt'

export function ReferencePromptInput({
  viewModel,
  onAction,
  ...baseProps
}: LumenPromptReferenceViewProps): React.ReactElement | null {
  const props = { ...baseProps, onAction: viewModel.onAction ?? onAction }
  const { content } = viewModel
  switch (content.variant) {
    case 1:
      return <ReferenceRichPrompt {...props} viewModel={{ ...viewModel, content }} />
    case 2:
      return <ReferenceToolsPrompt {...props} viewModel={{ ...viewModel, content }} />
    case 3:
      return <ReferenceHeroPrompt {...props} viewModel={{ ...viewModel, content }} />
    case 4:
      return <ReferenceTemplatePrompt {...props} viewModel={{ ...viewModel, content }} />
    case 5:
      return <ReferenceUploadPrompt {...props} viewModel={{ ...viewModel, content }} />
    case 6:
      return <ReferenceScopePrompt {...props} viewModel={{ ...viewModel, content }} />
    case 7:
      return <ReferenceModesPrompt {...props} viewModel={{ ...viewModel, content }} />
    default:
      return null
  }
}
export default ReferencePromptInput
