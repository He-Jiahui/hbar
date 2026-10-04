import { createStore } from 'zustand/vanilla'
import type { LumenPromptReferenceContent } from '@lumen/app-ui'

interface PromptSeed {
  readonly ownerId: string
  readonly draft: string
  readonly attachmentIds: readonly string[]
  readonly uploadIds: readonly string[]
  readonly modelIds: readonly string[]
  readonly effortIds: readonly string[]
  readonly sourceIds: readonly string[]
  readonly modeIds: readonly string[]
  readonly environmentIds: readonly string[]
  readonly modelId: string | null
  readonly effortId: string | null
  readonly modeId: string | null
  readonly environmentId: string | null
  readonly selectedSourceIds: readonly string[]
  readonly maximumSources: number
  readonly variables: readonly { readonly id: string; readonly value: string }[]
  readonly presets: readonly { readonly id: string; readonly draft: string }[]
}
export interface PromptReferencePreviewState {
  readonly seed: PromptSeed
  readonly draft: string
  readonly removedAttachmentIds: readonly string[]
  readonly removedUploadIds: readonly string[]
  readonly modelId: string | null
  readonly effortId: string | null
  readonly modeId: string | null
  readonly environmentId: string | null
  readonly searchEnabled: boolean
  readonly selectedSourceIds: readonly string[]
  readonly variables: readonly { readonly id: string; readonly value: string }[]
  readonly notice: 'local' | 'intent' | null
  readonly setDraft: (value: string) => void
  readonly select: (kind: 'model' | 'effort' | 'mode' | 'environment', id: string) => boolean
  readonly remove: (kind: 'attachment' | 'upload', id: string) => boolean
  readonly setSource: (id: string, selected: boolean) => boolean
  readonly setVariable: (id: string, value: string) => boolean
  readonly usePreset: (id: string) => boolean
  readonly setSearch: (value: boolean) => void
  readonly recordIntent: () => void
  readonly reconcile: (seed: PromptSeed) => void
}
function unique(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => id.trim()))]
}
function uniqueItems<Item extends { readonly id: string }>(items: readonly Item[]): Item[] {
  const ids = new Set<string>()
  return items.filter((item) => {
    if (!item.id.trim() || ids.has(item.id)) return false
    ids.add(item.id)
    return true
  })
}
function pick(ids: readonly string[], id: string | null): string | null {
  return id && ids.includes(id) ? id : (ids[0] ?? null)
}
export function promptReferenceSeed(content: LumenPromptReferenceContent): PromptSeed {
  return {
    ownerId: content.ownerId,
    draft: content.composer?.draft ?? '',
    attachmentIds: unique(content.composer?.attachments.map(({ id }) => id) ?? []),
    uploadIds: content.variant === 5 ? unique(content.uploads.map(({ id }) => id)) : [],
    modelIds:
      content.variant === 1 || content.variant === 2 || content.variant === 7
        ? unique(content.models.map(({ id }) => id))
        : [],
    modelId: content.variant === 1 || content.variant === 2 || content.variant === 7 ? content.modelId : null,
    effortIds: content.variant === 1 ? unique(content.efforts.map(({ id }) => id)) : [],
    effortId: content.variant === 1 ? content.effortId : null,
    sourceIds: content.variant === 6 ? unique(content.sources.map(({ id }) => id)) : [],
    selectedSourceIds:
      content.variant === 6
        ? unique(content.selectedSourceIds)
            .filter((id) => content.sources.some((item) => item.id === id))
            .slice(0, Math.max(0, content.maximumSources))
        : [],
    maximumSources: content.variant === 6 ? Math.max(0, content.maximumSources) : 0,
    modeIds: content.variant === 7 ? unique(content.modes.map(({ id }) => id)) : [],
    modeId: content.variant === 7 ? content.modeId : null,
    environmentIds: content.variant === 7 ? unique(content.environments.map(({ id }) => id)) : [],
    environmentId: content.variant === 7 ? content.environmentId : null,
    variables: content.variant === 4 ? uniqueItems(content.variables).map(({ id, value }) => ({ id, value })) : [],
    presets: uniqueItems(
      content.variant === 1 ? content.commands : content.variant === 3 ? content.suggestions : [],
    ).map(({ id, draft }) => ({ id, draft })),
  }
}
/** Preview owner contains values/IDs only, never translations, tokens or service results. */
export function createPromptReferencePreviewStore(content: LumenPromptReferenceContent) {
  const seed = promptReferenceSeed(content)
  return createStore<PromptReferencePreviewState>((set, get) => ({
    seed,
    draft: seed.draft,
    removedAttachmentIds: [],
    removedUploadIds: [],
    modelId: pick(seed.modelIds, seed.modelId),
    effortId: pick(seed.effortIds, seed.effortId),
    modeId: pick(seed.modeIds, seed.modeId),
    environmentId: pick(seed.environmentIds, seed.environmentId),
    variables: seed.variables,
    selectedSourceIds: seed.selectedSourceIds,
    searchEnabled: content.variant === 2 && content.searchEnabled,
    notice: null,
    setDraft: (draft) => set({ draft, notice: null }),
    select: (kind, id) => {
      const ids = get().seed[`${kind}Ids`]
      if (!ids.includes(id)) return false
      if (kind === 'model') set({ modelId: id, notice: 'local' })
      if (kind === 'effort') set({ effortId: id, notice: 'local' })
      if (kind === 'mode') set({ modeId: id, notice: 'local' })
      if (kind === 'environment') set({ environmentId: id, notice: 'local' })
      return true
    },
    remove: (kind, id) => {
      const state = get()
      const ids = kind === 'attachment' ? state.seed.attachmentIds : state.seed.uploadIds
      const removed = kind === 'attachment' ? state.removedAttachmentIds : state.removedUploadIds
      if (!ids.includes(id) || removed.includes(id)) return false
      if (kind === 'attachment') set({ removedAttachmentIds: [...removed, id], notice: 'local' })
      else set({ removedUploadIds: [...removed, id], notice: 'local' })
      return true
    },
    setSource: (id, selected) => {
      const state = get()
      if (!state.seed.sourceIds.includes(id)) return false
      if (state.selectedSourceIds.includes(id) === selected) return true
      const ids = state.selectedSourceIds.filter((item) => item !== id)
      if (selected && ids.length >= state.seed.maximumSources) return false
      set({ selectedSourceIds: selected ? [...ids, id] : ids, notice: 'local' })
      return true
    },
    setVariable: (id, value) => {
      if (!get().seed.variables.some((item) => item.id === id)) return false
      set({ variables: get().variables.map((item) => (item.id === id ? { ...item, value } : item)), notice: null })
      return true
    },
    usePreset: (id) => {
      const preset = get().seed.presets.find((item) => item.id === id)
      if (!preset) return false
      set({ draft: preset.draft, notice: 'local' })
      return true
    },
    setSearch: (searchEnabled) => set({ searchEnabled, notice: 'local' }),
    recordIntent: () => set({ notice: 'intent' }),
    reconcile: (next) => {
      const state = get()
      if (next.ownerId !== state.seed.ownerId) return
      set({
        seed: next,
        modelId: pick(next.modelIds, state.modelId),
        effortId: pick(next.effortIds, state.effortId),
        modeId: pick(next.modeIds, state.modeId),
        environmentId: pick(next.environmentIds, state.environmentId),
        removedAttachmentIds: state.removedAttachmentIds.filter((id) => next.attachmentIds.includes(id)),
        removedUploadIds: state.removedUploadIds.filter((id) => next.uploadIds.includes(id)),
        selectedSourceIds: state.selectedSourceIds
          .filter((id) => next.sourceIds.includes(id))
          .slice(0, next.maximumSources),
        variables: next.variables.map((item) => state.variables.find((value) => value.id === item.id) ?? item),
      })
    },
  }))
}
