import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ProviderEditorState } from '@hbar/app-runtime'
import {
  LumenContentText,
  LumenFrame,
  LumenButton,
  LumenComboBox,
  LumenFormField,
  LumenIcon,
  LumenInput,
  LumenNavigationButton,
  LumenPopupSelect,
  LumenToggle,
  LumenToggleGroup,
  type LumenControlOption,
} from '@lumen/app-ui'
import { Check, EyeOff, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { HbarLumenDisclosure } from './lumen-disclosure'
import { createMessageScope } from './messages'
import {
  HbarProviderContextRulesMessageScope,
  HbarProviderContextRulesView,
  type HbarProviderContextRulesLabels,
  type HbarProviderContextIntent,
} from './provider-context-rules'

type ProviderField = 'id' | 'name' | 'visible' | 'protocol' | 'baseUrl'
type ThinkingLevel = ProviderEditorState['draft']['models'][number]['thinkingLevels'][number]
type ModelField =
  | 'id'
  | 'name'
  | 'description'
  | 'visible'
  | 'contextWindow'
  | 'maxOutput'
  | 'imageInput'
  | 'reasoning'
  | 'inputPrice'
  | 'outputPrice'
  | 'defaultThinkingLevel'

export type HbarProviderEditorIntent =
  | HbarProviderContextIntent
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
  readonly contextPricing: HbarProviderContextRulesLabels
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
  readonly advancedConnection: string
  readonly advancedModel: string
  readonly advancedDescription: string
  readonly checkConfiguration: string
  readonly issues: (count: number) => string
  readonly validConfiguration: string
  readonly modelIssues: (name: string, count: number) => string
  readonly discardTitle: (name: string) => string
  readonly discardDescription: string
  readonly discardConfirm: string
  readonly keepEditing: string
  readonly saving: string
  readonly unknown: string
  readonly credentialUnconfirmed: string
  readonly sections: {
    readonly preset: string
    readonly presetDescription: string
    readonly presetEdit: string
    readonly presetEditDescription: string
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
    readonly readError: (code: string) => string
    readonly retry: string
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
    readonly catalogReadError: (code: string) => string
    readonly catalogRetry: string
    readonly catalogLoadMore: string
    readonly catalogDetail: (contextWindow: number, maxOutput: number) => string
    readonly setDefault: string
    readonly remove: string
    readonly id: string
    readonly name: string
    readonly description: string
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
    readonly thinkingLevelsSelectionHint: string
    readonly defaultThinkingLevel: string
    readonly defaultThinkingLevelDescription: string
    readonly removeThinkingLevel: (level: string) => string
  }
  readonly protocol: (protocol: ProviderEditorState['draft']['protocol']) => string
  readonly thinkingLevel: (level: ThinkingLevel) => string
  readonly validation: (path: string, code: string) => string
  readonly deleteConfirmTitle: (name: string) => string
  readonly deleteConfirmDescription: (name: string) => string
}

type ProviderEditorRootMessages = Pick<
  HbarProviderDialogLabels,
  | 'addTitle'
  | 'editTitle'
  | 'description'
  | 'back'
  | 'error'
  | 'saving'
  | 'credentialUnconfirmed'
  | 'unknown'
  | 'saved'
  | 'unsaved'
  | 'issues'
  | 'validConfiguration'
  | 'reset'
  | 'checkConfiguration'
  | 'cancel'
  | 'reconcile'
  | 'save'
>
type ProviderPresetMessages = Pick<HbarProviderDialogLabels, 'preset'> & {
  readonly sections: Pick<
    HbarProviderDialogLabels['sections'],
    'preset' | 'presetDescription' | 'presetEdit' | 'presetEditDescription'
  >
}
type ProviderConnectionMessages = Pick<
  HbarProviderDialogLabels,
  'protocol' | 'validation' | 'requiredIndicator' | 'advancedConnection'
> & {
  readonly provider: Pick<
    HbarProviderDialogLabels['provider'],
    'id' | 'idDescription' | 'name' | 'protocol' | 'baseUrl' | 'visible' | 'visibleDescription'
  >
  readonly sections: Pick<HbarProviderDialogLabels['sections'], 'connection' | 'connectionDescription'>
}
type ProviderCredentialMessages = Pick<HbarProviderDialogLabels, 'configured' | 'notConfigured'> & {
  readonly provider: Pick<HbarProviderDialogLabels['provider'], 'apiKey' | 'apiKeyDescription'>
  readonly sections: Pick<HbarProviderDialogLabels['sections'], 'credentials' | 'credentialsDescription'>
}
type ProviderCatalogMessages = Pick<
  HbarProviderDialogLabels['models'],
  | 'catalog'
  | 'catalogPlaceholder'
  | 'catalogOpen'
  | 'catalogEmpty'
  | 'catalogLoading'
  | 'catalogReadError'
  | 'catalogRetry'
  | 'catalogLoadMore'
  | 'catalogDetail'
>
type ProviderModelListMessages = Pick<
  HbarProviderDialogLabels['models'],
  'empty' | 'default' | 'hidden' | 'select' | 'customId' | 'customIdPlaceholder' | 'addCustom'
>
type ProviderModelEditorMessages = Pick<
  HbarProviderDialogLabels,
  'thinkingLevel' | 'validation' | 'requiredIndicator' | 'advancedModel' | 'advancedDescription'
>
type ProviderModelDetailMessages = Pick<
  HbarProviderDialogLabels['models'],
  | 'empty'
  | 'setDefault'
  | 'remove'
  | 'id'
  | 'name'
  | 'description'
  | 'visible'
  | 'visibleDescription'
  | 'contextWindow'
  | 'maxOutput'
  | 'inputPrice'
  | 'outputPrice'
  | 'imageInput'
  | 'imageInputDescription'
  | 'reasoning'
  | 'reasoningDescription'
  | 'thinkingLevels'
  | 'thinkingLevelsDescription'
  | 'thinkingLevelsSelectionHint'
  | 'defaultThinkingLevel'
  | 'defaultThinkingLevelDescription'
>
export interface HbarProviderEditorMessages {
  readonly root: ProviderEditorRootMessages
  readonly preset: ProviderPresetMessages
  readonly connection: ProviderConnectionMessages
  readonly credentials: ProviderCredentialMessages
  readonly catalog: ProviderCatalogMessages
  readonly modelList: ProviderModelListMessages
  readonly modelEditor: ProviderModelEditorMessages
  readonly modelDetails: ProviderModelDetailMessages
  readonly modelSection: Pick<
    HbarProviderDialogLabels['sections'],
    'models' | 'modelsDescription' | 'modelDetails' | 'modelDetailsDescription'
  >
  readonly contextPricing: HbarProviderContextRulesLabels
  readonly modelIssues: Pick<HbarProviderDialogLabels, 'modelIssues'>
}
export const HbarProviderEditorMessageScope = createMessageScope<HbarProviderEditorMessages>()

function providerEditorMessages(labels: HbarProviderDialogLabels): HbarProviderEditorMessages {
  return {
    root: {
      addTitle: labels.addTitle,
      editTitle: labels.editTitle,
      description: labels.description,
      back: labels.back,
      error: labels.error,
      saving: labels.saving,
      credentialUnconfirmed: labels.credentialUnconfirmed,
      unknown: labels.unknown,
      saved: labels.saved,
      unsaved: labels.unsaved,
      issues: labels.issues,
      validConfiguration: labels.validConfiguration,
      reset: labels.reset,
      checkConfiguration: labels.checkConfiguration,
      cancel: labels.cancel,
      reconcile: labels.reconcile,
      save: labels.save,
    },
    preset: {
      preset: labels.preset,
      sections: {
        preset: labels.sections.preset,
        presetDescription: labels.sections.presetDescription,
        presetEdit: labels.sections.presetEdit,
        presetEditDescription: labels.sections.presetEditDescription,
      },
    },
    connection: {
      provider: {
        id: labels.provider.id,
        idDescription: labels.provider.idDescription,
        name: labels.provider.name,
        protocol: labels.provider.protocol,
        baseUrl: labels.provider.baseUrl,
        visible: labels.provider.visible,
        visibleDescription: labels.provider.visibleDescription,
      },
      protocol: labels.protocol,
      validation: labels.validation,
      requiredIndicator: labels.requiredIndicator,
      advancedConnection: labels.advancedConnection,
      sections: {
        connection: labels.sections.connection,
        connectionDescription: labels.sections.connectionDescription,
      },
    },
    credentials: {
      configured: labels.configured,
      notConfigured: labels.notConfigured,
      provider: { apiKey: labels.provider.apiKey, apiKeyDescription: labels.provider.apiKeyDescription },
      sections: {
        credentials: labels.sections.credentials,
        credentialsDescription: labels.sections.credentialsDescription,
      },
    },
    catalog: {
      catalog: labels.models.catalog,
      catalogPlaceholder: labels.models.catalogPlaceholder,
      catalogOpen: labels.models.catalogOpen,
      catalogEmpty: labels.models.catalogEmpty,
      catalogLoading: labels.models.catalogLoading,
      catalogReadError: labels.models.catalogReadError,
      catalogRetry: labels.models.catalogRetry,
      catalogLoadMore: labels.models.catalogLoadMore,
      catalogDetail: labels.models.catalogDetail,
    },
    modelList: {
      empty: labels.models.empty,
      default: labels.models.default,
      hidden: labels.models.hidden,
      select: labels.models.select,
      customId: labels.models.customId,
      customIdPlaceholder: labels.models.customIdPlaceholder,
      addCustom: labels.models.addCustom,
    },
    modelEditor: {
      thinkingLevel: labels.thinkingLevel,
      validation: labels.validation,
      requiredIndicator: labels.requiredIndicator,
      advancedModel: labels.advancedModel,
      advancedDescription: labels.advancedDescription,
    },
    modelDetails: {
      empty: labels.models.empty,
      setDefault: labels.models.setDefault,
      remove: labels.models.remove,
      id: labels.models.id,
      name: labels.models.name,
      description: labels.models.description,
      visible: labels.models.visible,
      visibleDescription: labels.models.visibleDescription,
      contextWindow: labels.models.contextWindow,
      maxOutput: labels.models.maxOutput,
      inputPrice: labels.models.inputPrice,
      outputPrice: labels.models.outputPrice,
      imageInput: labels.models.imageInput,
      imageInputDescription: labels.models.imageInputDescription,
      reasoning: labels.models.reasoning,
      reasoningDescription: labels.models.reasoningDescription,
      thinkingLevels: labels.models.thinkingLevels,
      thinkingLevelsDescription: labels.models.thinkingLevelsDescription,
      thinkingLevelsSelectionHint: labels.models.thinkingLevelsSelectionHint,
      defaultThinkingLevel: labels.models.defaultThinkingLevel,
      defaultThinkingLevelDescription: labels.models.defaultThinkingLevelDescription,
    },
    modelSection: {
      models: labels.sections.models,
      modelsDescription: labels.sections.modelsDescription,
      modelDetails: labels.sections.modelDetails,
      modelDetailsDescription: labels.sections.modelDetailsDescription,
    },
    contextPricing: labels.contextPricing,
    modelIssues: { modelIssues: labels.modelIssues },
  }
}

export type HbarProviderCatalogReadIntent = Extract<
  HbarProviderEditorIntent,
  { readonly kind: 'load-presets' | 'apply-preset' | 'load-preset-models' }
>

export interface HbarProviderCatalogRead {
  readonly editorId: string
  readonly intent: HbarProviderCatalogReadIntent
  readonly status: 'loading' | 'error'
  readonly errorCode?: string
}

const thinkingLevels: readonly ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
const protocols: readonly ProviderEditorState['draft']['protocol'][] = [
  'openai-responses',
  'openai-completions',
  'anthropic-messages',
  'mock',
]

function isThinkingLevel(value: string): value is ThinkingLevel {
  return (thinkingLevels as readonly string[]).includes(value)
}

/** Keep the model's current default and at least one supported level intact. */
export function normalizeProviderThinkingLevels(
  values: readonly string[],
  defaultThinkingLevel: ThinkingLevel,
): readonly ThinkingLevel[] | null {
  const next = [...new Set(values.filter(isThinkingLevel))]
  if (next.length === 0 || !next.includes(defaultThinkingLevel)) return null
  return next
}

function AdvancedSection({
  label,
  description,
  forcedOpen,
  children,
}: {
  readonly label: string
  readonly description: string
  readonly forcedOpen: boolean
  readonly children: ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const open = expanded || forcedOpen
  useEffect(() => {
    // Resolving the final issue must not collapse the field while it is being edited.
    if (forcedOpen) setExpanded(true)
  }, [forcedOpen])
  return (
    <HbarLumenDisclosure
      className="hbar-provider-advanced"
      label={label}
      open={open}
      onOpenChange={(next) => {
        if (!forcedOpen) setExpanded(next)
      }}
    >
      <LumenFrame className="hbar-provider-advanced-content" hidden={!open}>
        <LumenContentText context="form.description">{description}</LumenContentText>
        {children}
      </LumenFrame>
    </HbarLumenDisclosure>
  )
}

function SectionHeading({ title, description }: { readonly title: string; readonly description: string }) {
  return (
    <LumenFrame as="header" className="hbar-app-react-provider-section-heading">
      <LumenContentText context="section.title">{title}</LumenContentText>
      <LumenContentText context="form.description">{description}</LumenContentText>
    </LumenFrame>
  )
}

function CatalogReadFeedback({
  read,
  targetId,
  labels,
  onRetry,
  focusTarget,
}: {
  readonly read: HbarProviderCatalogRead | null
  readonly targetId: string
  readonly labels: {
    readonly error: (code: string) => string
    readonly retry: string
    readonly loading: string
  }
  readonly onRetry: (editorId: string, intent: HbarProviderCatalogReadIntent) => Promise<boolean>
  readonly focusTarget: (targetId: string) => void
}) {
  if (!read) return null
  const loading = read.status === 'loading'
  return (
    <LumenFrame className="hbar-provider-catalog-recovery" aria-busy={loading}>
      <LumenContentText context="feedback.message" role={loading ? 'status' : 'alert'}>
        {loading ? labels.loading : labels.error(read.errorCode ?? 'EXECUTION_FAILED')}
      </LumenContentText>
      <LumenButton
        type="button"
        variant="outlined"
        aria-disabled={loading}
        onClick={() => {
          if (loading) return
          void onRetry(read.editorId, read.intent)
            .then((recovered) => {
              if (recovered) focusTarget(targetId)
            })
            .catch(() => undefined)
        }}
      >
        {labels.retry}
      </LumenButton>
    </LumenFrame>
  )
}

function draftIssueProps(
  editor: ProviderEditorState,
  path: string,
  validation: HbarProviderDialogLabels['validation'],
): { readonly error?: string } {
  const issue = editor.draftIssues.find((candidate) => candidate.path === path)
  const touched =
    Boolean(editor.providerId) ||
    editor.draftDirty.includes(path) ||
    (path.startsWith('models.') && editor.draftDirty.includes('models'))
  if (!touched) return {}
  return issue ? { error: validation(issue.path, issue.code) } : {}
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
  const rawRef = useRef(raw)
  const committed = useRef(value)
  useEffect(() => {
    if (!focused) {
      setRaw(String(value))
      rawRef.current = String(value)
      committed.current = value
    }
  }, [focused, value])
  const commit = () => {
    setFocused(false)
    const numeric = Number(rawRef.current)
    if (rawRef.current.trim() && Number.isFinite(numeric)) {
      if (numeric !== committed.current) onCommit(numeric)
      committed.current = numeric
    } else setRaw(String(value))
  }
  return (
    <LumenInput
      id={id}
      type="number"
      value={raw}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onChange={(event) => {
        const next = event.currentTarget.value
        rawRef.current = next
        setRaw(next)
        // Commit complete numeric edits immediately, so switching models or
        // collapsing advanced fields cannot move an unblurred value to another model.
        const numeric = Number(next)
        if (next.trim() && Number.isFinite(numeric)) {
          committed.current = numeric
          onCommit(numeric)
        }
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setRaw(String(value))
          rawRef.current = String(value)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

function ProviderPresetPicker({
  editor,
  disabled,
  mode,
  catalogRead,
  onRetryCatalog,
  focusCatalogTarget,
  onIntent,
}: {
  readonly editor: ProviderEditorState
  readonly disabled: boolean
  readonly mode: 'create' | 'edit'
  readonly catalogRead: HbarProviderCatalogRead | null
  readonly onRetryCatalog: (editorId: string, intent: HbarProviderCatalogReadIntent) => Promise<boolean>
  readonly focusCatalogTarget: (targetId: string) => void
  readonly onIntent: (intent: HbarProviderEditorIntent) => void
}) {
  const { t } = HbarProviderEditorMessageScope.useMessages()
  const messages = t('preset')
  const labels = { preset: messages.preset, sections: messages.sections }
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
  const fieldRead =
    catalogRead?.editorId === editor.editorId && catalogRead.intent.kind === 'load-presets' ? catalogRead : null
  useEffect(() => {
    if (fieldRead?.status === 'error') setOpen(false)
  }, [fieldRead?.status])
  return (
    <LumenFrame as="section" className="hbar-app-react-provider-section">
      <SectionHeading
        title={mode === 'edit' ? labels.sections.presetEdit : labels.sections.preset}
        description={mode === 'edit' ? labels.sections.presetEditDescription : labels.sections.presetDescription}
      />
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
          onValueChange={(presetId) =>
            onIntent(
              mode === 'create'
                ? { kind: 'apply-preset', presetId }
                : { kind: 'load-preset-models', presetId, query: '', append: false },
            )
          }
        />
        <CatalogReadFeedback
          read={fieldRead}
          targetId="provider-preset"
          labels={{ error: labels.preset.readError, retry: labels.preset.retry, loading: labels.preset.loading }}
          onRetry={onRetryCatalog}
          focusTarget={focusCatalogTarget}
        />
      </LumenFormField>
    </LumenFrame>
  )
}

function ProviderConnectionForm({
  editor,
  disabled,
  onIntent,
}: {
  readonly editor: ProviderEditorState
  readonly disabled: boolean
  readonly onIntent: (intent: HbarProviderEditorIntent) => void
}) {
  const { t } = HbarProviderEditorMessageScope.useMessages()
  const labels = t('connection')
  const set = (field: ProviderField, value: string | boolean) => onIntent({ kind: 'set-provider-field', field, value })
  return (
    <LumenFrame as="section" className="hbar-app-react-provider-section">
      <SectionHeading title={labels.sections.connection} description={labels.sections.connectionDescription} />
      <LumenFrame className="hbar-app-react-provider-field-row">
        {!editor.providerId && (
          <LumenFormField
            controlId="provider-id"
            label={labels.provider.id}
            description={labels.provider.idDescription}
            descriptionPlacement="after-control"
            required
            requiredIndicator={labels.requiredIndicator}
            {...draftIssueProps(editor, 'id', labels.validation)}
          >
            <LumenInput
              id="provider-id"
              value={editor.draft.id}
              readOnly={Boolean(editor.providerId)}
              disabled={disabled}
              onChange={(event) => set('id', event.currentTarget.value)}
            />
          </LumenFormField>
        )}
        <LumenFormField
          controlId="provider-name"
          label={labels.provider.name}
          descriptionPlacement="after-control"
          required
          requiredIndicator={labels.requiredIndicator}
          {...draftIssueProps(editor, 'name', labels.validation)}
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
          {...draftIssueProps(editor, 'protocol', labels.validation)}
        >
          <LumenPopupSelect
            id="provider-protocol"
            value={editor.draft.protocol}
            options={protocols.map((protocol) => ({ id: protocol, label: labels.protocol(protocol) }))}
            disabled={disabled}
            onValueChange={(value) => set('protocol', value)}
          />
        </LumenFormField>
        <LumenFormField
          controlId="provider-base-url"
          label={labels.provider.baseUrl}
          required
          requiredIndicator={labels.requiredIndicator}
          {...draftIssueProps(editor, 'baseUrl', labels.validation)}
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
      {editor.providerId && (
        <LumenContentText context="form.description" className="hbar-provider-identity">
          <LumenContentText context="message.inline">{labels.provider.id}</LumenContentText>
          <LumenContentText context="message.inline">{editor.providerId}</LumenContentText>
        </LumenContentText>
      )}
      <AdvancedSection
        label={labels.advancedConnection}
        description={labels.provider.visibleDescription}
        forcedOpen={false}
      >
        <LumenToggle
          checked={editor.draft.visible}
          disabled={disabled}
          label={labels.provider.visible}
          description={labels.provider.visibleDescription}
          onChange={(event) => set('visible', event.currentTarget.checked)}
        />
      </AdvancedSection>
    </LumenFrame>
  )
}

function ProviderCredentials({
  editor,
  disabled,
  onIntent,
}: {
  readonly editor: ProviderEditorState
  readonly disabled: boolean
  readonly onIntent: (intent: HbarProviderEditorIntent) => void
}) {
  const { t } = HbarProviderEditorMessageScope.useMessages()
  const labels = t('credentials')
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
  disabled,
  catalogRead,
  onRetryCatalog,
  focusCatalogTarget,
  onIntent,
}: {
  readonly editor: ProviderEditorState
  readonly disabled: boolean
  readonly catalogRead: HbarProviderCatalogRead | null
  readonly onRetryCatalog: (editorId: string, intent: HbarProviderCatalogReadIntent) => Promise<boolean>
  readonly focusCatalogTarget: (targetId: string) => void
  readonly onIntent: (intent: HbarProviderEditorIntent) => void
}) {
  const { t } = HbarProviderEditorMessageScope.useMessages()
  const labels = { models: t('catalog') }
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const presetId = editor.presets.selectedPresetId
  const fieldRead =
    presetId &&
    catalogRead?.editorId === editor.editorId &&
    ((catalogRead.intent.kind === 'apply-preset' && catalogRead.intent.presetId === presetId) ||
      (catalogRead.intent.kind === 'load-preset-models' && catalogRead.intent.presetId === presetId))
      ? catalogRead
      : null
  useEffect(() => {
    if (fieldRead?.status === 'error') setOpen(false)
  }, [fieldRead?.status])
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
      <CatalogReadFeedback
        read={fieldRead}
        targetId="provider-model-catalog"
        labels={{
          error: labels.models.catalogReadError,
          retry: labels.models.catalogRetry,
          loading: labels.models.catalogLoading,
        }}
        onRetry={onRetryCatalog}
        focusTarget={focusCatalogTarget}
      />
    </LumenFormField>
  )
}

function ModelList({
  editor,
  disabled,
  catalogRead,
  onRetryCatalog,
  focusCatalogTarget,
  onIntent,
}: {
  readonly editor: ProviderEditorState
  readonly disabled: boolean
  readonly catalogRead: HbarProviderCatalogRead | null
  readonly onRetryCatalog: (editorId: string, intent: HbarProviderCatalogReadIntent) => Promise<boolean>
  readonly focusCatalogTarget: (targetId: string) => void
  readonly onIntent: (intent: HbarProviderEditorIntent) => void
}) {
  const { t } = HbarProviderEditorMessageScope.useMessages()
  const labels = { sections: t('modelSection'), models: t('modelList'), ...t('modelIssues') }
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
          <LumenContentText context="form.description">{labels.models.empty}</LumenContentText>
        ) : (
          editor.draft.models.map((model, index) => (
            <LumenNavigationButton
              key={model.id}
              className="hbar-app-react-provider-model-row"
              selected={model.id === editor.selectedModelId}
              aria-label={labels.models.select(model.name)}
              disabled={disabled}
              onClick={() => onIntent({ kind: 'select-model', modelId: model.id })}
            >
              <LumenContentText context="control.label">
                <LumenContentText context="choice.title" title={model.name}>
                  {model.name}
                </LumenContentText>
                <LumenContentText context="choice.description" title={model.id}>
                  {model.id}
                </LumenContentText>
                {editor.draftIssues.some((issue) => issue.path.startsWith(`models.${index}.`)) && (
                  <LumenContentText context="choice.description" className="hbar-provider-model-error">
                    {labels.modelIssues(
                      model.name,
                      editor.draftIssues.filter((issue) => issue.path.startsWith(`models.${index}.`)).length,
                    )}
                  </LumenContentText>
                )}
              </LumenContentText>
              <LumenContentText context="control.label" className="hbar-app-react-provider-model-markers">
                {editor.draft.model === model.id && (
                  <LumenContentText
                    context="control.label"
                    title={labels.models.default}
                    aria-label={labels.models.default}
                  >
                    <LumenIcon icon={Check} tier="sm" />
                  </LumenContentText>
                )}
                {!model.visible && (
                  <LumenContentText
                    context="control.label"
                    title={labels.models.hidden}
                    aria-label={labels.models.hidden}
                  >
                    <LumenIcon icon={EyeOff} tier="sm" />
                  </LumenContentText>
                )}
              </LumenContentText>
            </LumenNavigationButton>
          ))
        )}
      </LumenFrame>
      <ModelCatalogPicker
        editor={editor}
        disabled={disabled}
        catalogRead={catalogRead}
        onRetryCatalog={onRetryCatalog}
        focusCatalogTarget={focusCatalogTarget}
        onIntent={onIntent}
      />
      <LumenFormField
        controlId="provider-custom-model"
        label={labels.models.customId}
        className="hbar-provider-custom-model-field"
      >
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
  disabled,
  onIntent,
}: {
  readonly editor: ProviderEditorState
  readonly disabled: boolean
  readonly onIntent: (intent: HbarProviderEditorIntent) => void
}) {
  const { t } = HbarProviderEditorMessageScope.useMessages()
  const labels = {
    ...t('modelEditor'),
    models: t('modelDetails'),
    contextPricing: t('contextPricing'),
  }
  const modelIndex = editor.draft.models.findIndex((model) => model.id === editor.selectedModelId)
  const model = editor.draft.models[modelIndex]
  if (!model)
    return (
      <LumenFrame className="hbar-app-react-provider-model-empty">
        <LumenContentText context="form.description">{labels.models.empty}</LumenContentText>
      </LumenFrame>
    )
  const set = (field: ModelField, value: string | number | boolean) =>
    onIntent({ kind: 'set-model-field', modelId: model.id, field, value })
  const path = (field: string) => `models.${modelIndex}.${field}`
  const levelOptions = thinkingLevels.map((level) => ({
    id: level,
    label: labels.thinkingLevel(level),
    disabled:
      model.thinkingLevels.includes(level) &&
      (model.thinkingLevels.length <= 1 || level === model.defaultThinkingLevel),
  }))
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
          descriptionPlacement="after-control"
          required
          requiredIndicator={labels.requiredIndicator}
          {...draftIssueProps(editor, path('id'), labels.validation)}
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
          descriptionPlacement="after-control"
          required
          requiredIndicator={labels.requiredIndicator}
          {...draftIssueProps(editor, path('name'), labels.validation)}
        >
          <LumenInput
            id="provider-model-name"
            value={model.name}
            disabled={disabled}
            onChange={(event) => set('name', event.currentTarget.value)}
          />
        </LumenFormField>
      </LumenFrame>
      <LumenFormField
        controlId="provider-model-description"
        label={labels.models.description}
        {...draftIssueProps(editor, path('description'), labels.validation)}
      >
        <LumenInput
          id="provider-model-description"
          value={model.description ?? ''}
          disabled={disabled}
          onChange={(event) => set('description', event.currentTarget.value)}
        />
      </LumenFormField>
      <HbarProviderContextRulesMessageScope.Provider messages={labels.contextPricing}>
        <HbarProviderContextRulesView
          key={`${editor.editorId}:${model.id}`}
          editor={editor}
          disabled={disabled}
          onIntent={onIntent}
        />
      </HbarProviderContextRulesMessageScope.Provider>
      <AdvancedSection
        label={labels.advancedModel}
        description={labels.advancedDescription}
        forcedOpen={editor.draftIssues.some(
          (issue) =>
            issue.path.startsWith(`models.${modelIndex}.`) &&
            !['id', 'name'].includes(issue.path.split('.').at(-1) ?? ''),
        )}
      >
        <LumenToggle
          checked={model.visible}
          disabled={disabled}
          label={labels.models.visible}
          description={labels.models.visibleDescription}
          onChange={(event) => set('visible', event.currentTarget.checked)}
        />
        <LumenFrame className="hbar-app-react-provider-field-row">
          {!editor.description.contextPricing && (
            <LumenFormField
              controlId="provider-model-context"
              label={labels.models.contextWindow}
              required
              requiredIndicator={labels.requiredIndicator}
              {...draftIssueProps(editor, path('contextWindow'), labels.validation)}
            >
              <NumberInput
                id="provider-model-context"
                value={model.contextWindow}
                disabled={disabled}
                onCommit={(value) => set('contextWindow', value)}
              />
            </LumenFormField>
          )}
          <LumenFormField
            controlId="provider-model-output"
            label={labels.models.maxOutput}
            required
            requiredIndicator={labels.requiredIndicator}
            {...draftIssueProps(editor, path('maxOutput'), labels.validation)}
          >
            <NumberInput
              id="provider-model-output"
              value={model.maxOutput}
              disabled={disabled}
              onCommit={(value) => set('maxOutput', value)}
            />
          </LumenFormField>
        </LumenFrame>
        {!editor.description.contextPricing && (
          <LumenFrame className="hbar-app-react-provider-field-row">
            <LumenFormField
              controlId="provider-model-input-price"
              label={labels.models.inputPrice}
              {...draftIssueProps(editor, path('inputPrice'), labels.validation)}
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
              {...draftIssueProps(editor, path('outputPrice'), labels.validation)}
            >
              <NumberInput
                id="provider-model-output-price"
                value={model.outputPrice}
                disabled={disabled}
                onCommit={(value) => set('outputPrice', value)}
              />
            </LumenFormField>
          </LumenFrame>
        )}
        <LumenFrame className="hbar-app-react-provider-capabilities">
          <LumenToggle
            checked={model.imageInput}
            disabled={disabled}
            label={labels.models.imageInput}
            description={labels.models.imageInputDescription}
            onChange={(event) => set('imageInput', event.currentTarget.checked)}
          />
          <LumenToggle
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
          {...draftIssueProps(editor, path('thinkingLevels'), labels.validation)}
        >
          <LumenToggleGroup
            id="provider-model-thinking-levels"
            type="multiple"
            label={labels.models.thinkingLevels}
            values={model.thinkingLevels}
            options={levelOptions}
            disabled={disabled}
            onValuesChange={(values) => {
              const next = normalizeProviderThinkingLevels(values, model.defaultThinkingLevel)
              if (next)
                onIntent({
                  kind: 'set-model-thinking-levels',
                  modelId: model.id,
                  thinkingLevels: next,
                })
            }}
          />
          <LumenContentText context="form.description" className="hbar-provider-thinking-levels-hint">
            {labels.models.thinkingLevelsSelectionHint}
          </LumenContentText>
        </LumenFormField>
        <LumenFormField
          controlId="provider-model-default-thinking"
          label={labels.models.defaultThinkingLevel}
          description={labels.models.defaultThinkingLevelDescription}
          descriptionPlacement="after-control"
        >
          <LumenToggleGroup
            id="provider-model-default-thinking"
            type="single"
            label={labels.models.defaultThinkingLevel}
            value={model.defaultThinkingLevel}
            options={model.thinkingLevels.map((level) => ({ id: level, label: labels.thinkingLevel(level) }))}
            disabled={disabled}
            onValueChange={(value) => {
              if (isThinkingLevel(value) && model.thinkingLevels.includes(value)) set('defaultThinkingLevel', value)
            }}
          />
        </LumenFormField>
      </AdvancedSection>
    </LumenFrame>
  )
}

function ProviderModels({
  editor,
  disabled,
  catalogRead,
  onRetryCatalog,
  focusCatalogTarget,
  onIntent,
}: {
  readonly editor: ProviderEditorState
  readonly disabled: boolean
  readonly catalogRead: HbarProviderCatalogRead | null
  readonly onRetryCatalog: (editorId: string, intent: HbarProviderCatalogReadIntent) => Promise<boolean>
  readonly focusCatalogTarget: (targetId: string) => void
  readonly onIntent: (intent: HbarProviderEditorIntent) => void
}) {
  const { t } = HbarProviderEditorMessageScope.useMessages()
  const labels = { sections: t('modelSection') }
  return (
    <LumenFrame as="section" className="hbar-app-react-provider-section hbar-app-react-provider-model-section">
      <SectionHeading title={labels.sections.models} description={labels.sections.modelsDescription} />
      <LumenFrame className="hbar-app-react-provider-model-workspace">
        <ModelList
          editor={editor}
          disabled={disabled}
          catalogRead={catalogRead}
          onRetryCatalog={onRetryCatalog}
          focusCatalogTarget={focusCatalogTarget}
          onIntent={onIntent}
        />
        <LumenFrame
          as="section"
          className="hbar-app-react-provider-model-details"
          aria-label={labels.sections.modelDetails}
        >
          <SectionHeading title={labels.sections.modelDetails} description={labels.sections.modelDetailsDescription} />
          <ModelEditor
            key={editor.draft.models.findIndex((model) => model.id === editor.selectedModelId)}
            editor={editor}
            disabled={disabled}
            onIntent={onIntent}
          />
        </LumenFrame>
      </LumenFrame>
    </LumenFrame>
  )
}

function HbarProviderEditorViewContent({
  editor,
  connected,
  actionError,
  catalogRead,
  onBack,
  onSave,
  onReconcile,
  onRetryCatalog,
  onIntent,
}: {
  readonly editor: ProviderEditorState
  readonly connected: boolean
  readonly actionError: string | null
  readonly catalogRead: HbarProviderCatalogRead | null
  readonly onBack: () => void
  readonly onSave: () => void
  readonly onReconcile: () => void
  readonly onRetryCatalog: (editorId: string, intent: HbarProviderCatalogReadIntent) => Promise<boolean>
  readonly onIntent: (intent: HbarProviderEditorIntent) => void
}) {
  const { t } = HbarProviderEditorMessageScope.useMessages()
  const labels = t('root')
  const container = useRef<HTMLElement>(null)
  const focusCatalogTarget = useCallback(
    (targetId: string) => {
      const root = container.current
      if (root?.dataset.providerEditorId !== editor.editorId) return
      root.querySelector<HTMLElement>(`#${targetId}`)?.focus()
    },
    [editor.editorId],
  )
  const [checked, setChecked] = useState(false)
  const focusPath = useRef<string | null>(null)
  const [focusRequest, setFocusRequest] = useState(0)
  const busy = editor.form.status === 'submitting'
  const unknown = editor.form.status === 'unknown'
  const disabled = !connected || busy || unknown
  const displayedError = actionError ?? editor.error
  const dirtyCount = editor.draftDirty.length + (editor.sensitiveDirty ? 1 : 0)
  const title = editor.providerId ? labels.editTitle(editor.draft.name || editor.providerId) : labels.addTitle
  const showIssues = checked || editor.draftDirty.length > 0 || Boolean(editor.providerId)
  // Presentation-only touched paths reveal local schema errors after an explicit check;
  // the runtime remains the owner of draft values, dirty state, and validation facts.
  const validatedEditor = checked
    ? { ...editor, draftDirty: [...editor.draftDirty, ...editor.draftIssues.map((issue) => issue.path)] }
    : editor
  const checkConfiguration = () => {
    setChecked(true)
    const issue = editor.draftIssues[0]
    if (!issue) return
    const match = /^models\.(\d+)\.(.+)$/.exec(issue.path)
    const model = match ? editor.draft.models[Number(match[1])] : undefined
    if (model) onIntent({ kind: 'select-model', modelId: model.id })
    focusPath.current = issue.path
    setFocusRequest((value) => value + 1)
  }
  useEffect(() => {
    const target = focusPath.current
    if (!target) return
    const match = /^models\.(\d+)\.(.+)$/.exec(target)
    if (match && editor.draft.models[Number(match[1])]?.id !== editor.selectedModelId) return
    const ids: Readonly<Record<string, string>> = {
      id: 'provider-id',
      name: 'provider-name',
      protocol: 'provider-protocol',
      baseUrl: 'provider-base-url',
      models: 'provider-custom-model',
      model: 'provider-custom-model',
      provider: 'provider-name',
      'model.id': 'provider-model-id',
      'model.name': 'provider-model-name',
      'model.contextWindow': 'provider-model-context',
      'model.maxOutput': 'provider-model-output',
      'model.inputPrice': 'provider-model-input-price',
      'model.outputPrice': 'provider-model-output-price',
      'model.thinkingLevels': 'provider-model-thinking-levels',
      'model.defaultThinkingLevel': 'provider-model-default-thinking',
    }
    const id = ids[match ? `model.${match[2]}` : target]
    const tierMatch = match ? /^contextTiers\.(\d+)\.(\w+)$/.exec(match[2] ?? '') : null
    const activeModel = match ? editor.draft.models[Number(match[1])] : undefined
    const contextTier = tierMatch ? activeModel?.contextTiers?.[Number(tierMatch[1])]?.id : 'standard'
    const contextField = tierMatch?.[2] ?? match?.[2]
    const contextControl =
      contextField && /^[a-zA-Z]+$/.test(contextField) && contextTier
        ? container.current?.querySelector<HTMLElement>(
            `[data-context-field="${contextField}"][data-context-tier="${contextTier}"]`,
          )
        : null
    const control = (id ? container.current?.querySelector<HTMLElement>(`#${id}`) : null) ?? contextControl
    control?.scrollIntoView({ block: 'nearest' })
    control?.focus()
    focusPath.current = null
  }, [focusRequest, editor.selectedModelId, editor.draft.models])
  useEffect(() => {
    if (editor.presets.status === 'idle') onIntent({ kind: 'load-presets', query: '', append: false })
  }, [editor.editorId, editor.presets.status, editor.providerId, onIntent])
  return (
    <LumenFrame
      ref={container}
      data-provider-editor-id={editor.editorId}
      as="section"
      className="hbar-app-react-provider-dialog"
      aria-label={title}
      aria-busy={busy}
    >
      <LumenFrame as="header" className="hbar-app-react-provider-page-header">
        <LumenFrame>
          <LumenContentText context="page.title">{title}</LumenContentText>
          <LumenContentText context="form.description">{labels.description}</LumenContentText>
        </LumenFrame>
        <LumenButton
          type="button"
          className="hbar-app-react-provider-back"
          variant="text"
          indicator="none"
          aria-label={labels.back}
          disabled={busy || unknown}
          onClick={onBack}
        >
          <LumenIcon icon={X} tier="md" />
        </LumenButton>
      </LumenFrame>
      <LumenFrame as="main">
        <LumenFrame className="hbar-app-react-provider-primary-column">
          <ProviderPresetPicker
            editor={editor}
            disabled={disabled}
            mode={editor.providerId ? 'edit' : 'create'}
            catalogRead={catalogRead}
            onRetryCatalog={onRetryCatalog}
            focusCatalogTarget={focusCatalogTarget}
            onIntent={onIntent}
          />
          <ProviderConnectionForm editor={validatedEditor} disabled={disabled} onIntent={onIntent} />
          <ProviderCredentials editor={editor} disabled={disabled} onIntent={onIntent} />
        </LumenFrame>
        <ProviderModels
          editor={validatedEditor}
          disabled={disabled}
          catalogRead={catalogRead}
          onRetryCatalog={onRetryCatalog}
          focusCatalogTarget={focusCatalogTarget}
          onIntent={onIntent}
        />
      </LumenFrame>
      {displayedError && !(unknown && ['RESULT_UNKNOWN', 'CREDENTIAL_RESULT_UNKNOWN'].includes(displayedError)) && (
        <LumenContentText context="feedback.message" className="hbar-app-react-provider-error" role="alert">
          {labels.error(displayedError)}
        </LumenContentText>
      )}
      <LumenFrame as="footer">
        <LumenFrame className="hbar-provider-footer-details">
          <LumenContentText context="message.inline" role="status">
            {busy
              ? labels.saving
              : unknown
                ? displayedError === 'CREDENTIAL_RESULT_UNKNOWN'
                  ? labels.credentialUnconfirmed
                  : labels.unknown
                : editor.form.status === 'succeeded' && dirtyCount === 0
                  ? labels.saved
                  : dirtyCount > 0
                    ? labels.unsaved(dirtyCount)
                    : null}
            {showIssues && editor.draftIssues.length > 0
              ? labels.issues(editor.draftIssues.length)
              : checked && editor.draftIssues.length === 0
                ? labels.validConfiguration
                : null}
          </LumenContentText>
          <LumenFrame className="hbar-provider-secondary-actions">
            {dirtyCount > 0 && !unknown && (
              <LumenButton disabled={disabled} onClick={() => onIntent({ kind: 'reset-draft' })}>
                <LumenIcon icon={RotateCcw} tier="sm" />
                {labels.reset}
              </LumenButton>
            )}
            <LumenButton type="button" variant="text" disabled={busy || unknown} onClick={checkConfiguration}>
              {labels.checkConfiguration}
            </LumenButton>
          </LumenFrame>
        </LumenFrame>
        <LumenFrame className="hbar-provider-primary-actions">
          <LumenButton type="button" disabled={busy || unknown} onClick={onBack}>
            {labels.cancel}
          </LumenButton>
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
    </LumenFrame>
  )
}

export function HbarProviderEditorView(props: {
  readonly editor: ProviderEditorState
  readonly labels: HbarProviderDialogLabels
  readonly connected: boolean
  readonly actionError: string | null
  readonly catalogRead: HbarProviderCatalogRead | null
  readonly onBack: () => void
  readonly onSave: () => void
  readonly onReconcile: () => void
  readonly onRetryCatalog: (editorId: string, intent: HbarProviderCatalogReadIntent) => Promise<boolean>
  readonly onIntent: (intent: HbarProviderEditorIntent) => void
}) {
  const { labels, ...viewProps } = props
  return (
    <HbarProviderEditorMessageScope.Provider messages={providerEditorMessages(labels)}>
      <HbarProviderEditorViewContent {...viewProps} />
    </HbarProviderEditorMessageScope.Provider>
  )
}
