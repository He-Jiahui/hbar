import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown, RotateCcw, ShieldAlert, ShieldCheck, ShieldX, X } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import type { ComposerPermissionChoice, ComposerPermissionMode } from '@hbar/app-runtime'
import type { HbarComposerPermissionLabels } from './composer-permission-picker'
import './composer-permission-picker.css'

const order = ['ask', 'deny', 'allow', 'inherit'] as const satisfies readonly ComposerPermissionChoice[]
const icons = { ask: ShieldCheck, deny: ShieldX, allow: ShieldAlert, inherit: RotateCcw }

export interface HbarPreSessionApprovalPickerProps {
  readonly choice: ComposerPermissionChoice
  readonly hostDefault: ComposerPermissionMode | null
  readonly sessionLabel: string
  readonly labels: HbarComposerPermissionLabels
  readonly disabled?: boolean
  readonly onChoose: (choice: ComposerPermissionChoice, confirmAllow?: true) => Promise<void>
}

/** A local first-send choice; the real Session setting is applied by the Host only after creation. */
export function HbarPreSessionApprovalPicker({
  choice,
  hostDefault,
  sessionLabel,
  labels,
  disabled = false,
  onChoose,
}: HbarPreSessionApprovalPickerProps) {
  const popupId = useId()
  const headingId = useId()
  const hintId = useId()
  const anchor = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const cancelConfirmation = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectedLabel =
    choice === 'inherit' && hostDefault
      ? labels.inheritedTrigger(labels.options[hostDefault].label)
      : labels.options[choice].label

  useEffect(() => {
    if (confirming) cancelConfirmation.current?.focus()
  }, [confirming])

  const close = (force = false) => {
    if (busy && !force) return
    popup.current?.hidePopover()
    setConfirming(false)
    setError(null)
    anchor.current?.focus()
  }
  const select = async (next: ComposerPermissionChoice, confirmAllow?: true) => {
    if (busy || disabled) return
    if (next === choice) {
      close(true)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onChoose(next, confirmAllow)
      setBusy(false)
      close(true)
    } catch (reason) {
      setBusy(false)
      setError(
        reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
          ? reason.code
          : 'EXECUTION_FAILED',
      )
    }
  }
  const moveChoice = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]:not(:disabled)')]
    if (items.length === 0) return
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (current + 1) % items.length
            : (current - 1 + items.length) % items.length
    items[next]?.focus()
  }
  return (
    <LumenFrame className="hbar-composer-permission-picker hbar-pre-session-approval-picker">
      <LumenButton
        ref={anchor}
        type="button"
        size="s"
        variant="text"
        indicator="none"
        className="hbar-composer-permission-trigger"
        data-choice={choice}
        aria-label={labels.trigger(selectedLabel)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popupId}
        disabled={disabled || busy}
        popoverTarget={popupId}
      >
        <LumenIcon icon={icons[choice]} tier="sm" />
        <LumenText as="span">{selectedLabel}</LumenText>
        <LumenIcon icon={ChevronDown} tier="sm" />
      </LumenButton>
      <LumenFrame
        ref={popup}
        id={popupId}
        popover="auto"
        role="dialog"
        aria-labelledby={headingId}
        aria-describedby={hintId}
        className="hbar-composer-permission-popover hbar-pre-session-approval-popover"
        onBeforeToggle={(event) => {
          if (event.newState !== 'open' || !anchor.current) return
          const rect = anchor.current.getBoundingClientRect()
          const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
          const width = Math.min(22.5 * rem, Math.max(0, innerWidth - 2 * rem))
          event.currentTarget.style.setProperty(
            '--permission-popup-left',
            `${Math.max(rem, Math.min(rect.left, innerWidth - width - rem))}px`,
          )
          event.currentTarget.style.setProperty('--permission-popup-top', 'auto')
          event.currentTarget.style.setProperty('--permission-popup-bottom', `${innerHeight - rect.top + rem / 2}px`)
          event.currentTarget.style.setProperty('--permission-popup-limit', `${Math.max(0, rect.top - 1.5 * rem)}px`)
        }}
        onToggle={(event) => {
          const opening = event.newState === 'open'
          setOpen(opening)
          if (!opening) {
            setConfirming(false)
            setError(null)
          } else {
            queueMicrotask(() =>
              popup.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')?.focus(),
            )
          }
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
        <LumenFrame className="hbar-composer-permission-heading">
          <LumenText as="strong" id={headingId}>
            {confirming ? labels.confirmTitle : labels.title}
          </LumenText>
          <LumenButton
            type="button"
            size="s"
            variant="text"
            indicator="none"
            aria-label={labels.close}
            onClick={() => close()}
          >
            <LumenIcon icon={X} tier="sm" />
          </LumenButton>
        </LumenFrame>
        {confirming ? (
          <>
            <LumenText as="p" id={hintId}>
              {labels.confirmBody(sessionLabel)}
            </LumenText>
            <LumenFrame className="hbar-composer-permission-actions">
              <LumenButton
                ref={cancelConfirmation}
                type="button"
                size="s"
                disabled={busy}
                onClick={() => {
                  setConfirming(false)
                  queueMicrotask(() =>
                    popup.current?.querySelector<HTMLButtonElement>('[data-choice="allow"]')?.focus(),
                  )
                }}
              >
                {labels.cancel}
              </LumenButton>
              <LumenButton
                type="button"
                size="s"
                tone="danger"
                disabled={busy}
                onClick={() => void select('allow', true)}
              >
                {labels.confirmAllow}
              </LumenButton>
            </LumenFrame>
          </>
        ) : (
          <LumenFrame className="hbar-composer-permission-body">
            <LumenText as="p" id={hintId} className="hbar-composer-permission-hint">
              {labels.scopeHint}
            </LumenText>
            <LumenFrame
              role="menu"
              aria-label={labels.title}
              className="hbar-composer-permission-options"
              onKeyDown={moveChoice}
            >
              {order.map((value) => (
                <LumenButton
                  key={value}
                  type="button"
                  variant="text"
                  indicator="none"
                  role="menuitemradio"
                  aria-checked={choice === value}
                  disabled={busy || disabled}
                  className="hbar-composer-permission-option"
                  data-choice={value}
                  onClick={() => {
                    if (value === 'allow' && value !== choice) setConfirming(true)
                    else void select(value)
                  }}
                >
                  <LumenIcon icon={icons[value]} tier="md" />
                  <LumenFrame className="hbar-composer-permission-description">
                    <LumenText as="span">{labels.options[value].label}</LumenText>
                    <LumenText as="span">{labels.options[value].description}</LumenText>
                  </LumenFrame>
                  {choice === value && <LumenIcon icon={Check} tier="sm" />}
                </LumenButton>
              ))}
            </LumenFrame>
            {error && (
              <LumenText as="p" role="alert">
                {labels.error(error)}
              </LumenText>
            )}
          </LumenFrame>
        )}
      </LumenFrame>
    </LumenFrame>
  )
}
