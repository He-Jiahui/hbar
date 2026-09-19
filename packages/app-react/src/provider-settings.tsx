import { useCallback, useEffect, useState } from 'react'
import { HbarSchemaList, type HbarSchemaListLabels, type SchemaListIntent } from '@hbar/schema-react'
import { HbarAppUiButton } from 'hbar-app-ui'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { HbarProviderEditorView, type HbarProviderDialogLabels, type HbarProviderEditorIntent } from './provider-editor'
import './provider-settings.css'

export type { HbarProviderDialogLabels } from './provider-editor'

function reasonCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

export interface HbarProviderSettingsLabels {
  readonly loading: string
  readonly refresh: string
  readonly error: (code: string) => string
  readonly list: HbarSchemaListLabels
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
  useEffect(() => {
    if (providers.status !== 'idle') return
    void runtime.commands.execute('providerEditor.refresh', {}).catch((reason) => setActionError(reasonCode(reason)))
  }, [providers.status, runtime.commands])
  const execute = (intent: SchemaListIntent) => {
    setActionError(null)
    if (intent.kind === 'add' || intent.kind === 'open') {
      const itemId = intent.kind === 'open' ? intent.itemId : undefined
      void runtime.commands
        .execute('app.openSettingsEditor', {
          scope: 'global',
          path: 'providers',
          ...(itemId ? { entryId: itemId } : {}),
          instanceId: `settings-editor:providers:${itemId ?? 'new'}`,
        })
        .catch((reason) => setActionError(reasonCode(reason)))
      return
    }
    if (intent.kind === 'remove')
      void runtime.commands
        .execute('providerEditor.delete', { providerId: intent.itemId })
        .catch((reason) => setActionError(reasonCode(reason)))
  }
  const refresh = () => {
    setActionError(null)
    void runtime.commands.execute('providerEditor.refresh', {}).catch((reason) => setActionError(reasonCode(reason)))
  }
  if (providers.status === 'idle' || providers.status === 'loading')
    return (
      <p className="hbar-app-react-provider-state" role="status">
        {labels.loading}
      </p>
    )
  if (providers.status === 'error' || !providers.listSchema || !providers.list)
    return (
      <div className="hbar-app-react-provider-state">
        <p role="alert">{labels.error(actionError ?? providers.error ?? 'CAPABILITY_UNAVAILABLE')}</p>
        <HbarAppUiButton disabled={!connected} onClick={refresh}>
          {labels.refresh}
        </HbarAppUiButton>
      </div>
    )
  return (
    <div className="hbar-app-react-provider-list">
      <HbarSchemaList
        schema={providers.listSchema}
        state={providers.list}
        labels={labels.list}
        disabled={!connected}
        reorderable={false}
        resettable={false}
        onIntent={execute}
      />
      <HbarAppUiButton disabled={!connected} onClick={refresh}>
        {labels.refresh}
      </HbarAppUiButton>
      {actionError && <p role="alert">{labels.error(actionError)}</p>}
    </div>
  )
}

export function HbarProviderDialog({
  labels,
  connected,
}: {
  readonly labels: HbarProviderDialogLabels
  readonly connected: boolean
}) {
  const runtime = useHbarRuntime()
  const providers = useHbarRuntimeState(runtime.state.providers)
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const [actionError, setActionError] = useState<string | null>(null)
  const editor = providers.editor
  const editorId = editor?.editorId
  const back = useCallback(() => {
    setActionError(null)
    if (presentation.modalInstanceId)
      void runtime.commands
        .execute('app.closePanel', { instanceId: presentation.modalInstanceId })
        .catch((reason) => setActionError(reasonCode(reason)))
  }, [presentation.modalInstanceId, runtime.commands])
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
          request = runtime.commands.execute('providerEditor.setField', {
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
      void request.catch((reason) => setActionError(reasonCode(reason)))
    },
    [editorId, runtime.commands],
  )
  if (!editor)
    return (
      <section className="hbar-app-react-provider-dialog hbar-app-react-provider-state">
        <p role={providers.status === 'error' ? 'alert' : 'status'}>
          {providers.status === 'error' ? labels.error(providers.error ?? 'FORM_NOT_READY') : labels.loading}
        </p>
        <HbarAppUiButton onClick={back}>{labels.back}</HbarAppUiButton>
      </section>
    )
  const save = (reconcile: boolean) => {
    setActionError(null)
    void runtime.commands
      .execute(reconcile ? 'providerEditor.reconcile' : 'providerEditor.save', { editorId: editor.editorId })
      .catch((reason) => setActionError(reasonCode(reason)))
  }
  const remove = () => {
    if (!editor.providerId) return
    setActionError(null)
    void runtime.commands
      .execute('providerEditor.delete', { providerId: editor.providerId })
      .then(back)
      .catch((reason) => setActionError(reasonCode(reason)))
  }
  return (
    <HbarProviderEditorView
      editor={editor}
      labels={labels}
      connected={connected}
      actionError={actionError}
      onBack={back}
      onSave={() => save(false)}
      onReconcile={() => save(true)}
      onRemove={remove}
      onIntent={intent}
    />
  )
}
