import { createStore } from 'zustand/vanilla'
import type { LumenAppShellChatContent } from '@lumen/app-ui'

export function createAppShellChatPreviewStore() {
  return createStore<{
    readonly modelId: string
    readonly threadId: string | null
    readonly draft: string
    readonly chooseModel: (id: string) => void
    readonly chooseThread: (id: string | null) => void
    readonly edit: (value: string) => void
  }>((set) => ({
    modelId: 'atlas',
    threadId: null,
    draft: '',
    chooseModel: (modelId) => set({ modelId }),
    chooseThread: (threadId) => set({ threadId, draft: '' }),
    edit: (draft) => set({ draft }),
  }))
}

export function projectAppShellChatPreview(
  state: ReturnType<ReturnType<typeof createAppShellChatPreviewStore>['getState']>,
  content: LumenAppShellChatContent,
): LumenAppShellChatContent {
  return {
    ...content,
    selectedModelId: content.models.some((item) => item.id === state.modelId)
      ? state.modelId
      : (content.models[0]?.id ?? ''),
    selectedThreadId:
      state.threadId && content.threads.some((item) => item.id === state.threadId) ? state.threadId : null,
    draft: state.draft,
    onModel: (id) => {
      if (content.models.some((item) => item.id === id)) {
        state.chooseModel(id)
        content.onModel(id)
      }
    },
    onThread: (id) => {
      if (id === null || content.threads.some((item) => item.id === id)) {
        state.chooseThread(id)
        content.onThread(id)
      }
    },
    onDraft: (value) => {
      state.edit(value)
      content.onDraft(value)
    },
    onAction: (action, value) => {
      if (action === 'quick' && !content.quickActions.some((item) => item.id === value)) return
      if (action === 'send' && !state.draft.trim()) return
      content.onAction(action, value)
    },
  }
}
