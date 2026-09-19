import { CommandError, type CommandRegistry } from '@hbar/commands'
import { providerEditorCommands } from '@hbar/contracts/commands/provider-editor'
import {
  configurationCommands,
  type ProviderEditorDescription,
  type ProviderProfile,
} from '@hbar/contracts/commands/configuration'
import type { ProviderInput } from '@hbar/contracts'
import {
  beginSubmit,
  compileForm,
  compileKeyedList,
  createComponentRegistry,
  createForm,
  createKeyedList,
  rebaseForm,
  resetField,
  SchemaError,
  setField,
  settleSubmit,
  type Submission,
} from '@hbar/schema-core'
import { createState, type StateReader } from './state'
import type { PanelSurface, ProviderEditorState, ProviderSettingsState, RuntimeOptions, SurfaceState } from './types'

interface PendingProviderSave {
  readonly submission: Submission
  readonly provider: ProviderInput
  readonly apiKeyPresent: boolean
  readonly apiKey: string | undefined
  readonly secretRevision: number
}

function errorCode(error: unknown): string {
  if (error instanceof CommandError || error instanceof SchemaError) return error.code
  return 'EXECUTION_FAILED'
}

function commandError(error: unknown): CommandError {
  if (error instanceof CommandError) return error
  if (error instanceof SchemaError) return new CommandError(error.code, error.message)
  return new CommandError('EXECUTION_FAILED', 'Provider editor action failed')
}

function summary(state: ProviderSettingsState) {
  return {
    status: state.status,
    editorId: state.editor?.editorId ?? null,
    providerId: state.editor?.providerId ?? null,
    formStatus: state.editor?.form.status ?? null,
    revision: state.editor?.form.revision ?? 0,
    dirty: [...(state.editor?.form.dirty ?? []), ...(state.editor?.sensitiveDirty ? ['apiKey'] : [])],
    error: state.editor?.error ?? state.error,
  }
}

function compile(description: ProviderEditorDescription, editing: boolean) {
  const components = createComponentRegistry()
  components.register('TextField', ['string'])
  components.register('SecretField', ['string'])
  components.register('NumberField', ['integer', 'number'])
  components.register('CheckBox', ['boolean'])
  components.register('ComboBox', ['string'])
  const properties = Object.fromEntries(
    description.fields.map((field) => {
      const constraints = {
        type: field.type,
        ...(field.minimum !== undefined ? { minimum: field.minimum } : {}),
        ...(field.maximum !== undefined ? { maximum: field.maximum } : {}),
        ...(field.minLength !== undefined ? { minLength: field.minLength } : {}),
        ...(field.maxLength !== undefined ? { maxLength: field.maxLength } : {}),
        ...(field.choices ? { enum: field.choices } : {}),
        ...(field.defaultValue !== undefined ? { default: field.defaultValue } : {}),
      }
      return [field.name, field.nullable ? { anyOf: [constraints, { type: 'null' }] } : constraints]
    }),
  )
  return compileForm(
    {
      type: 'object',
      additionalProperties: false,
      properties,
      required: description.fields.filter((field) => field.required).map((field) => field.name),
    },
    {
      id: `${description.id}@${description.version}:${editing ? 'edit' : 'new'}`,
      version: description.version,
      fields: Object.fromEntries(
        description.fields.map((field) => [
          field.name,
          { labelKey: field.labelKey, component: field.component, readOnly: editing && field.readOnlyOnEdit },
        ]),
      ),
    },
    components,
  )
}

function baseline(description: ProviderEditorDescription, profile: ProviderProfile | null): Record<string, unknown> {
  if (!profile) return {}
  return Object.fromEntries(
    description.fields.flatMap((field) => {
      if (field.sensitive) return []
      const value = profile.provider[field.name as keyof typeof profile.provider]
      return value === undefined ? [] : [[field.name, value]]
    }),
  )
}

function selectedModel(provider: ProviderInput, modelId: string) {
  return provider.models?.find((model) => model.id === modelId)
}

function providerInput(
  editor: ProviderEditorState,
  input: Readonly<Record<string, unknown>>,
  apiKey: string | undefined,
): Omit<PendingProviderSave, 'submission'> {
  const id = String(input.id)
  const model = String(input.model)
  const original = editor.original
  const modelInput = {
    ...(selectedModel(original ?? ({} as ProviderInput), model) ?? {}),
    id: model,
    contextWindow: Number(input.contextWindow),
    maxOutput: Number(input.maxOutput),
    imageInput: Boolean(input.imageInput),
    reasoning: Boolean(input.reasoning),
    inputPrice: Number(input.inputPrice),
    outputPrice: Number(input.outputPrice),
  }
  const originalModels = original?.models ?? []
  const models = original
    ? originalModels.some((candidate) => candidate.id === model)
      ? originalModels.map((candidate) => (candidate.id === model ? modelInput : candidate))
      : originalModels.length > 1
        ? [...originalModels, modelInput]
        : [modelInput]
    : undefined
  const provider: ProviderInput = {
    id,
    name: String(input.name),
    protocol: input.protocol as ProviderInput['protocol'],
    baseUrl: String(input.baseUrl),
    model,
    ...(models ? { models } : {}),
    contextWindow: Number(input.contextWindow),
    maxOutput: Number(input.maxOutput),
    imageInput: Boolean(input.imageInput),
    reasoning: Boolean(input.reasoning),
    inputPrice: Number(input.inputPrice),
    outputPrice: Number(input.outputPrice),
  }
  const apiKeyPresent = editor.sensitiveDirty
  return {
    provider,
    apiKeyPresent,
    apiKey: apiKeyPresent ? (apiKey ?? '') : undefined,
    secretRevision: editor.secretRevision,
  }
}

function profileMatches(profile: ProviderProfile | undefined, pending: PendingProviderSave): boolean {
  if (!profile) return false
  const expected = pending.provider
  if (
    profile.provider.id !== expected.id ||
    profile.provider.name !== expected.name ||
    profile.provider.protocol !== expected.protocol ||
    profile.provider.baseUrl !== expected.baseUrl ||
    profile.provider.model !== expected.model ||
    profile.provider.contextWindow !== expected.contextWindow ||
    profile.provider.maxOutput !== expected.maxOutput ||
    profile.provider.imageInput !== expected.imageInput ||
    profile.provider.reasoning !== expected.reasoning ||
    profile.provider.inputPrice !== expected.inputPrice ||
    profile.provider.outputPrice !== expected.outputPrice
  )
    return false
  return !pending.apiKeyPresent || profile.hasKey === Boolean(pending.apiKey)
}

export function createProviderSettings(
  local: CommandRegistry,
  options: RuntimeOptions,
  surfaces: StateReader<SurfaceState>,
  onSubscriberError: (error: unknown) => void,
  isDisposed: () => boolean,
) {
  const state = createState<ProviderSettingsState>(
    { status: 'idle', description: null, listSchema: null, list: null, profiles: {}, editor: null, error: null },
    onSubscriberError,
  )
  const pending = new Map<string, PendingProviderSave>()
  const secretDrafts = new Map<string, string>()
  let generation = 0

  const port = () => {
    if (!options.configuration)
      throw new CommandError('CAPABILITY_UNAVAILABLE', 'Provider configuration commands are unavailable')
    return options.configuration
  }
  const replace = (next: ProviderSettingsState): void => {
    if (!isDisposed()) state.replace(next)
  }
  const currentEditorPanel = (): PanelSurface | null => {
    const current = surfaces.getSnapshot()
    const panel = current.focusedPanelId ? current.panels[current.focusedPanelId] : undefined
    return panel?.panelId === 'settings-editor' && panel.params.path === 'providers' ? panel : null
  }
  const queryDescription = async () =>
    configurationCommands['provider.describe'].output.parse(await port().execute('provider.describe', {}))
  const queryProfiles = async () =>
    configurationCommands['provider.list'].output.parse(await port().execute('provider.list', {}))

  const loadList = async (force = false): Promise<ProviderSettingsState> => {
    const current = state.reader.getSnapshot()
    if (!force && current.status === 'ready' && current.description && current.listSchema && current.list)
      return current
    const currentGeneration = ++generation
    replace({ ...current, status: 'loading', error: null })
    try {
      const [description, profiles] = await Promise.all([current.description ?? queryDescription(), queryProfiles()])
      if (currentGeneration !== generation || isDisposed())
        throw new CommandError('CONTENT_SUPERSEDED', 'A newer provider request replaced this result')
      const listSchema = compileKeyedList({
        id: 'hbar.providers',
        version: description.version,
        labelKey: 'i18n:settings.providers.list.label',
        component: 'List',
        element: 'ProviderDialog',
        keyField: 'providerId',
        itemSchemaId: `${description.id}@${description.version}`,
        maxItems: 256,
      })
      const ordered = [...profiles].sort((left, right) => left.provider.id.localeCompare(right.provider.id))
      const latest = state.reader.getSnapshot()
      const next: ProviderSettingsState = {
        ...latest,
        status: 'ready',
        description,
        listSchema,
        list: createKeyedList(
          listSchema,
          ordered.map((profile) => ({
            providerId: profile.provider.id,
            name: profile.provider.name,
            protocol: profile.provider.protocol,
            model: profile.provider.model,
            hasKey: profile.hasKey,
          })),
        ),
        profiles: Object.fromEntries(ordered.map((profile) => [profile.provider.id, profile])),
        error: null,
      }
      replace(next)
      return next
    } catch (error) {
      if (currentGeneration === generation) {
        const latest = state.reader.getSnapshot()
        replace({ ...latest, status: 'error', error: errorCode(error) })
      }
      throw error
    }
  }

  const loadEditor = async (panel: PanelSurface, force = false): Promise<ProviderEditorState> => {
    const loaded = await loadList(force)
    if (currentEditorPanel()?.instanceId !== panel.instanceId)
      throw new CommandError('CONTENT_SUPERSEDED', 'Provider editor target changed')
    const providerId = typeof panel.params.entryId === 'string' ? panel.params.entryId : null
    const profile = providerId ? loaded.profiles[providerId] : undefined
    if (providerId && !profile) throw new CommandError('PROVIDER_NOT_FOUND', 'Provider profile does not exist')
    const schema = compile(loaded.description!, Boolean(profile))
    const editor: ProviderEditorState = {
      editorId: panel.instanceId,
      providerId,
      description: loaded.description!,
      schema,
      form: createForm(schema, baseline(loaded.description!, profile ?? null)),
      original: profile?.provider ?? null,
      hasKey: profile?.hasKey ?? false,
      sensitiveDirty: false,
      secretRevision: 0,
      secretResetRevision: 0,
      error: null,
    }
    secretDrafts.delete(panel.instanceId)
    pending.delete(panel.instanceId)
    replace({ ...state.reader.getSnapshot(), editor, error: null })
    return editor
  }
  const editor = (editorId: string): ProviderEditorState => {
    const current = state.reader.getSnapshot().editor
    if (!current || current.editorId !== editorId)
      throw new CommandError('FORM_NOT_FOUND', 'Provider editor is unavailable')
    return current
  }
  const replaceEditor = (next: ProviderEditorState): void => {
    const current = state.reader.getSnapshot()
    replace({ ...current, editor: next })
  }
  const settleSuccess = (editorId: string, operation: PendingProviderSave, loaded: ProviderSettingsState) => {
    const current = editor(editorId)
    const profile = loaded.profiles[operation.provider.id]
    let form = settleSubmit(current.schema, current.form, operation.submission, 'succeeded')
    if (profile) form = rebaseForm(current.schema, form, baseline(current.description, profile))
    const next: ProviderEditorState = {
      ...current,
      providerId: operation.provider.id,
      form,
      original: profile?.provider ?? current.original,
      hasKey: profile?.hasKey ?? (operation.apiKeyPresent ? Boolean(operation.apiKey) : current.hasKey),
      sensitiveDirty:
        current.secretRevision === operation.secretRevision && operation.apiKeyPresent ? false : current.sensitiveDirty,
      secretResetRevision:
        current.secretRevision === operation.secretRevision && operation.apiKeyPresent
          ? current.secretResetRevision + 1
          : current.secretResetRevision,
      error: null,
    }
    if (current.secretRevision === operation.secretRevision && operation.apiKeyPresent) secretDrafts.delete(editorId)
    pending.delete(editorId)
    replaceEditor(next)
    return next
  }
  const save = async (editorId: string): Promise<ProviderEditorState> => {
    const current = editor(editorId)
    if (pending.has(editorId)) throw new CommandError('SUBMISSION_PENDING', 'Provider save is already pending')
    const begun = beginSubmit(current.schema, current.form)
    const candidate = providerInput(current, begun.submission.input, secretDrafts.get(editorId))
    const operation = { ...candidate, submission: begun.submission }
    pending.set(editorId, operation)
    replaceEditor({ ...current, form: begun.state, error: null })
    try {
      await port().execute('provider.save', {
        provider: operation.provider,
        ...(operation.apiKeyPresent ? { apiKey: operation.apiKey } : {}),
      })
      const loaded = await loadList(true)
      return settleSuccess(editorId, operation, loaded)
    } catch (error) {
      const latest = editor(editorId)
      const code = errorCode(error)
      const unknown = code === 'RESULT_UNKNOWN'
      replaceEditor({
        ...latest,
        form: settleSubmit(latest.schema, latest.form, operation.submission, unknown ? 'unknown' : 'failed', code),
        error: code,
      })
      if (!unknown) pending.delete(editorId)
      throw error
    }
  }
  const reconcile = async (editorId: string): Promise<ProviderEditorState> => {
    const current = editor(editorId)
    const operation = pending.get(editorId)
    if (!operation || current.form.status !== 'unknown')
      throw new CommandError('INVALID_INPUT', 'Provider editor has no unknown save to reconcile')
    const loaded = await loadList(true)
    if (!profileMatches(loaded.profiles[operation.provider.id], operation))
      throw new CommandError('RESULT_UNKNOWN', 'Provider save is not yet confirmed by the Host')
    return settleSuccess(editorId, operation, loaded)
  }

  local.register(providerEditorCommands['providerEditor.refresh'], async () => {
    try {
      const panel = currentEditorPanel()
      if (panel) await loadEditor(panel, true)
      else await loadList(true)
      return summary(state.reader.getSnapshot())
    } catch (error) {
      throw commandError(error)
    }
  })
  local.register(providerEditorCommands['providerEditor.setField'], ({ editorId, field, value }) => {
    try {
      const current = editor(editorId)
      const definition = current.description.fields.find((candidate) => candidate.name === field)
      if (!definition) throw new CommandError('FIELD_NOT_FOUND', 'Provider field is not registered')
      if (definition.sensitive) {
        if (typeof value !== 'string') throw new CommandError('INVALID_INPUT', 'Sensitive fields require text input')
        secretDrafts.set(editorId, value)
        const next = {
          ...current,
          sensitiveDirty: true,
          secretRevision: current.secretRevision + 1,
          secretResetRevision: current.secretResetRevision,
          error: null,
        }
        replaceEditor(next)
        return summary(state.reader.getSnapshot())
      }
      const next = { ...current, form: setField(current.schema, current.form, field, value), error: null }
      replaceEditor(next)
      return summary(state.reader.getSnapshot())
    } catch (error) {
      throw commandError(error)
    }
  })
  local.register(providerEditorCommands['providerEditor.resetField'], ({ editorId, field }) => {
    try {
      const current = editor(editorId)
      const definition = current.description.fields.find((candidate) => candidate.name === field)
      if (!definition) throw new CommandError('FIELD_NOT_FOUND', 'Provider field is not registered')
      if (definition.sensitive) {
        secretDrafts.delete(editorId)
        const next = {
          ...current,
          sensitiveDirty: false,
          secretRevision: current.secretRevision + 1,
          secretResetRevision: current.secretResetRevision + 1,
          error: null,
        }
        replaceEditor(next)
        return summary(state.reader.getSnapshot())
      }
      const next = { ...current, form: resetField(current.schema, current.form, field), error: null }
      replaceEditor(next)
      return summary(state.reader.getSnapshot())
    } catch (error) {
      throw commandError(error)
    }
  })
  local.register(providerEditorCommands['providerEditor.save'], async ({ editorId }) => {
    try {
      await save(editorId)
      return summary(state.reader.getSnapshot())
    } catch (error) {
      throw commandError(error)
    }
  })
  local.register(providerEditorCommands['providerEditor.reconcile'], async ({ editorId }) => {
    try {
      await reconcile(editorId)
      return summary(state.reader.getSnapshot())
    } catch (error) {
      throw commandError(error)
    }
  })
  local.register(providerEditorCommands['providerEditor.delete'], async ({ providerId }) => {
    try {
      await port().execute('provider.delete', { id: providerId })
      const loaded = await loadList(true)
      if (loaded.editor?.providerId === providerId)
        replace({ ...state.reader.getSnapshot(), editor: null, error: null })
      return summary(state.reader.getSnapshot())
    } catch (error) {
      throw commandError(error)
    }
  })

  const syncSurface = () => {
    const panel = currentEditorPanel()
    if (!panel) {
      return
    }
    const providerId = typeof panel.params.entryId === 'string' ? panel.params.entryId : null
    const current = state.reader.getSnapshot().editor
    if (current?.editorId === panel.instanceId && current.providerId === providerId) return
    void loadEditor(panel).catch((error) => onSubscriberError(error))
  }
  const unsubscribe = surfaces.subscribe(syncSurface)
  syncSurface()
  return {
    reader: state.reader,
    dispose() {
      unsubscribe()
      generation += 1
      pending.clear()
      secretDrafts.clear()
      state.dispose()
    },
  }
}
