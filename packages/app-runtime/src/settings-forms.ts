import { CommandError, type CommandRegistry, type ExecuteOptions } from '@hbar/commands'
import { settingsEditorCommands } from '@hbar/contracts/commands/settings-editor'
import {
  settingsCommands,
  settingsScopeSchema,
  type SettingsApplyInput,
  type SettingsDescription,
  type SettingsReceipt,
  type SettingsSnapshot,
} from '@hbar/contracts/commands/settings'
import {
  beginSubmit,
  compileForm,
  createComponentRegistry,
  createForm,
  decodePath,
  encodePath,
  rebaseForm,
  resetField,
  SchemaError,
  setField,
  settleSubmit,
  type FormState,
  type Submission,
} from '@hbar/schema-core'
import type { StateReader } from './state'
import { createState } from './state'
import type {
  DirectoryState,
  PanelSurface,
  RuntimeOptions,
  SettingsFormEntry,
  SettingsWorkspaceState,
  SurfaceState,
} from './types'

const MAX_FORMS = 32

interface PendingSubmission {
  readonly submission: Submission
  readonly unsets: Readonly<Record<string, number>>
  readonly key: string
  readonly input: SettingsApplyInput
}

function errorCode(error: unknown): string {
  if (error instanceof CommandError || error instanceof SchemaError) return error.code
  return 'EXECUTION_FAILED'
}

function commandError(error: unknown): CommandError {
  if (error instanceof CommandError) return error
  if (error instanceof SchemaError) return new CommandError(error.code, error.message)
  return new CommandError('EXECUTION_FAILED', 'Settings form action failed')
}

function formKey(panel: PanelSurface, scope: SettingsSnapshot['scope']): string {
  return `${panel.instanceId}:${scope.kind}:${scope.kind === 'global' ? 'global' : encodeURIComponent(scope.targetId)}`
}

function panelScope(panel: PanelSurface): SettingsSnapshot['scope'] {
  const requested = panel.params.scope
  const target = typeof panel.params.targetId === 'string' ? panel.params.targetId : undefined
  const scope =
    requested === 'global'
      ? { kind: 'global' as const }
      : requested === 'workspace'
        ? { kind: 'workspace' as const, targetId: target ?? panel.workspaceId }
        : requested === 'session'
          ? { kind: 'session' as const, targetId: target ?? panel.sessionId }
          : null
  const parsed = settingsScopeSchema.safeParse(scope)
  if (!parsed.success) throw new CommandError('INVALID_INPUT', 'Settings panel needs an explicit valid scope target')
  return parsed.data
}

function compile(description: SettingsDescription, scope: SettingsSnapshot['scope']) {
  const components = createComponentRegistry()
  components.register('TextField', ['string'])
  components.register('NumberField', ['integer', 'number'])
  components.register('CheckBox', ['boolean'])
  components.register('ComboBox', ['string', 'integer', 'number', 'boolean'])
  const properties = Object.fromEntries(
    description.fields.map((field) => {
      const constraints = {
        type: field.type,
        ...(field.minimum !== undefined ? { minimum: field.minimum } : {}),
        ...(field.maximum !== undefined ? { maximum: field.maximum } : {}),
        ...(field.choices ? { enum: field.choices } : {}),
        default: field.defaultValue,
      }
      return [encodePath(field.path), field.nullable ? { anyOf: [constraints, { type: 'null' }] } : constraints]
    }),
  )
  return compileForm(
    { type: 'object', additionalProperties: false, properties },
    {
      id: `${description.id}@${description.schemaVersion}`,
      version: description.schemaVersion,
      fields: Object.fromEntries(
        description.fields.map((field) => [
          encodePath(field.path),
          {
            labelKey: field.labelKey,
            component: field.component,
            readOnly: !field.allowedScopes.includes(scope.kind),
          },
        ]),
      ),
    },
    components,
  )
}

function values(description: SettingsDescription, snapshot: SettingsSnapshot): Record<string, unknown> {
  return Object.fromEntries(
    description.fields.map((field) => {
      const key = encodePath(field.path)
      const report = snapshot.resolution.reports[key]
      if (!report) throw new CommandError('INVALID_OUTPUT', `Settings report is missing ${key}`)
      return [key, report.effectiveValue]
    }),
  )
}

function summary(entry: SettingsFormEntry) {
  return {
    formId: entry.formId,
    scope: entry.scope,
    status: entry.status,
    formStatus: entry.form?.status ?? null,
    revision: entry.form?.revision ?? 0,
    dirty: [...(entry.form?.dirty ?? [])],
    unsets: Object.keys(entry.unsets),
    issues: [...(entry.form?.issues ?? [])],
    error: entry.error,
  }
}

function loading(formId: string, scope: SettingsSnapshot['scope']): SettingsFormEntry {
  return {
    formId,
    scope,
    status: 'loading',
    description: null,
    schema: null,
    form: null,
    reports: {},
    inheritedValues: {},
    unsets: {},
    revisions: {},
    receipt: null,
    pendingKey: null,
    error: null,
  }
}

function inputValue(value: unknown): string | boolean | null {
  if (typeof value === 'string' || typeof value === 'boolean' || value === null) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  throw new CommandError('INVALID_OUTPUT', 'Inherited setting is not a supported scalar value')
}

function wirePath(value: string): SettingsApplyInput['changes'][number]['path'] {
  return decodePath(value).map((segment) => ({ ...segment }))
}

export function createSettingsForms(
  local: CommandRegistry,
  options: RuntimeOptions,
  surfaces: StateReader<SurfaceState>,
  directory: StateReader<DirectoryState>,
  onSubscriberError: (error: unknown) => void,
  isDisposed: () => boolean,
) {
  const state = createState<SettingsWorkspaceState>({ activeFormId: null, forms: {} }, onSubscriberError)
  const generations = new Map<string, number>()
  const touched: string[] = []
  const pending = new Map<string, PendingSubmission>()
  let description: SettingsDescription | null = null

  const touch = (formId: string): void => {
    const index = touched.indexOf(formId)
    if (index >= 0) touched.splice(index, 1)
    touched.push(formId)
  }
  const replaceEntry = (formId: string, entry: SettingsFormEntry): void => {
    if (isDisposed()) return
    const current = state.reader.getSnapshot()
    state.replace({ ...current, forms: { ...current.forms, [formId]: entry } })
    touch(formId)
  }
  const entry = (formId: string): SettingsFormEntry => {
    const current = state.reader.getSnapshot().forms[formId]
    if (!current) throw new CommandError('FORM_NOT_FOUND', 'Settings form is unavailable')
    return current
  }
  const ready = (
    formId: string,
  ): SettingsFormEntry & {
    schema: NonNullable<SettingsFormEntry['schema']>
    form: FormState
    description: SettingsDescription
  } => {
    const current = entry(formId)
    if (current.status !== 'ready' || !current.schema || !current.form || !current.description)
      throw new CommandError('FORM_NOT_READY', 'Settings form has not loaded')
    return current as SettingsFormEntry & {
      schema: NonNullable<SettingsFormEntry['schema']>
      form: FormState
      description: SettingsDescription
    }
  }
  const port = () => {
    if (!options.settings) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Settings command port is unavailable')
    return options.settings
  }
  const describe = async (execution?: ExecuteOptions): Promise<SettingsDescription> =>
    settingsCommands['settings.describe'].output.parse(await port().execute('settings.describe', {}, execution))
  const get = async (scope: SettingsSnapshot['scope'], execution?: ExecuteOptions): Promise<SettingsSnapshot> =>
    settingsCommands['settings.get'].output.parse(await port().execute('settings.get', { scope }, execution))
  const apply = async (input: SettingsApplyInput, key: string): Promise<SettingsReceipt> =>
    settingsCommands['settings.apply'].output.parse(
      await port().execute('settings.apply', input, { idempotencyKey: key }),
    )
  const parentScope = (scope: SettingsSnapshot['scope'], panel: PanelSurface): SettingsSnapshot['scope'] | null => {
    if (scope.kind === 'global') return null
    if (scope.kind === 'workspace') return { kind: 'global' }
    const workspaceId = panel.workspaceId ?? directory.getSnapshot().sessions[scope.targetId]?.workspaceId ?? null
    if (!workspaceId) throw new CommandError('INVALID_INPUT', 'Session settings require their workspace target')
    return { kind: 'workspace', targetId: workspaceId }
  }
  const ensureCapacity = (activeFormId: string): void => {
    const current = state.reader.getSnapshot()
    if (current.forms[activeFormId] || Object.keys(current.forms).length < MAX_FORMS) return
    const evict = touched.find((id) => {
      const candidate = current.forms[id]
      return (
        id !== current.activeFormId &&
        candidate?.form?.status !== 'submitting' &&
        candidate?.form?.status !== 'unknown' &&
        !candidate?.form?.dirty.length &&
        !Object.keys(candidate?.unsets ?? {}).length
      )
    })
    if (!evict) throw new CommandError('BUSY', 'Too many settings drafts are open')
    const forms = { ...current.forms }
    delete forms[evict]
    pending.delete(evict)
    generations.delete(evict)
    touched.splice(touched.indexOf(evict), 1)
    state.replace({ ...current, forms })
  }
  const load = async (panel: PanelSurface, force = false): Promise<SettingsFormEntry> => {
    const scope = panelScope(panel)
    const formId = formKey(panel, scope)
    ensureCapacity(formId)
    const workspace = state.reader.getSnapshot()
    const existing = workspace.forms[formId]
    state.replace({ ...workspace, activeFormId: formId })
    touch(formId)
    if (existing && !force) return existing
    if (existing?.form && (existing.form.dirty.length || Object.keys(existing.unsets).length))
      throw new CommandError('DIRTY_FORM', 'Reset pending settings edits before refreshing')
    const generation = (generations.get(formId) ?? 0) + 1
    generations.set(formId, generation)
    replaceEntry(formId, loading(formId, scope))
    try {
      description ??= await describe()
      const parent = parentScope(scope, panel)
      const [snapshot, inherited] = await Promise.all([get(scope), parent ? get(parent) : Promise.resolve(null)])
      if (isDisposed() || generations.get(formId) !== generation)
        throw new CommandError('CONTENT_SUPERSEDED', 'A newer settings target replaced this load')
      const schema = compile(description, scope)
      const baseline = values(description, snapshot)
      const inheritedValues = inherited
        ? values(description, inherited)
        : Object.fromEntries(description.fields.map((field) => [encodePath(field.path), field.defaultValue]))
      const next: SettingsFormEntry = {
        formId,
        scope,
        status: 'ready',
        description,
        schema,
        form: createForm(schema, baseline),
        reports: snapshot.resolution.reports,
        inheritedValues,
        unsets: {},
        revisions: snapshot.revisions,
        receipt: null,
        pendingKey: null,
        error: null,
      }
      replaceEntry(formId, next)
      return next
    } catch (error) {
      if (generations.get(formId) !== generation) throw error
      const failed = { ...loading(formId, scope), status: 'error' as const, error: errorCode(error) }
      replaceEntry(formId, failed)
      throw error
    }
  }
  const currentSettingsPanel = (): PanelSurface | null => {
    const current = surfaces.getSnapshot()
    const panel = current.focusedPanelId ? current.panels[current.focusedPanelId] : undefined
    return panel?.panelId === 'settings' ? panel : null
  }
  const syncSurface = (): void => {
    const panel = currentSettingsPanel()
    if (!panel) {
      const current = state.reader.getSnapshot()
      if (current.activeFormId !== null) state.replace({ ...current, activeFormId: null })
      return
    }
    try {
      const scope = panelScope(panel)
      const id = formKey(panel, scope)
      const current = state.reader.getSnapshot()
      if (current.activeFormId === id && current.forms[id]) return
      void load(panel).catch(() => undefined)
    } catch (error) {
      onSubscriberError(error)
    }
  }
  const settle = (formId: string, receipt: SettingsReceipt): SettingsFormEntry => {
    const current = ready(formId)
    const operation = pending.get(formId)
    if (!operation || current.pendingKey !== operation.key) return current
    let form = settleSubmit(current.schema, current.form, operation.submission, 'succeeded')
    const baseline = values(current.description, {
      schemaVersion: receipt.schemaVersion,
      scope: current.scope,
      revisions: { ...current.revisions, [receipt.layerId]: receipt.revision },
      resolution: receipt.resolution,
    })
    form = rebaseForm(current.schema, form, baseline)
    const unsets = { ...current.unsets }
    for (const [field, revision] of Object.entries(operation.unsets))
      if (unsets[field] === revision) delete unsets[field]
    const next: SettingsFormEntry = {
      ...current,
      form,
      reports: receipt.resolution.reports,
      revisions: { ...current.revisions, [receipt.layerId]: receipt.revision },
      unsets,
      receipt,
      pendingKey: null,
      error: null,
    }
    pending.delete(formId)
    replaceEntry(formId, next)
    return next
  }
  const submit = async (formId: string, retry: boolean): Promise<SettingsFormEntry> => {
    const current = ready(formId)
    let operation = pending.get(formId)
    if (retry) {
      if (!operation || current.form.status !== 'unknown' || current.pendingKey !== operation.key)
        throw new CommandError('INVALID_INPUT', 'Settings form has no unknown submission to reconcile')
    } else {
      if (operation) throw new CommandError('SUBMISSION_PENDING', 'Settings form submission is already pending')
      const begun = beginSubmit(current.schema, current.form)
      const unsets = { ...current.unsets }
      const changed = [...new Set([...begun.state.dirty, ...Object.keys(unsets)])]
      const changes = changed.map((field) =>
        Object.hasOwn(unsets, field)
          ? ({ op: 'unset' as const, path: wirePath(field) } as const)
          : ({ op: 'set' as const, path: wirePath(field), value: begun.submission.input[field] } as const),
      )
      if (!changes.length) throw new CommandError('INVALID_INPUT', 'Settings form has no changes to submit')
      const key = crypto.randomUUID()
      operation = {
        submission: begun.submission,
        unsets,
        key,
        input: {
          schemaVersion: current.description.schemaVersion,
          scope: current.scope,
          changes,
          baselineRevisions: current.revisions,
        },
      }
      pending.set(formId, operation)
      replaceEntry(formId, { ...current, form: begun.state, pendingKey: key, receipt: null, error: null })
    }
    if (!operation) throw new CommandError('SUBMISSION_PENDING', 'Settings submission state is unavailable')
    try {
      const receipt = await apply(operation.input, operation.key)
      return settle(formId, receipt)
    } catch (error) {
      const latest = ready(formId)
      if (latest.pendingKey === operation.key) {
        const code = errorCode(error)
        const unknown = code === 'RESULT_UNKNOWN'
        const next = {
          ...latest,
          form: settleSubmit(latest.schema, latest.form, operation.submission, unknown ? 'unknown' : 'failed', code),
          pendingKey: unknown ? latest.pendingKey : null,
          error: code,
        }
        if (!unknown) pending.delete(formId)
        replaceEntry(formId, next)
      }
      throw error
    }
  }

  local.register(settingsEditorCommands['settingsForm.refresh'], async ({ formId }) => {
    try {
      const panel = currentSettingsPanel()
      if (!panel || formKey(panel, panelScope(panel)) !== formId)
        throw new CommandError('FORM_NOT_FOUND', 'Settings form is not active')
      return summary(await load(panel, true))
    } catch (error) {
      throw commandError(error)
    }
  })
  local.register(settingsEditorCommands['settingsForm.setField'], ({ formId, field, value }) => {
    try {
      const current = ready(formId)
      const form = setField(current.schema, current.form, field, value)
      const unsets = { ...current.unsets }
      delete unsets[field]
      const next = { ...current, form, unsets, receipt: null, error: null }
      replaceEntry(formId, next)
      return summary(next)
    } catch (error) {
      throw commandError(error)
    }
  })
  local.register(settingsEditorCommands['settingsForm.resetField'], ({ formId, field }) => {
    try {
      const current = ready(formId)
      const form = resetField(current.schema, current.form, field)
      const unsets = { ...current.unsets }
      delete unsets[field]
      const next = { ...current, form, unsets, receipt: null, error: null }
      replaceEntry(formId, next)
      return summary(next)
    } catch (error) {
      throw commandError(error)
    }
  })
  local.register(settingsEditorCommands['settingsForm.restoreInheritance'], ({ formId, field }) => {
    try {
      const current = ready(formId)
      const report = current.reports[field]
      if (!report) throw new CommandError('FIELD_NOT_FOUND', 'Setting field is not registered')
      if (!report.localPresence) {
        const unsets = { ...current.unsets }
        delete unsets[field]
        const next = { ...current, form: resetField(current.schema, current.form, field), unsets, error: null }
        replaceEntry(formId, next)
        return summary(next)
      }
      const form = setField(current.schema, current.form, field, inputValue(current.inheritedValues[field]))
      const unsets = { ...current.unsets, [field]: form.revision }
      const next = { ...current, form, unsets, receipt: null, error: null }
      replaceEntry(formId, next)
      return summary(next)
    } catch (error) {
      throw commandError(error)
    }
  })
  local.register(settingsEditorCommands['settingsForm.submit'], async ({ formId }) => {
    try {
      return summary(await submit(formId, false))
    } catch (error) {
      throw commandError(error)
    }
  })
  local.register(settingsEditorCommands['settingsForm.reconcile'], async ({ formId }) => {
    try {
      return summary(await submit(formId, true))
    } catch (error) {
      throw commandError(error)
    }
  })

  const unsubscribe = surfaces.subscribe(syncSurface)
  syncSurface()
  return {
    reader: state.reader,
    dispose() {
      unsubscribe()
      generations.clear()
      pending.clear()
      touched.splice(0)
      state.dispose()
    },
  }
}
