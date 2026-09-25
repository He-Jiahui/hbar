import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { LumenFrame, LumenText, LumenButton, LumenDialog, LumenSettingsList } from '@lumen/app-ui'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import {
  HbarProviderEditorView,
  type HbarProviderDialogLabels,
  type HbarProviderEditorIntent,
} from './lumen-provider-editor'
import './lumen-provider-settings.css'

export type { HbarProviderDialogLabels } from './lumen-provider-editor'

function reasonCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

export interface HbarProviderSettingsLabels {
  readonly loading: string
  readonly refresh: string
  readonly error: (code: string) => string
  readonly title: string
  readonly description: string
  readonly empty: string
  readonly add: string
  readonly edit: (name: string) => string
  readonly actions: (name: string) => string
  readonly remove: (name: string) => string
  readonly protocol: (value: string) => string
  readonly defaultModel: (model: string) => string
  readonly modelCount: (count: number) => string
  readonly hidden: string
  readonly configured: string
  readonly notConfigured: string
  readonly deleteConfirmTitle: (name: string) => string
  readonly deleteConfirmDescription: (name: string) => string
  readonly cancel: string
  readonly confirmRemove: string
}

export function HbarProviderSettings({
  labels,
  connected,
}: {
  readonly labels: HbarProviderSettingsLabels
  readonly connected: boolean
}) {
  const runtime = useHbarRuntime()
  const providers = useHbarRuntimeState(runtime.state.providers)
  const [actionError, setActionError] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<{ readonly id: string; readonly name: string } | null>(null)
  const [removing, setRemoving] = useState(false)
  useEffect(() => {
    if (providers.status !== 'idle') return
    void runtime.commands.execute('providerEditor.refresh', {}).catch((reason) => setActionError(reasonCode(reason)))
  }, [providers.status, runtime.commands])
  const open = (itemId?: string) => {
    setActionError(null)
    void runtime.commands
      .execute('app.openSettingsEditor', {
        scope: 'global',
        path: 'providers',
        ...(itemId ? { entryId: itemId } : {}),
        instanceId: `settings-editor:providers:${itemId ?? 'new'}`,
      })
      .catch((reason) => setActionError(reasonCode(reason)))
  }
  const refresh = () => {
    setActionError(null)
    void runtime.commands.execute('providerEditor.refresh', {}).catch((reason) => setActionError(reasonCode(reason)))
  }
  if (providers.status === 'idle' || (providers.status === 'loading' && !providers.list))
    return (
      <LumenText as="p" className="hbar-app-react-provider-state" role="status">
        {labels.loading}
      </LumenText>
    )
  if (providers.status === 'error' || !providers.listSchema || !providers.list)
    return (
      <LumenFrame className="hbar-app-react-provider-state">
        <LumenText as="p" role="alert">
          {labels.error(actionError ?? providers.error ?? 'CAPABILITY_UNAVAILABLE')}
        </LumenText>
        <LumenButton variant="outlined" disabled={!connected} onClick={refresh}>
          {labels.refresh}
        </LumenButton>
      </LumenFrame>
    )
  const items = providers.list.draft.map((item) => {
    const id = String(item.providerId)
    const name = String(item.name || item.providerId)
    return {
      id,
      title: name,
      metadata: [
        labels.protocol(String(item.protocol)),
        labels.defaultModel(String(item.model)),
        labels.modelCount(Number(item.modelCount)),
        ...(item.visible === false ? [labels.hidden] : []),
      ],
      status: {
        label: item.hasKey ? labels.configured : labels.notConfigured,
        tone: item.hasKey ? ('success' as const) : ('neutral' as const),
      },
      editLabel: labels.edit(name),
      menuLabel: labels.actions(name),
      removeLabel: labels.remove(name),
    }
  })
  const confirmRemove = () => {
    if (!removeTarget) return
    setActionError(null)
    setRemoving(true)
    void runtime.commands
      .execute('providerEditor.delete', { providerId: removeTarget.id })
      .then(() => setRemoveTarget(null))
      .catch((reason) => setActionError(reasonCode(reason)))
      .finally(() => setRemoving(false))
  }
  return (
    <LumenFrame className="hbar-app-react-provider-list">
      <LumenSettingsList
        label={labels.title}
        description={labels.description}
        empty={labels.empty}
        addLabel={labels.add}
        refreshLabel={labels.refresh}
        items={items}
        disabled={!connected}
        busy={removing}
        onAdd={() => open()}
        onRefresh={refresh}
        onOpen={open}
        onRemove={(id) => {
          const item = items.find((candidate) => candidate.id === id)
          if (item) setRemoveTarget({ id, name: item.title })
        }}
      />
      {actionError && (
        <LumenText as="p" role="alert">
          {labels.error(actionError)}
        </LumenText>
      )}
      <LumenDialog
        open={Boolean(removeTarget)}
        title={labels.deleteConfirmTitle(removeTarget?.name ?? '')}
        closeLabel={labels.cancel}
        onClose={() => !removing && setRemoveTarget(null)}
        footer={
          <>
            <LumenButton variant="outlined" disabled={removing} onClick={() => setRemoveTarget(null)}>
              {labels.cancel}
            </LumenButton>
            <LumenButton tone="danger" disabled={removing} onClick={confirmRemove}>
              {labels.confirmRemove}
            </LumenButton>
          </>
        }
      >
        <LumenText as="p" className="hbar-app-react-provider-delete-copy">
          {labels.deleteConfirmDescription(removeTarget?.name ?? '')}
        </LumenText>
      </LumenDialog>
    </LumenFrame>
  )
}

export function HbarProviderDialog({
  labels,
  connected,
  modalClassName,
}: {
  readonly labels: HbarProviderDialogLabels
  readonly connected: boolean
  readonly modalClassName?: string
}) {
  const runtime = useHbarRuntime()
  const providers = useHbarRuntimeState(runtime.state.providers)
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const [actionError, setActionError] = useState<string | null>(null)
  const [discarding, setDiscarding] = useState<{ readonly editorId: string; readonly name: string } | null>(null)
  const alive = useRef(true)
  const opening = useRef(typeof document === 'undefined' ? null : document.activeElement)
  const returnFocus = useRef(false)
  const editor = providers.editor?.editorId === presentation.modalInstanceId ? providers.editor : null
  const editorId = editor?.editorId
  const isCurrent = useCallback(
    (id: string) =>
      alive.current &&
      runtime.state.presentation.getSnapshot().modalInstanceId === id &&
      runtime.state.providers.getSnapshot().editor?.editorId === id,
    [runtime],
  )
  useEffect(() => {
    alive.current = true
    const originalControl = opening.current
    return () => {
      alive.current = false
      if (!returnFocus.current) return
      // A removed native modal no longer owns inertness. Restore only if another
      // modal/navigation action has not taken focus while the operation completed.
      requestAnimationFrame(() => {
        if (
          runtime.state.presentation.getSnapshot().modalInstanceId !== null ||
          (document.activeElement !== document.body && document.activeElement !== null)
        )
          return
        if (originalControl instanceof HTMLElement && originalControl.isConnected) originalControl.focus()
      })
    }
  }, [runtime])
  const close = useCallback(
    (id: string) => {
      if (runtime.state.presentation.getSnapshot().modalInstanceId !== id || !alive.current) return
      returnFocus.current = true
      void runtime.commands.execute('app.closePanel', { instanceId: id }).catch((reason) => {
        if (isCurrent(id)) setActionError(reasonCode(reason))
      })
    },
    [isCurrent, runtime],
  )
  const discard = useCallback(
    (id: string) => {
      if (!isCurrent(id)) return
      const latest = runtime.state.providers.getSnapshot().editor
      if (!latest || ['submitting', 'unknown'].includes(latest.form.status)) return
      void runtime.commands
        .execute('providerEditor.resetDraft', { editorId: id })
        .then(() => close(id))
        .catch((reason) => {
          if (isCurrent(id)) setActionError(reasonCode(reason))
        })
    },
    [close, isCurrent, runtime],
  )
  const back = useCallback(() => {
    setActionError(null)
    const id = runtime.state.presentation.getSnapshot().modalInstanceId
    if (!id) return
    const latest = runtime.state.providers.getSnapshot().editor
    if (!latest || latest.editorId !== id) {
      close(id)
      return
    }
    if (['submitting', 'unknown'].includes(latest.form.status)) return
    if (latest.draftDirty.length || latest.sensitiveDirty)
      setDiscarding({ editorId: id, name: latest.draft.name || latest.draft.id || labels.addTitle })
    else discard(id)
  }, [close, discard, labels.addTitle, runtime])
  const intent = useCallback(
    (value: HbarProviderEditorIntent) => {
      if (!editorId) return
      setActionError(null)
      let request: Promise<unknown>
      switch (value.kind) {
        case 'set-provider-field':
          request = runtime.commands.execute('providerEditor.setProviderField', {
            editorId,
            field: value.field,
            value: value.value,
          })
          break
        case 'set-secret':
          request =
            value.value === ''
              ? runtime.commands.execute('providerEditor.resetField', { editorId, field: 'apiKey' })
              : runtime.commands.execute('providerEditor.setField', {
                  editorId,
                  field: 'apiKey',
                  value: value.value,
                })
          break
        case 'reset-draft':
          request = runtime.commands.execute('providerEditor.resetDraft', { editorId })
          break
        case 'load-presets':
          request = runtime.commands.execute('providerEditor.loadPresets', {
            editorId,
            query: value.query,
            ...(value.cursor ? { cursor: value.cursor } : {}),
            append: value.append,
          })
          break
        case 'apply-preset':
          request = runtime.commands.execute('providerEditor.applyPreset', {
            editorId,
            presetId: value.presetId,
          })
          break
        case 'load-preset-models':
          request = runtime.commands.execute('providerEditor.loadPresetModels', {
            editorId,
            presetId: value.presetId,
            query: value.query,
            ...(value.cursor ? { cursor: value.cursor } : {}),
            append: value.append,
          })
          break
        case 'add-preset-model':
          request = runtime.commands.execute('providerEditor.addPresetModel', {
            editorId,
            presetId: value.presetId,
            modelId: value.modelId,
          })
          break
        case 'add-model':
          request = runtime.commands.execute('providerEditor.addModel', {
            editorId,
            modelId: value.modelId,
          })
          break
        case 'select-model':
          request = runtime.commands.execute('providerEditor.selectModel', {
            editorId,
            modelId: value.modelId,
          })
          break
        case 'set-default-model':
          request = runtime.commands.execute('providerEditor.setDefaultModel', {
            editorId,
            modelId: value.modelId,
          })
          break
        case 'remove-model':
          request = runtime.commands.execute('providerEditor.removeModel', {
            editorId,
            modelId: value.modelId,
          })
          break
        case 'set-model-field':
          request = runtime.commands.execute('providerEditor.setModelField', {
            editorId,
            modelId: value.modelId,
            field: value.field,
            value: value.value,
          })
          break
        case 'set-model-thinking-levels':
          request = runtime.commands.execute('providerEditor.setModelThinkingLevels', {
            editorId,
            modelId: value.modelId,
            thinkingLevels: [...value.thinkingLevels],
          })
          break
      }
      void request.catch((reason) => {
        if (isCurrent(editorId)) setActionError(reasonCode(reason))
      })
    },
    [editorId, isCurrent, runtime.commands],
  )
  const wrap = (content: ReactNode) => (
    <>
      {modalClassName ? (
        <LumenDialog
          open
          chromeless
          className={modalClassName}
          title={editor?.providerId ? labels.editTitle(editor.draft.name || editor.providerId) : labels.addTitle}
          closeLabel={labels.back}
          onClose={back}
        >
          {content}
        </LumenDialog>
      ) : (
        content
      )}
      <LumenDialog
        open={Boolean(discarding)}
        title={labels.discardTitle(discarding?.name ?? '')}
        closeLabel={labels.keepEditing}
        onClose={() => setDiscarding(null)}
        footer={
          <>
            <LumenButton type="button" onClick={() => setDiscarding(null)}>
              {labels.keepEditing}
            </LumenButton>
            <LumenButton
              type="button"
              tone="danger"
              onClick={() => {
                if (discarding) discard(discarding.editorId)
                setDiscarding(null)
              }}
            >
              {labels.discardConfirm}
            </LumenButton>
          </>
        }
      >
        <LumenText as="p" className="hbar-app-react-provider-delete-copy">
          {labels.discardDescription}
        </LumenText>
      </LumenDialog>
    </>
  )
  if (!editor)
    return wrap(
      <LumenFrame as="section" className="hbar-app-react-provider-dialog hbar-app-react-provider-state">
        <LumenText as="p" role={providers.status === 'error' ? 'alert' : 'status'}>
          {providers.status === 'error' ? labels.error(providers.error ?? 'FORM_NOT_READY') : labels.loading}
        </LumenText>
        <LumenButton variant="outlined" onClick={back}>
          {labels.back}
        </LumenButton>
      </LumenFrame>,
    )
  const save = (reconcile: boolean) => {
    setActionError(null)
    void runtime.commands
      .execute(reconcile ? 'providerEditor.reconcile' : 'providerEditor.save', { editorId: editor.editorId })
      .then(() => {
        if (!isCurrent(editor.editorId)) return
        const latest = runtime.state.providers.getSnapshot().editor
        if (latest?.form.status === 'succeeded' && !latest.draftDirty.length && !latest.sensitiveDirty)
          close(editor.editorId)
      })
      .catch((reason) => {
        if (isCurrent(editor.editorId)) setActionError(reasonCode(reason))
      })
  }
  return wrap(
    <HbarProviderEditorView
      editor={editor}
      labels={labels}
      connected={connected}
      actionError={actionError}
      onBack={back}
      onSave={() => save(false)}
      onReconcile={() => save(true)}
      onIntent={intent}
    />,
  )
}
