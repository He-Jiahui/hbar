import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Target, X } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import type { ComposerIntentState } from '@hbar/app-runtime'
import { HbarComposerGoalRecovery, type HbarComposerGoalRecoveryLabels } from './composer-goal-recovery'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import {
  composerGoalAvailability,
  sameComposerIntentInteraction,
  type ComposerGoalBlockedReason,
  type ComposerGoalRecovery,
  type ComposerIntentInteractionTarget,
} from './composer-intent-availability'
import './composer-intent-blocked.css'

export interface HbarComposerIntentBlockedLabels {
  readonly goalRecovery: HbarComposerGoalRecoveryLabels
  readonly title: string
  readonly close: string
  readonly reasons: Readonly<Record<ComposerGoalBlockedReason, string>>
  readonly exitPlan: string
  readonly refreshGoal: string
  readonly refreshPlan: string
  readonly reconcilePlan: string
  readonly reconcileComposer: string
  readonly checkingPlan: string
  readonly planCheckFailed: string
  readonly pending: string
  readonly exited: string
  readonly error: (code: string) => string
}

export interface HbarComposerIntentControlLabels {
  readonly goal: string
  readonly goalHint: string
  readonly cancelGoal: string
  readonly blocked: HbarComposerIntentBlockedLabels
}

/** Native light-dismiss may start with BODY focused after a pending action was removed. */
export function canReturnComposerGoalFocus(input: {
  readonly captured: ComposerIntentInteractionTarget | null
  readonly current: ComposerIntentInteractionTarget | null
  readonly selectedSessionId: string | null
  readonly navigationIdle: boolean
  readonly popupOpen: boolean
  readonly otherTopLayer: boolean
  readonly focusVacant: boolean
}): boolean {
  return Boolean(
    input.captured &&
    sameComposerIntentInteraction(input.captured, input.current) &&
    input.selectedSessionId === input.captured.sessionId &&
    input.navigationIdle &&
    !input.popupOpen &&
    !input.otherTopLayer &&
    input.focusVacant,
  )
}

export function HbarComposerIntentControl({
  sessionId,
  connected,
  disabled,
  canPrepare = true,
  labels,
  triggerRef,
}: {
  readonly sessionId: string
  readonly connected: boolean
  readonly disabled: boolean
  readonly canPrepare?: boolean
  readonly labels: HbarComposerIntentControlLabels
  readonly triggerRef?: RefObject<HTMLButtonElement | null>
}) {
  const runtime = useHbarRuntime()
  const state = useHbarRuntimeState(runtime.state.composerIntent)
  const planState = useHbarRuntimeState(runtime.state.composerPlanMode)
  const plan = planState.entries[sessionId]
  const candidate = state.entries[sessionId]
  const entry = candidate?.sessionId === sessionId ? candidate : undefined
  const intent = entry?.intent ?? 'default'
  const availability = composerGoalAvailability({
    sessionId,
    connected,
    disabled,
    canPrepare,
    intent: state,
    plan: planState,
  })
  const popupId = useId()
  const headingId = useId()
  const descriptionId = useId()
  const anchor = useRef<HTMLButtonElement>(null)
  const setAnchor = useCallback(
    (element: HTMLButtonElement | null) => {
      anchor.current = element
      if (triggerRef) triggerRef.current = element
    },
    [triggerRef],
  )
  const popup = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const lifetime = useRef(0)
  const owner = useRef<ComposerIntentInteractionTarget | null>(null)
  const closeReturn = useRef<ComposerIntentInteractionTarget | null>(null)
  const inFlight = useRef<object | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [exited, setExited] = useState(false)
  const [error, setError] = useState<{
    code: string
    intent: ComposerIntentState
    plan: typeof planState
  } | null>(null)
  useLayoutEffect(() => {
    const current = { sessionId, lifetime: ++lifetime.current }
    owner.current = current
    closeReturn.current = null
    inFlight.current = null
    setBusy(false)
    setOpen(false)
    setError(null)
    setExited(false)
    const element = popup.current
    element?.hidePopover?.()
    return () => {
      if (sameComposerIntentInteraction(current, owner.current)) owner.current = null
      closeReturn.current = null
      element?.hidePopover?.()
    }
  }, [runtime, sessionId])
  const returnClosedFocus = useCallback(() => {
    const captured = closeReturn.current
    if (!captured) return
    const active = document.activeElement
    const navigation = runtime.state.navigation.getSnapshot()
    const allowed = canReturnComposerGoalFocus({
      captured,
      current: owner.current,
      selectedSessionId: navigation.sessionId,
      navigationIdle: navigation.status === 'idle',
      popupOpen: popup.current?.matches(':popover-open') ?? false,
      otherTopLayer: Boolean(document.querySelector('dialog:modal, [popover]:popover-open')),
      focusVacant: active === document.body || !active?.isConnected,
    })
    if (!allowed) {
      closeReturn.current = null
      return
    }
    // A confirmed reply can briefly precede the local finally. Retry only when
    // this component's busy state settles, never after a deliberate focus move.
    if (anchor.current?.disabled) return
    closeReturn.current = null
    if (anchor.current?.isConnected) anchor.current.focus()
  }, [runtime])
  useLayoutEffect(() => {
    if (!open) returnClosedFocus()
  }, [open, busy, returnClosedFocus])
  useEffect(() => {
    if (!open) return
    const position = () => {
      if (popup.current && anchor.current) placeGoalHelp(popup.current, anchor.current)
    }
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [open])
  const close = () => {
    const current = owner.current
    popup.current?.hidePopover()
    if (current && sameComposerIntentInteraction(current, owner.current) && anchor.current?.isConnected)
      anchor.current.focus()
  }
  const perform = (recovery?: ComposerGoalRecovery) => {
    const captured = owner.current
    if (!captured || captured.sessionId !== sessionId || inFlight.current) return
    if (runtime.state.navigation.getSnapshot().sessionId !== sessionId) return
    const actual = composerGoalAvailability({
      sessionId,
      connected,
      disabled,
      canPrepare,
      intent: runtime.state.composerIntent.getSnapshot(),
      plan: runtime.state.composerPlanMode.getSnapshot(),
    })
    if (recovery ? actual.kind !== 'blocked' || actual.recovery !== recovery : actual.kind === 'blocked') return
    const originalGoal = runtime.state.composerIntent.getSnapshot().entries[sessionId]?.goalAction
    if (
      recovery === 'reconcileComposer' &&
      (originalGoal?.reconciliation?.requestInFlight || originalGoal?.reconciliation?.status === 'checking')
    )
      return
    if (
      (recovery === 'reconcilePlan' || recovery === 'refreshPlan') &&
      runtime.state.composerPlanMode.getSnapshot().entries[sessionId]?.reading
    )
      return
    const operation = {}
    inFlight.current = operation
    setBusy(true)
    setError(null)
    setExited(false)
    const execute = (): Promise<unknown> => {
      switch (recovery) {
        case 'exitPlan':
          return runtime.commands.execute('composerPlanMode.setMode', {
            sessionId,
            mode: 'default',
            expectedRevision: plan?.revision ?? 0,
          })
        case 'refreshGoal':
          return runtime.commands.execute('composerIntent.refresh', { sessionId })
        case 'refreshPlan':
          return runtime.commands.execute('composerPlanMode.refresh', { sessionId })
        case 'reconcilePlan':
          return runtime.commands.execute('composerPlanMode.reconcile', { sessionId })
        case 'reconcileComposer':
          return runtime.commands.execute('composerIntent.reconcile', { sessionId })
        case undefined:
          return runtime.commands.execute('composerIntent.setIntent', {
            sessionId,
            intent: intent === 'goal' ? 'default' : 'goal',
            expectedRevision: entry?.revision ?? 0,
          })
      }
    }
    void (async () => {
      try {
        await execute()
        if (!sameComposerIntentInteraction(captured, owner.current)) return
        const confirmed = runtime.state.composerPlanMode.getSnapshot().entries[sessionId]
        if (
          recovery === 'exitPlan' &&
          confirmed?.sessionId === sessionId &&
          confirmed.status === 'ready' &&
          confirmed.mode === 'default'
        )
          setExited(true)
      } catch (reason: unknown) {
        if (sameComposerIntentInteraction(captured, owner.current))
          setError({
            code: commandCode(reason),
            intent: runtime.state.composerIntent.getSnapshot(),
            plan: runtime.state.composerPlanMode.getSnapshot(),
          })
      } finally {
        if (inFlight.current === operation) inFlight.current = null
        if (sameComposerIntentInteraction(captured, owner.current)) setBusy(false)
      }
    })()
  }
  const blocked = availability.kind === 'blocked'
  const reason = blocked ? labels.blocked.reasons[availability.reason] : labels.goalHint
  const recovery = blocked ? availability.recovery : null
  const feedback = error?.intent === state && error.plan === planState ? labels.blocked.error(error.code) : null
  const confirmedExit =
    exited &&
    availability.kind === 'ready' &&
    plan?.sessionId === sessionId &&
    plan.status === 'ready' &&
    plan.mode === 'default'
  const goalUnknown = entry?.goalAction.status === 'unknown'
  const goalChecking =
    entry?.goalAction.reconciliation?.requestInFlight === true ||
    entry?.goalAction.reconciliation?.status === 'checking'
  const sharedPlanReading = plan?.sessionId === sessionId && plan.reading === true
  const recoveryBusy = busy || goalChecking || sharedPlanReading
  return (
    <LumenFrame className="hbar-composer-intents">
      <LumenButton
        ref={setAnchor}
        type="button"
        size="s"
        variant="text"
        indicator="none"
        aria-pressed={intent === 'goal'}
        aria-label={intent === 'goal' ? labels.cancelGoal : labels.goal}
        title={reason}
        aria-haspopup={blocked || open ? 'dialog' : undefined}
        aria-expanded={blocked || open ? open : undefined}
        aria-controls={blocked || open ? popupId : undefined}
        aria-describedby={blocked || open ? descriptionId : undefined}
        popoverTarget={blocked || open ? popupId : undefined}
        aria-busy={recoveryBusy || undefined}
        disabled={busy && !blocked && !open}
        onClick={() => {
          if (!blocked && !open) perform()
        }}
      >
        <LumenIcon icon={Target} tier="sm" />
        {labels.goal}
        {intent === 'goal' && <LumenIcon icon={X} tier="sm" />}
      </LumenButton>
      {feedback && !open && !goalUnknown && (
        <LumenText as="span" role="alert">
          {feedback}
        </LumenText>
      )}
      <LumenFrame
        ref={popup}
        id={popupId}
        popover="auto"
        role="dialog"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        className="hbar-composer-intent-blocked-popover"
        onBeforeToggle={(event) => {
          closeReturn.current = event.newState === 'closed' ? owner.current : null
          if (event.newState === 'open' && anchor.current) placeGoalHelp(event.currentTarget, anchor.current)
        }}
        onToggle={(event) => {
          const opening = event.newState === 'open'
          setOpen(opening)
          if (opening) closeButton.current?.focus()
          else returnClosedFocus()
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
        <LumenFrame className="hbar-composer-intent-blocked-heading">
          <LumenText as="strong" id={headingId}>
            {labels.blocked.title}
          </LumenText>
          <LumenButton
            ref={closeButton}
            type="button"
            size="s"
            variant="text"
            indicator="none"
            aria-label={labels.blocked.close}
            onClick={close}
          >
            <LumenIcon icon={X} tier="sm" />
          </LumenButton>
        </LumenFrame>
        <LumenFrame className="hbar-composer-intent-blocked-body">
          {goalUnknown ? (
            <HbarComposerGoalRecovery
              action={entry?.goalAction}
              connected={connected}
              busy={busy}
              labels={labels.blocked.goalRecovery}
              descriptionId={descriptionId}
              onReconcile={() => perform('reconcileComposer')}
            />
          ) : (
            <LumenText as="p" id={descriptionId} role={confirmedExit ? 'status' : undefined}>
              {confirmedExit ? labels.blocked.exited : reason}
            </LumenText>
          )}
          {recoveryBusy && !goalUnknown && (
            <LumenText as="p" role="status">
              {sharedPlanReading ? labels.blocked.checkingPlan : labels.blocked.pending}
            </LumenText>
          )}
          {!goalUnknown &&
            !sharedPlanReading &&
            plan?.status === 'unknown' &&
            plan.error &&
            plan.error !== 'RESULT_UNKNOWN' && (
              <LumenText as="p" role="alert">
                {labels.blocked.planCheckFailed}
              </LumenText>
            )}
          {feedback && !goalUnknown && plan?.status !== 'unknown' && (
            <LumenText as="p" role="alert">
              {feedback}
            </LumenText>
          )}
          {recovery && !goalUnknown && (
            <LumenButton type="button" size="s" disabled={recoveryBusy} onClick={() => perform(recovery)}>
              {labels.blocked[recovery]}
            </LumenButton>
          )}
        </LumenFrame>
      </LumenFrame>
    </LumenFrame>
  )
}

/** Only this native popover container is positioned; its explanation/actions stay in normal flow. */
function placeGoalHelp(popover: HTMLElement, trigger: HTMLElement) {
  const rect = trigger.getBoundingClientRect()
  const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  const width = Math.min(22.5 * rem, innerWidth - 2 * rem)
  const above = rect.top >= innerHeight - rect.bottom
  popover.style.setProperty(
    '--goal-help-left',
    `${Math.max(rem, Math.min(rect.right - width, innerWidth - width - rem))}px`,
  )
  popover.style.setProperty('--goal-help-top', above ? 'auto' : `${rect.bottom + rem / 2}px`)
  popover.style.setProperty('--goal-help-bottom', above ? `${innerHeight - rect.top + rem / 2}px` : 'auto')
  popover.style.setProperty(
    '--goal-help-limit',
    `${Math.max(0, (above ? rect.top : innerHeight - rect.bottom) - 1.5 * rem)}px`,
  )
}

function commandCode(reason: unknown) {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}
