import type * as React from 'react'
import type { LumenPromptInputAction, LumenPromptInputListStrategy } from '../prompt-input'

export interface LumenPromptReferenceChoice {
  readonly id: string
  readonly label: string
  readonly detail?: string | undefined
}
export interface LumenPromptReferenceAttachment extends LumenPromptReferenceChoice {
  readonly kind?: 'file' | 'person' | 'channel' | undefined
}
export interface LumenPromptReferenceComposer {
  readonly allowAttachmentOnly?: boolean | undefined
  readonly draft: string
  readonly attachments: readonly LumenPromptReferenceAttachment[]
  readonly role?: 'combobox' | undefined
  readonly labels: {
    readonly input: string
    readonly placeholder: string
    readonly send: string
    readonly attach?: string | undefined
    readonly remove: (name: string) => string
  }
}
export interface LumenPromptReferenceBaseContent {
  readonly variant: number
  readonly ownerId: string
  readonly composer?: LumenPromptReferenceComposer | undefined
  readonly help?: string | undefined
  readonly notice?: string | undefined
  readonly listStrategy: LumenPromptInputListStrategy
}
export interface LumenPromptRichReferenceContent extends LumenPromptReferenceBaseContent {
  readonly variant: 1
  readonly models: readonly LumenPromptReferenceChoice[]
  readonly modelId: string
  readonly efforts: readonly LumenPromptReferenceChoice[]
  readonly effortId: string
  readonly commands: readonly (LumenPromptReferenceChoice & { readonly draft: string })[]
  readonly labels: {
    readonly model: (name: string) => string
    readonly effort: (name: string) => string
    readonly commands: string
    readonly voice: string
  }
}
export interface LumenPromptToolsReferenceContent extends LumenPromptReferenceBaseContent {
  readonly variant: 2
  readonly models: readonly LumenPromptReferenceChoice[]
  readonly modelId: string
  readonly searchEnabled: boolean
  readonly tokenLabel: string
  readonly labels: { readonly model: (name: string) => string; readonly search: string }
}
export interface LumenPromptHeroReferenceContent extends LumenPromptReferenceBaseContent {
  readonly variant: 3
  readonly title: string
  readonly description: string
  readonly suggestions: readonly (LumenPromptReferenceChoice & {
    readonly draft: string
    readonly icon: 'page' | 'chart' | 'store' | 'checklist'
  })[]
}
export type LumenPromptTemplatePart =
  { readonly kind: 'text'; readonly text: string } | { readonly kind: 'variable'; readonly variableId: string }
export interface LumenPromptTemplateReferenceContent extends LumenPromptReferenceBaseContent {
  readonly variant: 4
  readonly parts: readonly LumenPromptTemplatePart[]
  readonly variables: readonly {
    readonly id: string
    readonly label: string
    readonly placeholder: string
    readonly value: string
  }[]
  readonly labels: { readonly run: string; readonly status: (missing: number) => string }
}
export interface LumenPromptUploadReferenceContent extends LumenPromptReferenceBaseContent {
  readonly variant: 5
  readonly uploads: readonly {
    readonly id: string
    readonly name: string
    readonly detail: string
    readonly failed: boolean
  }[]
  readonly labels: {
    readonly browse: string
    readonly drop: string
    readonly retry: (name: string) => string
    readonly remove: (name: string) => string
    readonly empty: string
  }
}
export interface LumenPromptScopeReferenceContent extends LumenPromptReferenceBaseContent {
  readonly variant: 6
  readonly sources: readonly LumenPromptReferenceAttachment[]
  readonly selectedSourceIds: readonly string[]
  readonly maximumSources: number
  readonly labels: {
    readonly addContext: string
    readonly sources: string
    readonly empty: string
  }
}
export interface LumenPromptModesReferenceContent extends LumenPromptReferenceBaseContent {
  readonly variant: 7
  readonly modes: readonly LumenPromptReferenceChoice[]
  readonly modeId: string
  readonly environments: readonly LumenPromptReferenceChoice[]
  readonly environmentId: string
  readonly models: readonly LumenPromptReferenceChoice[]
  readonly modelId: string
  readonly modeDescription: (modeId: string) => string
  readonly labels: {
    readonly modes: string
    readonly environment: (name: string) => string
    readonly model: (name: string) => string
  }
  readonly hints: readonly {
    readonly id: string
    readonly key: string
    readonly description: string
  }[]
}
export type LumenPromptReferenceContent =
  | LumenPromptRichReferenceContent
  | LumenPromptToolsReferenceContent
  | LumenPromptHeroReferenceContent
  | LumenPromptTemplateReferenceContent
  | LumenPromptUploadReferenceContent
  | LumenPromptScopeReferenceContent
  | LumenPromptModesReferenceContent
export interface LumenPromptReferenceViewModel<
  Content extends LumenPromptReferenceContent = LumenPromptReferenceContent,
> {
  readonly content: Content
  readonly onAction?: ((event: LumenPromptInputAction) => void) | undefined
  readonly onDraftChange?: ((value: string) => void) | undefined
  readonly onRemoveAttachment?: ((id: string) => void) | undefined
  readonly onModelChange?: ((id: string) => void) | undefined
  readonly onEffortChange?: ((id: string) => void) | undefined
  readonly onSearchChange?: ((value: boolean) => void) | undefined
  readonly onSuggestionSelect?: ((id: string) => void) | undefined
  readonly onCommandSelect?: ((id: string) => void) | undefined
  readonly onVariableChange?: ((id: string, value: string) => void) | undefined
  readonly onRemoveUpload?: ((id: string) => void) | undefined
  readonly onSourceAdd?: ((id: string) => void) | undefined
  readonly onSourceRemove?: ((id: string) => void) | undefined
  readonly onModeChange?: ((id: string) => void) | undefined
  readonly onEnvironmentChange?: ((id: string) => void) | undefined
}
export interface LumenPromptReferenceViewProps<
  Content extends LumenPromptReferenceContent = LumenPromptReferenceContent,
> {
  readonly variantId: string
  readonly className?: string | undefined
  readonly viewModel: LumenPromptReferenceViewModel<Content>
  readonly onAction?: ((event: LumenPromptInputAction) => void) | undefined
}
export interface LumenPromptReferenceFrameProps {
  readonly content: LumenPromptReferenceBaseContent
  readonly variantId: string
  readonly className?: string | undefined
  readonly children: React.ReactNode
}
