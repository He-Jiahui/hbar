import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleAlert,
  Lightbulb,
  LoaderCircle,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  X,
} from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import type {
  ComposerPermissionChoice,
  ComposerPermissionEntry,
  ComposerPermissionState,
  ComposerPlanModeEntry,
} from '@hbar/app-runtime'
import './composer-permission-picker.css'

export interface HbarComposerPermissionLabels {
  readonly execution: {
    readonly loading: string
    readonly pending: string
    readonly checking: string
    readonly unknown: string
    readonly failed: string
    readonly approvalFrozen: string
    readonly checkFailed: string
    readonly readFailed: string
  }
  readonly title: string
  readonly trigger: (choiceLabel: string) => string
  readonly inheritedTrigger: (currentModeLabel: string) => string
  readonly close: string
  readonly loading: string
  readonly retry: string
  readonly pending: string
  readonly unknown: string
  readonly recheck: string
  readonly scopeHint: string
  readonly runActiveHint: string
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
    readonly selected: string
    readonly exit: string
    readonly exitDescription: string
    readonly retry: string
    readonly recheck: string
    readonly goalPrepared: string
    readonly cancelGoalPreparation: string
    readonly cancellingGoalPreparation: string
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
  readonly defaultAvailable: boolean
  readonly connected: boolean
  readonly disabled: boolean
  readonly runActive?: boolean
  readonly canPrepare?: boolean
  readonly labels: HbarComposerPermissionLabels
  readonly onRefresh: () => Promise<void>
  readonly onSelect: (input: ComposerPermissionSelection) => Promise<void>
  readonly onReconcile?: () => Promise<void>
  readonly plan?: {
    readonly entry: ComposerPlanModeEntry | undefined
    readonly disabled?: boolean
    readonly goalPreparation?: {
      readonly revision: number
      readonly onCancel: (target: { readonly sessionId: string; readonly expectedRevision: number }) => Promise<void>
    }
    readonly onSetMode: (mode: 'default' | 'plan', expectedRevision: number) => Promise<void>
    readonly onSelectOrdinary: (input: ComposerPermissionSelection, expectedModeRevision: number) => Promise<void>
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
  const width = Math.min(22.5 * rem, Math.max(0, innerWidth - 2 * rem))
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

/** A controlled session policy picker. The Host owns settings, drafts, and submission receipts. */
export function HbarComposerPermissionPicker(props: HbarComposerPermissionPickerProps) {
  const { sessionId, sessionLabel, hostDefault, connected, disabled, labels, onRefresh, onSelect } = props
  const entry = props.entry?.sessionId === sessionId ? props.entry : undefined
  const plan = props.plan
  const planEntry = plan?.entry?.sessionId === sessionId ? plan.entry : undefined
  const choice = entry?.choice ?? 'inherit'
  const revision = entry?.revision ?? 0
  const locked = entry?.locked ?? false
  const unavailable = !connected || disabled || props.runActive || locked
  const preparationUnavailable =
    unavailable || props.canPrepare === false || entry?.status === 'loading' || entry?.status === 'failed'
  const anchor = useRef<HTMLButtonElement>(null)
  const wasConnected = useRef(connected)
  const popup = useRef<HTMLDivElement>(null)
  const cancelConfirmation = useRef<HTMLButtonElement>(null)
  const owner = useRef({ sessionId, revision })
  const restoreFocus = useRef<string | null>(null)
  const inFlight = useRef(false)
  const actionGeneration = useRef(0)
  const openedGeneration = useRef<number | null>(null)
  const selectableCurrent = useRef(false)
  const [open, setOpen] = useState(false)
  const [actionBusy, setBusy] = useState(false)
  const [planAction, setPlanAction] = useState<'write' | 'read' | null>(null)
  const [planReadFailed, setPlanReadFailed] = useState(false)
  const [goalCancelBusy, setGoalCancelBusy] = useState(false)
  const [goalCancelError, setGoalCancelError] = useState<{
    readonly sessionId: string
    readonly revision: number
    readonly code: string
  } | null>(null)
  const goalCancelGeneration = useRef(0)
  const goalCancelPending = useRef(false)
  const goalCancelFocus = useRef<number | null>(null)
  const goalCancelReturn = useRef<number | null>(null)
  const goalCancelButton = useRef<HTMLButtonElement>(null)
  const busy = actionBusy || goalCancelBusy || planEntry?.reading === true
  const [confirmation, setConfirmation] = useState<{
    sessionId: string
    revision: number
    sessionLabel: string
  } | null>(null)
  const [localError, setLocalError] = useState<{ sessionId: string; revision: number; code: string } | null>(null)
  const popupId = useId()
  const headingId = useId()
  const bodyId = useId()
  const goalPreparedId = useId()
  const error =
    localError?.sessionId === sessionId && localError.revision === revision
      ? localError.code
      : (entry?.error ?? (choice === 'inherit' ? hostDefault.error : null))
  const goalPreparation = plan?.goalPreparation
  const executionStatus = !plan
    ? null
    : planAction === 'read' || (planEntry?.reading && planEntry.status !== 'loading')
      ? 'checking'
      : planAction === 'write'
        ? 'pending'
        : planEntry?.status === 'ready' && !planEntry.mode
          ? 'failed'
          : (planEntry?.status ?? 'loading')
  const executionUnresolved = executionStatus !== null && executionStatus !== 'ready'
  const planSelected = executionStatus === 'ready' && planEntry?.mode === 'plan'
  const ordinaryConfirmed = !plan || (executionStatus === 'ready' && planEntry?.mode === 'default')
  const canSelectOrdinary = ordinaryConfirmed || planSelected
  const confirming =
    confirmation?.sessionId === sessionId && confirmation.revision === revision && !unavailable && canSelectOrdinary
      ? confirmation
      : null
  const inheritedMode = choice === 'inherit' && hostDefault.status === 'ready' ? hostDefault.mode : null
  const triggerLabel = executionUnresolved
    ? labels.execution[executionStatus]
    : planSelected
      ? labels.plan.label
      : inheritedMode
        ? labels.inheritedTrigger(labels.options[inheritedMode].label)
        : labels.options[choice].label
  const triggerDisabled = Boolean(props.runActive) || (!executionUnresolved && (unavailable || busy))
  const planBlocked =
    executionStatus !== 'ready' ||
    preparationUnavailable ||
    busy ||
    Boolean((plan?.disabled || goalPreparation) && !planSelected)

  useEffect(() => {
    const reconnected = connected && !wasConnected.current
    wasConnected.current = connected
    if (connected && props.defaultAvailable && (hostDefault.status === 'idle' || reconnected))
      void onRefresh().catch(() => undefined)
  }, [connected, props.defaultAvailable, hostDefault.status, onRefresh])

  useLayoutEffect(() => {
    actionGeneration.current += 1
    inFlight.current = false
    setBusy(false)
    setPlanAction(null)
    setPlanReadFailed(false)
    setLocalError(null)
    setConfirmation(null)
    openedGeneration.current = null
    return () => {
      actionGeneration.current += 1
      inFlight.current = false
    }
  }, [sessionId])
  useLayoutEffect(() => {
    selectableCurrent.current = canSelectOrdinary
  }, [canSelectOrdinary])

  useEffect(() => {
    const generation = goalCancelGeneration.current + 1
    goalCancelGeneration.current = generation
    goalCancelPending.current = false
    goalCancelFocus.current = null
    goalCancelReturn.current = null
    setGoalCancelBusy(false)
    setGoalCancelError(null)
    return () => {
      goalCancelGeneration.current = generation + 1
      goalCancelPending.current = false
      goalCancelFocus.current = null
      goalCancelReturn.current = null
    }
  }, [sessionId])
  useEffect(() => {
    if (busy || goalPreparation || goalCancelFocus.current !== goalCancelGeneration.current) return
    goalCancelFocus.current = null
    if (
      popup.current?.matches(':popover-open') &&
      (document.activeElement === goalCancelButton.current || document.activeElement === document.body)
    )
      popup.current.querySelector<HTMLButtonElement>('[data-choice="plan"]:not(:disabled)')?.focus()
  }, [busy, goalPreparation])
  useEffect(() => {
    if (busy || goalCancelReturn.current !== goalCancelGeneration.current) return
    goalCancelReturn.current = null
    const active = document.activeElement
    // Closing while the trigger is disabled defers its focus return. A later
    // deliberate focus move or another top-layer interaction wins over it.
    if (
      !unavailable &&
      !document.querySelector('dialog[open], [popover]:popover-open') &&
      (active === document.body || (active && popup.current?.contains(active)) || !active?.isConnected)
    )
      anchor.current?.focus()
  }, [busy, unavailable])
  const closePopover = () => {
    if (goalCancelPending.current) goalCancelReturn.current = goalCancelGeneration.current
    popup.current?.hidePopover()
    anchor.current?.focus()
  }

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
    const generation = actionGeneration.current
    const target = { sessionId, revision }
    setLocalError(null)
    void Promise.resolve()
      .then(() => {
        if (actionGeneration.current === generation) return onRefresh()
        return undefined
      })
      .catch((reason: unknown) => {
        if (
          actionGeneration.current === generation &&
          owner.current.sessionId === target.sessionId &&
          owner.current.revision === target.revision
        )
          setLocalError({ ...target, code: errorCode(reason) })
      })
  }
  const select = (target: ComposerPermissionSelection) => {
    if (!canSelectOrdinary || preparationUnavailable || busy || goalCancelPending.current || inFlight.current) return
    const fromPlan = planSelected
    const modeRevision = planEntry?.revision ?? 0
    const generation = actionGeneration.current
    inFlight.current = true
    setBusy(true)
    setLocalError(null)
    void Promise.resolve()
      .then(async () => {
        if (actionGeneration.current !== generation || !selectableCurrent.current) return false
        if (fromPlan && plan) await plan.onSelectOrdinary(target, modeRevision)
        else await onSelect(target)
        return true
      })
      .then((applied) => {
        if (!applied || actionGeneration.current !== generation || owner.current.sessionId !== target.sessionId) return
        if (popup.current?.contains(document.activeElement) || document.activeElement === document.body)
          restoreFocus.current = target.sessionId
        popup.current?.hidePopover()
      })
      .catch((reason: unknown) => {
        if (
          actionGeneration.current === generation &&
          owner.current.sessionId === target.sessionId &&
          owner.current.revision === target.expectedRevision
        )
          setLocalError({ sessionId: target.sessionId, revision: target.expectedRevision, code: errorCode(reason) })
      })
      .finally(() => {
        if (actionGeneration.current !== generation) return
        inFlight.current = false
        setBusy(false)
      })
  }
  const cancelGoalPreparation = () => {
    if (!goalPreparation || unavailable || busy || inFlight.current || goalCancelPending.current) return
    const generation = goalCancelGeneration.current
    const target = { sessionId, expectedRevision: goalPreparation.revision }
    goalCancelPending.current = true
    setGoalCancelBusy(true)
    setGoalCancelError(null)
    void Promise.resolve()
      .then(() => goalPreparation.onCancel(target))
      .then(() => {
        if (goalCancelGeneration.current === generation) goalCancelFocus.current = generation
      })
      .catch((reason: unknown) => {
        if (goalCancelGeneration.current === generation)
          setGoalCancelError({
            sessionId: target.sessionId,
            revision: target.expectedRevision,
            code: errorCode(reason),
          })
      })
      .finally(() => {
        if (goalCancelGeneration.current !== generation) return
        goalCancelPending.current = false
        setGoalCancelBusy(false)
      })
  }
  const changePlan = (mode: 'default' | 'plan') => {
    if (!plan || planBlocked || goalCancelPending.current || inFlight.current) return
    const target = { sessionId, revision: planEntry?.revision ?? 0 }
    const generation = actionGeneration.current
    inFlight.current = true
    setBusy(true)
    setPlanAction('write')
    setPlanReadFailed(false)
    setLocalError(null)
    void Promise.resolve()
      .then(() => {
        if (actionGeneration.current === generation) return plan.onSetMode(mode, target.revision)
        return undefined
      })
      .then(() => {
        if (actionGeneration.current === generation && owner.current.sessionId === sessionId) {
          if (
            popup.current?.matches(':popover-open') &&
            (popup.current.contains(document.activeElement) || document.activeElement === document.body)
          )
            restoreFocus.current = sessionId
          popup.current?.hidePopover()
        }
      })
      .catch(() => {
        // The canonical write result carries failed/unknown; this was not a recovery read.
      })
      .finally(() => {
        if (actionGeneration.current !== generation) return
        inFlight.current = false
        setPlanAction(null)
        setBusy(false)
      })
  }
  const checkPlan = (reconcile: boolean) => {
    if (!plan || !connected || busy || goalCancelPending.current || inFlight.current) return
    const generation = actionGeneration.current
    inFlight.current = true
    setBusy(true)
    setPlanAction('read')
    setPlanReadFailed(false)
    setLocalError(null)
    void Promise.resolve()
      .then(() => {
        if (actionGeneration.current === generation) return reconcile ? plan.onReconcile() : plan.onRefresh()
        return undefined
      })
      .catch(() => {
        if (actionGeneration.current === generation) setPlanReadFailed(true)
      })
      .finally(() => {
        if (actionGeneration.current !== generation) return
        inFlight.current = false
        setPlanAction(null)
        setBusy(false)
      })
  }
  const moveChoice = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    const options = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]:not(:disabled)'),
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
  const approvalFeedback = (
    <LumenFrame className="hbar-composer-permission-feedback">
      {entry?.status === 'unknown' ? (
        <LumenText as="span" role="alert">
          {labels.unknown}
        </LumenText>
      ) : locked || entry?.status === 'loading' ? (
        <LumenText as="span" role="status">
          {entry?.status === 'loading' ? labels.loading : labels.pending}
        </LumenText>
      ) : null}
      {entry?.writeUnknown && props.onReconcile && (
        <LumenButton
          type="button"
          size="s"
          disabled={!connected || busy}
          loading={actionBusy}
          onClick={() => {
            if (inFlight.current) return
            const generation = actionGeneration.current
            inFlight.current = true
            setBusy(true)
            setLocalError(null)
            void props
              .onReconcile?.()
              .catch((reason: unknown) => {
                if (actionGeneration.current === generation && owner.current.sessionId === sessionId)
                  setLocalError({ sessionId, revision, code: errorCode(reason) })
              })
              .finally(() => {
                if (actionGeneration.current !== generation) return
                inFlight.current = false
                setBusy(false)
              })
          }}
        >
          {labels.recheck}
        </LumenButton>
      )}
      {error &&
        (entry?.status !== 'unknown' || (localError?.sessionId === sessionId && localError.revision === revision)) && (
          <LumenText as="span" role="alert">
            {labels.error(error)}
          </LumenText>
        )}
      {hostDefault.status === 'loading' && open && (
        <LumenText as="span" role="status">
          {labels.loading}
        </LumenText>
      )}
      {((hostDefault.status === 'error' && choice === 'inherit') || entry?.status === 'failed') && !locked && (
        <LumenButton type="button" size="s" disabled={!connected || busy} onClick={refresh}>
          {labels.retry}
        </LumenButton>
      )}
    </LumenFrame>
  )
  const executionFeedback = executionUnresolved ? (
    <LumenFrame className="hbar-composer-permission-feedback">
      {executionStatus === 'pending' && (
        <LumenText as="span" role="status">
          {labels.plan.pending}
        </LumenText>
      )}
      {executionStatus === 'checking' && (
        <LumenText as="span" role="status">
          {labels.execution.checking}
        </LumenText>
      )}
      {executionStatus === 'unknown' && (
        <LumenText as="span" role="alert">
          {planReadFailed || (planEntry?.error && planEntry.error !== 'RESULT_UNKNOWN')
            ? labels.execution.checkFailed
            : labels.plan.unknown}
        </LumenText>
      )}
      {executionStatus === 'loading' && (
        <LumenText as="span" role="status">
          {labels.plan.loading}
        </LumenText>
      )}
      {executionStatus === 'failed' && (
        <LumenText as="span" role="alert">
          {labels.execution.readFailed}
        </LumenText>
      )}
    </LumenFrame>
  ) : null
  return (
    <LumenFrame className="hbar-composer-permission-picker">
      <LumenButton
        ref={anchor}
        type="button"
        size="s"
        variant="text"
        indicator="none"
        className="hbar-composer-permission-trigger"
        data-choice={executionUnresolved ? executionStatus : planSelected ? 'plan' : choice}
        aria-label={labels.trigger(triggerLabel)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popupId}
        title={props.runActive ? labels.runActiveHint : undefined}
        disabled={triggerDisabled}
        popoverTarget={popupId}
      >
        <LumenIcon
          icon={
            executionUnresolved
              ? executionStatus === 'unknown' || executionStatus === 'failed'
                ? CircleAlert
                : LoaderCircle
              : planSelected
                ? Lightbulb
                : icons[inheritedMode ?? choice]
          }
          tier="sm"
        />
        <LumenText as="span">{triggerLabel}</LumenText>
        <LumenIcon icon={ChevronDown} tier="sm" />
      </LumenButton>
      {!open && (
        <>
          {approvalFeedback}
          {executionFeedback}
        </>
      )}
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
          const sameOpening = openedGeneration.current === actionGeneration.current
          openedGeneration.current = opening ? actionGeneration.current : null
          // Native Escape can light-dismiss while a disabled action has left
          // focus on BODY, so no key event reaches this popover's handler.
          if (!opening && goalCancelPending.current) goalCancelReturn.current = goalCancelGeneration.current
          if (
            !opening &&
            sameOpening &&
            executionUnresolved &&
            owner.current.sessionId === sessionId &&
            !document.querySelector('dialog[open], [popover]:popover-open') &&
            (document.activeElement === document.body || !document.activeElement?.isConnected)
          )
            anchor.current?.focus()
          setOpen(opening)
          setConfirmation(null)
          if (opening) {
            const selected = planSelected
              ? popup.current?.querySelector<HTMLButtonElement>('[data-plan-exit]:not(:disabled)')
              : popup.current?.querySelector<HTMLButtonElement>(
                  '[role="menuitemradio"][aria-checked="true"]:not(:disabled)',
                )
            ;(
              selected ??
              popup.current?.querySelector<HTMLButtonElement>('[data-execution-recovery]:not(:disabled)') ??
              popup.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')
            )?.focus()
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.stopPropagation()
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            closePopover()
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
            onClick={closePopover}
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
              {executionUnresolved && (
                <LumenFrame className="hbar-composer-permission-feedback" data-execution-recovery-region>
                  {executionFeedback}
                  <LumenText as="p" className="hbar-composer-permission-hint">
                    {labels.execution.approvalFrozen}
                  </LumenText>
                  {plan && planEntry?.status === 'unknown' && (
                    <LumenButton
                      data-execution-recovery
                      type="button"
                      size="s"
                      disabled={!connected || busy}
                      loading={planEntry.reading || planAction === 'read'}
                      onClick={() => checkPlan(true)}
                    >
                      {planEntry.reading || planAction === 'read' ? labels.execution.checking : labels.plan.recheck}
                    </LumenButton>
                  )}
                  {plan && (!planEntry || planEntry.status === 'failed') && (
                    <LumenButton
                      data-execution-recovery
                      type="button"
                      size="s"
                      disabled={!connected || busy}
                      onClick={() => checkPlan(false)}
                    >
                      {labels.plan.retry}
                    </LumenButton>
                  )}
                </LumenFrame>
              )}
              {planSelected && (
                <LumenButton
                  type="button"
                  variant="text"
                  indicator="none"
                  data-plan-exit
                  className="hbar-composer-permission-option hbar-composer-plan-exit"
                  aria-label={labels.plan.exit}
                  disabled={planBlocked}
                  onClick={() => changePlan('default')}
                >
                  <LumenIcon icon={ArrowLeft} tier="md" />
                  <LumenFrame className="hbar-composer-permission-description">
                    <LumenText as="span">{labels.plan.exit}</LumenText>
                    <LumenText as="span">{labels.plan.exitDescription}</LumenText>
                  </LumenFrame>
                </LumenButton>
              )}
              {!planSelected && (
                <LumenText as="p" id={bodyId} className="hbar-composer-permission-hint">
                  {labels.scopeHint}
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
                    aria-checked={value === choice && ordinaryConfirmed}
                    disabled={preparationUnavailable || busy || !canSelectOrdinary}
                    className="hbar-composer-permission-option"
                    data-choice={value}
                    onClick={() => {
                      if (!canSelectOrdinary) return
                      if (value === 'allow' && (choice !== 'allow' || planSelected))
                        setConfirmation({ sessionId, revision, sessionLabel })
                      else select({ sessionId, choice: value, expectedRevision: revision })
                    }}
                  >
                    <LumenIcon icon={icons[value]} tier="md" />
                    <LumenFrame className="hbar-composer-permission-description">
                      <LumenText as="span">{labels.options[value].label}</LumenText>
                      <LumenText as="span">
                        {value === 'inherit'
                          ? labels.inheritedSnapshotHint(
                              hostDefault.mode ? labels.options[hostDefault.mode].label : null,
                            )
                          : labels.options[value].description}
                      </LumenText>
                    </LumenFrame>
                    {value === choice && ordinaryConfirmed && <LumenIcon icon={Check} tier="sm" />}
                  </LumenButton>
                ))}
                {plan && (
                  <LumenButton
                    type="button"
                    variant="text"
                    indicator="none"
                    role="menuitemradio"
                    aria-checked={planSelected}
                    aria-describedby={goalPreparation && !planSelected ? goalPreparedId : undefined}
                    disabled={planBlocked}
                    className="hbar-composer-permission-option hbar-composer-plan-option"
                    data-choice="plan"
                    onClick={() => {
                      if (planSelected) closePopover()
                      else changePlan('plan')
                    }}
                  >
                    <LumenIcon icon={Lightbulb} tier="md" />
                    <LumenFrame className="hbar-composer-permission-description">
                      <LumenText as="span">{labels.plan.label}</LumenText>
                      <LumenText as="span">{planSelected ? labels.plan.selected : labels.plan.description}</LumenText>
                    </LumenFrame>
                    {planSelected && <LumenIcon icon={Check} tier="sm" />}
                  </LumenButton>
                )}
              </LumenFrame>
              {goalPreparation && !planSelected && (
                <LumenFrame className="hbar-composer-permission-goal-recovery">
                  <LumenText as="p" id={goalPreparedId}>
                    {labels.plan.goalPrepared}
                  </LumenText>
                  <LumenButton
                    ref={goalCancelButton}
                    type="button"
                    size="s"
                    disabled={unavailable || busy}
                    aria-describedby={goalPreparedId}
                    onClick={cancelGoalPreparation}
                  >
                    {goalCancelBusy ? labels.plan.cancellingGoalPreparation : labels.plan.cancelGoalPreparation}
                  </LumenButton>
                  {goalCancelError?.sessionId === sessionId &&
                    goalCancelError.revision === goalPreparation.revision && (
                      <LumenText as="p" role="alert">
                        {labels.error(goalCancelError.code)}
                      </LumenText>
                    )}
                </LumenFrame>
              )}
              {plan && (planSelected || executionUnresolved) && (
                <LumenText as="p" id={planSelected ? bodyId : undefined} className="hbar-composer-permission-hint">
                  {labels.plan.scope}
                </LumenText>
              )}
            </>
          )}
          {open && approvalFeedback}
        </LumenFrame>
        {confirming && (
          <LumenFrame className="hbar-composer-permission-actions">
            <LumenButton
              ref={cancelConfirmation}
              type="button"
              size="s"
              disabled={busy}
              onClick={() => {
                const generation = actionGeneration.current
                setConfirmation(null)
                queueMicrotask(() => {
                  if (actionGeneration.current !== generation || !popup.current?.matches(':popover-open')) return
                  popup.current
                    .querySelector<HTMLButtonElement>('[role="menuitemradio"][data-choice="allow"]:not(:disabled)')
                    ?.focus()
                })
              }}
            >
              {labels.cancel}
            </LumenButton>
            <LumenButton
              type="button"
              size="s"
              disabled={preparationUnavailable || busy}
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
