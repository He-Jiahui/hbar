import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenInput, LumenContentText } from '@lumen/app-ui'
import type { AgentWorkspaceState } from '@hbar/app-runtime'
import { filterCatalogModels, MODEL_CATALOG_PAGE_SIZE } from './model-choice-filter'
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
  readonly optionLabel: (modelName: string, modelId: string) => string
}

type Catalog = AgentWorkspaceState['catalog']

export function AgentModelPicker({
  id,
  value,
  catalog,
  connected,
  disabled,
  labels,
  onSelect,
  onRetry,
  required,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: {
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
  const popupId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const triggerReading = useRef<HTMLDivElement>(null)
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
  const models = useMemo(() => {
    const seen = new Set<string>()
    return catalog.models.filter((model) => {
      if (seen.has(model.id)) return false
      seen.add(model.id)
      return true
    })
  }, [catalog.models])
  const selected = models.find((model) => model.id === value)
  const currentLabel = selected?.modelName ?? (value ? labels.unavailable(value) : labels.choose)
  const { groups, remaining } = filterCatalogModels(models, query, limit, value)
  const moveOption = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey) return
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
      <LumenFrame
        ref={triggerReading}
        className="hbar-agent-model-trigger-reading"
        role="group"
        aria-label={currentLabel}
        tabIndex={0}
      >
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
      </LumenFrame>
      {!open && catalog.status === 'loading' && (
        <LumenContentText context="feedback.paragraph" role="status">
          {labels.loading}
        </LumenContentText>
      )}
      {!open && catalog.status === 'error' && (
        <LumenFrame className="hbar-agent-model-feedback">
          <LumenContentText context="feedback.paragraph" role="alert" tone="danger">
            {labels.error(catalog.error ?? 'READ_FAILED')}
          </LumenContentText>
          <LumenFrame className="hbar-agent-model-action-reading" role="group" aria-label={labels.retry} tabIndex={0}>
            <LumenButton type="button" size="s" disabled={!connected} onClick={onRetry}>
              {labels.retry}
            </LumenButton>
          </LumenFrame>
        </LumenFrame>
      )}
      <FloatingSurface
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={trigger}
        positionReferenceRef={triggerReading}
        initialFocusRef={search}
        focusRecoveryRef={search}
        label={labels.title}
        id={popupId}
        className="hbar-agent-model-popover"
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return
          if (event.key === 'Enter') {
            event.stopPropagation()
            if (event.target instanceof HTMLInputElement) event.preventDefault()
          }
          moveOption(event)
        }}
      >
        <LumenFrame className="hbar-agent-model-heading">
          <LumenContentText context="popover.title" className="hbar-agent-model-title-reading">
            {labels.title}
          </LumenContentText>
          <LumenButton
            type="button"
            size="s"
            variant="text"
            indicator="none"
            aria-label={labels.close}
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
            aria-label={labels.search}
            placeholder={labels.search}
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value)
              setLimit(MODEL_CATALOG_PAGE_SIZE)
            }}
          />
        </LumenFrame>
        {catalog.status === 'loading' && (
          <LumenContentText context="feedback.paragraph" role="status">
            {labels.loading}
          </LumenContentText>
        )}
        {catalog.status === 'error' && (
          <LumenFrame className="hbar-agent-model-feedback">
            <LumenContentText context="feedback.paragraph" role="alert" tone="danger">
              {labels.error(catalog.error ?? 'READ_FAILED')}
            </LumenContentText>
            <LumenFrame className="hbar-agent-model-action-reading" role="group" aria-label={labels.retry} tabIndex={0}>
              <LumenButton type="button" size="s" disabled={!connected} onClick={onRetry}>
                {labels.retry}
              </LumenButton>
            </LumenFrame>
          </LumenFrame>
        )}
        <LumenFrame className="hbar-agent-model-list" role="listbox" aria-label={labels.title} tabIndex={0}>
          {groups.map(([providerId, group]) => (
            <LumenFrame
              key={providerId}
              as="section"
              className="hbar-agent-model-group"
              role="group"
              aria-labelledby={`${popupId}-provider-${providerId}`}
            >
              <LumenContentText context="section.title" level={3} id={`${popupId}-provider-${providerId}`}>
                {group.name}
              </LumenContentText>
              {group.models.map((model) => (
                <LumenButton
                  key={model.id}
                  type="button"
                  variant="text"
                  indicator="none"
                  role="option"
                  aria-selected={model.id === value}
                  disabled={!connected || catalog.status !== 'ready'}
                  aria-label={labels.optionLabel(model.modelName, model.modelId)}
                  title={labels.optionLabel(model.modelName, model.modelId)}
                  onClick={() => {
                    onSelect(model.id)
                    setOpen(false)
                  }}
                >
                  <LumenFrame as="span" className="hbar-agent-model-option-text">
                    <LumenContentText context="choice.title" title={model.modelName}>
                      {model.modelName}
                    </LumenContentText>
                    <LumenContentText context="code.inline" tone="muted" title={model.modelId}>
                      {model.modelId}
                    </LumenContentText>
                  </LumenFrame>
                  {model.id === value && <LumenIcon icon={Check} tier="sm" />}
                </LumenButton>
              ))}
            </LumenFrame>
          ))}
          {catalog.status === 'ready' && !groups.length && (
            <LumenContentText context="empty.description">
              {catalog.models.length ? labels.noMatches : labels.empty}
            </LumenContentText>
          )}
          {remaining > 0 && (
            <LumenFrame
              className="hbar-agent-model-action-reading"
              role="group"
              aria-label={labels.more(remaining)}
              tabIndex={0}
            >
              <LumenButton
                type="button"
                size="s"
                onClick={() => setLimit((current) => current + MODEL_CATALOG_PAGE_SIZE)}
              >
                {labels.more(remaining)}
              </LumenButton>
            </LumenFrame>
          )}
        </LumenFrame>
      </FloatingSurface>
    </LumenFrame>
  )
}
