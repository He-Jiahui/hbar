import * as React from 'react'
import type { LumenAiChatReferenceViewProps } from './reference-content'
import { ReferenceThreadChat } from './ReferenceThreadChat'
import { ReferenceArtifactChat } from './ReferenceArtifactChat'
import { ReferenceEmbeddedChat } from './ReferenceEmbeddedChat'
import { ReferenceContextChat } from './ReferenceContextChat'
import { ReferenceApprovalChat } from './ReferenceApprovalChat'
import { ReferenceAgentsChat } from './ReferenceAgentsChat'
import { ReferenceCitationsChat } from './ReferenceCitationsChat'
import { ReferenceVoiceChat } from './ReferenceVoiceChat'
import { ReferenceModelsChat } from './ReferenceModelsChat'

export function ReferenceAiChat({
  viewModel,
  onAction,
  ...baseProps
}: LumenAiChatReferenceViewProps): React.ReactElement | null {
  const { content } = viewModel
  const props = { ...baseProps, onAction: viewModel.onAction ?? onAction }
  switch (content.variant) {
    case 1:
      return <ReferenceThreadChat {...props} viewModel={{ ...viewModel, content }} />
    case 2:
      return <ReferenceArtifactChat {...props} viewModel={{ ...viewModel, content }} />
    case 3:
      return <ReferenceEmbeddedChat {...props} viewModel={{ ...viewModel, content }} />
    case 4:
      return <ReferenceContextChat {...props} viewModel={{ ...viewModel, content }} />
    case 5:
      return <ReferenceApprovalChat {...props} viewModel={{ ...viewModel, content }} />
    case 6:
      return <ReferenceAgentsChat {...props} viewModel={{ ...viewModel, content }} />
    case 7:
      return <ReferenceCitationsChat {...props} viewModel={{ ...viewModel, content }} />
    case 8:
      return <ReferenceVoiceChat {...props} viewModel={{ ...viewModel, content }} />
    case 9:
      return <ReferenceModelsChat {...props} viewModel={{ ...viewModel, content }} />
    default:
      return null
  }
}
export default ReferenceAiChat
