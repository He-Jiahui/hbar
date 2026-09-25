import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown, Lightbulb, RotateCcw, ShieldAlert, ShieldCheck, ShieldX, X } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import type {
  ComposerPermissionChoice,
  ComposerPermissionEntry,
  ComposerPermissionState,
  ComposerPlanModeEntry,
} from '@hbar/app-runtime'
import './composer-permission-picker.css'

export interface HbarComposerPermissionLabels {
  readonly title: string
  readonly trigger: (choiceLabel: string) => string
  readonly close: string
  readonly loading: string
  readonly retry: string
  readonly pending: string
  readonly unknown: string
  readonly scopeHint: string
  readonly inheritedSnapshotHint: (modeLabel: string | null) => string
  readonly options: Readonly<Record<ComposerPermissionChoice, { readonly label: string; readonly description: string }>>
  readonly confirmTitle: string
  readonly confirmBody: (sessionLabel: string) => string
  readonly confirmAllow: string
  readonly cancel: string
  readonly error: (code: string) => string
  readonly plan: {
    readonly label: string
    readonly description: string
    readonly scope: string
    readonly pending: string
    readonly unknown: string
    readonly loading: string
    readonly exit: string
    readonly retry: string
    readonly recheck: string
    readonly approvalPaused: string
  }
}

export interface ComposerPermissionSelection {
  readonly sessionId: string
  readonly choice: ComposerPermissionChoice
  readonly expectedRevision: number
  readonly confirmAllow?: true
}

export interface HbarComposerPermissionPickerProps {
  readonly sessionId: string
  readonly sessionLabel: string
  readonly entry: ComposerPermissionEntry | undefined
  readonly hostDefault: ComposerPermissionState['hostDefault']
  readonly connected: boolean
  readonly disabled: boolean
  readonly labels: HbarComposerPermissionLabels
  readonly onRefresh: () => Promise<void>
  readonly onSelect: (input: ComposerPermissionSelection) => Promise<void>
  readonly plan?: {
    readonly entry: ComposerPlanModeEntry | undefined
    readonly disabled?: boolean
    readonly onSetMode: (mode: 'default' | 'plan', expectedRevision: number) => Promise<void>
    readonly onRefresh: () => Promise<void>
    readonly onReconcile: () => Promise<void>
  }
}

// Four actual contract choices, not cc-haha's unsupported five-mode taxonomy.
// This bounded list grows with its content; only the viewport-limited overlay scrolls.
const choices: readonly ComposerPermissionChoice[] = ['ask', 'deny', 'allow', 'inherit']
const icons = { ask: ShieldCheck, deny: ShieldX, allow: ShieldAlert, inherit: RotateCcw }

/** The reference is a trigger-anchored overlay; coordinates apply to this container only. */
function placePopover(popover: HTMLElement, anchor: HTMLElement) {
  const rect = anchor.getBoundingClientRect()
  const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  const width = Math.min(24 * rem, innerWidth - 2 * rem)
  const above = rect.top > innerHeight - rect.bottom
  popover.style.setProperty(
    '--permission-popup-left',
    `${Math.max(rem, Math.min(rect.left, innerWidth - width - rem))}px`,
  )
  popover.style.setProperty('--permission-popup-top', above ? 'auto' : `${rect.bottom + rem / 2}px`)
  popover.style.setProperty('--permission-popup-bottom', above ? `${innerHeight - rect.top + rem / 2}px` : 'auto')
  popover.style.setProperty(
    '--permission-popup-limit',
    `${Math.max(0, (above ? rect.top : innerHeight - rect.bottom) - 1.5 * rem)}px`,
  )
}

function errorCode(reason: unknown) {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

/** A controlled next-send policy picker. The host owns drafts, default reads, and submission receipts. */
export function HbarComposerPermissionPicker(props: HbarComposerPermissionPickerProps) {
  const { sessionId, sessionLabel, hostDefault, connected, disabled, labels, onRefresh, onSelect } = props
  const entry = props.entry?.sessionId === sessionId ? props.entry : undefined
  const choice = entry?.choice ?? 'inherit'
  const revision = entry?.revision ?? 0
  const locked = entry?.locked ?? false
  const unavailable = !connected || disabled || locked
  const anchor = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const cancelConfirmation = useRef<HTMLButtonElement>(null)
  const owner = useRef({ sessionId, revision })
  const restoreFocus = useRef<string | null>(null)
  const inFlight = useRef(false)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmation, setConfirmation] = useState<{
    sessionId: string
    revision: number
    sessionLabel: string
  } | null>(null)
  const [localError, setLocalError] = useState<{ sessionId: string; revision: number; code: string } | null>(null)
  const popupId = useId()
  const headingId = useId()
  const bodyId = useId()
  const confirming =
    confirmation?.sessionId === sessionId && confirmation.revision === revision && !unavailable ? confirmation : null
  const error =
    localError?.sessionId === sessionId && localError.revision === revision
      ? localError.code
      : (entry?.error ?? (choice === 'inherit' ? hostDefault.error : null))
  const plan = props.plan
  const planEntry = plan?.entry?.sessionId === sessionId ? plan.entry : undefined
  const planSelected = planEntry?.status === 'ready' && planEntry.mode === 'plan'
  const planBlocked = planEntry?.status !== 'ready' || unavailable || busy || Boolean(plan?.disabled && !planSelected)

  useEffect(() => {
    owner.current = { sessionId, revision }
    if (restoreFocus.current !== sessionId) restoreFocus.current = null
    popup.current?.hidePopover()
  }, [sessionId, revision, unavailable])
  useEffect(() => {
    if (!busy && !unavailable && restoreFocus.current === sessionId) {
      restoreFocus.current = null
      anchor.current?.focus()
    }
  }, [busy, unavailable, sessionId, revision])
  useEffect(() => {
    if (!open) return
    const reposition = () => {
      if (popup.current && anchor.current) placePopover(popup.current, anchor.current)
    }
    window.addEventListener('resize', reposition)
    return () => window.removeEventListener('resize', reposition)
  }, [open])
  useEffect(() => {
    if (confirming) cancelConfirmation.current?.focus()
  }, [confirming])
  const refresh = () => {
    const target = { sessionId, revision }
    setLocalError(null)
    void Promise.resolve()
      .then(onRefresh)
      .catch((reason: unknown) => {
        if (owner.current.sessionId === target.sessionId && owner.current.revision === target.revision)
          setLocalError({ ...target, code: errorCode(reason) })
      })
  }
  const select = (target: ComposerPermissionSelection) => {
    if (unavailable || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setLocalError(null)
    void Promise.resolve()
      .then(() => onSelect(target))
      .then(() => {
        if (owner.current.sessionId !== target.sessionId) return
        if (popup.current?.contains(document.activeElement) || document.activeElement === document.body)
          restoreFocus.current = target.sessionId
        popup.current?.hidePopover()
      })
      .catch((reason: unknown) => {
        if (owner.current.sessionId === target.sessionId && owner.current.revision === target.expectedRevision)
          setLocalError({ sessionId: target.sessionId, revision: target.expectedRevision, code: errorCode(reason) })
      })
      .finally(() => {
        inFlight.current = false
        setBusy(false)
      })
  }
  const changePlan = (mode: 'default' | 'plan') => {
    if (!plan || planBlocked || inFlight.current) return
    const target = { sessionId, revision: planEntry?.revision ?? 0 }
    inFlight.current = true
    setBusy(true)
    setLocalError(null)
    void Promise.resolve()
      .then(() => plan.onSetMode(mode, target.revision))
      .then(() => {
        if (owner.current.sessionId === sessionId) {
          restoreFocus.current = sessionId
          popup.current?.hidePopover()
        }
      })
      .catch((reason: unknown) => {
        if (owner.current.sessionId === target.sessionId) setLocalError({ ...target, code: errorCode(reason) })
      })
      .finally(() => {
        inFlight.current = false
        setBusy(false)
      })
  }
  const checkPlan = (reconcile: boolean) => {
    if (!plan || !connected || busy || inFlight.current) return
    const target = { sessionId, revision }
    inFlight.current = true
    setBusy(true)
    setLocalError(null)
    void Promise.resolve()
      .then(() => (reconcile ? plan.onReconcile() : plan.onRefresh()))
      .catch((reason: unknown) => {
        if (owner.current.sessionId === target.sessionId) setLocalError({ ...target, code: errorCode(reason) })
      })
      .finally(() => {
        inFlight.current = false
        setBusy(false)
      })
  }
  const moveChoice = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    const options = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="menuitemradio"]:not(:disabled),[role="menuitemcheckbox"]:not(:disabled)',
      ),
    ]
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
  const feedback = (
    <LumenFrame className="hbar-composer-permission-feedback">
      {entry?.status === 'unknown' ? (
        <LumenText as="span" role="alert">
          {labels.unknown}
        </LumenText>
      ) : locked ? (
        <LumenText as="span" role="status">
          {labels.pending}
        </LumenText>
      ) : null}
      {error && entry?.status !== 'unknown' && (
        <LumenText as="span" role="alert">
          {labels.error(error)}
        </LumenText>
      )}
      {hostDefault.status === 'loading' && open && (
        <LumenText as="span" role="status">
          {labels.loading}
        </LumenText>
      )}
      {hostDefault.status === 'error' && !locked && choice === 'inherit' && (
        <LumenButton type="button" size="s" disabled={!connected || busy} onClick={refresh}>
          {labels.retry}
        </LumenButton>
      )}
      {plan && planEntry?.status === 'pending' && (
        <LumenText as="span" role="status">
          {labels.plan.pending}
        </LumenText>
      )}
      {plan && planEntry?.status === 'unknown' && (
        <LumenText as="span" role="alert">
          {labels.plan.unknown}
        </LumenText>
      )}
      {plan && planEntry?.status === 'loading' && (
        <LumenText as="span" role="status">
          {labels.plan.loading}
        </LumenText>
      )}
      {plan && planEntry?.status === 'failed' && (
        <LumenText as="span" role="alert">
          {labels.error(planEntry.error ?? 'EXECUTION_FAILED')}
        </LumenText>
      )}
    </LumenFrame>
  )
  return (
    <LumenFrame className="hbar-composer-permission-picker">
      <LumenButton
        ref={anchor}
        type="button"
        size="s"
        variant="text"
        indicator="none"
        className="hbar-composer-permission-trigger"
        data-choice={planSelected ? 'plan' : choice}
        aria-label={labels.trigger(planSelected ? labels.plan.label : labels.options[choice].label)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popupId}
        disabled={unavailable || busy}
        popoverTarget={popupId}
      >
        <LumenIcon icon={planSelected ? Lightbulb : icons[choice]} tier="sm" />
        <LumenText as="span">{planSelected ? labels.plan.label : labels.options[choice].label}</LumenText>
        <LumenIcon icon={ChevronDown} tier="sm" />
      </LumenButton>
      {!open && feedback}
      <LumenFrame
        ref={popup}
        id={popupId}
        popover="auto"
        role="dialog"
        aria-labelledby={headingId}
        aria-describedby={bodyId}
        className="hbar-composer-permission-popover"
        onBeforeToggle={(event) => {
          if (event.newState === 'open' && anchor.current) placePopover(event.currentTarget, anchor.current)
        }}
        onToggle={(event) => {
          const opening = event.newState === 'open'
          setOpen(opening)
          setConfirmation(null)
          if (opening) {
            popup.current
              ?.querySelector<HTMLButtonElement>(
                '[role="menuitemcheckbox"][aria-checked="true"], [role="menuitemradio"][aria-checked="true"]',
              )
              ?.focus()
            if (hostDefault.status !== 'loading') refresh()
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.stopPropagation()
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            popup.current?.hidePopover()
            anchor.current?.focus()
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
            onClick={() => {
              popup.current?.hidePopover()
              anchor.current?.focus()
            }}
          >
            <LumenIcon icon={X} tier="sm" />
          </LumenButton>
        </LumenFrame>
        <LumenFrame className="hbar-composer-permission-body">
          {confirming ? (
            <LumenText as="p" id={bodyId}>
              {labels.confirmBody(confirming.sessionLabel)}
            </LumenText>
          ) : (
            <>
              <LumenText as="p" id={bodyId} className="hbar-composer-permission-hint">
                {labels.scopeHint}
              </LumenText>
              {planSelected && (
                <LumenText as="p" className="hbar-composer-permission-hint">
                  {labels.plan.approvalPaused}
                </LumenText>
              )}
              <LumenFrame
                role="menu"
                aria-label={labels.title}
                onKeyDown={moveChoice}
                className="hbar-composer-permission-options"
              >
                {choices.map((value) => (
                  <LumenButton
                    key={value}
                    type="button"
                    variant="text"
                    indicator="none"
                    role="menuitemradio"
                    aria-checked={value === choice && !planSelected}
                    disabled={unavailable || busy || planSelected}
                    className="hbar-composer-permission-option"
                    data-choice={value}
                    onClick={() => {
                      if (value === 'allow' && choice !== 'allow')
                        setConfirmation({ sessionId, revision, sessionLabel })
                      else select({ sessionId, choice: value, expectedRevision: revision })
                    }}
                  >
                    <LumenIcon icon={icons[value]} tier="md" />
                    <LumenFrame className="hbar-composer-permission-description">
                      <LumenText as="span">{labels.options[value].label}</LumenText>
                      <LumenText as="span">{labels.options[value].description}</LumenText>
                    </LumenFrame>
                    {value === choice && !planSelected && <LumenIcon icon={Check} tier="sm" />}
                  </LumenButton>
                ))}
                {plan && (
                  <LumenButton
                    type="button"
                    variant="text"
                    indicator="none"
                    role="menuitemcheckbox"
                    aria-checked={planSelected}
                    disabled={planBlocked}
                    className="hbar-composer-permission-option hbar-composer-plan-option"
                    data-choice="plan"
                    onClick={() => changePlan(planSelected ? 'default' : 'plan')}
                  >
                    <LumenIcon icon={Lightbulb} tier="md" />
                    <LumenFrame className="hbar-composer-permission-description">
                      <LumenText as="span">{labels.plan.label}</LumenText>
                      <LumenText as="span">{planSelected ? labels.plan.exit : labels.plan.description}</LumenText>
                    </LumenFrame>
                    {planSelected && <LumenIcon icon={Check} tier="sm" />}
                  </LumenButton>
                )}
              </LumenFrame>
              {plan && (
                <LumenText as="p" className="hbar-composer-permission-hint">
                  {labels.plan.scope}
                </LumenText>
              )}
              {plan && planEntry?.status === 'unknown' && (
                <LumenButton type="button" size="s" disabled={!connected || busy} onClick={() => checkPlan(true)}>
                  {labels.plan.recheck}
                </LumenButton>
              )}
              {plan && (!planEntry || planEntry.status === 'failed') && (
                <LumenButton type="button" size="s" disabled={!connected || busy} onClick={() => checkPlan(false)}>
                  {labels.plan.retry}
                </LumenButton>
              )}
              <LumenText as="p" className="hbar-composer-permission-hint">
                {labels.inheritedSnapshotHint(hostDefault.mode ? labels.options[hostDefault.mode].label : null)}
              </LumenText>
            </>
          )}
          {open && feedback}
        </LumenFrame>
        {confirming && (
          <LumenFrame className="hbar-composer-permission-actions">
            <LumenButton
              ref={cancelConfirmation}
              type="button"
              size="s"
              disabled={busy}
              onClick={() => {
                setConfirmation(null)
                queueMicrotask(() =>
                  popup.current
                    ?.querySelector<HTMLButtonElement>('[role="menuitemradio"][data-choice="allow"]')
                    ?.focus(),
                )
              }}
            >
              {labels.cancel}
            </LumenButton>
            <LumenButton
              type="button"
              size="s"
              disabled={unavailable || busy}
              onClick={() =>
                select({
                  sessionId: confirming.sessionId,
                  choice: 'allow',
                  expectedRevision: confirming.revision,
                  confirmAllow: true,
                })
              }
            >
              {labels.confirmAllow}
            </LumenButton>
          </LumenFrame>
        )}
      </LumenFrame>
    </LumenFrame>
  )
}
