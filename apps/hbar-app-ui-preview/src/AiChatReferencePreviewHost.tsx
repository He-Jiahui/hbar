import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import type { LumenAiChatAction, LumenAiChatReferenceContent, LumenAiChatReferenceViewModel } from '@lumen/app-ui'
import { HbarAppUiAiChatProvider, type HbarAppUiAiChatContent, type HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { aiChatReferenceSeed, createAiChatReferencePreviewStore } from './aiChatReferencePreviewStore'

interface AiChatReferencePreviewHostProps extends Pick<HbarAppUiVariantProps, 'spec' | 'onAction'> {
  readonly content: HbarAppUiAiChatContent
  readonly reference: LumenAiChatReferenceContent | undefined
  readonly locale: 'en' | 'zh'
  readonly children: ReactNode
}
export function AiChatReferencePreviewHost(props: AiChatReferencePreviewHostProps) {
  if (props.spec.category !== 'ai-chat' || !props.reference) return props.children
  return (
    <AiChatReferenceOwner key={`${props.spec.id}:${props.reference.ownerId}`} {...props} reference={props.reference} />
  )
}
function AiChatReferenceOwner({
  content,
  reference,
  spec,
  onAction,
  locale,
  children,
}: AiChatReferencePreviewHostProps & { readonly reference: LumenAiChatReferenceContent }) {
  const seed = useMemo(() => aiChatReferenceSeed(reference), [reference])
  const [store] = useState(() => createAiChatReferencePreviewStore(seed))
  const draft = useStore(store, (state) => state.draft)
  const removed = useStore(store, (state) => state.removedAttachmentIds)
  const modelId = useStore(store, (state) => state.modelId)
  const versionId = useStore(store, (state) => state.versionId)
  const artifactMode = useStore(store, (state) => state.artifactMode)
  const sourceId = useStore(store, (state) => state.sourceId)
  const voicePhase = useStore(store, (state) => state.voicePhase)
  const notice = useStore(store, (state) => state.notice)
  const active = useRef(false)
  useLayoutEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  useLayoutEffect(() => {
    store.getState().reconcile(seed)
  }, [seed, store])
  const zh = locale === 'zh'
  const base = {
    ...reference,
    notice:
      notice === 'intent'
        ? zh
          ? '仅记录预览请求；草稿保留，未执行任何外部操作。'
          : 'Preview request recorded; draft retained. No external action was performed.'
        : notice === 'local'
          ? zh
            ? '仅更新本地预览，未调用真实服务。'
            : 'Local preview updated; no live service was called.'
          : undefined,
    composer: reference.composer
      ? {
          ...reference.composer,
          draft,
          attachments: reference.composer.attachments.filter(({ id }) => !removed.includes(id)),
        }
      : undefined,
  }
  let projected: LumenAiChatReferenceContent = base
  if (base.variant === 2)
    projected = { ...base, artifact: { ...base.artifact, selectedVersionId: versionId ?? '', mode: artifactMode } }
  if (base.variant === 4 || base.variant === 9) projected = { ...base, selectedModelId: modelId ?? '' }
  if (base.variant === 7) projected = { ...base, selectedSourceId: sourceId }
  if (base.variant === 8)
    projected = { ...base, phase: voicePhase, attachments: base.attachments.filter(({ id }) => !removed.includes(id)) }
  const report = (event: LumenAiChatAction) => {
    if (!active.current) return
    const current = store.getState()
    if (event.actionId === 'send' && projected.variant !== 8 && !current.draft.trim()) return
    if (event.actionId === 'source-select' && (!event.value || !current.seed.sourceIds.includes(event.value))) return
    if (
      (event.actionId === 'regenerate' || event.actionId === 'copy-reply') &&
      (!event.value || !current.seed.messageIds.includes(event.value))
    )
      return
    if ((event.actionId === 'approve' || event.actionId === 'deny') && event.value !== current.seed.approvalId) return
    const localOnly =
      event.actionId === 'voice-stop' || event.actionId === 'voice-resume' || event.actionId === 'source-select'
    if (!localOnly) current.recordIntent()
    onAction?.({
      variantId: spec.id,
      actionId: event.actionId,
      value: JSON.stringify({
        ownerId: reference.ownerId,
        targetId: event.value ?? null,
        draft: event.actionId === 'send' ? current.draft : undefined,
        outcome: localOnly ? 'local-preview-only' : 'intent-only',
      }),
    })
  }
  const viewModel: LumenAiChatReferenceViewModel = {
    content: projected,
    onAction: report,
    onDraftChange: (value) => {
      if (active.current) store.getState().setDraft(value)
    },
    onRemoveAttachment: (id) => {
      if (active.current) store.getState().removeAttachment(id)
    },
    onModelChange: (id) => {
      if (active.current) store.getState().select('model', id)
    },
    onArtifactVersionChange: (id) => {
      if (active.current) store.getState().select('version', id)
    },
    onArtifactModeChange: (mode) => {
      if (active.current) store.getState().setArtifactMode(mode)
    },
    onSourceSelect: (id) => {
      if (active.current) store.getState().select('source', id)
    },
    onVoicePhaseChange: (phase) => {
      if (active.current) store.getState().setVoicePhase(phase)
    },
  }
  return (
    <HbarAppUiAiChatProvider content={{ ...content, referenceViewModel: viewModel }}>
      {children}
    </HbarAppUiAiChatProvider>
  )
}
