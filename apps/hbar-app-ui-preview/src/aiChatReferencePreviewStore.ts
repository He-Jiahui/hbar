import { createStore } from 'zustand/vanilla'
import type { LumenAiChatReferenceContent } from '@lumen/app-ui/catalog'

export interface AiChatReferencePreviewSeed {
  readonly ownerId: string
  readonly variant: number
  readonly attachmentIds: readonly string[]
  readonly modelIds: readonly string[]
  readonly versionIds: readonly string[]
  readonly sourceIds: readonly string[]
  readonly messageIds: readonly string[]
  readonly approvalId: string | null
  readonly initialModelId: string | null
  readonly initialVersionId: string | null
}
export interface AiChatReferencePreviewState {
  readonly seed: AiChatReferencePreviewSeed
  readonly draft: string
  readonly removedAttachmentIds: readonly string[]
  readonly modelId: string | null
  readonly versionId: string | null
  readonly artifactMode: 'code' | 'document'
  readonly sourceId: string | null
  readonly voicePhase: 'listening' | 'stopped'
  readonly notice: 'intent' | 'local' | null
  readonly setDraft: (value: string) => void
  readonly removeAttachment: (id: string) => boolean
  readonly select: (kind: 'model' | 'version' | 'source', id: string) => boolean
  readonly setArtifactMode: (mode: 'code' | 'document') => void
  readonly setVoicePhase: (phase: 'listening' | 'stopped') => void
  readonly recordIntent: () => void
  readonly reconcile: (seed: AiChatReferencePreviewSeed) => void
}
function unique(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => id.trim()))]
}
function normalize(seed: AiChatReferencePreviewSeed): AiChatReferencePreviewSeed {
  return {
    ...seed,
    attachmentIds: unique(seed.attachmentIds),
    modelIds: unique(seed.modelIds),
    versionIds: unique(seed.versionIds),
    sourceIds: unique(seed.sourceIds),
    messageIds: unique(seed.messageIds),
  }
}
function pick(ids: readonly string[], id: string | null): string | null {
  return id && ids.includes(id) ? id : (ids[0] ?? null)
}
export function aiChatReferenceSeed(content: LumenAiChatReferenceContent): AiChatReferencePreviewSeed {
  return {
    ownerId: content.ownerId,
    variant: content.variant,
    attachmentIds: (content.variant === 8 ? content.attachments : (content.composer?.attachments ?? [])).map(
      ({ id }) => id,
    ),
    modelIds: content.variant === 4 || content.variant === 9 ? content.models.map(({ id }) => id) : [],
    initialModelId: content.variant === 4 || content.variant === 9 ? content.selectedModelId : null,
    versionIds: content.variant === 2 ? content.artifact.versions.map(({ id }) => id) : [],
    initialVersionId: content.variant === 2 ? content.artifact.selectedVersionId : null,
    sourceIds: content.variant === 7 ? content.sources.map(({ id }) => id) : [],
    messageIds: content.messages.map(({ id }) => id),
    approvalId: content.variant === 5 ? content.approval.id : null,
  }
}
/** Local preview values only. No provider calls, microphone, file I/O or approval execution. */
export function createAiChatReferencePreviewStore(input: AiChatReferencePreviewSeed) {
  const seed = normalize(input)
  return createStore<AiChatReferencePreviewState>((set, get) => ({
    seed,
    draft: '',
    removedAttachmentIds: [],
    modelId: pick(seed.modelIds, seed.initialModelId),
    versionId: pick(seed.versionIds, seed.initialVersionId),
    artifactMode: 'code',
    sourceId: null,
    voicePhase: 'listening',
    notice: null,
    setDraft: (draft) => set({ draft, notice: null }),
    removeAttachment: (id) => {
      const state = get()
      if (!state.seed.attachmentIds.includes(id) || state.removedAttachmentIds.includes(id)) return false
      set({ removedAttachmentIds: [...state.removedAttachmentIds, id], notice: 'local' })
      return true
    },
    select: (kind, id) => {
      const state = get()
      const ids =
        kind === 'model' ? state.seed.modelIds : kind === 'version' ? state.seed.versionIds : state.seed.sourceIds
      if (!ids.includes(id)) return false
      if (kind === 'model') set({ modelId: id, notice: 'local' })
      else if (kind === 'version') set({ versionId: id, notice: 'local' })
      else set({ sourceId: id, notice: 'local' })
      return true
    },
    setArtifactMode: (artifactMode) => {
      if (get().seed.variant === 2) set({ artifactMode, notice: 'local' })
    },
    setVoicePhase: (voicePhase) => {
      if (get().seed.variant === 8) set({ voicePhase, notice: 'local' })
    },
    recordIntent: () => set({ notice: 'intent' }),
    reconcile: (inputSeed) => {
      const next = normalize(inputSeed)
      const state = get()
      if (state.seed.ownerId !== next.ownerId || state.seed.variant !== next.variant) return
      set({
        seed: next,
        removedAttachmentIds: state.removedAttachmentIds.filter((id) => next.attachmentIds.includes(id)),
        modelId: pick(next.modelIds, state.modelId),
        versionId: pick(next.versionIds, state.versionId),
        sourceId: state.sourceId && next.sourceIds.includes(state.sourceId) ? state.sourceId : null,
      })
    },
  }))
}
