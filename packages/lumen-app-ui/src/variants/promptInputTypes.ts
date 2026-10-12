export interface PromptBaseCopy {
  title: string
  detail: string
  placeholder: string
  send: string
  stop: string
  empty: string
}

export interface PromptBaseState {
  draft: string
  status: 'idle' | 'running' | 'failed'
  error: string | null
}

export interface PromptBaseActions {
  onDraftChange: (promptId: string, value: string) => void
  onSend: (promptId: string, value: string) => void
  onStop: (promptId: string) => void
}

export interface PromptOption {
  id: string
  label: string
}

export interface PromptAttachment extends PromptOption {
  progress: number
  status: 'uploading' | 'ready' | 'failed'
}

interface PromptBaseProps {
  content: { id: string }
  state: PromptBaseState
  actions: PromptBaseActions
}

export interface HbarAppUiPromptInput01Props extends PromptBaseProps {
  copy: PromptBaseCopy & {
    commands: string
    attach: string
    removeAttachment: (label: string) => string
  }
  content: PromptBaseProps['content'] & {
    commands: readonly PromptOption[]
    attachments: readonly PromptOption[]
    accept: string
  }
  state: PromptBaseState & { commandOpen: boolean }
  actions: PromptBaseActions & {
    onCommandOpen: (promptId: string, open: boolean) => void
    onCommand: (promptId: string, commandId: string) => void
    onAttach: (promptId: string, files: readonly File[]) => void
    onRemoveAttachment: (promptId: string, attachmentId: string) => void
  }
}

export interface HbarAppUiPromptInput02Props extends PromptBaseProps {
  copy: PromptBaseCopy & { model: string; tools: string; tokens: (count: number) => string }
  content: PromptBaseProps['content'] & {
    models: readonly PromptOption[]
    tools: readonly PromptOption[]
  }
  state: PromptBaseState & {
    modelId: string | null
    toolIds: readonly string[]
    tokenCount: number
  }
  actions: PromptBaseActions & {
    onModel: (promptId: string, modelId: string) => void
    onTool: (promptId: string, toolId: string) => void
  }
}

export interface HbarAppUiPromptInput03Props extends PromptBaseProps {
  copy: PromptBaseCopy & { suggestions: string; recent: string }
  content: PromptBaseProps['content'] & {
    suggestions: readonly PromptOption[]
    recent: readonly PromptOption[]
  }
  actions: PromptBaseActions & {
    onSuggestion: (promptId: string, suggestionId: string) => void
    onRecent: (promptId: string, recentId: string) => void
  }
}

export interface HbarAppUiPromptInput04Props {
  copy: {
    title: string
    detail: string
    name: string
    template: string
    variables: string
    save: string
    invalid: string
  }
  content: { id: string; variables: readonly PromptOption[] }
  state: { name: string; template: string; valid: boolean; error: string | null }
  actions: {
    onNameChange: (templateId: string, value: string) => void
    onTemplateChange: (templateId: string, value: string) => void
    onSave: (templateId: string, name: string, template: string) => void
  }
}

export interface HbarAppUiPromptInput05Props extends PromptBaseProps {
  copy: PromptBaseCopy & {
    drop: string
    release: string
    choose: string
    retry: (label: string) => string
    progress: (label: string, value: number) => string
    percentage: (value: number) => string
  }
  content: PromptBaseProps['content'] & {
    accept: string
    attachments: readonly PromptAttachment[]
  }
  actions: PromptBaseActions & {
    onUpload: (promptId: string, files: readonly File[], origin: 'drop' | 'picker') => void
    onRetry: (promptId: string, attachmentId: string) => void
  }
}

export interface HbarAppUiPromptInput06Props extends PromptBaseProps {
  copy: PromptBaseCopy & { scope: string; mention: string; remove: (label: string) => string }
  content: PromptBaseProps['content'] & {
    scopes: readonly PromptOption[]
    sources: readonly PromptOption[]
  }
  state: PromptBaseState & {
    scopeId: string | null
    sourceIds: readonly string[]
    mentionOpen: boolean
  }
  actions: PromptBaseActions & {
    onScope: (promptId: string, scopeId: string) => void
    onMentionOpen: (promptId: string, open: boolean) => void
    onSource: (promptId: string, sourceId: string) => void
    onRemoveSource: (promptId: string, sourceId: string) => void
  }
}

export interface HbarAppUiPromptInput07Props extends PromptBaseProps {
  copy: PromptBaseCopy & { mode: string; hints: readonly string[] }
  content: PromptBaseProps['content'] & { modes: readonly PromptOption[] }
  state: PromptBaseState & { modeId: string | null }
  actions: PromptBaseActions & { onMode: (promptId: string, modeId: string) => void }
}
