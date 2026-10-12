import { createStore } from 'zustand/vanilla'
import type { LumenAppShellChatContent } from '@lumen/app-ui/catalog'

function isValidId(id: string): boolean {
  return id.trim().length > 0
}
function stableValidItems<T extends { readonly id: string }>(items: readonly T[]): T[] {
  return [...new Map(items.filter((item) => isValidId(item.id)).map((item) => [item.id, item])).values()]
}

export function createAppShellChatPreviewStore() {
  return createStore<{
    readonly modelId: string
    readonly threadId: string | null
    readonly draft: string
    readonly chooseModel: (id: string) => void
    readonly chooseThread: (id: string | null) => void
    readonly edit: (value: string) => void
    readonly canSend: (value: string) => boolean
  }>((set, get) => ({
    modelId: 'atlas',
    threadId: null,
    draft: '',
    chooseModel: (modelId) => {
      if (isValidId(modelId)) set({ modelId })
    },
    chooseThread: (threadId) => {
      if (threadId === null || isValidId(threadId)) set({ threadId, draft: '' })
    },
    edit: (draft) => set({ draft }),
    canSend: (value) => value.trim().length > 0 && value === get().draft.trim(),
  }))
}

export function projectAppShellChatPreview(
  state: ReturnType<ReturnType<typeof createAppShellChatPreviewStore>['getState']>,
  content: LumenAppShellChatContent,
): LumenAppShellChatContent {
  const models = stableValidItems(content.models)
  const threads = stableValidItems(content.threads).map((thread) => ({
    ...thread,
    messages: stableValidItems(thread.messages),
  }))
  const quickActions = stableValidItems(content.quickActions)
  const suggestions = stableValidItems(content.suggestions)
  return {
    ...content,
    models,
    threads,
    quickActions,
    suggestions,
    selectedModelId: models.some((item) => item.id === state.modelId) ? state.modelId : (models[0]?.id ?? ''),
    selectedThreadId: state.threadId && threads.some((item) => item.id === state.threadId) ? state.threadId : null,
    pinnedThreadId:
      content.pinnedThreadId && threads.some((item) => item.id === content.pinnedThreadId)
        ? content.pinnedThreadId
        : null,
    draft: state.draft,
    onModel: (id) => {
      if (isValidId(id) && models.some((item) => item.id === id)) {
        state.chooseModel(id)
        content.onModel(id)
      }
    },
    onThread: (id) => {
      if (id === null || (isValidId(id) && threads.some((item) => item.id === id))) {
        state.chooseThread(id)
        content.onThread(id)
      }
    },
    onDraft: (value) => {
      state.edit(value)
      content.onDraft(value)
    },
    onAction: (action, value) => {
      if (action === 'quick' && (!value || !isValidId(value) || !quickActions.some((item) => item.id === value))) return
      if (action === 'send' && !state.canSend(value ?? '')) return
      content.onAction(action, value)
    },
  }
}
