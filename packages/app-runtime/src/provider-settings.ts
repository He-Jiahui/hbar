import { CommandError, type CommandRegistry } from '@hbar/commands'
import {
  providerInputSchema,
  providerSchema,
  type ProviderConfig,
  type ProviderInput,
  type ThinkingLevel,
} from '@hbar/contracts'
import { providerEditorCommands } from '@hbar/contracts/commands/provider-editor'
import {
  configurationCommands,
  type ProviderEditorDescription,
  type ProviderPresetModel,
  type ProviderProfile,
} from '@hbar/contracts/commands/configuration'
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
  type FormState,
  type Submission,
} from '@hbar/schema-core'
import { createState, type StateReader } from './state'
import type {
  PanelSurface,
  ProviderEditorDraft,
  ProviderEditorDraftIssue,
  ProviderEditorDraftModel,
  ProviderEditorState,
  ProviderPresetCatalogState,
  ProviderSettingsState,
  RuntimeOptions,
  SurfaceState,
} from './types'

interface PendingProviderSave {
  readonly submission: Submission
  readonly provider: ProviderInput
  readonly draft: ProviderEditorDraft
  readonly apiKeyPresent: boolean
  readonly apiKey: string | undefined
  readonly secretRevision: number
}

const protocolValues = ['openai-completions', 'openai-responses', 'anthropic-messages', 'mock'] as const
const providerFields = ['id', 'name', 'visible', 'protocol', 'baseUrl'] as const
const modelFields = [
  'id',
  'name',
  'visible',
  'contextWindow',
  'maxOutput',
  'imageInput',
  'reasoning',
  'inputPrice',
  'outputPrice',
  'thinkingLevels',
  'defaultThinkingLevel',
] as const

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
    dirty: [...(state.editor?.draftDirty ?? []), ...(state.editor?.sensitiveDirty ? ['apiKey'] : [])],
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

function draftModel(model: ProviderConfig['models'][number]): ProviderEditorDraftModel {
  return {
    id: model.id,
    name: model.name,
    visible: model.visible,
    contextWindow: model.contextWindow,
    maxOutput: model.maxOutput,
    imageInput: model.imageInput,
    reasoning: model.reasoning,
    inputPrice: model.inputPrice,
    outputPrice: model.outputPrice,
    thinkingLevels: [...model.thinkingLevels],
    defaultThinkingLevel: model.defaultThinkingLevel,
  }
}

function draftFromProvider(provider: ProviderConfig): ProviderEditorDraft {
  return {
    id: provider.id,
    name: provider.name,
    visible: provider.visible,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    model: provider.model,
    models: provider.models.map(draftModel),
  }
}

function emptyDraft(): ProviderEditorDraft {
  return {
    id: '',
    name: '',
    visible: true,
    protocol: 'openai-responses',
    baseUrl: '',
    model: '',
    models: [],
  }
}

function defaultModel(id: string): ProviderEditorDraftModel {
  return {
    id,
    name: id,
    visible: true,
    contextWindow: 128_000,
    maxOutput: 8_192,
    imageInput: false,
    reasoning: false,
    inputPrice: 0,
    outputPrice: 0,
    thinkingLevels: ['off'],
    defaultThinkingLevel: 'off',
  }
}

function draftFromPreset(model: ProviderPresetModel): ProviderEditorDraftModel {
  return {
    id: model.id,
    name: model.name,
    visible: true,
    contextWindow: model.contextWindow,
    maxOutput: model.maxOutput,
    imageInput: model.imageInput,
    reasoning: model.reasoning,
    inputPrice: model.inputPrice,
    outputPrice: model.outputPrice,
    thinkingLevels: [...model.thinkingLevels],
    defaultThinkingLevel: model.defaultThinkingLevel,
  }
}

function toProviderInput(draft: ProviderEditorDraft): ProviderInput {
  return {
    id: draft.id,
    name: draft.name,
    visible: draft.visible,
    protocol: draft.protocol,
    baseUrl: draft.baseUrl,
    model: draft.model,
    models: draft.models.map((model) => ({
      id: model.id,
      name: model.name,
      visible: model.visible,
      contextWindow: model.contextWindow,
      maxOutput: model.maxOutput,
      imageInput: model.imageInput,
      reasoning: model.reasoning,
      inputPrice: model.inputPrice,
      outputPrice: model.outputPrice,
      thinkingLevels: [...model.thinkingLevels],
      defaultThinkingLevel: model.defaultThinkingLevel,
    })),
  }
}

function issuesForDraft(draft: ProviderEditorDraft): readonly ProviderEditorDraftIssue[] {
  const result = providerInputSchema.safeParse(toProviderInput(draft))
  if (result.success) return []
  return result.error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : 'provider',
    code: issue.code,
  }))
}

function dirtyPaths(baselineDraft: ProviderEditorDraft, draft: ProviderEditorDraft): readonly string[] {
  const dirty: string[] = []
  for (const field of providerFields) if (baselineDraft[field] !== draft[field]) dirty.push(field)
  if (baselineDraft.model !== draft.model) dirty.push('model')
  if (
    baselineDraft.models.map((model) => model.id).join('\u0000') !==
    draft.models.map((model) => model.id).join('\u0000')
  )
    dirty.push('models')
  const baselineModels = new Map(baselineDraft.models.map((model) => [model.id, model]))
  for (const model of draft.models) {
    const previous = baselineModels.get(model.id)
    if (!previous) continue
    for (const field of modelFields)
      if (JSON.stringify(previous[field]) !== JSON.stringify(model[field])) dirty.push(`models.${model.id}.${field}`)
  }
  return dirty
}

function selectedDraftModel(draft: ProviderEditorDraft, selectedModelId: string | null) {
  return (
    draft.models.find((model) => model.id === selectedModelId) ?? draft.models.find((model) => model.id === draft.model)
  )
}

function syncForm(editor: ProviderEditorState, draft: ProviderEditorDraft, selectedModelId: string | null): FormState {
  const model = selectedDraftModel(draft, selectedModelId)
  const projection: Readonly<Record<string, string | boolean>> = {
    id: draft.id,
    name: draft.name,
    protocol: draft.protocol,
    baseUrl: draft.baseUrl,
    model: draft.model,
    contextWindow: String(model?.contextWindow ?? 128_000),
    maxOutput: String(model?.maxOutput ?? 8_192),
    imageInput: model?.imageInput ?? false,
    reasoning: model?.reasoning ?? false,
    inputPrice: String(model?.inputPrice ?? 0),
    outputPrice: String(model?.outputPrice ?? 0),
  }
  let form = editor.form
  for (const field of editor.schema.fields) {
    if (field.readOnly || field.name === 'apiKey') continue
    const value = projection[field.name]
    if (value === undefined) continue
    if (form.draft[field.name] === value || form.raw[field.name] === String(value)) continue
    form = setField(editor.schema, form, field.name, value)
  }
  return form
}

function updateDraft(
  editor: ProviderEditorState,
  draft: ProviderEditorDraft,
  selectedModelId = editor.selectedModelId,
): ProviderEditorState {
  const selected = draft.models.some((model) => model.id === selectedModelId)
    ? selectedModelId
    : (draft.models.find((model) => model.id === draft.model)?.id ?? draft.models[0]?.id ?? null)
  return {
    ...editor,
    draft,
    draftDirty: dirtyPaths(editor.baselineDraft, draft),
    draftIssues: issuesForDraft(draft),
    selectedModelId: selected,
    form: syncForm(editor, draft, selected),
    error: null,
  }
}

function draftFromFlatForm(editor: ProviderEditorState, form: FormState): ProviderEditorDraft {
  const modelId = String(form.draft.model ?? editor.draft.model)
  const existing = editor.draft.models.find((model) => model.id === modelId)
  const model: ProviderEditorDraftModel = {
    ...(existing ?? defaultModel(modelId)),
    id: modelId,
    name: existing?.name ?? modelId,
    contextWindow: Number(form.draft.contextWindow ?? existing?.contextWindow ?? 128_000),
    maxOutput: Number(form.draft.maxOutput ?? existing?.maxOutput ?? 8_192),
    imageInput: Boolean(form.draft.imageInput ?? existing?.imageInput),
    reasoning: Boolean(form.draft.reasoning ?? existing?.reasoning),
    inputPrice: Number(form.draft.inputPrice ?? existing?.inputPrice ?? 0),
    outputPrice: Number(form.draft.outputPrice ?? existing?.outputPrice ?? 0),
  }
  const models = editor.draft.models.some((candidate) => candidate.id === modelId)
    ? editor.draft.models.map((candidate) => (candidate.id === modelId ? model : candidate))
    : [...editor.draft.models, model]
  return {
    ...editor.draft,
    id: String(form.draft.id ?? editor.draft.id),
    name: String(form.draft.name ?? editor.draft.name),
    protocol: (form.draft.protocol ?? editor.draft.protocol) as ProviderEditorDraft['protocol'],
    baseUrl: String(form.draft.baseUrl ?? editor.draft.baseUrl),
    model: modelId,
    models,
  }
}

function emptyPresets(): ProviderPresetCatalogState {
  return {
    status: 'idle',
    query: '',
    items: [],
    nextCursor: null,
    selectedPresetId: null,
    modelsQuery: '',
    models: [],
    modelsNextCursor: null,
    catalogGeneratedAt: null,
    error: null,
  }
}

function mergeById<Value extends { readonly id: string }>(left: readonly Value[], right: readonly Value[]): Value[] {
  const merged = new Map(left.map((item) => [item.id, item]))
  for (const item of right) merged.set(item.id, item)
  return [...merged.values()]
}

function profileMatches(profile: ProviderProfile | undefined, pending: PendingProviderSave): boolean {
  if (!profile) return false
  const expected = providerSchema.parse(pending.provider)
  return (
    JSON.stringify(profile.provider) === JSON.stringify(expected) &&
    (!pending.apiKeyPresent || profile.hasKey === Boolean(pending.apiKey))
  )
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
  let presetGeneration = 0

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
      const [description, rawProfiles] = await Promise.all([current.description ?? queryDescription(), queryProfiles()])
      const profiles = rawProfiles.map((profile) => ({ ...profile, provider: providerSchema.parse(profile.provider) }))
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
            modelCount: profile.provider.models.length,
            visible: profile.provider.visible,
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
    const normalizedProvider = profile ? providerSchema.parse(profile.provider) : null
    const initialDraft = normalizedProvider ? draftFromProvider(normalizedProvider) : emptyDraft()
    let nextEditor: ProviderEditorState = {
      editorId: panel.instanceId,
      providerId,
      description: loaded.description!,
      schema,
      form: createForm(schema, baseline(loaded.description!, profile ?? null)),
      draft: initialDraft,
      baselineDraft: initialDraft,
      draftDirty: [],
      draftIssues: issuesForDraft(initialDraft),
      selectedModelId: initialDraft.model || null,
      presets: emptyPresets(),
      original: normalizedProvider,
      hasKey: profile?.hasKey ?? false,
      sensitiveDirty: false,
      secretRevision: 0,
      secretResetRevision: 0,
      error: null,
    }
    nextEditor = updateDraft(nextEditor, initialDraft, nextEditor.selectedModelId)
    secretDrafts.delete(panel.instanceId)
    pending.delete(panel.instanceId)
    presetGeneration += 1
    replace({ ...state.reader.getSnapshot(), editor: nextEditor, error: null })
    return nextEditor
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
  const replaceDraft = (current: ProviderEditorState, draft: ProviderEditorDraft, selectedModelId?: string | null) => {
    const next = updateDraft(current, draft, selectedModelId === undefined ? current.selectedModelId : selectedModelId)
    replaceEditor(next)
    return next
  }
  const settleSuccess = (editorId: string, operation: PendingProviderSave, loaded: ProviderSettingsState) => {
    const current = editor(editorId)
    const profile = loaded.profiles[operation.provider.id]
    const saved = providerSchema.parse(profile?.provider ?? operation.provider)
    let form = settleSubmit(current.schema, current.form, operation.submission, 'succeeded')
    form = rebaseForm(
      current.schema,
      form,
      baseline(current.description, profile ?? { provider: saved, hasKey: false }),
    )
    const savedDraft = draftFromProvider(saved)
    const hasNewerDraft = JSON.stringify(current.draft) !== JSON.stringify(operation.draft)
    const nextDraft = hasNewerDraft ? current.draft : savedDraft
    const next: ProviderEditorState = {
      ...current,
      providerId: operation.provider.id,
      form,
      draft: nextDraft,
      baselineDraft: savedDraft,
      draftDirty: dirtyPaths(savedDraft, nextDraft),
      draftIssues: issuesForDraft(nextDraft),
      selectedModelId: nextDraft.models.some((model) => model.id === current.selectedModelId)
        ? current.selectedModelId
        : nextDraft.model || null,
      original: saved,
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
    const parsed = providerInputSchema.safeParse(toProviderInput(current.draft))
    if (!parsed.success) throw new CommandError('INVALID_INPUT', 'Resolve provider draft issues before saving')
    const begun = beginSubmit(current.schema, current.form)
    const operation: PendingProviderSave = {
      submission: begun.submission,
      provider: parsed.data,
      draft: current.draft,
      apiKeyPresent: current.sensitiveDirty,
      apiKey: current.sensitiveDirty ? (secretDrafts.get(editorId) ?? '') : undefined,
      secretRevision: current.secretRevision,
    }
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

  const loadPresets = async (
    editorId: string,
    input: { readonly query?: string; readonly cursor?: string; readonly append: boolean },
  ) => {
    const current = editor(editorId)
    const currentGeneration = ++presetGeneration
    replaceEditor({
      ...current,
      presets: { ...current.presets, status: 'loading', query: input.query ?? '', error: null },
    })
    try {
      const result = configurationCommands['provider.preset.list'].output.parse(
        await port().execute('provider.preset.list', {
          ...(input.query ? { query: input.query } : {}),
          ...(input.cursor ? { cursor: input.cursor } : {}),
          limit: 50,
        }),
      )
      if (currentGeneration !== presetGeneration)
        throw new CommandError('CONTENT_SUPERSEDED', 'Preset query was replaced')
      const latest = editor(editorId)
      replaceEditor({
        ...latest,
        presets: {
          ...latest.presets,
          status: 'ready',
          query: input.query ?? '',
          items: input.append ? mergeById(latest.presets.items, result.items) : result.items,
          nextCursor: result.nextCursor,
          catalogGeneratedAt: result.catalogGeneratedAt,
          error: null,
        },
      })
    } catch (error) {
      if (currentGeneration === presetGeneration) {
        const latest = editor(editorId)
        replaceEditor({ ...latest, presets: { ...latest.presets, status: 'error', error: errorCode(error) } })
      }
      throw error
    }
  }

  const loadPresetModels = async (
    editorId: string,
    input: { readonly presetId: string; readonly query?: string; readonly cursor?: string; readonly append: boolean },
  ) => {
    const current = editor(editorId)
    const currentGeneration = ++presetGeneration
    replaceEditor({
      ...current,
      presets: {
        ...current.presets,
        status: 'loading',
        selectedPresetId: input.presetId,
        modelsQuery: input.query ?? '',
        error: null,
      },
    })
    try {
      const result = configurationCommands['provider.preset.models'].output.parse(
        await port().execute('provider.preset.models', {
          presetId: input.presetId,
          ...(input.query ? { query: input.query } : {}),
          ...(input.cursor ? { cursor: input.cursor } : {}),
          limit: 100,
        }),
      )
      if (currentGeneration !== presetGeneration)
        throw new CommandError('CONTENT_SUPERSEDED', 'Preset model query was replaced')
      const latest = editor(editorId)
      replaceEditor({
        ...latest,
        presets: {
          ...latest.presets,
          status: 'ready',
          selectedPresetId: input.presetId,
          modelsQuery: input.query ?? '',
          models: input.append ? mergeById(latest.presets.models, result.items) : result.items,
          modelsNextCursor: result.nextCursor,
          catalogGeneratedAt: result.catalogGeneratedAt,
          error: null,
        },
      })
      return result
    } catch (error) {
      if (currentGeneration === presetGeneration) {
        const latest = editor(editorId)
        replaceEditor({ ...latest, presets: { ...latest.presets, status: 'error', error: errorCode(error) } })
      }
      throw error
    }
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
        replaceEditor({
          ...current,
          sensitiveDirty: true,
          secretRevision: current.secretRevision + 1,
          error: null,
        })
        return summary(state.reader.getSnapshot())
      }
      const form = setField(current.schema, current.form, field, value)
      replaceDraft(
        { ...current, form },
        draftFromFlatForm(current, form),
        String(form.draft.model ?? current.draft.model),
      )
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
        replaceEditor({
          ...current,
          sensitiveDirty: false,
          secretRevision: current.secretRevision + 1,
          secretResetRevision: current.secretResetRevision + 1,
          error: null,
        })
        return summary(state.reader.getSnapshot())
      }
      const form = resetField(current.schema, current.form, field)
      replaceDraft(
        { ...current, form },
        draftFromFlatForm(current, form),
        String(form.draft.model ?? current.draft.model),
      )
      return summary(state.reader.getSnapshot())
    } catch (error) {
      throw commandError(error)
    }
  })
  local.register(providerEditorCommands['providerEditor.setProviderField'], ({ editorId, field, value }) => {
    try {
      const current = editor(editorId)
      if (field === 'id' && current.providerId) throw new CommandError('FIELD_READ_ONLY', 'Provider id is immutable')
      if (field === 'visible') {
        if (typeof value !== 'boolean') throw new CommandError('INVALID_INPUT', 'Provider visibility must be boolean')
        replaceDraft(current, { ...current.draft, visible: value })
      } else {
        if (typeof value !== 'string') throw new CommandError('INVALID_INPUT', 'Provider field requires text')
        if (field === 'protocol' && !protocolValues.includes(value as (typeof protocolValues)[number]))
          throw new CommandError('INVALID_INPUT', 'Provider protocol is unsupported')
        replaceDraft(current, { ...current.draft, [field]: value })
      }
      return summary(state.reader.getSnapshot())
    } catch (error) {
      throw commandError(error)
    }
  })
  local.register(providerEditorCommands['providerEditor.selectModel'], ({ editorId, modelId }) => {
    try {
      const current = editor(editorId)
      if (!current.draft.models.some((model) => model.id === modelId))
        throw new CommandError('MODEL_NOT_FOUND', 'Provider draft model was not found')
      replaceEditor({ ...current, selectedModelId: modelId, form: syncForm(current, current.draft, modelId) })
      return summary(state.reader.getSnapshot())
    } catch (error) {
      throw commandError(error)
    }
  })
  local.register(providerEditorCommands['providerEditor.setDefaultModel'], ({ editorId, modelId }) => {
    try {
      const current = editor(editorId)
      if (!current.draft.models.some((model) => model.id === modelId))
        throw new CommandError('MODEL_NOT_FOUND', 'Provider draft model was not found')
      replaceDraft(current, { ...current.draft, model: modelId })
      return summary(state.reader.getSnapshot())
    } catch (error) {
      throw commandError(error)
    }
  })
  local.register(providerEditorCommands['providerEditor.addModel'], ({ editorId, modelId }) => {
    try {
      const current = editor(editorId)
      if (current.draft.models.length >= 256) throw new CommandError('INPUT_TOO_LARGE', 'Provider model limit reached')
      if (current.draft.models.some((model) => model.id === modelId))
        throw new CommandError('COMMAND_CONFLICT', 'Provider model id already exists')
      const model = defaultModel(modelId)
      replaceDraft(
        current,
        { ...current.draft, model: current.draft.model || modelId, models: [...current.draft.models, model] },
        modelId,
      )
      return summary(state.reader.getSnapshot())
    } catch (error) {
      throw commandError(error)
    }
  })
  local.register(providerEditorCommands['providerEditor.removeModel'], ({ editorId, modelId }) => {
    try {
      const current = editor(editorId)
      if (current.draft.models.length <= 1)
        throw new CommandError('INVALID_INPUT', 'A provider needs at least one model')
      if (!current.draft.models.some((model) => model.id === modelId))
        throw new CommandError('MODEL_NOT_FOUND', 'Provider draft model was not found')
      const models = current.draft.models.filter((model) => model.id !== modelId)
      const defaultModelId = current.draft.model === modelId ? models[0]!.id : current.draft.model
      replaceDraft(current, { ...current.draft, model: defaultModelId, models }, models[0]!.id)
      return summary(state.reader.getSnapshot())
    } catch (error) {
      throw commandError(error)
    }
  })
  local.register(providerEditorCommands['providerEditor.setModelField'], ({ editorId, modelId, field, value }) => {
    try {
      const current = editor(editorId)
      const existing = current.draft.models.find((model) => model.id === modelId)
      if (!existing) throw new CommandError('MODEL_NOT_FOUND', 'Provider draft model was not found')
      let nextId = modelId
      let replacement: ProviderEditorDraftModel
      if (field === 'id' || field === 'name' || field === 'defaultThinkingLevel') {
        if (typeof value !== 'string') throw new CommandError('INVALID_INPUT', 'Model field requires text')
        if (field === 'id') {
          if (!value) throw new CommandError('INVALID_INPUT', 'Model id is required')
          if (value !== modelId && current.draft.models.some((model) => model.id === value))
            throw new CommandError('COMMAND_CONFLICT', 'Provider model id already exists')
          nextId = value
        }
        if (field === 'defaultThinkingLevel' && !existing.thinkingLevels.includes(value as ThinkingLevel))
          throw new CommandError('INVALID_INPUT', 'Default thinking level is unavailable')
        replacement = { ...existing, [field]: value }
      } else if (field === 'visible' || field === 'imageInput' || field === 'reasoning') {
        if (typeof value !== 'boolean') throw new CommandError('INVALID_INPUT', 'Model field requires boolean')
        replacement = { ...existing, [field]: value }
      } else {
        if (typeof value !== 'number' || value < 0)
          throw new CommandError('INVALID_INPUT', 'Model numeric field is invalid')
        replacement = { ...existing, [field]: value }
      }
      const models = current.draft.models.map((model) => (model.id === modelId ? replacement : model))
      replaceDraft(
        current,
        { ...current.draft, model: current.draft.model === modelId ? nextId : current.draft.model, models },
        current.selectedModelId === modelId ? nextId : current.selectedModelId,
      )
      return summary(state.reader.getSnapshot())
    } catch (error) {
      throw commandError(error)
    }
  })
  local.register(
    providerEditorCommands['providerEditor.setModelThinkingLevels'],
    ({ editorId, modelId, thinkingLevels }) => {
      try {
        const current = editor(editorId)
        const existing = current.draft.models.find((model) => model.id === modelId)
        if (!existing) throw new CommandError('MODEL_NOT_FOUND', 'Provider draft model was not found')
        const levels = [...new Set(thinkingLevels)]
        const defaultThinkingLevel = levels.includes(existing.defaultThinkingLevel)
          ? existing.defaultThinkingLevel
          : (levels.find((level) => level !== 'off') ?? 'off')
        const replacement = {
          ...existing,
          thinkingLevels: levels,
          defaultThinkingLevel,
          reasoning: levels.some((level) => level !== 'off'),
        }
        replaceDraft(current, {
          ...current.draft,
          models: current.draft.models.map((model) => (model.id === modelId ? replacement : model)),
        })
        return summary(state.reader.getSnapshot())
      } catch (error) {
        throw commandError(error)
      }
    },
  )
  local.register(providerEditorCommands['providerEditor.resetDraft'], ({ editorId }) => {
    try {
      const current = editor(editorId)
      secretDrafts.delete(editorId)
      const next = updateDraft(
        {
          ...current,
          sensitiveDirty: false,
          secretRevision: current.secretRevision + 1,
          secretResetRevision: current.secretResetRevision + 1,
        },
        current.baselineDraft,
        current.baselineDraft.model || null,
      )
      replaceEditor(next)
      return summary(state.reader.getSnapshot())
    } catch (error) {
      throw commandError(error)
    }
  })
  local.register(providerEditorCommands['providerEditor.loadPresets'], async ({ editorId, query, cursor, append }) => {
    try {
      await loadPresets(editorId, { ...(query ? { query } : {}), ...(cursor ? { cursor } : {}), append })
      return summary(state.reader.getSnapshot())
    } catch (error) {
      throw commandError(error)
    }
  })
  local.register(providerEditorCommands['providerEditor.loadPresetModels'], async (input) => {
    try {
      await loadPresetModels(input.editorId, {
        presetId: input.presetId,
        ...(input.query ? { query: input.query } : {}),
        ...(input.cursor ? { cursor: input.cursor } : {}),
        append: input.append,
      })
      return summary(state.reader.getSnapshot())
    } catch (error) {
      throw commandError(error)
    }
  })
  local.register(providerEditorCommands['providerEditor.applyPreset'], async ({ editorId, presetId }) => {
    try {
      const current = editor(editorId)
      const preset = current.presets.items.find((item) => item.id === presetId)
      if (!preset) throw new CommandError('NOT_FOUND', 'Provider preset is unavailable')
      const result = await loadPresetModels(editorId, { presetId, append: false })
      const first = result.items[0]
      if (!first) throw new CommandError('NOT_FOUND', 'Provider preset has no compatible models')
      const latest = editor(editorId)
      const model = draftFromPreset(first)
      replaceDraft(
        latest,
        {
          id: latest.providerId ? latest.draft.id : preset.providerId,
          name: preset.name,
          visible: latest.draft.visible,
          protocol: preset.protocol,
          baseUrl: preset.baseUrl,
          model: model.id,
          models: [model],
        },
        model.id,
      )
      return summary(state.reader.getSnapshot())
    } catch (error) {
      throw commandError(error)
    }
  })
  local.register(providerEditorCommands['providerEditor.addPresetModel'], ({ editorId, presetId, modelId }) => {
    try {
      const current = editor(editorId)
      const preset = current.presets.items.find((item) => item.id === presetId)
      const model = current.presets.models.find((item) => item.id === modelId)
      if (!preset || current.presets.selectedPresetId !== presetId || !model)
        throw new CommandError('NOT_FOUND', 'Preset model is unavailable')
      if (preset.protocol !== current.draft.protocol || preset.baseUrl !== current.draft.baseUrl)
        throw new CommandError('INVALID_INPUT', 'Preset model does not match the provider transport')
      if (current.draft.models.some((item) => item.id === modelId))
        throw new CommandError('COMMAND_CONFLICT', 'Provider model id already exists')
      if (current.draft.models.length >= 256) throw new CommandError('INPUT_TOO_LARGE', 'Provider model limit reached')
      replaceDraft(current, { ...current.draft, models: [...current.draft.models, draftFromPreset(model)] }, model.id)
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
    if (!panel) return
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
      presetGeneration += 1
      pending.clear()
      secretDrafts.clear()
      state.dispose()
    },
  }
}
