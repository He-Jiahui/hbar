import { useEffect, useMemo, useState } from 'react'
import type { ProviderEditorState } from '@hbar/app-runtime'
import {
  LumenFrame,
  LumenOption,
  LumenText,
  LumenButton,
  LumenCheckBox,
  LumenComboBox,
  LumenDialog,
  LumenFormField,
  LumenIcon,
  LumenInput,
  LumenMultiSelect,
  LumenNavigationButton,
  LumenSelect,
  type LumenControlOption,
} from '@lumen/app-ui'
import { ArrowLeft, Check, EyeOff, Plus, RotateCcw, Trash2 } from 'lucide-react'

type ProviderField = 'id' | 'name' | 'visible' | 'protocol' | 'baseUrl'
type ThinkingLevel = ProviderEditorState['draft']['models'][number]['thinkingLevels'][number]
type ModelField =
  | 'id'
  | 'name'
  | 'visible'
  | 'contextWindow'
  | 'maxOutput'
  | 'imageInput'
  | 'reasoning'
  | 'inputPrice'
  | 'outputPrice'
  | 'defaultThinkingLevel'

export type HbarProviderEditorIntent =
  | { readonly kind: 'set-provider-field'; readonly field: ProviderField; readonly value: string | boolean }
  | { readonly kind: 'set-secret'; readonly value: string }
  | { readonly kind: 'reset-draft' }
  | { readonly kind: 'load-presets'; readonly query: string; readonly cursor?: string; readonly append: boolean }
  | { readonly kind: 'apply-preset'; readonly presetId: string }
  | {
      readonly kind: 'load-preset-models'
      readonly presetId: string
      readonly query: string
      readonly cursor?: string
      readonly append: boolean
    }
  | { readonly kind: 'add-preset-model'; readonly presetId: string; readonly modelId: string }
  | { readonly kind: 'add-model'; readonly modelId: string }
  | { readonly kind: 'select-model'; readonly modelId: string }
  | { readonly kind: 'set-default-model'; readonly modelId: string }
  | { readonly kind: 'remove-model'; readonly modelId: string }
  | {
      readonly kind: 'set-model-field'
      readonly modelId: string
      readonly field: ModelField
      readonly value: string | number | boolean
    }
  | {
      readonly kind: 'set-model-thinking-levels'
      readonly modelId: string
      readonly thinkingLevels: readonly ThinkingLevel[]
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
  readonly reset: string
  readonly cancel: string
  readonly saved: string
  readonly unsaved: (count: number) => string
  readonly configured: string
  readonly notConfigured: string
  readonly error: (code: string) => string
  readonly requiredIndicator: string
  readonly sections: {
    readonly preset: string
    readonly presetDescription: string
    readonly connection: string
    readonly connectionDescription: string
    readonly credentials: string
    readonly credentialsDescription: string
    readonly models: string
    readonly modelsDescription: string
    readonly modelDetails: string
    readonly modelDetailsDescription: string
  }
  readonly preset: {
    readonly label: string
    readonly placeholder: string
    readonly open: string
    readonly empty: string
    readonly loading: string
    readonly loadMore: string
    readonly detail: (protocol: string, baseUrl: string, modelCount: number) => string
  }
  readonly provider: {
    readonly id: string
    readonly idDescription: string
    readonly name: string
    readonly protocol: string
    readonly baseUrl: string
    readonly visible: string
    readonly visibleDescription: string
    readonly apiKey: string
    readonly apiKeyDescription: string
  }
  readonly models: {
    readonly empty: string
    readonly default: string
    readonly hidden: string
    readonly select: (name: string) => string
    readonly customId: string
    readonly customIdPlaceholder: string
    readonly addCustom: string
    readonly catalog: string
    readonly catalogPlaceholder: string
    readonly catalogOpen: string
    readonly catalogEmpty: string
    readonly catalogLoading: string
    readonly catalogLoadMore: string
    readonly catalogDetail: (contextWindow: number, maxOutput: number) => string
    readonly setDefault: string
    readonly remove: string
    readonly id: string
    readonly name: string
    readonly visible: string
    readonly visibleDescription: string
    readonly contextWindow: string
    readonly maxOutput: string
    readonly inputPrice: string
    readonly outputPrice: string
    readonly imageInput: string
    readonly imageInputDescription: string
    readonly reasoning: string
    readonly reasoningDescription: string
    readonly thinkingLevels: string
    readonly thinkingLevelsDescription: string
    readonly defaultThinkingLevel: string
    readonly removeThinkingLevel: (level: string) => string
  }
  readonly protocol: (protocol: ProviderEditorState['draft']['protocol']) => string
  readonly thinkingLevel: (level: ThinkingLevel) => string
  readonly validation: (path: string, code: string) => string
  readonly deleteConfirmTitle: (name: string) => string
  readonly deleteConfirmDescription: (name: string) => string
}

const thinkingLevels: readonly ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
const protocols: readonly ProviderEditorState['draft']['protocol'][] = [
  'openai-responses',
  'openai-completions',
  'anthropic-messages',
  'mock',
]

function SectionHeading({ title, description }: { readonly title: string; readonly description: string }) {
  return (
    <LumenFrame as="header" className="hbar-app-react-provider-section-heading">
      <LumenText as="h2">{title}</LumenText>
      <LumenText as="p">{description}</LumenText>
    </LumenFrame>
  )
}

function draftIssueProps(
  editor: ProviderEditorState,
  path: string,
  labels: HbarProviderDialogLabels,
): { readonly error?: string } {
  const issue = editor.draftIssues.find((candidate) => candidate.path === path)
  const touched =
    Boolean(editor.providerId) ||
    editor.draftDirty.includes(path) ||
    (path.startsWith('models.') && editor.draftDirty.includes('models'))
  if (!touched) return {}
  return issue ? { error: labels.validation(issue.path, issue.code) } : {}
}

function NumberInput({
  id,
  value,
  disabled,
  onCommit,
}: {
  readonly id: string
  readonly value: number
  readonly disabled: boolean
  readonly onCommit: (value: number) => void
}) {
  const [raw, setRaw] = useState(String(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setRaw(String(value))
  }, [focused, value])
  const commit = () => {
    setFocused(false)
    const numeric = Number(raw)
    if (raw.trim() && Number.isFinite(numeric)) onCommit(numeric)
    else setRaw(String(value))
  }
  return (
    <LumenInput
      id={id}
      type="number"
      value={raw}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onChange={(event) => setRaw(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setRaw(String(value))
          event.currentTarget.blur()
        }
      }}
    />
  )
}

function ProviderPresetPicker({
  editor,
  labels,
  disabled,
  onIntent,
}: {
  readonly editor: ProviderEditorState
  readonly labels: HbarProviderDialogLabels
  readonly disabled: boolean
  readonly onIntent: (intent: HbarProviderEditorIntent) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const presetRank = (name: string, providerId: string) => {
    const normalizedName = name.toLocaleLowerCase()
    const normalizedId = providerId.toLocaleLowerCase()
    if (!normalizedQuery) return 0
    if (normalizedName === normalizedQuery || normalizedId === normalizedQuery) return 0
    if (normalizedName.startsWith(normalizedQuery) || normalizedId.startsWith(normalizedQuery)) return 1
    if (normalizedName.includes(normalizedQuery) || normalizedId.includes(normalizedQuery)) return 2
    return 3
  }
  const options = editor.presets.items
    .map((preset) => ({ preset, rank: presetRank(preset.name, preset.providerId) }))
    .toSorted((left, right) => left.rank - right.rank || left.preset.name.localeCompare(right.preset.name))
    .map(({ preset }) => ({
      id: preset.id,
      label: preset.name,
      detail: labels.preset.detail(preset.protocol, preset.baseUrl, preset.modelCount),
    }))
  return (
    <LumenFrame as="section" className="hbar-app-react-provider-section">
      <SectionHeading title={labels.sections.preset} description={labels.sections.presetDescription} />
      <LumenFormField controlId="provider-preset" label={labels.preset.label}>
        <LumenComboBox
          id="provider-preset"
          value={editor.presets.selectedPresetId}
          query={query}
          open={open}
          options={options}
          labels={labels.preset}
          placeholder={labels.preset.placeholder}
          disabled={disabled}
          loading={editor.presets.status === 'loading'}
          {...(editor.presets.nextCursor
            ? {
                loadMoreLabel: labels.preset.loadMore,
                onLoadMore: () =>
                  onIntent({
                    kind: 'load-presets',
                    query,
                    cursor: editor.presets.nextCursor!,
                    append: true,
                  }),
              }
            : {})}
          onQueryChange={(value) => {
            setQuery(value)
            onIntent({ kind: 'load-presets', query: value, append: false })
          }}
          onOpenChange={setOpen}
          onValueChange={(presetId) => onIntent({ kind: 'apply-preset', presetId })}
        />
      </LumenFormField>
    </LumenFrame>
  )
}

function ProviderConnectionForm({
  editor,
  labels,
  disabled,
  onIntent,
}: {
  readonly editor: ProviderEditorState
  readonly labels: HbarProviderDialogLabels
  readonly disabled: boolean
  readonly onIntent: (intent: HbarProviderEditorIntent) => void
}) {
  const set = (field: ProviderField, value: string | boolean) => onIntent({ kind: 'set-provider-field', field, value })
  return (
    <LumenFrame as="section" className="hbar-app-react-provider-section">
      <SectionHeading title={labels.sections.connection} description={labels.sections.connectionDescription} />
      <LumenFrame className="hbar-app-react-provider-field-row">
        <LumenFormField
          controlId="provider-id"
          label={labels.provider.id}
          description={labels.provider.idDescription}
          required
          requiredIndicator={labels.requiredIndicator}
          {...draftIssueProps(editor, 'id', labels)}
        >
          <LumenInput
            id="provider-id"
            value={editor.draft.id}
            readOnly={Boolean(editor.providerId)}
            disabled={disabled}
            onChange={(event) => set('id', event.currentTarget.value)}
          />
        </LumenFormField>
        <LumenFormField
          controlId="provider-name"
          label={labels.provider.name}
          required
          requiredIndicator={labels.requiredIndicator}
          {...draftIssueProps(editor, 'name', labels)}
        >
          <LumenInput
            id="provider-name"
            value={editor.draft.name}
            disabled={disabled}
            onChange={(event) => set('name', event.currentTarget.value)}
          />
        </LumenFormField>
      </LumenFrame>
      <LumenFrame className="hbar-app-react-provider-field-row">
        <LumenFormField
          controlId="provider-protocol"
          label={labels.provider.protocol}
          required
          requiredIndicator={labels.requiredIndicator}
          {...draftIssueProps(editor, 'protocol', labels)}
        >
          <LumenSelect
            id="provider-protocol"
            value={editor.draft.protocol}
            disabled={disabled}
            onChange={(event) => set('protocol', event.currentTarget.value)}
          >
            {protocols.map((protocol) => (
              <LumenOption key={protocol} value={protocol}>
                {labels.protocol(protocol)}
              </LumenOption>
            ))}
          </LumenSelect>
        </LumenFormField>
        <LumenFormField
          controlId="provider-base-url"
          label={labels.provider.baseUrl}
          required
          requiredIndicator={labels.requiredIndicator}
          {...draftIssueProps(editor, 'baseUrl', labels)}
        >
          <LumenInput
            id="provider-base-url"
            type="url"
            value={editor.draft.baseUrl}
            disabled={disabled}
            onChange={(event) => set('baseUrl', event.currentTarget.value)}
          />
        </LumenFormField>
      </LumenFrame>
      <LumenCheckBox
        checked={editor.draft.visible}
        disabled={disabled}
        label={labels.provider.visible}
        description={labels.provider.visibleDescription}
        onChange={(event) => set('visible', event.currentTarget.checked)}
      />
    </LumenFrame>
  )
}

function ProviderCredentials({
  editor,
  labels,
  disabled,
  onIntent,
}: {
  readonly editor: ProviderEditorState
  readonly labels: HbarProviderDialogLabels
  readonly disabled: boolean
  readonly onIntent: (intent: HbarProviderEditorIntent) => void
}) {
  return (
    <LumenFrame as="section" className="hbar-app-react-provider-section">
      <SectionHeading title={labels.sections.credentials} description={labels.sections.credentialsDescription} />
      <LumenFormField
        controlId="provider-api-key"
        label={labels.provider.apiKey}
        description={labels.provider.apiKeyDescription}
        hint={editor.hasKey ? labels.configured : labels.notConfigured}
      >
        <LumenInput
          key={editor.secretResetRevision}
          id="provider-api-key"
          type="password"
          autoComplete="off"
          defaultValue=""
          disabled={disabled}
          onChange={(event) => onIntent({ kind: 'set-secret', value: event.currentTarget.value })}
        />
      </LumenFormField>
    </LumenFrame>
  )
}

function ModelCatalogPicker({
  editor,
  labels,
  disabled,
  onIntent,
}: {
  readonly editor: ProviderEditorState
  readonly labels: HbarProviderDialogLabels
  readonly disabled: boolean
  readonly onIntent: (intent: HbarProviderEditorIntent) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const presetId = editor.presets.selectedPresetId
  if (!presetId) return null
  const existing = new Set(editor.draft.models.map((model) => model.id))
  const options: readonly LumenControlOption[] = editor.presets.models.map((model) => ({
    id: model.id,
    label: model.name,
    detail: labels.models.catalogDetail(model.contextWindow, model.maxOutput),
    disabled: existing.has(model.id),
  }))
  return (
    <LumenFormField controlId="provider-model-catalog" label={labels.models.catalog}>
      <LumenComboBox
        id="provider-model-catalog"
        value={null}
        query={query}
        open={open}
        options={options}
        labels={{
          open: labels.models.catalogOpen,
          empty: labels.models.catalogEmpty,
          loading: labels.models.catalogLoading,
        }}
        placeholder={labels.models.catalogPlaceholder}
        disabled={disabled}
        loading={editor.presets.status === 'loading'}
        {...(editor.presets.modelsNextCursor
          ? {
              loadMoreLabel: labels.models.catalogLoadMore,
              onLoadMore: () =>
                onIntent({
                  kind: 'load-preset-models',
                  presetId,
                  query,
                  cursor: editor.presets.modelsNextCursor!,
                  append: true,
                }),
            }
          : {})}
        onQueryChange={(value) => {
          setQuery(value)
          onIntent({ kind: 'load-preset-models', presetId, query: value, append: false })
        }}
        onOpenChange={setOpen}
        onValueChange={(modelId) => {
          setQuery('')
          onIntent({ kind: 'add-preset-model', presetId, modelId })
        }}
      />
    </LumenFormField>
  )
}

function ModelList({
  editor,
  labels,
  disabled,
  onIntent,
}: {
  readonly editor: ProviderEditorState
  readonly labels: HbarProviderDialogLabels
  readonly disabled: boolean
  readonly onIntent: (intent: HbarProviderEditorIntent) => void
}) {
  const [customModelId, setCustomModelId] = useState('')
  const addCustom = () => {
    const modelId = customModelId.trim()
    if (!modelId) return
    onIntent({ kind: 'add-model', modelId })
    setCustomModelId('')
  }
  return (
    <LumenFrame as="aside" className="hbar-app-react-provider-model-list" aria-label={labels.sections.models}>
      <LumenFrame className="hbar-app-react-provider-model-list-items">
        {editor.draft.models.length === 0 ? (
          <LumenText as="p">{labels.models.empty}</LumenText>
        ) : (
          editor.draft.models.map((model) => (
            <LumenNavigationButton
              key={model.id}
              className="hbar-app-react-provider-model-row"
              selected={model.id === editor.selectedModelId}
              aria-label={labels.models.select(model.name)}
              disabled={disabled}
              onClick={() => onIntent({ kind: 'select-model', modelId: model.id })}
            >
              <LumenText as="span">
                <LumenText as="strong">{model.name}</LumenText>
                <LumenText as="small">{model.id}</LumenText>
              </LumenText>
              <LumenText as="span" className="hbar-app-react-provider-model-markers">
                {editor.draft.model === model.id && (
                  <LumenText as="span" title={labels.models.default} aria-label={labels.models.default}>
                    <LumenIcon icon={Check} tier="sm" />
                  </LumenText>
                )}
                {!model.visible && (
                  <LumenText as="span" title={labels.models.hidden} aria-label={labels.models.hidden}>
                    <LumenIcon icon={EyeOff} tier="sm" />
                  </LumenText>
                )}
              </LumenText>
            </LumenNavigationButton>
          ))
        )}
      </LumenFrame>
      <ModelCatalogPicker editor={editor} labels={labels} disabled={disabled} onIntent={onIntent} />
      <LumenFormField controlId="provider-custom-model" label={labels.models.customId}>
        <LumenFrame className="hbar-app-react-provider-inline-action">
          <LumenInput
            id="provider-custom-model"
            value={customModelId}
            placeholder={labels.models.customIdPlaceholder}
            disabled={disabled}
            onChange={(event) => setCustomModelId(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addCustom()
              }
            }}
          />
          <LumenButton
            aria-label={labels.models.addCustom}
            title={labels.models.addCustom}
            disabled={disabled || !customModelId.trim()}
            onClick={addCustom}
          >
            <LumenIcon icon={Plus} tier="sm" />
          </LumenButton>
        </LumenFrame>
      </LumenFormField>
    </LumenFrame>
  )
}

function ModelEditor({
  editor,
  labels,
  disabled,
  onIntent,
}: {
  readonly editor: ProviderEditorState
  readonly labels: HbarProviderDialogLabels
  readonly disabled: boolean
  readonly onIntent: (intent: HbarProviderEditorIntent) => void
}) {
  const [thinkingQuery, setThinkingQuery] = useState('')
  const [thinkingOpen, setThinkingOpen] = useState(false)
  const modelIndex = editor.draft.models.findIndex((model) => model.id === editor.selectedModelId)
  const model = editor.draft.models[modelIndex]
  if (!model)
    return (
      <LumenFrame className="hbar-app-react-provider-model-empty">
        <LumenText as="p">{labels.models.empty}</LumenText>
      </LumenFrame>
    )
  const set = (field: ModelField, value: string | number | boolean) =>
    onIntent({ kind: 'set-model-field', modelId: model.id, field, value })
  const path = (field: string) => `models.${modelIndex}.${field}`
  const levelOptions = thinkingLevels.map((level) => ({ id: level, label: labels.thinkingLevel(level) }))
  return (
    <LumenFrame className="hbar-app-react-provider-model-editor">
      <LumenFrame className="hbar-app-react-provider-model-actions">
        <LumenButton
          disabled={disabled || editor.draft.model === model.id}
          onClick={() => onIntent({ kind: 'set-default-model', modelId: model.id })}
        >
          <LumenIcon icon={Check} tier="sm" />
          {labels.models.setDefault}
        </LumenButton>
        <LumenButton
          tone="danger"
          disabled={disabled || editor.draft.models.length <= 1}
          onClick={() => onIntent({ kind: 'remove-model', modelId: model.id })}
        >
          <LumenIcon icon={Trash2} tier="sm" />
          {labels.models.remove}
        </LumenButton>
      </LumenFrame>
      <LumenFrame className="hbar-app-react-provider-field-row">
        <LumenFormField
          controlId="provider-model-id"
          label={labels.models.id}
          required
          requiredIndicator={labels.requiredIndicator}
          {...draftIssueProps(editor, path('id'), labels)}
        >
          <LumenInput
            id="provider-model-id"
            value={model.id}
            disabled={disabled}
            onChange={(event) => set('id', event.currentTarget.value)}
          />
        </LumenFormField>
        <LumenFormField
          controlId="provider-model-name"
          label={labels.models.name}
          required
          requiredIndicator={labels.requiredIndicator}
          {...draftIssueProps(editor, path('name'), labels)}
        >
          <LumenInput
            id="provider-model-name"
            value={model.name}
            disabled={disabled}
            onChange={(event) => set('name', event.currentTarget.value)}
          />
        </LumenFormField>
      </LumenFrame>
      <LumenCheckBox
        checked={model.visible}
        disabled={disabled}
        label={labels.models.visible}
        description={labels.models.visibleDescription}
        onChange={(event) => set('visible', event.currentTarget.checked)}
      />
      <LumenFrame className="hbar-app-react-provider-field-row">
        <LumenFormField
          controlId="provider-model-context"
          label={labels.models.contextWindow}
          required
          requiredIndicator={labels.requiredIndicator}
          {...draftIssueProps(editor, path('contextWindow'), labels)}
        >
          <NumberInput
            id="provider-model-context"
            value={model.contextWindow}
            disabled={disabled}
            onCommit={(value) => set('contextWindow', value)}
          />
        </LumenFormField>
        <LumenFormField
          controlId="provider-model-output"
          label={labels.models.maxOutput}
          required
          requiredIndicator={labels.requiredIndicator}
          {...draftIssueProps(editor, path('maxOutput'), labels)}
        >
          <NumberInput
            id="provider-model-output"
            value={model.maxOutput}
            disabled={disabled}
            onCommit={(value) => set('maxOutput', value)}
          />
        </LumenFormField>
      </LumenFrame>
      <LumenFrame className="hbar-app-react-provider-field-row">
        <LumenFormField
          controlId="provider-model-input-price"
          label={labels.models.inputPrice}
          {...draftIssueProps(editor, path('inputPrice'), labels)}
        >
          <NumberInput
            id="provider-model-input-price"
            value={model.inputPrice}
            disabled={disabled}
            onCommit={(value) => set('inputPrice', value)}
          />
        </LumenFormField>
        <LumenFormField
          controlId="provider-model-output-price"
          label={labels.models.outputPrice}
          {...draftIssueProps(editor, path('outputPrice'), labels)}
        >
          <NumberInput
            id="provider-model-output-price"
            value={model.outputPrice}
            disabled={disabled}
            onCommit={(value) => set('outputPrice', value)}
          />
        </LumenFormField>
      </LumenFrame>
      <LumenFrame className="hbar-app-react-provider-capabilities">
        <LumenCheckBox
          checked={model.imageInput}
          disabled={disabled}
          label={labels.models.imageInput}
          description={labels.models.imageInputDescription}
          onChange={(event) => set('imageInput', event.currentTarget.checked)}
        />
        <LumenCheckBox
          checked={model.reasoning}
          disabled={disabled}
          label={labels.models.reasoning}
          description={labels.models.reasoningDescription}
          onChange={(event) => set('reasoning', event.currentTarget.checked)}
        />
      </LumenFrame>
      <LumenFormField
        controlId="provider-model-thinking-levels"
        label={labels.models.thinkingLevels}
        description={labels.models.thinkingLevelsDescription}
        {...draftIssueProps(editor, path('thinkingLevels'), labels)}
      >
        <LumenMultiSelect
          id="provider-model-thinking-levels"
          values={model.thinkingLevels}
          query={thinkingQuery}
          open={thinkingOpen}
          options={levelOptions}
          labels={{
            open: labels.models.catalogOpen,
            empty: labels.models.catalogEmpty,
            loading: labels.models.catalogLoading,
            remove: labels.models.removeThinkingLevel,
          }}
          disabled={disabled}
          onQueryChange={setThinkingQuery}
          onOpenChange={setThinkingOpen}
          onValuesChange={(values) => {
            if (values.length > 0)
              onIntent({
                kind: 'set-model-thinking-levels',
                modelId: model.id,
                thinkingLevels: values as readonly ThinkingLevel[],
              })
          }}
        />
      </LumenFormField>
      <LumenFormField controlId="provider-model-default-thinking" label={labels.models.defaultThinkingLevel}>
        <LumenSelect
          id="provider-model-default-thinking"
          value={model.defaultThinkingLevel}
          disabled={disabled}
          onChange={(event) => set('defaultThinkingLevel', event.currentTarget.value)}
        >
          {model.thinkingLevels.map((level) => (
            <LumenOption key={level} value={level}>
              {labels.thinkingLevel(level)}
            </LumenOption>
          ))}
        </LumenSelect>
      </LumenFormField>
    </LumenFrame>
  )
}

function ProviderModels({
  editor,
  labels,
  disabled,
  onIntent,
}: {
  readonly editor: ProviderEditorState
  readonly labels: HbarProviderDialogLabels
  readonly disabled: boolean
  readonly onIntent: (intent: HbarProviderEditorIntent) => void
}) {
  return (
    <LumenFrame as="section" className="hbar-app-react-provider-section hbar-app-react-provider-model-section">
      <SectionHeading title={labels.sections.models} description={labels.sections.modelsDescription} />
      <LumenFrame className="hbar-app-react-provider-model-workspace">
        <ModelList editor={editor} labels={labels} disabled={disabled} onIntent={onIntent} />
        <LumenFrame as="section" className="hbar-app-react-provider-model-details" aria-label={labels.sections.modelDetails}>
          <SectionHeading title={labels.sections.modelDetails} description={labels.sections.modelDetailsDescription} />
          <ModelEditor editor={editor} labels={labels} disabled={disabled} onIntent={onIntent} />
        </LumenFrame>
      </LumenFrame>
    </LumenFrame>
  )
}

function sameEndpoint(left: string, right: string): boolean {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/\/+$/, '')
  return normalize(left) === normalize(right)
}

export function HbarProviderEditorView({
  editor,
  labels,
  connected,
  actionError,
  onBack,
  onSave,
  onReconcile,
  onRemove,
  onIntent,
}: {
  readonly editor: ProviderEditorState
  readonly labels: HbarProviderDialogLabels
  readonly connected: boolean
  readonly actionError: string | null
  readonly onBack: () => void
  readonly onSave: () => void
  readonly onReconcile: () => void
  readonly onRemove: () => void
  readonly onIntent: (intent: HbarProviderEditorIntent) => void
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const busy = editor.form.status === 'submitting'
  const unknown = editor.form.status === 'unknown'
  const disabled = !connected || busy || unknown
  const dirtyCount = editor.draftDirty.length + (editor.sensitiveDirty ? 1 : 0)
  const title = editor.providerId ? labels.editTitle(editor.draft.name || editor.providerId) : labels.addTitle
  const compatiblePreset = useMemo(
    () =>
      editor.presets.items.find(
        (preset) => preset.protocol === editor.draft.protocol && sameEndpoint(preset.baseUrl, editor.draft.baseUrl),
      ),
    [editor.draft.baseUrl, editor.draft.protocol, editor.presets.items],
  )
  useEffect(() => {
    if (editor.presets.status === 'idle')
      onIntent({ kind: 'load-presets', query: editor.providerId ?? '', append: false })
  }, [editor.editorId, editor.presets.status, editor.providerId, onIntent])
  useEffect(() => {
    if (editor.providerId && compatiblePreset && editor.presets.status === 'ready' && !editor.presets.selectedPresetId)
      onIntent({
        kind: 'load-preset-models',
        presetId: compatiblePreset.id,
        query: '',
        append: false,
      })
  }, [compatiblePreset, editor.presets.selectedPresetId, editor.presets.status, editor.providerId, onIntent])
  return (
    <LumenFrame as="section" className="hbar-app-react-provider-dialog" aria-label={title} aria-busy={busy}>
      <LumenFrame as="header" className="hbar-app-react-provider-page-header">
        <LumenButton className="hbar-app-react-provider-back" onClick={onBack}>
          <LumenIcon icon={ArrowLeft} tier="sm" />
          {labels.back}
        </LumenButton>
        <LumenFrame>
          <LumenText as="h1">{title}</LumenText>
          <LumenText as="p">{labels.description}</LumenText>
        </LumenFrame>
      </LumenFrame>
      <LumenFrame as="main">
        <LumenFrame className="hbar-app-react-provider-primary-column">
          {!editor.providerId && (
            <ProviderPresetPicker editor={editor} labels={labels} disabled={disabled} onIntent={onIntent} />
          )}
          <ProviderConnectionForm editor={editor} labels={labels} disabled={disabled} onIntent={onIntent} />
          <ProviderCredentials editor={editor} labels={labels} disabled={disabled} onIntent={onIntent} />
        </LumenFrame>
        <ProviderModels editor={editor} labels={labels} disabled={disabled} onIntent={onIntent} />
      </LumenFrame>
      {(actionError || editor.error) && (
        <LumenText as="p" className="hbar-app-react-provider-error" role="alert">
          {labels.error(actionError ?? editor.error ?? 'EXECUTION_FAILED')}
        </LumenText>
      )}
      <LumenFrame as="footer">
        <LumenText as="span" role="status">
          {editor.form.status === 'succeeded' && dirtyCount === 0
            ? labels.saved
            : dirtyCount > 0
              ? labels.unsaved(dirtyCount)
              : null}
        </LumenText>
        <LumenFrame>
          {dirtyCount > 0 && !unknown && (
            <LumenButton disabled={disabled} onClick={() => onIntent({ kind: 'reset-draft' })}>
              <LumenIcon icon={RotateCcw} tier="sm" />
              {labels.reset}
            </LumenButton>
          )}
          {editor.providerId && (
            <LumenButton tone="danger" disabled={disabled} onClick={() => setConfirmingDelete(true)}>
              <LumenIcon icon={Trash2} tier="sm" />
              {labels.remove}
            </LumenButton>
          )}
          {unknown ? (
            <LumenButton tone="warning" disabled={!connected} onClick={onReconcile}>
              {labels.reconcile}
            </LumenButton>
          ) : (
            <LumenButton
              tone="primary"
              disabled={!connected || busy || editor.draftIssues.length > 0 || dirtyCount === 0}
              onClick={onSave}
            >
              {labels.save}
            </LumenButton>
          )}
        </LumenFrame>
      </LumenFrame>
      <LumenDialog
        open={confirmingDelete}
        title={labels.deleteConfirmTitle(editor.draft.name || editor.draft.id)}
        closeLabel={labels.cancel}
        onClose={() => setConfirmingDelete(false)}
        footer={
          <>
            <LumenButton onClick={() => setConfirmingDelete(false)}>{labels.cancel}</LumenButton>
            <LumenButton
              tone="danger"
              onClick={() => {
                setConfirmingDelete(false)
                onRemove()
              }}
            >
              {labels.remove}
            </LumenButton>
          </>
        }
      >
        <LumenText as="p" className="hbar-app-react-provider-delete-copy">
          {labels.deleteConfirmDescription(editor.draft.name || editor.draft.id)}
        </LumenText>
      </LumenDialog>
    </LumenFrame>
  )
}
