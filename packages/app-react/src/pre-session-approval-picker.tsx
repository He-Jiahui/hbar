import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Lightbulb,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  ShieldHalf,
  ShieldX,
  X,
} from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenContentText } from '@lumen/app-ui'
import type { ComposerPermissionChoice, ComposerPermissionMode, ComposerPlanMode } from '@hbar/app-runtime'
import type { HbarComposerPermissionLabels } from './composer-permission-picker'
import { FloatingSurface, useFloatingTrigger } from './floating-surface'
import './composer-permission-picker.css'
import './pre-session-approval-picker.css'

const order = ['ask', 'deny', 'sandbox', 'allow', 'plan', 'inherit'] as const satisfies readonly (
  ComposerPermissionChoice | 'plan'
)[]
const icons = { ask: ShieldCheck, deny: ShieldX, sandbox: ShieldHalf, allow: ShieldAlert, inherit: RotateCcw }

export interface HbarPreSessionApprovalPickerProps {
  readonly choice: ComposerPermissionChoice
  readonly planMode: ComposerPlanMode
  readonly planAvailable: boolean
  readonly planBlockedReason?: string
  readonly hostDefault: ComposerPermissionMode | null
  readonly sessionLabel: string
  readonly labels: HbarComposerPermissionLabels
  readonly disabled?: boolean
  readonly onChoose: (choice: ComposerPermissionChoice, confirmAllow?: true) => Promise<void>
  readonly onPlanMode: (mode: ComposerPlanMode) => Promise<void>
}

/** A local first-send choice; the real Session setting is applied by the Host only after creation. */
export function HbarPreSessionApprovalPicker({
  choice,
  planMode,
  planAvailable,
  planBlockedReason,
  hostDefault,
  sessionLabel,
  labels,
  disabled = false,
  onChoose,
  onPlanMode,
}: HbarPreSessionApprovalPickerProps) {
  const popupId = useId()
  const headingId = useId()
  const hintId = useId()
  const anchor = useRef<HTMLButtonElement>(null)
  const selectedOption = useRef<HTMLButtonElement>(null)
  const allowOption = useRef<HTMLButtonElement>(null)
  const cancelConfirmation = useRef<HTMLButtonElement>(null)
  const returnAllowFocus = useRef(false)
  const inFlight = useRef(false)
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const planSelected = planMode === 'plan'
  const selectedLabel = planSelected
    ? labels.plan.label
    : choice === 'inherit' && hostDefault
      ? labels.inheritedTrigger(labels.options[hostDefault].label)
      : labels.options[choice].label

  useEffect(() => {
    if (!open) return
    if (confirming) cancelConfirmation.current?.focus()
    else if (returnAllowFocus.current) {
      returnAllowFocus.current = false
      allowOption.current?.focus()
    }
  }, [confirming, open])

  const close = useCallback(() => {
    setOpen(false)
    setConfirming(false)
    returnAllowFocus.current = false
  }, [])
  const triggerEvents = useFloatingTrigger({
    open,
    onOpen: () => {
      if (disabled || inFlight.current) return
      setConfirming(false)
      setOpen(true)
    },
    onClose: close,
  })
  const select = async (next: ComposerPermissionChoice, confirmAllow?: true) => {
    if (inFlight.current || disabled) return
    if (next === choice && !planSelected) {
      close()
      return
    }
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      await onChoose(next, confirmAllow)
      setError(null)
      close()
    } catch (reason) {
      setError(
        reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
          ? reason.code
          : 'EXECUTION_FAILED',
      )
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  const selectPlan = async (mode: ComposerPlanMode) => {
    if (inFlight.current || disabled || (mode === 'plan' && (!planAvailable || planBlockedReason))) return
    if (mode === planMode) {
      close()
      return
    }
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      await onPlanMode(mode)
      setError(null)
      close()
    } catch (reason) {
      setError(
        reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
          ? reason.code
          : 'EXECUTION_FAILED',
      )
    } finally {
      inFlight.current = false
      setBusy(false)
    }
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
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    if (
      event.target !== event.currentTarget &&
      !(event.target instanceof Element && event.target.matches('[role="menuitemradio"], [role="menuitem"]'))
    )
      return
    const items = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="menuitemradio"]:not(:disabled), [role="menuitem"]:not(:disabled)',
      ),
    ]
    if (items.length === 0) return
    event.preventDefault()
    event.stopPropagation()
    const active = items.findIndex((item) => item === event.currentTarget.ownerDocument.activeElement)
    const current = active >= 0 ? active : items.findIndex((item) => item === selectedOption.current)
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
  const feedback = error ? (
    <LumenContentText context="feedback.paragraph" tone="danger" role="alert">
      {labels.error(error)}
    </LumenContentText>
  ) : null
  return (
    <LumenFrame className="hbar-composer-permission-picker hbar-pre-session-approval-picker">
      <LumenButton
        ref={anchor}
        type="button"
        size="s"
        variant="text"
        indicator="none"
        className="hbar-composer-permission-trigger"
        data-choice={planSelected ? 'plan' : choice}
        aria-label={labels.trigger(selectedLabel)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popupId}
        disabled={disabled}
        aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
        {...triggerEvents}
      >
        <LumenIcon icon={planSelected ? Lightbulb : icons[choice]} tier="sm" />
        <LumenContentText context="control.label">{selectedLabel}</LumenContentText>
        <LumenIcon icon={ChevronDown} tier="sm" />
      </LumenButton>
      <FloatingSurface
        open={open}
        onClose={close}
        anchorRef={anchor}
        initialFocusRef={selectedOption}
        responsivePresentation="narrow-sheet"
        placement="above"
        label={confirming ? labels.confirmTitle : labels.title}
        id={popupId}
        role="dialog"
        aria-labelledby={headingId}
        aria-describedby={hintId}
        className="hbar-pre-session-approval-popover"
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.stopPropagation()
          moveChoice(event)
        }}
      >
        <LumenFrame className="hbar-composer-permission-heading">
          <LumenFrame
            className="hbar-composer-permission-title-reading"
            role="group"
            aria-label={confirming ? labels.confirmTitle : labels.title}
            tabIndex={0}
          >
            <LumenContentText context="popover.title" id={headingId}>
              {confirming ? labels.confirmTitle : labels.title}
            </LumenContentText>
          </LumenFrame>
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
            <LumenFrame
              className="hbar-pre-session-approval-confirmation"
              role="region"
              aria-label={labels.confirmTitle}
              tabIndex={0}
            >
              <LumenContentText context="popover.body" id={hintId}>
                {labels.confirmBody(sessionLabel)}
              </LumenContentText>
              {feedback}
            </LumenFrame>
            <LumenFrame className="hbar-composer-permission-actions">
              <LumenButton
                ref={cancelConfirmation}
                type="button"
                size="s"
                disabled={busy}
                onClick={() => {
                  setConfirming(false)
                  returnAllowFocus.current = true
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
          <LumenFrame className="hbar-composer-permission-body" role="region" aria-label={labels.title} tabIndex={0}>
            <LumenContentText context="popover.body" id={hintId} className="hbar-composer-permission-hint">
              {planSelected ? labels.plan.scope : labels.scopeHint}
            </LumenContentText>
            <LumenFrame role="menu" aria-label={labels.title} className="hbar-composer-permission-options">
              {planSelected && (
                <LumenButton
                  ref={selectedOption}
                  type="button"
                  variant="text"
                  indicator="none"
                  role="menuitem"
                  className="hbar-composer-permission-option hbar-composer-plan-exit"
                  disabled={busy || disabled}
                  onClick={() => void selectPlan('default')}
                >
                  <LumenIcon icon={ArrowLeft} tier="md" />
                  <LumenFrame className="hbar-composer-permission-description">
                    <LumenContentText context="choice.title">{labels.plan.exit}</LumenContentText>
                    <LumenContentText context="choice.description">{labels.plan.exitDescription}</LumenContentText>
                  </LumenFrame>
                </LumenButton>
              )}
              {order.map((value) =>
                value === 'plan' ? (
                  planAvailable || planSelected ? (
                    <LumenButton
                      key={value}
                      type="button"
                      variant="text"
                      indicator="none"
                      role="menuitemradio"
                      aria-checked={planSelected}
                      disabled={busy || disabled || Boolean(planBlockedReason)}
                      className="hbar-composer-permission-option hbar-composer-plan-option"
                      data-choice="plan"
                      onClick={() => void selectPlan('plan')}
                    >
                      <LumenIcon icon={Lightbulb} tier="md" />
                      <LumenFrame className="hbar-composer-permission-description">
                        <LumenContentText context="choice.title">{labels.plan.label}</LumenContentText>
                        <LumenContentText context="choice.description">
                          {planBlockedReason ?? (planSelected ? labels.plan.selected : labels.plan.description)}
                        </LumenContentText>
                      </LumenFrame>
                      {planSelected && <LumenIcon icon={Check} tier="sm" />}
                    </LumenButton>
                  ) : null
                ) : (
                  <LumenButton
                    ref={(node) => {
                      if (value === 'allow') allowOption.current = node
                      if (!planSelected && choice === value) selectedOption.current = node
                    }}
                    key={value}
                    type="button"
                    variant="text"
                    indicator="none"
                    role="menuitemradio"
                    aria-checked={!planSelected && choice === value}
                    disabled={busy || disabled}
                    className="hbar-composer-permission-option"
                    data-choice={value}
                    onClick={() => {
                      if (value === 'allow' && (value !== choice || planSelected)) setConfirming(true)
                      else void select(value)
                    }}
                  >
                    <LumenIcon icon={icons[value]} tier="md" />
                    <LumenFrame className="hbar-composer-permission-description">
                      <LumenContentText context="choice.title">{labels.options[value].label}</LumenContentText>
                      <LumenContentText context="choice.description">
                        {labels.options[value].description}
                      </LumenContentText>
                    </LumenFrame>
                    {!planSelected && choice === value && <LumenIcon icon={Check} tier="sm" />}
                  </LumenButton>
                ),
              )}
            </LumenFrame>
            {feedback}
          </LumenFrame>
        )}
      </FloatingSurface>
      {error && !open && <LumenFrame className="hbar-pre-session-approval-closed-error">{feedback}</LumenFrame>}
    </LumenFrame>
  )
}
