import { createStore } from 'zustand/vanilla'
import type { HbarAppUiFeedbackWidgetReferenceContent, HbarAppUiFeedbackType } from 'hbar-app-ui/catalog'
import { uniqueHbarAppUiFeedbackReferenceTypes } from 'hbar-app-ui/catalog'

type Type = HbarAppUiFeedbackWidgetReferenceContent['types'][number]
interface FeedbackWidgetState {
  readonly widgetId: string | undefined
  readonly types: readonly Type[]
  readonly selectedTypeId: HbarAppUiFeedbackType | undefined
  readonly draft: string
  readonly screenshotAttached: boolean
  readonly phase: 'editing' | 'sent'
  readonly maximumCharacters: number
  readonly reset: (content: HbarAppUiFeedbackWidgetReferenceContent | undefined) => void
  readonly selectType: (widgetId: string, typeId: HbarAppUiFeedbackType) => void
  readonly changeDraft: (widgetId: string, draft: string) => void
  readonly toggleScreenshot: (widgetId: string) => void
  readonly submit: (widgetId: string) => void
  readonly sendAnother: (widgetId: string) => void
}

function projection(content: HbarAppUiFeedbackWidgetReferenceContent | undefined) {
  const types = uniqueHbarAppUiFeedbackReferenceTypes(content?.types ?? [])
  const maximumCharacters = Math.max(0, content?.maximumCharacters ?? 0)
  return {
    widgetId: content?.widgetId,
    types,
    selectedTypeId: types.some((type) => type.id === content?.selectedTypeId) ? content?.selectedTypeId : types[0]?.id,
    draft: (content?.draft ?? '').slice(0, maximumCharacters),
    screenshotAttached: content?.screenshotAttached ?? false,
    phase: content?.phase ?? 'editing',
    maximumCharacters,
  }
}

/** The demo acknowledgement is local preview state, not a remote delivery promise. */
export function createFeedbackWidgetPreviewStore(content: HbarAppUiFeedbackWidgetReferenceContent | undefined) {
  return createStore<FeedbackWidgetState>((set) => ({
    ...projection(content),
    reset: (next) => set(projection(next)),
    selectType: (widgetId, typeId) =>
      set((state) =>
        state.widgetId === widgetId && state.phase === 'editing' && state.types.some((type) => type.id === typeId)
          ? { selectedTypeId: typeId }
          : {},
      ),
    changeDraft: (widgetId, draft) =>
      set((state) =>
        state.widgetId === widgetId && state.phase === 'editing'
          ? { draft: draft.slice(0, state.maximumCharacters) }
          : {},
      ),
    toggleScreenshot: (widgetId) =>
      set((state) =>
        state.widgetId === widgetId && state.phase === 'editing'
          ? { screenshotAttached: !state.screenshotAttached }
          : {},
      ),
    submit: (widgetId) =>
      set((state) =>
        state.widgetId === widgetId && state.phase === 'editing' && state.selectedTypeId && state.draft.trim()
          ? { phase: 'sent' }
          : {},
      ),
    sendAnother: (widgetId) =>
      set((state) => (state.widgetId === widgetId && state.phase === 'sent' ? { phase: 'editing', draft: '' } : {})),
  }))
}
