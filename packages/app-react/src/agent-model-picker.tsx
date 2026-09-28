import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenInput, LumenText } from '@lumen/app-ui'
import type { AgentWorkspaceState } from '@hbar/app-runtime'
import { filterCatalogModels, MODEL_CATALOG_PAGE_SIZE } from './model-choice-filter'
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

type Catalog = AgentWorkspaceState['catalog']

function placePopover(popover: HTMLDivElement, trigger: HTMLButtonElement) {
  const bounds = trigger.getBoundingClientRect()
  const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  const margin = rem
  const gap = rem / 2
  const width = Math.min(22.5 * rem, innerWidth - margin * 2)
  const above = bounds.bottom + 18.75 * rem > innerHeight && bounds.top > innerHeight - bounds.bottom
  popover.style.setProperty(
    '--agent-model-left',
    `${Math.max(margin, Math.min(bounds.left, innerWidth - width - margin))}px`,
  )
  popover.style.setProperty('--agent-model-top', above ? 'auto' : `${bounds.bottom + gap}px`)
  popover.style.setProperty('--agent-model-bottom', above ? `${innerHeight - bounds.top + gap}px` : 'auto')
  popover.style.setProperty(
    '--agent-model-limit',
    `${Math.max(0, (above ? bounds.top : innerHeight - bounds.bottom) - margin - gap)}px`,
  )
}

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
  const popup = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(MODEL_CATALOG_PAGE_SIZE)
  const [open, setOpen] = useState(false)
  const selected = catalog.models.find((model) => model.id === value)
  const { groups, remaining } = filterCatalogModels(catalog.models, query, limit, value)
  const show = () => {
    setQuery('')
    setLimit(MODEL_CATALOG_PAGE_SIZE)
    popup.current?.showPopover()
  }
  useEffect(() => {
    if (!open) return
    const reposition = () => {
      if (popup.current && trigger.current) placePopover(popup.current, trigger.current)
    }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])
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
        onClick={show}
      >
        <LumenText as="span" className="hbar-agent-model-current">
          {selected?.modelName ?? (value ? labels.unavailable(value) : labels.choose)}
        </LumenText>
        <LumenIcon icon={ChevronDown} tier="sm" />
      </LumenButton>
      {!open && catalog.status === 'loading' && (
        <LumenText as="small" role="status">
          {labels.loading}
        </LumenText>
      )}
      {!open && catalog.status === 'error' && (
        <LumenFrame className="hbar-agent-model-feedback">
          <LumenText as="small" role="alert">
            {labels.error(catalog.error ?? 'READ_FAILED')}
          </LumenText>
          <LumenButton type="button" size="s" disabled={!connected} onClick={onRetry}>
            {labels.retry}
          </LumenButton>
        </LumenFrame>
      )}
      <LumenFrame
        ref={popup}
        id={popupId}
        popover="auto"
        role="dialog"
        aria-label={labels.title}
        className="hbar-agent-model-popover"
        onBeforeToggle={(event) => {
          if (event.newState === 'open' && trigger.current) placePopover(event.currentTarget, trigger.current)
        }}
        onToggle={(event) => {
          setOpen(event.newState === 'open')
          // A narrow touch viewport shows a bottom sheet. Let users inspect
          // choices before explicitly opening the on-screen keyboard.
          if (event.newState === 'open') {
            if (!window.matchMedia('(max-width: 40rem) and (pointer: coarse)').matches) search.current?.focus()
          } else if (document.activeElement === document.body || popup.current?.contains(document.activeElement)) {
            trigger.current?.focus()
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.stopPropagation()
            if (event.target instanceof HTMLInputElement) event.preventDefault()
          }
          moveOption(event)
        }}
      >
        <LumenFrame className="hbar-agent-model-heading">
          <LumenText as="strong">{labels.title}</LumenText>
          <LumenButton
            type="button"
            size="s"
            variant="text"
            indicator="none"
            aria-label={labels.close}
            onClick={() => popup.current?.hidePopover()}
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
          <LumenText as="p" role="status">
            {labels.loading}
          </LumenText>
        )}
        {catalog.status === 'error' && (
          <LumenFrame className="hbar-agent-model-feedback">
            <LumenText as="p" role="alert">
              {labels.error(catalog.error ?? 'READ_FAILED')}
            </LumenText>
            <LumenButton type="button" size="s" disabled={!connected} onClick={onRetry}>
              {labels.retry}
            </LumenButton>
          </LumenFrame>
        )}
        <LumenFrame className="hbar-agent-model-list" role="listbox" aria-label={labels.title}>
          {groups.map(([providerId, group]) => (
            <LumenFrame key={providerId} as="section" className="hbar-agent-model-group">
              <LumenText as="h3">{group.name}</LumenText>
              {group.models.map((model) => (
                <LumenButton
                  key={model.id}
                  type="button"
                  variant="text"
                  indicator="none"
                  role="option"
                  aria-selected={model.id === value}
                  disabled={!connected || catalog.status !== 'ready'}
                  onClick={() => {
                    onSelect(model.id)
                    popup.current?.hidePopover()
                  }}
                >
                  <LumenText as="span" className="hbar-agent-model-option-text">
                    <LumenText as="span">{model.modelName}</LumenText>
                    <LumenText as="small">{model.modelId}</LumenText>
                  </LumenText>
                  {model.id === value && <LumenIcon icon={Check} tier="sm" />}
                </LumenButton>
              ))}
            </LumenFrame>
          ))}
          {catalog.status === 'ready' && !groups.length && (
            <LumenText as="p">{catalog.models.length ? labels.noMatches : labels.empty}</LumenText>
          )}
          {remaining > 0 && (
            <LumenButton
              type="button"
              size="s"
              onClick={() => setLimit((current) => current + MODEL_CATALOG_PAGE_SIZE)}
            >
              {labels.more(remaining)}
            </LumenButton>
          )}
        </LumenFrame>
      </LumenFrame>
    </LumenFrame>
  )
}
