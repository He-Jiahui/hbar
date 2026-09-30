import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import type { LumenPromptInputAction, LumenPromptReferenceContent, LumenPromptReferenceViewModel } from '@lumen/app-ui'
import {
  HbarAppUiPromptInputProvider,
  type HbarAppUiPromptInputContent,
  type HbarAppUiVariantProps,
} from 'hbar-app-ui/catalog'
import { createPromptReferencePreviewStore, promptReferenceSeed } from './promptReferencePreviewStore'

interface PromptReferencePreviewHostProps extends Pick<HbarAppUiVariantProps, 'spec' | 'onAction'> {
  readonly content: HbarAppUiPromptInputContent
  readonly reference: LumenPromptReferenceContent | undefined
  readonly locale: 'en' | 'zh'
  readonly children: ReactNode
}
export function PromptReferencePreviewHost(props: PromptReferencePreviewHostProps) {
  if (props.spec.category !== 'prompt-input' || !props.reference) return props.children
  return (
    <PromptReferenceOwner key={`${props.spec.id}:${props.reference.ownerId}`} {...props} reference={props.reference} />
  )
}
function PromptReferenceOwner({
  content,
  reference,
  spec,
  onAction,
  locale,
  children,
}: PromptReferencePreviewHostProps & { readonly reference: LumenPromptReferenceContent }) {
  const [store] = useState(() => createPromptReferencePreviewStore(reference))
  const state = useStore(store, (value) => value)
  const seed = useMemo(() => promptReferenceSeed(reference), [reference])
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
  let projected: LumenPromptReferenceContent = {
    ...reference,
    notice:
      state.notice === 'intent'
        ? zh
          ? '仅记录预览请求；保留输入，未执行外部操作。'
          : 'Preview request only; input retained. No external action was performed.'
        : state.notice === 'local'
          ? zh
            ? '已更新本地预览，未调用真实服务。'
            : 'Local preview updated; no live service was called.'
          : undefined,
    composer: reference.composer
      ? {
          ...reference.composer,
          draft: state.draft,
          attachments: reference.composer.attachments.filter(({ id }) => !state.removedAttachmentIds.includes(id)),
        }
      : undefined,
  }
  if (projected.variant === 1)
    projected = { ...projected, modelId: state.modelId ?? '', effortId: state.effortId ?? '' }
  if (projected.variant === 2)
    projected = { ...projected, modelId: state.modelId ?? '', searchEnabled: state.searchEnabled }
  if (projected.variant === 4)
    projected = {
      ...projected,
      variables: projected.variables.map((item) => ({
        ...item,
        value: state.variables.find(({ id }) => item.id === id)?.value ?? item.value,
      })),
    }
  if (projected.variant === 5)
    projected = { ...projected, uploads: projected.uploads.filter(({ id }) => !state.removedUploadIds.includes(id)) }
  if (projected.variant === 6) projected = { ...projected, selectedSourceIds: state.selectedSourceIds }
  if (projected.variant === 7)
    projected = {
      ...projected,
      modeId: state.modeId ?? '',
      environmentId: state.environmentId ?? '',
      modelId: state.modelId ?? '',
    }
  const report = (event: LumenPromptInputAction) => {
    if (!active.current) return
    const current = store.getState()
    if (
      event.actionId === 'send' &&
      !current.draft.trim() &&
      !(reference.variant === 1 && current.seed.attachmentIds.some((id) => !current.removedAttachmentIds.includes(id)))
    )
      return
    if (event.actionId === 'run-template' && current.variables.some(({ value }) => !value.trim())) return
    if (
      event.actionId === 'retry-upload' &&
      (!event.value || !current.seed.uploadIds.includes(event.value) || current.removedUploadIds.includes(event.value))
    )
      return
    current.recordIntent()
    onAction?.({
      variantId: spec.id,
      actionId: event.actionId,
      value: JSON.stringify({
        ownerId: reference.ownerId,
        targetId: event.value ?? null,
        draft: current.draft,
        variables: event.actionId === 'run-template' ? current.variables : undefined,
        outcome: 'intent-only',
      }),
    })
  }
  const local = (action: () => unknown) => {
    if (active.current) action()
  }
  const viewModel: LumenPromptReferenceViewModel = {
    content: projected,
    onAction: report,
    onDraftChange: (value) => local(() => store.getState().setDraft(value)),
    onRemoveAttachment: (id) => local(() => store.getState().remove('attachment', id)),
    onModelChange: (id) => local(() => store.getState().select('model', id)),
    onEffortChange: (id) => local(() => store.getState().select('effort', id)),
    onModeChange: (id) => local(() => store.getState().select('mode', id)),
    onEnvironmentChange: (id) => local(() => store.getState().select('environment', id)),
    onSearchChange: (value) => local(() => store.getState().setSearch(value)),
    onSuggestionSelect: (id) => local(() => store.getState().usePreset(id)),
    onCommandSelect: (id) => local(() => store.getState().usePreset(id)),
    onVariableChange: (id, value) => local(() => store.getState().setVariable(id, value)),
    onRemoveUpload: (id) => local(() => store.getState().remove('upload', id)),
    onSourceAdd: (id) => local(() => store.getState().setSource(id, true)),
    onSourceRemove: (id) => local(() => store.getState().setSource(id, false)),
  }
  return (
    <HbarAppUiPromptInputProvider content={{ ...content, referenceViewModel: viewModel }}>
      {children}
    </HbarAppUiPromptInputProvider>
  )
}
