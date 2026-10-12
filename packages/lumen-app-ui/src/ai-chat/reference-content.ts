import type * as React from 'react'
import type { LumenAiChatAction, LumenAiChatListStrategy } from '../ai-chat'

export interface LumenAiChatReferenceChoice {
  readonly id: string
  readonly label: string
  readonly detail?: string | undefined
  readonly badge?: string | undefined
}
export interface LumenAiChatReferenceDisclosure extends LumenAiChatReferenceChoice {
  readonly body: string
  readonly status?: string | undefined
}
export type LumenAiChatReferencePart =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'citation'; readonly sourceId: string; readonly label: string }
export interface LumenAiChatReferenceMessage {
  readonly id: string
  readonly side: 'user' | 'assistant'
  readonly parts: readonly LumenAiChatReferencePart[]
  readonly author?: string | undefined
  readonly disclosures?: readonly LumenAiChatReferenceDisclosure[] | undefined
  readonly sourceTags?: readonly string[] | undefined
  readonly artifact?: LumenAiChatReferenceChoice | undefined
  readonly regenerate?: boolean | undefined
  readonly copy?: boolean | undefined
}
export interface LumenAiChatReferenceComposer {
  readonly draft: string
  readonly attachments: readonly LumenAiChatReferenceChoice[]
  readonly labels: {
    readonly input: string
    readonly placeholder: string
    readonly send: string
    readonly attach?: string | undefined
    readonly remove: (name: string) => string
  }
}
export interface LumenAiChatReferenceBaseContent {
  readonly variant: number
  readonly ownerId: string
  readonly title: string
  readonly subtitle?: string | undefined
  readonly messages: readonly LumenAiChatReferenceMessage[]
  readonly composer?: LumenAiChatReferenceComposer | undefined
  readonly listStrategy: LumenAiChatListStrategy
  readonly labels: {
    readonly empty: string
    readonly regenerate: string
    readonly copy: string
    readonly openArtifact: string
    readonly sources: string
  }
  readonly notice?: string | undefined
}
export interface LumenAiChatThreadReferenceContent extends LumenAiChatReferenceBaseContent {
  readonly variant: 1
}
export interface LumenAiChatArtifactReferenceContent extends LumenAiChatReferenceBaseContent {
  readonly variant: 2
  readonly artifact: {
    readonly fileName: string
    readonly versions: readonly LumenAiChatReferenceChoice[]
    readonly selectedVersionId: string
    readonly mode: 'code' | 'document'
    readonly code: (versionId: string) => string
    readonly document: (versionId: string) => string
    readonly labels: {
      readonly code: string
      readonly document: string
      readonly copy: string
      readonly download: string
      readonly empty: string
    }
  }
}
export interface LumenAiChatEmbeddedReferenceContent extends LumenAiChatReferenceBaseContent {
  readonly variant: 3
}
export interface LumenAiChatContextReferenceContent extends LumenAiChatReferenceBaseContent {
  readonly variant: 4
  readonly models: readonly LumenAiChatReferenceChoice[]
  readonly selectedModelId: string
  readonly modelLabel: string
  readonly contextLabel: string
  readonly contextRatio: number
  readonly settingsLabel: string
}
export interface LumenAiChatApprovalReferenceContent extends LumenAiChatReferenceBaseContent {
  readonly variant: 5
  readonly previousApprovals: readonly LumenAiChatReferenceChoice[]
  readonly approval: {
    readonly id: string
    readonly status: string
    readonly description: string
    readonly request: string
    readonly labels: {
      readonly showRequest: string
      readonly allow: string
      readonly deny: string
    }
  }
}
export interface LumenAiChatAgentsReferenceContent extends LumenAiChatReferenceBaseContent {
  readonly variant: 6
  readonly activityTitle: string
  readonly activity: readonly (LumenAiChatReferenceChoice & { readonly status: string })[]
}
export interface LumenAiChatCitationsReferenceContent extends LumenAiChatReferenceBaseContent {
  readonly variant: 7
  readonly sourcesTitle: string
  readonly sources: readonly LumenAiChatReferenceChoice[]
  readonly selectedSourceId: string | null
}
export interface LumenAiChatVoiceReferenceContent extends LumenAiChatReferenceBaseContent {
  readonly variant: 8
  readonly transcript: string
  readonly phase: 'listening' | 'stopped'
  readonly waveform: readonly { readonly id: string; readonly level: 'low' | 'medium' | 'high' }[]
  readonly attachments: readonly LumenAiChatReferenceChoice[]
  readonly voiceLabels: {
    readonly listening: string
    readonly stopped: string
    readonly stop: string
    readonly resume: string
    readonly tapToStop: string
    readonly send: string
    readonly remove: (name: string) => string
    readonly waveform: string
  }
}
export interface LumenAiChatModelsReferenceContent extends LumenAiChatReferenceBaseContent {
  readonly variant: 9
  readonly models: readonly LumenAiChatReferenceChoice[]
  readonly selectedModelId: string
  readonly modelLabel: string
  readonly disclaimer: (modelId: string) => string
  readonly modelSubtitle: (modelId: string) => string
}
export type LumenAiChatReferenceContent =
  | LumenAiChatThreadReferenceContent
  | LumenAiChatArtifactReferenceContent
  | LumenAiChatEmbeddedReferenceContent
  | LumenAiChatContextReferenceContent
  | LumenAiChatApprovalReferenceContent
  | LumenAiChatAgentsReferenceContent
  | LumenAiChatCitationsReferenceContent
  | LumenAiChatVoiceReferenceContent
  | LumenAiChatModelsReferenceContent
export interface LumenAiChatReferenceViewModel<
  Content extends LumenAiChatReferenceContent = LumenAiChatReferenceContent,
> {
  readonly content: Content
  readonly onAction?: ((event: LumenAiChatAction) => void) | undefined
  readonly onDraftChange?: ((draft: string) => void) | undefined
  readonly onRemoveAttachment?: ((id: string) => void) | undefined
  readonly onModelChange?: ((id: string) => void) | undefined
  readonly onArtifactVersionChange?: ((id: string) => void) | undefined
  readonly onArtifactModeChange?: ((mode: 'code' | 'document') => void) | undefined
  readonly onSourceSelect?: ((id: string) => void) | undefined
  readonly onVoicePhaseChange?: ((phase: 'listening' | 'stopped') => void) | undefined
}
export interface LumenAiChatReferenceViewProps<
  Content extends LumenAiChatReferenceContent = LumenAiChatReferenceContent,
> {
  readonly variantId: string
  readonly className?: string | undefined
  readonly viewModel: LumenAiChatReferenceViewModel<Content>
  readonly onAction?: ((event: LumenAiChatAction) => void) | undefined
}
export interface LumenAiChatReferenceFrameProps {
  readonly content: LumenAiChatReferenceBaseContent
  readonly variantId: string
  readonly className?: string | undefined
  readonly children: React.ReactNode
}
