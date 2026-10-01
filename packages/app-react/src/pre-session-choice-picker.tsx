import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronDown, Search, X, type LucideIcon } from 'lucide-react'
import { LumenButton, LumenDialog, LumenFrame, LumenIcon, LumenInput, LumenText } from '@lumen/app-ui'
import {
  groupPreSessionChoices,
  preSessionChoiceInitialFocus,
  visiblePreSessionChoices,
} from './pre-session-choice-model'
import type { HbarPreSessionChoice } from './pre-session-choice-model'
import './pre-session-choice-picker.css'

export { visiblePreSessionChoices } from './pre-session-choice-model'
export type { HbarPreSessionChoice } from './pre-session-choice-model'

export interface HbarPreSessionChoiceLabels {
  readonly title: string
  readonly trigger: (selected: string | null) => string
  readonly search: string
  readonly clearSearch: string
  readonly empty: string
  readonly noMatches: string
  readonly more: (remaining: number | null) => string
  readonly close: string
  readonly error: (code: string) => string
}

export interface HbarPreSessionChoicePickerProps {
  readonly icon: LucideIcon
  readonly labels: HbarPreSessionChoiceLabels
  readonly items: readonly HbarPreSessionChoice[]
  readonly selectedId: string | null
  /** A host-owned unavailable label, not an invented selectable row or implicit selection. */
  readonly unavailableLabel?: string | undefined
  readonly placement?: 'dialog' | 'composer'
  readonly menuPresentation?: 'native' | 'web'
  readonly disabled?: boolean
  /** Increment to open this specific picker from a nearby local command. */
  readonly openRequest?: number
  readonly loading?: boolean
  readonly hasMore?: boolean
  readonly onMore?: (() => void) | undefined
  readonly onChoose: (id: string) => Promise<void> | void
  readonly extra?: ReactNode | ((close: () => void) => ReactNode)
}

/** Host-supplied choices reveal in 60-row increments, with explicit remote pagination. */
export const PRE_SESSION_CHOICE_PAGE_SIZE = 60

export function HbarPreSessionChoicePicker({
  icon,
  labels,
  items,
  selectedId,
  unavailableLabel,
  placement = 'dialog',
  menuPresentation = 'web',
  disabled = false,
  openRequest = 0,
  loading = false,
  hasMore = false,
  onMore,
  onChoose,
  extra,
}: HbarPreSessionChoicePickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PRE_SESSION_CHOICE_PAGE_SIZE)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const triggerId = useId()
  const popupId = useId()
  const popupTitleId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const lastOpenRequest = useRef(openRequest)
  const restoreDialogFocus = useRef(false)
  const unique = useMemo(() => visiblePreSessionChoices(items, '', items.length).rows, [items])
  const selected = unique.find((item) => item.id === selectedId) ?? null
  const selectedTriggerLabel = selected?.triggerLabel ?? selected?.label ?? null
  const { rows, remaining } = visiblePreSessionChoices(items, query, limit, selectedId)
  const sections = groupPreSessionChoices(rows)
  const positionPopup = useCallback(() => {
    if (!trigger.current || !popup.current) return
    const document = trigger.current.ownerDocument
    const view = document.defaultView
    if (!view) return
    const rect = trigger.current.getBoundingClientRect()
    const rem = Number.parseFloat(view.getComputedStyle(document.documentElement).fontSize)
    const width = Math.min(22.5 * rem, Math.max(0, view.innerWidth - 2 * rem))
    const above = rect.top >= view.innerHeight - rect.bottom
    popup.current.style.setProperty(
      '--choice-popup-left',
      `${Math.max(rem, Math.min(rect.right - width, view.innerWidth - width - rem))}px`,
    )
    popup.current.style.setProperty('--choice-popup-top', above ? 'auto' : `${rect.bottom + rem / 2}px`)
    popup.current.style.setProperty(
      '--choice-popup-bottom',
      above ? `${view.innerHeight - rect.top + rem / 2}px` : 'auto',
    )
    popup.current.style.setProperty(
      '--choice-popup-limit',
      `${Math.max(0, (above ? rect.top : view.innerHeight - rect.bottom) - 1.5 * rem)}px`,
    )
  }, [])
  const focusInitial = useCallback(() => {
    const view = popup.current?.ownerDocument.defaultView
    if (!view || !popup.current?.matches(':popover-open')) return
    const target = preSessionChoiceInitialFocus(
      menuPresentation,
      view.matchMedia('(max-width: 40rem)').matches,
      view.matchMedia('(pointer: coarse)').matches,
    )
    if (target === 'close') popup.current.querySelector<HTMLButtonElement>('.hbar-pre-session-choice-close')?.focus()
    else search.current?.focus()
  }, [menuPresentation])
  useEffect(() => {
    if (placement !== 'composer' || !open) return
    const view = popup.current?.ownerDocument.defaultView
    if (!view) return
    positionPopup()
    view.addEventListener('resize', positionPopup)
    view.addEventListener('scroll', positionPopup, true)
    return () => {
      view.removeEventListener('resize', positionPopup)
      view.removeEventListener('scroll', positionPopup, true)
    }
  }, [open, placement, positionPopup])
  useEffect(() => {
    if (placement !== 'dialog' || open || !restoreDialogFocus.current) return
    restoreDialogFocus.current = false
    // A modal still makes the trigger inert until React commits its removal.
    // Restore from this closed-state effect, not before setOpen(false) settles.
    trigger.current?.focus()
  }, [open, placement])
  useEffect(() => {
    if (lastOpenRequest.current === openRequest) return
    lastOpenRequest.current = openRequest
    if (disabled) return
    if (placement === 'dialog') {
      setOpen(true)
      return
    }
    try {
      if (!popup.current?.matches(':popover-open')) popup.current?.showPopover()
    } catch {
      // Browsers without the Popover API cannot satisfy this request; keep it a no-op.
    }
  }, [disabled, openRequest, placement])
  useEffect(() => {
    if (placement !== 'composer' || !open || !popup.current?.matches(':popover-open')) return
    const document = popup.current.ownerDocument
    if (document.activeElement !== document.body) return
    focusInitial()
  }, [items.length, loading, open, placement, focusInitial])
  const reset = () => {
    setQuery('')
    setLimit(PRE_SESSION_CHOICE_PAGE_SIZE)
    setError(null)
  }
  const close = () => {
    if (pendingId !== null) return
    if (placement === 'composer') popup.current?.hidePopover()
    else {
      restoreDialogFocus.current = true
      setOpen(false)
    }
    reset()
    if (placement === 'composer') trigger.current?.focus()
  }
  const moveChoice = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    if (
      event.target !== search.current &&
      !(event.target instanceof Element && event.target.matches('.hbar-pre-session-choice-row'))
    )
      return
    if (event.target === search.current && event.key !== 'ArrowDown') return
    const choices = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>('.hbar-pre-session-choice-row:not(:disabled)'),
    ]
    if (!choices.length) return
    event.preventDefault()
    event.stopPropagation()
    const index = choices.findIndex((choice) => choice === event.currentTarget.ownerDocument.activeElement)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? choices.length - 1
          : event.key === 'ArrowUp'
            ? (index - 1 + choices.length) % choices.length
            : (index + 1) % choices.length
    choices[next]?.focus()
  }
  const renderChoice = (item: HbarPreSessionChoice) => (
    <LumenButton
      key={item.id}
      type="button"
      variant="text"
      indicator="none"
      className="hbar-pre-session-choice-row"
      data-grouped-choice={item.group ? 'true' : undefined}
      aria-current={item.id === selectedId ? 'true' : undefined}
      disabled={pendingId !== null}
      onClick={() => {
        setPendingId(item.id)
        setError(null)
        void Promise.resolve(onChoose(item.id))
          .then(() => {
            setPendingId(null)
            if (placement === 'composer') popup.current?.hidePopover()
            else {
              restoreDialogFocus.current = true
              setOpen(false)
            }
            reset()
            if (placement === 'composer') trigger.current?.focus()
          })
          .catch((reason: unknown) => {
            setPendingId(null)
            setError(
              reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
                ? reason.code
                : 'EXECUTION_FAILED',
            )
          })
      }}
    >
      {item.group ? (
        <>
          <LumenFrame className="hbar-pre-session-choice-row-content">
            <LumenText as="strong">{item.label}</LumenText>
            {item.detail && <LumenText as="small">{item.detail}</LumenText>}
          </LumenFrame>
          {item.id === selectedId && <LumenIcon icon={Check} tier="sm" aria-hidden="true" />}
        </>
      ) : (
        <>
          <LumenText as="strong">{item.label}</LumenText>
          {item.detail && <LumenText as="small">{item.detail}</LumenText>}
        </>
      )}
    </LumenButton>
  )
  const content = (
    <LumenFrame className="hbar-pre-session-choice-content" onKeyDown={moveChoice}>
      <LumenFrame className="hbar-pre-session-choice-search">
        <LumenIcon icon={Search} tier="sm" aria-hidden="true" />
        <LumenInput
          ref={search}
          type="search"
          variant="plain"
          aria-label={labels.search}
          placeholder={labels.search}
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value)
            setLimit(PRE_SESSION_CHOICE_PAGE_SIZE)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
            event.preventDefault()
            event.stopPropagation()
          }}
        />
        {query && (
          <LumenButton
            type="button"
            size="s"
            variant="text"
            indicator="none"
            aria-label={labels.clearSearch}
            onClick={() => {
              setQuery('')
              setLimit(PRE_SESSION_CHOICE_PAGE_SIZE)
              search.current?.focus()
            }}
          >
            <LumenIcon icon={X} tier="sm" />
          </LumenButton>
        )}
      </LumenFrame>
      <LumenFrame className="hbar-pre-session-choice-list" aria-label={labels.title}>
        {sections.flatMap((section) =>
          section.label
            ? [
                <LumenFrame
                  key={section.key}
                  role="group"
                  aria-label={section.label}
                  className="hbar-pre-session-choice-group"
                >
                  <LumenText as="span" className="hbar-pre-session-choice-group-label">
                    {section.label}
                  </LumenText>
                  {section.items.map(renderChoice)}
                </LumenFrame>,
              ]
            : section.items.map(renderChoice),
        )}
        {rows.length === 0 && <LumenText as="p">{unique.length === 0 ? labels.empty : labels.noMatches}</LumenText>}
        {(remaining > 0 || hasMore) && onMore && (
          <LumenButton
            type="button"
            size="s"
            disabled={loading || pendingId !== null}
            onClick={() => {
              if (remaining > 0) setLimit((current) => current + PRE_SESSION_CHOICE_PAGE_SIZE)
              else onMore()
            }}
          >
            {labels.more(hasMore && remaining === 0 ? null : remaining)}
          </LumenButton>
        )}
      </LumenFrame>
      {error && (
        <LumenText as="p" role="alert">
          {labels.error(error)}
        </LumenText>
      )}
      {typeof extra === 'function' ? extra(close) : extra}
    </LumenFrame>
  )
  return (
    <LumenFrame className="hbar-pre-session-choice-picker" data-placement={placement}>
      <LumenButton
        ref={trigger}
        id={triggerId}
        type="button"
        size="s"
        variant="text"
        indicator="none"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unavailableLabel ?? labels.trigger(selectedTriggerLabel)}
        popoverTarget={placement === 'composer' ? popupId : undefined}
        onClick={placement === 'dialog' ? () => setOpen(true) : undefined}
      >
        <LumenIcon icon={icon} tier="sm" />
        <LumenText as="span">{unavailableLabel ?? selectedTriggerLabel ?? labels.title}</LumenText>
        <LumenIcon icon={ChevronDown} tier="sm" />
      </LumenButton>
      {placement === 'composer' ? (
        <LumenFrame
          ref={popup}
          id={popupId}
          popover="auto"
          role="dialog"
          aria-labelledby={popupTitleId}
          className="hbar-pre-session-choice-popover"
          data-presentation={menuPresentation}
          onBeforeToggle={(event) => {
            if (event.newState === 'open') positionPopup()
          }}
          onToggle={(event) => {
            const opening = event.newState === 'open'
            setOpen(opening)
            if (!opening) reset()
            else queueMicrotask(focusInitial)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.stopPropagation()
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              close()
            }
          }}
        >
          <LumenFrame className="hbar-pre-session-choice-heading">
            <LumenText as="strong" id={popupTitleId}>
              {labels.title}
            </LumenText>
            <LumenButton
              type="button"
              size="s"
              variant="text"
              indicator="none"
              className="hbar-pre-session-choice-close"
              aria-label={labels.close}
              onClick={close}
            >
              <LumenIcon icon={X} tier="sm" />
            </LumenButton>
          </LumenFrame>
          {content}
        </LumenFrame>
      ) : open ? (
        <LumenDialog
          open
          title={labels.title}
          closeLabel={labels.close}
          onClose={close}
          className="hbar-pre-session-choice-dialog"
          appearance="panel"
        >
          {content}
        </LumenDialog>
      ) : null}
    </LumenFrame>
  )
}
