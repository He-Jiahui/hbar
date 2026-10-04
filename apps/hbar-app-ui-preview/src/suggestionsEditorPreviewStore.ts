import { createStore } from 'zustand/vanilla'
import type { HbarAppUiSuggestionsReferenceContent } from 'hbar-app-ui/catalog'
import { uniqueHbarAppUiReferenceSuggestions } from 'hbar-app-ui/catalog'

type Decision = HbarAppUiSuggestionsReferenceContent['decisions'][string]
type Suggestion = HbarAppUiSuggestionsReferenceContent['suggestions'][number]
interface SuggestionsEditorState {
  readonly documentId: string | undefined
  readonly suggestions: readonly Suggestion[]
  readonly decisions: Readonly<Record<string, Decision>>
  readonly selectedSuggestionId: string | undefined
  readonly reset: (content: HbarAppUiSuggestionsReferenceContent | undefined) => void
  readonly select: (documentId: string, suggestionId: string) => void
  readonly resolve: (documentId: string, suggestionId: string, action: Decision) => void
  readonly acceptAll: (documentId: string) => void
  readonly restore: (documentId: string) => void
}

function projection(content: HbarAppUiSuggestionsReferenceContent | undefined) {
  const suggestions = uniqueHbarAppUiReferenceSuggestions(content?.suggestions ?? [])
  const decisions: Record<string, Decision> = {}
  for (const [id, action] of Object.entries(content?.decisions ?? {})) {
    if (suggestions.some((item) => item.id === id)) decisions[id] = action
  }
  const remaining = suggestions.filter((item) => !decisions[item.id])
  return {
    documentId: content?.document.id,
    suggestions,
    decisions,
    selectedSuggestionId: remaining.some((item) => item.id === content?.selectedSuggestionId)
      ? content?.selectedSuggestionId
      : remaining[0]?.id,
  }
}

/** Decisions are ID-bound; accepted inline text and counts derive from the same state. */
export function createSuggestionsEditorPreviewStore(content: HbarAppUiSuggestionsReferenceContent | undefined) {
  return createStore<SuggestionsEditorState>((set) => ({
    ...projection(content),
    reset: (next) => set(projection(next)),
    select: (documentId, suggestionId) =>
      set((state) =>
        state.documentId === documentId &&
        state.suggestions.some((item) => item.id === suggestionId && !state.decisions[item.id])
          ? { selectedSuggestionId: suggestionId }
          : {},
      ),
    resolve: (documentId, suggestionId, action) =>
      set((state) => {
        if (state.documentId !== documentId || state.decisions[suggestionId]) return {}
        const remaining = state.suggestions.filter((item) => !state.decisions[item.id])
        const index = remaining.findIndex((item) => item.id === suggestionId)
        if (index < 0) return {}
        const next = remaining.filter((item) => item.id !== suggestionId)
        return {
          decisions: { ...state.decisions, [suggestionId]: action },
          selectedSuggestionId:
            state.selectedSuggestionId !== suggestionId && next.some((item) => item.id === state.selectedSuggestionId)
              ? state.selectedSuggestionId
              : next[Math.min(index, next.length - 1)]?.id,
        }
      }),
    acceptAll: (documentId) =>
      set((state) => {
        if (state.documentId !== documentId) return {}
        const decisions: Record<string, Decision> = { ...state.decisions }
        for (const item of state.suggestions) {
          if (!decisions[item.id]) decisions[item.id] = 'accept'
        }
        return {
          decisions,
          selectedSuggestionId: undefined,
        }
      }),
    restore: (documentId) =>
      set((state) =>
        state.documentId === documentId ? { decisions: {}, selectedSuggestionId: state.suggestions[0]?.id } : {},
      ),
  }))
}
