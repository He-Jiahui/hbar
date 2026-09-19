import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { encodePath, type CompiledField } from '@hbar/schema-core'
import {
  HbarSchemaForm,
  createSchemaComponentRegistry,
  registerStandardSchemaComponents,
  type HbarSchemaFormLabels,
  type SchemaComponentRegistry,
  type SchemaFieldIntent,
} from '@hbar/schema-react'
import { HbarAppUiButton, HbarAppUiSurface } from 'hbar-app-ui'
import type { SettingsFormEntry } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './settings-workspace.css'

const standardComponents = createSchemaComponentRegistry()
registerStandardSchemaComponents(standardComponents)

type SettingApplyMode = NonNullable<SettingsFormEntry['description']>['fields'][number]['applyMode']

export interface HbarSettingsWorkspaceLabels {
  readonly title: (scope: SettingsFormEntry['scope']['kind'], targetName: string | null) => string
  readonly description: string
  readonly scopes: string
  readonly global: string
  readonly workspace: string
  readonly session: string
  readonly groups: string
  readonly loading: string
  readonly refresh: string
  readonly save: string
  readonly reconcile: string
  readonly saved: string
  readonly unsaved: (count: number) => string
  readonly restoreInheritance: string
  readonly localOverride: string
  readonly pendingInheritance: string
  readonly inheritedFrom: (source: string) => string
  readonly readOnly: string
  readonly applyMode: (mode: SettingApplyMode) => string
  readonly error: (code: string) => string
  readonly resolve: (key: string) => string
  readonly form: Omit<HbarSchemaFormLabels, 'resolve' | 'help'>
}

export interface HbarSettingsWorkspaceProps {
  readonly labels: HbarSettingsWorkspaceLabels
  readonly connected: boolean
  readonly components?: SchemaComponentRegistry
  readonly renderGroup?: (groupId: string) => ReactNode
}

function reasonCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

export function HbarSettingsWorkspace({
  labels,
  connected,
  components = standardComponents,
  renderGroup,
}: HbarSettingsWorkspaceProps) {
  const runtime = useHbarRuntime()
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const directory = useHbarRuntimeState(runtime.state.directory)
  const settings = useHbarRuntimeState(runtime.state.settings)
  const [actionError, setActionError] = useState<string | null>(null)
  const entry = settings.activeFormId ? settings.forms[settings.activeFormId] : undefined
  const selectedTargetName = entry
    ? entry.scope.kind === 'global'
      ? null
      : entry.scope.kind === 'workspace'
        ? (directory.workspaces[entry.scope.targetId]?.name ?? null)
        : (directory.sessions[entry.scope.targetId]?.title ?? null)
    : null
  const groups = useMemo(
    () =>
      entry?.description
        ? [...entry.description.groups].sort(
            (left, right) => left.order - right.order || left.id.localeCompare(right.id),
          )
        : [],
    [entry?.description],
  )
  const definitions = useMemo(
    () => new Map(entry?.description?.fields.map((field) => [encodePath(field.path), field] as const) ?? []),
    [entry?.description],
  )
  const fieldNames = useMemo(
    () =>
      entry?.description?.fields
        .filter((field) => field.group === entry.selectedGroup)
        .sort((left, right) => left.order - right.order || encodePath(left.path).localeCompare(encodePath(right.path)))
        .map((field) => encodePath(field.path)) ?? [],
    [entry?.description, entry?.selectedGroup],
  )

  const reportError = useCallback((reason: unknown) => setActionError(reasonCode(reason)), [])
  const selectScope = (scope: 'global' | 'workspace' | 'session') => {
    setActionError(null)
    const request =
      scope === 'global'
        ? runtime.commands.execute('app.openSettings', { scope })
        : scope === 'workspace'
          ? navigation.workspaceId
            ? runtime.commands.execute('app.openSettings', { scope, targetId: navigation.workspaceId })
            : null
          : navigation.sessionId
            ? runtime.commands.execute('app.openSettings', { scope, targetId: navigation.sessionId })
            : null
    if (request) void request.catch(reportError)
  }
  const dispatchIntent = (intent: SchemaFieldIntent) => {
    if (!entry) return
    setActionError(null)
    const request =
      intent.kind === 'set'
        ? runtime.commands.execute('settingsForm.setField', {
            formId: entry.formId,
            field: intent.field,
            value: intent.value,
          })
        : intent.kind === 'pick'
          ? runtime.commands.execute('settingsForm.pickResource', { formId: entry.formId, field: intent.field })
          : runtime.commands.execute('settingsForm.resetField', { formId: entry.formId, field: intent.field })
    void request.catch(reportError)
  }
  const runFormCommand = (command: 'refresh' | 'submit' | 'reconcile') => {
    if (!entry) return
    setActionError(null)
    void runtime.commands.execute(`settingsForm.${command}`, { formId: entry.formId }).catch(reportError)
  }
  const selectGroup = (groupId: string) => {
    if (!entry) return
    setActionError(null)
    void runtime.commands.execute('settingsForm.selectGroup', { formId: entry.formId, groupId }).catch(reportError)
  }
  const restoreInheritance = (field: string) => {
    if (!entry) return
    setActionError(null)
    void runtime.commands.execute('settingsForm.restoreInheritance', { formId: entry.formId, field }).catch(reportError)
  }

  const dirtyCount = new Set([...(entry?.form?.dirty ?? []), ...Object.keys(entry?.unsets ?? {})]).size
  const busy = entry?.form?.status === 'submitting'
  const unknown = entry?.form?.status === 'unknown'
  const invalid = Boolean(entry?.form?.issues.length)
  const canRefresh = connected && Boolean(entry) && !busy && !unknown && dirtyCount === 0
  const canSave = connected && Boolean(entry) && !busy && !unknown && !invalid && dirtyCount > 0
  const customGroup = entry?.selectedGroup ? renderGroup?.(entry.selectedGroup) : null

  const fieldContext = (field: CompiledField) => {
    if (!entry) return null
    const definition = definitions.get(field.name)
    const report = entry.reports[field.name]
    if (!definition || !report) return null
    const source = Object.hasOwn(entry.unsets, field.name)
      ? labels.pendingInheritance
      : report.localPresence
        ? labels.localOverride
        : labels.inheritedFrom(report.sourceLayer)
    return (
      <span className="hbar-schema-form-context">
        <small>{source}</small>
        <small>{labels.applyMode(definition.applyMode)}</small>
        {field.readOnly && <small>{labels.readOnly}</small>}
      </span>
    )
  }
  const fieldActions = (field: CompiledField) => {
    if (!entry || entry.scope.kind === 'global' || field.readOnly || Object.hasOwn(entry.unsets, field.name))
      return null
    if (!entry.reports[field.name]?.localPresence) return null
    return (
      <span className="hbar-schema-form-actions">
        <HbarAppUiButton type="button" disabled={busy || unknown} onClick={() => restoreInheritance(field.name)}>
          {labels.restoreInheritance}
        </HbarAppUiButton>
      </span>
    )
  }

  return (
    <HbarAppUiSurface className="hbar-app-react-settings-workspace">
      <header className="hbar-app-react-settings-header">
        <div>
          <h1>{labels.title(entry?.scope.kind ?? 'global', selectedTargetName)}</h1>
          <p>{labels.description}</p>
        </div>
        <div className="hbar-app-react-settings-scopes" role="group" aria-label={labels.scopes}>
          <HbarAppUiButton aria-pressed={entry?.scope.kind === 'global'} onClick={() => selectScope('global')}>
            {labels.global}
          </HbarAppUiButton>
          <HbarAppUiButton
            aria-pressed={entry?.scope.kind === 'workspace'}
            disabled={!navigation.workspaceId}
            onClick={() => selectScope('workspace')}
          >
            {labels.workspace}
          </HbarAppUiButton>
          <HbarAppUiButton
            aria-pressed={entry?.scope.kind === 'session'}
            disabled={!navigation.sessionId}
            onClick={() => selectScope('session')}
          >
            {labels.session}
          </HbarAppUiButton>
        </div>
      </header>

      {!entry || entry.status === 'loading' ? (
        <p className="hbar-app-react-settings-state" role="status">
          {labels.loading}
        </p>
      ) : entry.status === 'error' || !entry.description || !entry.schema || !entry.form ? (
        <div className="hbar-app-react-settings-state">
          <p role="alert">{labels.error(entry.error ?? 'FORM_NOT_READY')}</p>
          <HbarAppUiButton disabled={!connected} onClick={() => runFormCommand('refresh')}>
            {labels.refresh}
          </HbarAppUiButton>
        </div>
      ) : (
        <div className="hbar-app-react-settings-layout">
          <nav className="hbar-app-react-settings-groups" aria-label={labels.groups}>
            {groups.map((group) => (
              <HbarAppUiButton
                key={group.id}
                aria-current={entry.selectedGroup === group.id ? 'page' : undefined}
                onClick={() => selectGroup(group.id)}
              >
                {labels.resolve(group.labelKey)}
              </HbarAppUiButton>
            ))}
          </nav>
          <main className="hbar-app-react-settings-main">
            {customGroup ?? (
              <>
                <HbarSchemaForm
                  schema={entry.schema}
                  state={entry.form}
                  components={components}
                  labels={{
                    ...labels.form,
                    resolve: labels.resolve,
                    help: (field) => {
                      const key = definitions.get(field.name)?.helpKey
                      return key ? labels.resolve(key) : undefined
                    },
                  }}
                  content={entry.content}
                  fieldNames={fieldNames}
                  renderFieldContext={fieldContext}
                  renderFieldActions={fieldActions}
                  onIntent={dispatchIntent}
                />
                <footer className="hbar-app-react-settings-footer">
                  <span role="status">
                    {entry.receipt ? labels.saved : dirtyCount > 0 ? labels.unsaved(dirtyCount) : null}
                  </span>
                  <div>
                    <HbarAppUiButton disabled={!canRefresh} onClick={() => runFormCommand('refresh')}>
                      {labels.refresh}
                    </HbarAppUiButton>
                    {unknown ? (
                      <HbarAppUiButton tone="warning" disabled={!connected} onClick={() => runFormCommand('reconcile')}>
                        {labels.reconcile}
                      </HbarAppUiButton>
                    ) : (
                      <HbarAppUiButton tone="accent" disabled={!canSave} onClick={() => runFormCommand('submit')}>
                        {labels.save}
                      </HbarAppUiButton>
                    )}
                  </div>
                </footer>
              </>
            )}
          </main>
        </div>
      )}
      {(actionError || (entry?.status === 'ready' && entry.error)) && (
        <p role="alert">{labels.error(actionError ?? entry?.error ?? 'EXECUTION_FAILED')}</p>
      )}
    </HbarAppUiSurface>
  )
}
