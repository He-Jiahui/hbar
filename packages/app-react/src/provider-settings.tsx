import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { LumenContentText, LumenFrame, LumenButton, LumenDialog } from '@lumen/app-ui'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { ProviderListView, type ProviderListViewLabels, type ProviderListViewItem } from './provider-list-view'
import {
  HbarProviderEditorView,
  type HbarProviderCatalogRead,
  type HbarProviderCatalogReadIntent,
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

function isCatalogReadIntent(value: HbarProviderEditorIntent): value is HbarProviderCatalogReadIntent {
  return value.kind === 'load-presets' || value.kind === 'apply-preset' || value.kind === 'load-preset-models'
}

export interface HbarProviderSettingsLabels extends ProviderListViewLabels {
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
  const [reconcilingProviderId, setReconcilingProviderId] = useState<string | null>(null)
  useEffect(() => {
    if (providers.status !== 'idle') return
    void runtime.commands.execute('providerEditor.refresh', {}).catch((reason) => setActionError(reasonCode(reason)))
  }, [providers.status, runtime.commands])
  const defaultActionPending =
    providers.globalDefaultAction.status === 'submitting' || providers.globalDefaultAction.status === 'unknown'
  const isProviderEditingBlocked = () => {
    const current = runtime.state.providers.getSnapshot().globalDefaultAction
    return current.status === 'submitting' || current.status === 'unknown' || reconcilingProviderId !== null
  }
  const open = (itemId?: string) => {
    if (isProviderEditingBlocked()) return
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
    if (isProviderEditingBlocked()) return
    setActionError(null)
    void runtime.commands.execute('providerEditor.refresh', {}).catch((reason) => setActionError(reasonCode(reason)))
  }
  if (providers.status === 'idle' || (providers.status === 'loading' && !providers.list))
    return (
      <LumenContentText context="feedback.message" className="hbar-app-react-provider-state" role="status">
        {labels.loading}
      </LumenContentText>
    )
  if (providers.status === 'error' || !providers.listSchema || !providers.list)
    return (
      <LumenFrame className="hbar-app-react-provider-state">
        <LumenContentText context="feedback.message" role="alert">
          {labels.error(actionError ?? providers.error ?? 'CAPABILITY_UNAVAILABLE')}
        </LumenContentText>
        <LumenButton variant="outlined" disabled={!connected} onClick={refresh}>
          {labels.refresh}
        </LumenButton>
      </LumenFrame>
    )
  const items: ProviderListViewItem[] = providers.list.draft.map((item) => {
    const providerId = String(item.providerId)
    const profile = providers.profiles[providerId]
    const provider = profile?.provider
    const primaryModelId = provider?.model ?? String(item.model)
    const primaryModel = provider?.models.find((model) => model.id === primaryModelId)
    return {
      providerId,
      name: provider?.name || String(item.name || item.providerId),
      protocol: provider?.protocol ?? String(item.protocol),
      primaryModelName: primaryModel?.name || primaryModelId,
      modelCount: provider?.models.length ?? Number(item.modelCount),
      hidden: provider ? !provider.visible : item.visible === false,
      hasKey: profile?.hasKey ?? Boolean(item.hasKey),
      defaultTargetVisible: Boolean(provider?.visible && primaryModel?.visible),
    }
  })
  const setGlobalDefault = (providerId: string) => {
    const previousAction = runtime.state.providers.getSnapshot().globalDefaultAction
    if (previousAction.status === 'submitting' || previousAction.status === 'unknown') return
    setActionError(null)
    void runtime.commands.execute('providerEditor.setGlobalDefault', { providerId }).catch((reason) => {
      const latestAction = runtime.state.providers.getSnapshot().globalDefaultAction
      const runtimeOwnsRowError =
        latestAction !== previousAction &&
        latestAction.providerId === providerId &&
        (latestAction.status === 'failed' || latestAction.status === 'unknown')
      if (!runtimeOwnsRowError) setActionError(reasonCode(reason))
    })
  }
  const reconcileGlobalDefault = (providerId: string) => {
    const previousAction = runtime.state.providers.getSnapshot().globalDefaultAction
    if (previousAction.status !== 'unknown' || previousAction.providerId !== providerId) return
    setActionError(null)
    setReconcilingProviderId(providerId)
    void runtime.commands
      .execute('providerEditor.reconcileGlobalDefault', {})
      .catch((reason) => {
        const latestAction = runtime.state.providers.getSnapshot().globalDefaultAction
        const runtimeOwnsRowError =
          latestAction !== previousAction &&
          latestAction.providerId === providerId &&
          (latestAction.status === 'failed' || latestAction.status === 'unknown')
        if (!runtimeOwnsRowError && latestAction.status !== 'unknown') setActionError(reasonCode(reason))
      })
      .finally(() => setReconcilingProviderId((current) => (current === providerId ? null : current)))
  }
  const confirmRemove = () => {
    if (!removeTarget || defaultActionPending || reconcilingProviderId !== null) return
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
      <ProviderListView
        labels={labels}
        items={items}
        connected={connected}
        busy={removing}
        globalDefault={providers.globalDefault}
        defaultAction={providers.globalDefaultAction}
        reconcilingProviderId={reconcilingProviderId}
        onAdd={() => open()}
        onRefresh={refresh}
        onSetDefault={setGlobalDefault}
        onReconcileDefault={reconcileGlobalDefault}
        onEdit={open}
        onRemove={(providerId) => {
          const item = items.find((candidate) => candidate.providerId === providerId)
          if (item && !isProviderEditingBlocked()) setRemoveTarget({ id: item.providerId, name: item.name })
        }}
      />
      {actionError && (
        <LumenContentText context="feedback.message" role="alert">
          {labels.error(actionError)}
        </LumenContentText>
      )}
      <LumenDialog
        open={Boolean(removeTarget)}
        size="small"
        title={labels.deleteConfirmTitle(removeTarget?.name ?? '')}
        closeLabel={labels.cancel}
        onClose={() => !removing && setRemoveTarget(null)}
        footer={
          <>
            <LumenButton variant="outlined" disabled={removing} onClick={() => setRemoveTarget(null)}>
              {labels.cancel}
            </LumenButton>
            <LumenButton
              tone="danger"
              disabled={removing || defaultActionPending || reconcilingProviderId !== null}
              onClick={confirmRemove}
            >
              {labels.confirmRemove}
            </LumenButton>
          </>
        }
      >
        <LumenContentText context="dialog.body" className="hbar-app-react-provider-delete-copy">
          {labels.deleteConfirmDescription(removeTarget?.name ?? '')}
        </LumenContentText>
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
  const [catalogRead, setCatalogRead] = useState<HbarProviderCatalogRead | null>(null)
  const catalogGeneration = useRef(0)
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
    (value: HbarProviderEditorIntent): Promise<boolean | void> => {
      if (!editorId) return Promise.resolve(false)
      setActionError(null)
      let request: Promise<unknown>
      switch (value.kind) {
        case 'add-context-tier':
          request = runtime.commands.execute('providerEditor.addContextTier', { editorId, modelId: value.modelId })
          break
        case 'remove-context-tier':
          request = runtime.commands.execute('providerEditor.removeContextTier', {
            editorId,
            modelId: value.modelId,
            tierId: value.tierId,
          })
          break
        case 'set-context-field':
          request = runtime.commands.execute('providerEditor.setContextField', {
            editorId,
            modelId: value.modelId,
            ...(value.tierId ? { tierId: value.tierId } : {}),
            field: value.field,
            value: value.value,
          })
          break
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
      if (isCatalogReadIntent(value)) {
        const attempt = ++catalogGeneration.current
        const readIntent = value
        setCatalogRead({ editorId, intent: readIntent, status: 'loading' })
        return request.then(
          () => {
            if (attempt !== catalogGeneration.current || !isCurrent(editorId)) return false
            setCatalogRead(null)
            return true
          },
          (reason) => {
            if (attempt !== catalogGeneration.current || !isCurrent(editorId)) return false
            const code = reasonCode(reason)
            if (code === 'CONTENT_SUPERSEDED') {
              setCatalogRead(null)
              return false
            }
            setCatalogRead({ editorId, intent: readIntent, status: 'error', errorCode: code })
            return false
          },
        )
      }
      return request
        .catch((reason) => {
          if (isCurrent(editorId)) setActionError(reasonCode(reason))
          return undefined
        })
        .then(() => undefined)
    },
    [editorId, isCurrent, runtime.commands],
  )
  const retryCatalog = useCallback(
    async (ownerId: string, readIntent: HbarProviderCatalogReadIntent): Promise<boolean> => {
      if (
        !editorId ||
        ownerId !== editorId ||
        !isCurrent(ownerId) ||
        catalogRead?.editorId !== ownerId ||
        catalogRead.status !== 'error' ||
        catalogRead.intent !== readIntent
      )
        return false
      try {
        return (await intent(readIntent)) === true
      } catch {
        return false
      }
    },
    [catalogRead, editorId, intent, isCurrent],
  )
  const wrap = (content: ReactNode) => (
    <>
      {modalClassName ? (
        <LumenDialog
          open
          size="medium"
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
        size="small"
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
        <LumenContentText context="dialog.body" className="hbar-app-react-provider-delete-copy">
          {labels.discardDescription}
        </LumenContentText>
      </LumenDialog>
    </>
  )
  if (!editor)
    return wrap(
      <LumenFrame as="section" className="hbar-app-react-provider-dialog hbar-app-react-provider-state">
        <LumenContentText context="feedback.message" role={providers.status === 'error' ? 'alert' : 'status'}>
          {providers.status === 'error' ? labels.error(providers.error ?? 'FORM_NOT_READY') : labels.loading}
        </LumenContentText>
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
      catalogRead={catalogRead?.editorId === editor.editorId ? catalogRead : null}
      onBack={back}
      onSave={() => save(false)}
      onReconcile={() => save(true)}
      onRetryCatalog={retryCatalog}
      onIntent={(value) => {
        void intent(value)
      }}
    />,
  )
}
