import { useEffect, useMemo, useState } from 'react'
import {
  HbarSchemaForm,
  HbarSchemaList,
  createSchemaComponentRegistry,
  registerStandardSchemaComponents,
  type HbarSchemaFormLabels,
  type HbarSchemaListLabels,
  type SchemaFieldIntent,
  type SchemaListIntent,
} from '@hbar/schema-react'
import { HbarAppUiButton, HbarAppUiSurface } from 'hbar-app-ui'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './provider-settings.css'

const providerComponents = createSchemaComponentRegistry()
registerStandardSchemaComponents(providerComponents)

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

export interface HbarProviderDialogLabels {
  readonly addTitle: string
  readonly editTitle: (name: string) => string
  readonly description: string
  readonly loading: string
  readonly back: string
  readonly save: string
  readonly reconcile: string
  readonly remove: string
  readonly saved: string
  readonly unsaved: (count: number) => string
  readonly configured: string
  readonly notConfigured: string
  readonly error: (code: string) => string
  readonly resolve: (key: string) => string
  readonly form: Omit<HbarSchemaFormLabels, 'resolve' | 'help'>
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
  const [actionError, setActionError] = useState<string | null>(null)
  const editor = providers.editor
  const definitions = useMemo(
    () => new Map(editor?.description.fields.map((field) => [field.name, field] as const) ?? []),
    [editor?.description],
  )
  const back = () => {
    setActionError(null)
    void runtime.commands
      .execute('app.openSettings', { scope: 'global', section: 'providers' })
      .catch((reason) => setActionError(reasonCode(reason)))
  }
  if (!editor)
    return (
      <HbarAppUiSurface className="hbar-app-react-provider-dialog hbar-app-react-provider-state">
        <p role={providers.status === 'error' ? 'alert' : 'status'}>
          {providers.status === 'error' ? labels.error(providers.error ?? 'FORM_NOT_READY') : labels.loading}
        </p>
        <HbarAppUiButton onClick={back}>{labels.back}</HbarAppUiButton>
      </HbarAppUiSurface>
    )
  const dirtyCount = editor.form.dirty.length + (editor.sensitiveDirty ? 1 : 0)
  const busy = editor.form.status === 'submitting'
  const unknown = editor.form.status === 'unknown'
  const title = editor.providerId
    ? labels.editTitle(String(editor.form.draft.name ?? editor.providerId))
    : labels.addTitle
  const intent = (value: SchemaFieldIntent) => {
    setActionError(null)
    const request =
      value.kind === 'set'
        ? runtime.commands.execute('providerEditor.setField', {
            editorId: editor.editorId,
            field: value.field,
            value: value.value,
          })
        : runtime.commands.execute('providerEditor.resetField', { editorId: editor.editorId, field: value.field })
    void request.catch((reason) => setActionError(reasonCode(reason)))
  }
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
    <HbarAppUiSurface className="hbar-app-react-provider-dialog">
      <header>
        <div>
          <h1>{title}</h1>
          <p>{labels.description}</p>
        </div>
        <HbarAppUiButton onClick={back}>{labels.back}</HbarAppUiButton>
      </header>
      <main>
        <HbarSchemaForm
          schema={editor.schema}
          state={editor.form}
          components={providerComponents}
          labels={{
            ...labels.form,
            resolve: labels.resolve,
            help: (field) => {
              const key = definitions.get(field.name)?.helpKey
              return key ? labels.resolve(key) : undefined
            },
          }}
          controlRevisions={{ apiKey: editor.secretResetRevision }}
          renderFieldContext={(field) =>
            definitions.get(field.name)?.sensitive ? (
              <small>{editor.hasKey ? labels.configured : labels.notConfigured}</small>
            ) : null
          }
          onIntent={intent}
        />
      </main>
      <footer>
        <span role="status">
          {editor.form.status === 'succeeded' && dirtyCount === 0
            ? labels.saved
            : dirtyCount > 0
              ? labels.unsaved(dirtyCount)
              : null}
        </span>
        <div>
          {editor.providerId && (
            <HbarAppUiButton tone="danger" disabled={!connected || busy || unknown} onClick={remove}>
              {labels.remove}
            </HbarAppUiButton>
          )}
          {unknown ? (
            <HbarAppUiButton tone="warning" disabled={!connected} onClick={() => save(true)}>
              {labels.reconcile}
            </HbarAppUiButton>
          ) : (
            <HbarAppUiButton
              tone="accent"
              disabled={!connected || busy || editor.form.issues.length > 0 || dirtyCount === 0}
              onClick={() => save(false)}
            >
              {labels.save}
            </HbarAppUiButton>
          )}
        </div>
      </footer>
      {(actionError || editor.error) && (
        <p role="alert">{labels.error(actionError ?? editor.error ?? 'EXECUTION_FAILED')}</p>
      )}
    </HbarAppUiSurface>
  )
}
