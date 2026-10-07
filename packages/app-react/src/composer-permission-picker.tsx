import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
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
  ShieldHalf,
  ShieldX,
  X,
} from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenContentText } from '@lumen/app-ui'
import type {
  ComposerPermissionChoice,
  ComposerPermissionEntry,
  ComposerPermissionState,
  ComposerPlanModeEntry,
} from '@hbar/app-runtime'
import { FloatingSurface, useFloatingTrigger } from './floating-surface'
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

// Plan occupies the reference's execution-mode position, but remains a separate
// durable Host mode. The other four entries are per-send approval choices.
// This bounded list grows with its content; only the viewport-limited overlay scrolls.
const choiceOrder = ['ask', 'deny', 'sandbox', 'allow', 'plan', 'inherit'] as const satisfies readonly (
  ComposerPermissionChoice | 'plan'
)[]
const icons = { ask: ShieldCheck, deny: ShieldX, sandbox: ShieldHalf, allow: ShieldAlert, inherit: RotateCcw }

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
  const initialFocus = useRef<HTMLButtonElement>(null)
  const focusRecovery = useRef<HTMLButtonElement | null>(null)
  const planOption = useRef<HTMLButtonElement>(null)
  const allowOption = useRef<HTMLButtonElement>(null)
  const cancelConfirmation = useRef<HTMLButtonElement>(null)
  const returnAllowFocus = useRef(false)
  const owner = useRef({ sessionId, revision })
  const inFlight = useRef(false)
  const actionGeneration = useRef(0)
  const selectableCurrent = useRef(false)
  const [open, setOpen] = useState(false)
  const openRef = useRef(open)
  openRef.current = open
  const surfaceGeneration = useRef(0)
  const [actionBusy, setBusy] = useState(false)
  const [approvalAction, setApprovalAction] = useState<'read' | 'write' | null>(null)
  const [planAction, setPlanAction] = useState<'write' | 'read' | null>(null)
  const [planReconcile, setPlanReconcile] = useState(false)
  const [planReadFailed, setPlanReadFailed] = useState(false)
  const [goalCancelBusy, setGoalCancelBusy] = useState(false)
  const [goalCancelError, setGoalCancelError] = useState<{
    readonly sessionId: string
    readonly revision: number
    readonly code: string
  } | null>(null)
  const goalCancelGeneration = useRef(0)
  const goalCancelPending = useRef(false)
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
  const triggerDisabled =
    Boolean(props.runActive) || (!executionUnresolved && unavailable && !actionBusy && !goalCancelBusy)
  const planBlocked =
    executionStatus !== 'ready' ||
    preparationUnavailable ||
    busy ||
    Boolean((plan?.disabled || goalPreparation) && !planSelected)
  let initialFocusKind: 'choice' | 'exit' | 'recovery' | 'close' = 'close'
  if (planSelected && !planBlocked) initialFocusKind = 'exit'
  else if (canSelectOrdinary && !preparationUnavailable && !busy) initialFocusKind = 'choice'
  else if (connected && !busy && plan && (!planEntry || ['unknown', 'failed'].includes(planEntry.status)))
    initialFocusKind = 'recovery'

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
    setApprovalAction(null)
    setPlanAction(null)
    setPlanReconcile(false)
    setPlanReadFailed(false)
    setLocalError(null)
    setConfirmation(null)
    openRef.current = false
    setOpen(false)
    focusRecovery.current = null
    returnAllowFocus.current = false
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
    focusRecovery.current = null
    setGoalCancelBusy(false)
    setGoalCancelError(null)
    return () => {
      goalCancelGeneration.current = generation + 1
      goalCancelPending.current = false
      focusRecovery.current = null
    }
  }, [sessionId])
  const closePopover = useCallback(() => {
    surfaceGeneration.current += 1
    openRef.current = false
    setOpen(false)
    setConfirmation(null)
    returnAllowFocus.current = false
    focusRecovery.current = null
  }, [])
  useLayoutEffect(() => {
    owner.current = { sessionId, revision }
    closePopover()
  }, [sessionId, revision, unavailable, closePopover])
  useLayoutEffect(() => {
    if (!open) return
    if (confirming) cancelConfirmation.current?.focus()
    else if (returnAllowFocus.current) {
      returnAllowFocus.current = false
      allowOption.current?.focus()
    }
  }, [open, confirming])
  const triggerEvents = useFloatingTrigger({
    open,
    onOpen: () => {
      if (triggerDisabled) return
      surfaceGeneration.current += 1
      setConfirmation(null)
      focusRecovery.current = null
      openRef.current = true
      setOpen(true)
    },
    onClose: closePopover,
  })
  const refresh = () => {
    if (!connected || busy || inFlight.current || goalCancelPending.current) return
    const generation = actionGeneration.current
    const target = { sessionId, revision }
    inFlight.current = true
    setBusy(true)
    setApprovalAction('read')
    setLocalError(null)
    void Promise.resolve()
      .then(() => {
        if (actionGeneration.current === generation) return onRefresh()
        return undefined
      })
      .finally(() => {
        if (actionGeneration.current !== generation) return
        inFlight.current = false
        setBusy(false)
        setApprovalAction(null)
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
    if (!fromPlan && target.choice === choice) {
      closePopover()
      return
    }
    const modeRevision = planEntry?.revision ?? 0
    const generation = actionGeneration.current
    const surfaceIntent = surfaceGeneration.current
    inFlight.current = true
    setBusy(true)
    setApprovalAction('write')
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
        if (openRef.current && surfaceGeneration.current === surfaceIntent) closePopover()
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
        setApprovalAction(null)
      })
  }
  const cancelGoalPreparation = () => {
    if (!goalPreparation || unavailable || busy || inFlight.current || goalCancelPending.current) return
    const generation = goalCancelGeneration.current
    const target = { sessionId, expectedRevision: goalPreparation.revision }
    goalCancelPending.current = true
    focusRecovery.current = planOption.current
    setGoalCancelBusy(true)
    setGoalCancelError(null)
    void Promise.resolve()
      .then(() => goalPreparation.onCancel(target))
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
    const surfaceIntent = surfaceGeneration.current
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
        if (
          actionGeneration.current === generation &&
          owner.current.sessionId === target.sessionId &&
          openRef.current &&
          surfaceGeneration.current === surfaceIntent
        )
          closePopover()
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
    setPlanReconcile(reconcile)
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
    if (
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      !(event.target instanceof HTMLElement) ||
      event.target.getAttribute('role') !== 'menuitemradio'
    )
      return
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    const options = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="menuitemradio"]:not(:disabled):not([aria-disabled="true"])',
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
  const approvalFeedback = (
    <LumenFrame className="hbar-composer-permission-feedback">
      {actionBusy && !planAction && !locked && entry?.status !== 'loading' && (
        <LumenContentText context="feedback.detail" role="status">
          {approvalAction === 'read' ? labels.loading : labels.pending}
        </LumenContentText>
      )}
      {entry?.status === 'unknown' ? (
        <LumenContentText context="feedback.detail" role="alert">
          {labels.unknown}
        </LumenContentText>
      ) : locked || entry?.status === 'loading' ? (
        <LumenContentText context="feedback.detail" role="status">
          {entry?.status === 'loading' ? labels.loading : labels.pending}
        </LumenContentText>
      ) : null}
      {entry?.writeUnknown && props.onReconcile && (
        <LumenButton
          type="button"
          size="s"
          disabled={!connected || goalCancelBusy || Boolean(planAction)}
          aria-disabled={busy || undefined}
          aria-busy={actionBusy || undefined}
          indicatorState={actionBusy ? 'running' : undefined}
          onClick={() => {
            if (!connected || busy || inFlight.current || goalCancelPending.current) return
            const generation = actionGeneration.current
            inFlight.current = true
            setBusy(true)
            setApprovalAction('read')
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
                setApprovalAction(null)
              })
          }}
        >
          {labels.recheck}
        </LumenButton>
      )}
      {error &&
        (entry?.status !== 'unknown' || (localError?.sessionId === sessionId && localError.revision === revision)) && (
          <LumenContentText context="feedback.detail" role="alert">
            {labels.error(error)}
          </LumenContentText>
        )}
      {hostDefault.status === 'loading' && open && (
        <LumenContentText context="feedback.detail" role="status">
          {labels.loading}
        </LumenContentText>
      )}
      {((hostDefault.status === 'error' && choice === 'inherit') || entry?.status === 'failed') && !locked && (
        <LumenButton
          type="button"
          size="s"
          disabled={!connected || goalCancelBusy || Boolean(planAction)}
          aria-disabled={busy || undefined}
          aria-busy={actionBusy || undefined}
          indicatorState={actionBusy ? 'running' : undefined}
          onClick={refresh}
        >
          {labels.retry}
        </LumenButton>
      )}
    </LumenFrame>
  )
  const executionFeedback = executionUnresolved ? (
    <LumenFrame className="hbar-composer-permission-feedback">
      {executionStatus === 'pending' && (
        <LumenContentText context="feedback.detail" role="status">
          {labels.plan.pending}
        </LumenContentText>
      )}
      {executionStatus === 'checking' && (
        <LumenContentText context="feedback.detail" role="status">
          {labels.execution.checking}
        </LumenContentText>
      )}
      {executionStatus === 'unknown' && (
        <LumenContentText context="feedback.detail" role="alert">
          {planReadFailed || (planEntry?.error && planEntry.error !== 'RESULT_UNKNOWN')
            ? labels.execution.checkFailed
            : labels.plan.unknown}
        </LumenContentText>
      )}
      {executionStatus === 'loading' && (
        <LumenContentText context="feedback.detail" role="status">
          {labels.plan.loading}
        </LumenContentText>
      )}
      {executionStatus === 'failed' && (
        <LumenContentText context="feedback.detail" role="alert">
          {labels.execution.readFailed}
        </LumenContentText>
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
        title={props.runActive ? labels.runActiveHint : triggerLabel}
        disabled={triggerDisabled}
        aria-busy={busy || undefined}
        {...triggerEvents}
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
        <LumenContentText context="control.label">{triggerLabel}</LumenContentText>
        <LumenIcon icon={ChevronDown} tier="sm" />
      </LumenButton>
      {!open && (
        <>
          {approvalFeedback}
          {executionFeedback}
          {goalCancelBusy && (
            <LumenContentText context="feedback.detail" role="status">
              {labels.plan.cancellingGoalPreparation}
            </LumenContentText>
          )}
          {goalPreparation &&
            goalCancelError?.sessionId === sessionId &&
            goalCancelError.revision === goalPreparation.revision && (
              <LumenContentText context="feedback.detail" role="alert">
                {labels.error(goalCancelError.code)}
              </LumenContentText>
            )}
        </>
      )}
      <FloatingSurface
        id={popupId}
        open={open}
        onClose={closePopover}
        anchorRef={anchor}
        initialFocusRef={initialFocus}
        focusRecoveryRef={focusRecovery}
        placement="above"
        anchorAlignment="start"
        responsivePresentation="narrow-sheet"
        label={confirming ? labels.confirmTitle : labels.title}
        aria-labelledby={headingId}
        aria-describedby={bodyId}
        className="hbar-composer-permission-surface"
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.stopPropagation()
        }}
      >
        <LumenFrame className="hbar-composer-permission-heading">
          <LumenFrame
            className="hbar-composer-permission-title-rail"
            role="region"
            aria-label={confirming ? labels.confirmTitle : labels.title}
            tabIndex={0}
          >
            <LumenContentText context="popover.title" id={headingId}>
              {confirming ? labels.confirmTitle : labels.title}
            </LumenContentText>
          </LumenFrame>
          <LumenButton
            ref={initialFocusKind === 'close' ? initialFocus : undefined}
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
        <LumenFrame
          className="hbar-composer-permission-body"
          role="region"
          aria-label={confirming ? labels.confirmTitle : labels.title}
          tabIndex={0}
        >
          {confirming ? (
            <LumenContentText context="dialog.body" id={bodyId}>
              {labels.confirmBody(confirming.sessionLabel)}
            </LumenContentText>
          ) : (
            <>
              {executionUnresolved && (
                <LumenFrame className="hbar-composer-permission-feedback" data-execution-recovery-region>
                  {executionFeedback}
                  <LumenContentText context="popover.body" className="hbar-composer-permission-hint">
                    {labels.execution.approvalFrozen}
                  </LumenContentText>
                  {plan && (planAction === 'read' ? planReconcile : planEntry?.status === 'unknown') && (
                    <LumenButton
                      data-execution-recovery
                      ref={initialFocusKind === 'recovery' ? initialFocus : undefined}
                      type="button"
                      size="s"
                      disabled={!connected || goalCancelBusy || planAction === 'write'}
                      aria-disabled={busy || undefined}
                      aria-busy={planEntry?.reading || planAction === 'read' || undefined}
                      indicatorState={planEntry?.reading || planAction === 'read' ? 'running' : undefined}
                      onClick={() => checkPlan(true)}
                    >
                      {planEntry?.reading || planAction === 'read' ? labels.execution.checking : labels.plan.recheck}
                    </LumenButton>
                  )}
                  {plan && (planAction === 'read' ? !planReconcile : !planEntry || planEntry.status === 'failed') && (
                    <LumenButton
                      data-execution-recovery
                      ref={initialFocusKind === 'recovery' ? initialFocus : undefined}
                      type="button"
                      size="s"
                      disabled={!connected || goalCancelBusy || planAction === 'write'}
                      aria-disabled={busy || undefined}
                      aria-busy={planAction === 'read' || undefined}
                      indicatorState={planAction === 'read' ? 'running' : undefined}
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
                  ref={initialFocusKind === 'exit' ? initialFocus : undefined}
                  className="hbar-composer-permission-option hbar-composer-plan-exit"
                  aria-label={labels.plan.exit}
                  disabled={preparationUnavailable}
                  aria-disabled={planBlocked || undefined}
                  aria-busy={planAction === 'write' || undefined}
                  onClick={() => changePlan('default')}
                >
                  <LumenIcon icon={ArrowLeft} tier="md" />
                  <LumenFrame className="hbar-composer-permission-description">
                    <LumenContentText context="choice.title">{labels.plan.exit}</LumenContentText>
                    <LumenContentText context="choice.description">{labels.plan.exitDescription}</LumenContentText>
                  </LumenFrame>
                </LumenButton>
              )}
              {!planSelected && (
                <LumenContentText context="popover.body" id={bodyId} className="hbar-composer-permission-hint">
                  {labels.scopeHint}
                </LumenContentText>
              )}
              <LumenFrame
                role="menu"
                aria-label={labels.title}
                onKeyDown={moveChoice}
                className="hbar-composer-permission-options"
              >
                {choiceOrder.map((value) =>
                  value === 'plan' ? (
                    plan ? (
                      <LumenButton
                        key={value}
                        ref={planOption}
                        type="button"
                        variant="text"
                        indicator="none"
                        role="menuitemradio"
                        aria-checked={planSelected}
                        aria-describedby={goalPreparation && !planSelected ? goalPreparedId : undefined}
                        disabled={
                          planBlocked && !((goalCancelBusy || planAction === 'write') && !preparationUnavailable)
                        }
                        aria-disabled={planBlocked || undefined}
                        aria-busy={planAction === 'write' || undefined}
                        className="hbar-composer-permission-option hbar-composer-plan-option"
                        data-choice="plan"
                        onClick={() => {
                          if (planBlocked) return
                          if (planSelected) closePopover()
                          else changePlan('plan')
                        }}
                      >
                        <LumenIcon icon={Lightbulb} tier="md" />
                        <LumenFrame className="hbar-composer-permission-description">
                          <LumenContentText context="choice.title">{labels.plan.label}</LumenContentText>
                          <LumenContentText context="choice.description">
                            {planSelected ? labels.plan.selected : labels.plan.description}
                          </LumenContentText>
                        </LumenFrame>
                        {planSelected && <LumenIcon icon={Check} tier="sm" />}
                      </LumenButton>
                    ) : null
                  ) : (
                    <LumenButton
                      key={value}
                      ref={(element) => {
                        if (value === 'allow') allowOption.current = element
                        if (value === choice && initialFocusKind === 'choice') initialFocus.current = element
                      }}
                      type="button"
                      variant="text"
                      indicator="none"
                      role="menuitemradio"
                      aria-checked={value === choice && ordinaryConfirmed}
                      disabled={preparationUnavailable || (!canSelectOrdinary && planAction !== 'write')}
                      aria-disabled={busy || !canSelectOrdinary || undefined}
                      aria-busy={(approvalAction === 'write' && actionBusy) || undefined}
                      className="hbar-composer-permission-option"
                      data-choice={value}
                      onClick={() => {
                        if (!canSelectOrdinary || preparationUnavailable || busy || inFlight.current) return
                        if (value === 'allow' && (choice !== 'allow' || planSelected))
                          setConfirmation({ sessionId, revision, sessionLabel })
                        else select({ sessionId, choice: value, expectedRevision: revision })
                      }}
                    >
                      <LumenIcon icon={icons[value]} tier="md" />
                      <LumenFrame className="hbar-composer-permission-description">
                        <LumenContentText context="choice.title">{labels.options[value].label}</LumenContentText>
                        <LumenContentText context="choice.description">
                          {value === 'inherit'
                            ? labels.inheritedSnapshotHint(
                                hostDefault.mode ? labels.options[hostDefault.mode].label : null,
                              )
                            : labels.options[value].description}
                        </LumenContentText>
                      </LumenFrame>
                      {value === choice && ordinaryConfirmed && <LumenIcon icon={Check} tier="sm" />}
                    </LumenButton>
                  ),
                )}
              </LumenFrame>
              {goalPreparation && !planSelected && (
                <LumenFrame className="hbar-composer-permission-goal-recovery">
                  <LumenContentText context="popover.body" id={goalPreparedId}>
                    {labels.plan.goalPrepared}
                  </LumenContentText>
                  <LumenButton
                    type="button"
                    size="s"
                    disabled={unavailable || actionBusy || planEntry?.reading}
                    aria-disabled={busy || undefined}
                    aria-busy={goalCancelBusy || undefined}
                    indicatorState={goalCancelBusy ? 'running' : undefined}
                    aria-describedby={goalPreparedId}
                    onClick={cancelGoalPreparation}
                  >
                    {goalCancelBusy ? labels.plan.cancellingGoalPreparation : labels.plan.cancelGoalPreparation}
                  </LumenButton>
                  {goalCancelError?.sessionId === sessionId &&
                    goalCancelError.revision === goalPreparation.revision && (
                      <LumenContentText context="feedback.detail" role="alert">
                        {labels.error(goalCancelError.code)}
                      </LumenContentText>
                    )}
                </LumenFrame>
              )}
              {plan && (planSelected || executionUnresolved) && (
                <LumenContentText
                  context="popover.body"
                  id={planSelected ? bodyId : undefined}
                  className="hbar-composer-permission-hint"
                >
                  {labels.plan.scope}
                </LumenContentText>
              )}
            </>
          )}
          {open && approvalFeedback}
        </LumenFrame>
        {confirming && (
          <LumenFrame
            className="hbar-composer-permission-actions"
            role="toolbar"
            aria-label={labels.confirmTitle}
            tabIndex={0}
          >
            <LumenButton
              ref={cancelConfirmation}
              type="button"
              size="s"
              aria-disabled={busy || undefined}
              onClick={() => {
                if (busy || inFlight.current) return
                returnAllowFocus.current = true
                setConfirmation(null)
              }}
            >
              {labels.cancel}
            </LumenButton>
            <LumenButton
              type="button"
              size="s"
              disabled={preparationUnavailable}
              aria-disabled={busy || undefined}
              aria-busy={actionBusy || undefined}
              indicatorState={actionBusy ? 'running' : undefined}
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
      </FloatingSurface>
    </LumenFrame>
  )
}
