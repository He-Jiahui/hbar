import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { LumenContentText, LumenButton, LumenFrame, LumenIcon, LumenInput } from '@lumen/app-ui'
import type { AgentWorkspaceState } from '@hbar/app-runtime'
import { filterCatalogModels, MODEL_CATALOG_PAGE_SIZE } from './model-choice-filter'
import { createMessageScope } from './messages'
import { FloatingSurface, useFloatingTrigger } from './floating-surface'
import './agent-model-picker.css'

export interface AgentModelPickerLabels {
  readonly title: string
  readonly choose: string
  readonly search: string
  readonly close: string
  readonly loading: string
  readonly empty: string
  readonly noMatches: string
  readonly retry: string
  readonly more: (count: number) => string
  readonly unavailable: (modelId: string) => string
  readonly error: (code: string) => string
}
const agentModelPickerMessages = createMessageScope<AgentModelPickerLabels>()

type Catalog = AgentWorkspaceState['catalog']

export function AgentModelPicker(props: {
  readonly id: string
  readonly value: string
  readonly catalog: Catalog
  readonly connected: boolean
  readonly disabled: boolean
  readonly labels: AgentModelPickerLabels
  readonly onSelect: (modelId: string) => void
  readonly onRetry: () => void
  readonly required?: boolean
  readonly 'aria-describedby'?: string
  readonly 'aria-invalid'?: boolean
}) {
  const { labels, ...viewProps } = props
  return (
    <agentModelPickerMessages.Provider messages={labels}>
      <AgentModelPickerContent {...viewProps} />
    </agentModelPickerMessages.Provider>
  )
}

function AgentModelPickerContent({
  id,
  value,
  catalog,
  connected,
  disabled,
  onSelect,
  onRetry,
  required,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: Omit<Parameters<typeof AgentModelPicker>[0], 'labels'>) {
  const { t } = agentModelPickerMessages.useMessages()
  const popupId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(MODEL_CATALOG_PAGE_SIZE)
  const [open, setOpen] = useState(false)
  const triggerEvents = useFloatingTrigger(open, (value) => {
    if (value) {
      setQuery('')
      setLimit(MODEL_CATALOG_PAGE_SIZE)
    }
    setOpen(value)
  })
  const selected = catalog.models.find((model) => model.id === value)
  const unavailableDraft = value && !selected ? value : null
  const closedEmpty = catalog.status === 'ready' && catalog.models.length === 0 && !unavailableDraft
  const currentLabel = selected?.modelName ?? (value ? t('unavailable')(value) : t('choose'))
  const { groups, remaining } = filterCatalogModels(catalog.models, query, limit, value)
  const moveOption = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    if (event.target === search.current && event.key !== 'ArrowDown') return
    const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)')]
    if (!options.length) return
    event.preventDefault()
    const index = options.findIndex((option) => option === document.activeElement)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : event.key === 'ArrowUp'
            ? (index - 1 + options.length) % options.length
            : (index + 1) % options.length
    options[next]?.focus()
  }
  return (
    <LumenFrame className="hbar-agent-model-picker">
      <LumenButton
        ref={trigger}
        id={id}
        type="button"
        variant="outlined"
        className="hbar-agent-model-trigger"
        aria-haspopup="dialog"
        aria-controls={popupId}
        aria-required={required}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        disabled={disabled}
        {...triggerEvents}
        aria-expanded={open}
        title={currentLabel}
      >
        <LumenContentText context="control.label" className="hbar-agent-model-current">
          {currentLabel}
        </LumenContentText>
        <LumenIcon icon={ChevronDown} tier="sm" />
      </LumenButton>
      {!open && catalog.status === 'loading' && (
        <LumenContentText context="record.description" role="status">
          {t('loading')}
        </LumenContentText>
      )}
      {!open && catalog.status === 'error' && (
        <LumenFrame className="hbar-agent-model-feedback">
          <LumenContentText context="record.description" role="alert">
            {t('error')(catalog.error ?? 'READ_FAILED')}
          </LumenContentText>
          <LumenButton type="button" size="s" disabled={!connected} onClick={onRetry}>
            {t('retry')}
          </LumenButton>
        </LumenFrame>
      )}
      {!open && closedEmpty && (
        <LumenContentText context="record.description" role="status">
          {t('empty')}
        </LumenContentText>
      )}
      <FloatingSurface
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={trigger}
        initialFocusRef={search}
        label={t('title')}
        id={popupId}
        className="hbar-agent-model-popover"
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.stopPropagation()
            if (event.target instanceof HTMLInputElement) event.preventDefault()
          }
          moveOption(event)
        }}
      >
        <LumenFrame className="hbar-agent-model-heading">
          <LumenContentText context="popover.title">{t('title')}</LumenContentText>
          <LumenButton
            type="button"
            size="s"
            variant="text"
            indicator="none"
            aria-label={t('close')}
            onClick={() => setOpen(false)}
          >
            <LumenIcon icon={X} tier="sm" />
          </LumenButton>
        </LumenFrame>
        <LumenFrame className="hbar-agent-model-search">
          <LumenIcon icon={Search} tier="sm" />
          <LumenInput
            ref={search}
            type="search"
            aria-label={t('search')}
            placeholder={t('search')}
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value)
              setLimit(MODEL_CATALOG_PAGE_SIZE)
            }}
          />
        </LumenFrame>
        {catalog.status === 'loading' && (
          <LumenContentText context="popover.body" role="status">
            {t('loading')}
          </LumenContentText>
        )}
        {catalog.status === 'error' && (
          <LumenFrame className="hbar-agent-model-feedback">
            <LumenContentText context="popover.body" role="alert">
              {t('error')(catalog.error ?? 'READ_FAILED')}
            </LumenContentText>
            <LumenButton type="button" size="s" disabled={!connected} onClick={onRetry}>
              {t('retry')}
            </LumenButton>
          </LumenFrame>
        )}
        <LumenFrame className="hbar-agent-model-list" role="listbox" aria-label={t('title')}>
          {unavailableDraft && (
            <LumenButton
              type="button"
              variant="text"
              indicator="none"
              role="option"
              aria-selected="true"
              disabled
              aria-label={t('unavailable')(unavailableDraft)}
              title={t('unavailable')(unavailableDraft)}
              className="hbar-agent-model-unavailable"
            >
              <LumenContentText context="control.label" className="hbar-agent-model-option-text">
                <LumenContentText context="control.label">{t('unavailable')(unavailableDraft)}</LumenContentText>
                <LumenContentText context="choice.description" title={unavailableDraft}>
                  {unavailableDraft}
                </LumenContentText>
              </LumenContentText>
            </LumenButton>
          )}
          {groups.map(([providerId, group]) => (
            <LumenFrame key={providerId} as="section" className="hbar-agent-model-group">
              <LumenContentText context="section.subtitle">{group.name}</LumenContentText>
              {group.models.map((model) => (
                <LumenButton
                  key={model.id}
                  type="button"
                  variant="text"
                  indicator="none"
                  role="option"
                  aria-selected={model.id === value}
                  disabled={!connected || catalog.status !== 'ready'}
                  aria-label={`${model.modelName} (${model.modelId})`}
                  title={`${model.modelName} (${model.modelId})`}
                  onClick={() => {
                    onSelect(model.id)
                    setOpen(false)
                  }}
                >
                  <LumenContentText context="control.label" className="hbar-agent-model-option-text">
                    <LumenContentText context="control.label" title={model.modelName}>
                      {model.modelName}
                    </LumenContentText>
                    <LumenContentText context="choice.description" title={model.modelId}>
                      {model.modelId}
                    </LumenContentText>
                  </LumenContentText>
                  {model.id === value && <LumenIcon icon={Check} tier="sm" />}
                </LumenButton>
              ))}
            </LumenFrame>
          ))}
          {catalog.status === 'ready' && !groups.length && !unavailableDraft && (
            <LumenContentText context="popover.body">
              {catalog.models.length ? t('noMatches') : t('empty')}
            </LumenContentText>
          )}
          {remaining > 0 && (
            <LumenButton
              type="button"
              size="s"
              onClick={() => setLimit((current) => current + MODEL_CATALOG_PAGE_SIZE)}
            >
              {t('more')(remaining)}
            </LumenButton>
          )}
        </LumenFrame>
      </FloatingSurface>
    </LumenFrame>
  )
}
