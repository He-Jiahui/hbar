import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronDown, LoaderCircle, Search, X, type LucideIcon } from 'lucide-react'
import { LumenButton, LumenDialog, LumenFrame, LumenIcon, LumenInput, LumenContentText } from '@lumen/app-ui'
import { groupPreSessionChoices, visiblePreSessionChoices } from './pre-session-choice-model'
import type { HbarPreSessionChoice } from './pre-session-choice-model'
import { FloatingSurface, useFloatingTrigger } from './floating-surface'
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
  /** Optional leading trigger glyph; text-only model controls keep the same appearance after first send. */
  readonly icon?: LucideIcon
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
  const search = useRef<HTMLInputElement>(null)
  const lastOpenRequest = useRef(openRequest)
  const unique = useMemo(() => visiblePreSessionChoices(items, '', items.length).rows, [items])
  const selected = unique.find((item) => item.id === selectedId) ?? null
  const selectedTriggerLabel = selected?.triggerLabel ?? selected?.label ?? null
  const { rows, remaining } = visiblePreSessionChoices(items, query, limit, selectedId)
  const sections = groupPreSessionChoices(rows)
  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setLimit(PRE_SESSION_CHOICE_PAGE_SIZE)
  }, [])
  const openPicker = useCallback(() => {
    if (disabled || pendingId !== null) return
    setQuery('')
    setLimit(PRE_SESSION_CHOICE_PAGE_SIZE)
    setOpen(true)
  }, [disabled, pendingId])
  const triggerEvents = useFloatingTrigger({ open, onOpen: openPicker, onClose: close })
  useEffect(() => {
    if (lastOpenRequest.current === openRequest) return
    lastOpenRequest.current = openRequest
    openPicker()
  }, [openRequest, openPicker])
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
        void Promise.resolve()
          .then(() => onChoose(item.id))
          .then(() => {
            setPendingId(null)
            setError(null)
            close()
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
            <LumenContentText context="choice.title">{item.label}</LumenContentText>
            {item.detail && <LumenContentText context="choice.description">{item.detail}</LumenContentText>}
          </LumenFrame>
          {item.id === selectedId && <LumenIcon icon={Check} tier="sm" aria-hidden="true" />}
        </>
      ) : (
        <>
          <LumenContentText context="choice.title">{item.label}</LumenContentText>
          {item.detail && <LumenContentText context="choice.description">{item.detail}</LumenContentText>}
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
      <LumenFrame className="hbar-pre-session-choice-list" role="region" aria-label={labels.title} tabIndex={0}>
        {sections.flatMap((section) =>
          section.label
            ? [
                <LumenFrame
                  key={section.key}
                  role="group"
                  aria-label={section.label}
                  className="hbar-pre-session-choice-group"
                >
                  <LumenContentText context="popover.title" className="hbar-pre-session-choice-group-label">
                    {section.label}
                  </LumenContentText>
                  {section.items.map(renderChoice)}
                </LumenFrame>,
              ]
            : section.items.map(renderChoice),
        )}
        {rows.length === 0 && (
          <LumenContentText context="popover.body">
            {unique.length === 0 ? labels.empty : labels.noMatches}
          </LumenContentText>
        )}
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
        <LumenContentText context="feedback.detail" role="alert">
          {labels.error(error)}
        </LumenContentText>
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
        aria-disabled={pendingId !== null || undefined}
        aria-busy={pendingId !== null || loading || undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unavailableLabel ?? labels.trigger(selectedTriggerLabel)}
        title={unavailableLabel ?? selectedTriggerLabel ?? labels.title}
        {...triggerEvents}
      >
        {icon && <LumenIcon icon={icon} tier="sm" />}
        <LumenContentText context="control.label">
          {unavailableLabel ?? selectedTriggerLabel ?? labels.title}
        </LumenContentText>
        <LumenIcon icon={pendingId !== null ? LoaderCircle : ChevronDown} tier="sm" />
      </LumenButton>
      {placement === 'composer' ? (
        <FloatingSurface
          open={open}
          onClose={close}
          anchorRef={trigger}
          initialFocusRef={search}
          responsivePresentation={menuPresentation === 'native' ? 'anchored' : 'narrow-sheet'}
          placement="above"
          label={labels.title}
          id={popupId}
          role="dialog"
          aria-labelledby={popupTitleId}
          className="hbar-pre-session-choice-popover"
          data-presentation={menuPresentation}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.stopPropagation()
          }}
        >
          <LumenFrame className="hbar-pre-session-choice-heading">
            <LumenContentText context="popover.title" id={popupTitleId}>
              {labels.title}
            </LumenContentText>
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
        </FloatingSurface>
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
      {error && !open && (
        <LumenContentText context="feedback.paragraph" role="alert" className="hbar-pre-session-choice-closed-error">
          {labels.error(error)}
        </LumenContentText>
      )}
    </LumenFrame>
  )
}
