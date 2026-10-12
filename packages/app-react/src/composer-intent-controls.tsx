import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Expand, Pause, Play, Target, Trash2 } from 'lucide-react'
import { LumenContentText, LumenButton, LumenFrame, LumenIcon } from '@lumen/app-ui'
import type { ComposerIntentState } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import type { HbarComposerIntentControlLabels } from './composer-intent-blocked'
import { HbarComposerGoalRecovery, type HbarComposerGoalRecoveryLabels } from './composer-goal-recovery'
import { canReturnGoalClearFocus, sameGoalClearFocusScope, type GoalClearFocusScope } from './composer-goal-clear-focus'
import { HbarGoalTiming } from './session-goal-timing'
import './composer-intent-controls.css'
import { HbarComposerFeedback } from './composer-feedback'
import { createMessageScope } from './messages'

type Goal = NonNullable<NonNullable<ComposerIntentState['facts']['snapshot']>['goal']>

export interface HbarComposerIntentLabels extends HbarComposerIntentControlLabels {
  readonly recovery: HbarComposerGoalRecoveryLabels
  readonly currentGoal: string
  readonly goalPlaceholder: string
  readonly planPlaceholder: string
  readonly statuses: Readonly<Record<Goal['status'], string>>
  readonly running: string
  readonly executionChecking: string
  readonly executionReadFailed: string
  readonly retryExecution: string
  readonly pause: string
  readonly pauseHint: string
  readonly resume: string
  readonly clear: string
  readonly confirmClear: (objective: string) => string
  readonly cancel: string
  readonly expand: string
  readonly elapsed: (seconds: number) => string
  readonly budget: (used: number, limit: number) => string
  readonly pending: string
  readonly partial: string
  readonly unknown: string
  readonly reconcile: string
  readonly refresh: string
  readonly error: (code: string) => string
}

const ComposerGoalMessages = createMessageScope<{ readonly intent: HbarComposerIntentLabels }>()

export { HbarComposerIntentControl as HbarComposerIntentControls } from './composer-intent-blocked'

function commandCode(reason: unknown) {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

export function HbarComposerGoal(props: Parameters<typeof HbarComposerGoalContent>[0]) {
  return (
    <ComposerGoalMessages.Provider messages={{ intent: props.labels }}>
      <HbarComposerGoalContent {...props} />
    </ComposerGoalMessages.Provider>
  )
}

function HbarComposerGoalContent({
  sessionId,
  workspaceId,
  connected,
  surface = 'all',
  canPrepare = true,
  runActive = false,
  executionReadError = false,
  executionChecking = false,
  goalTriggerRef,
  embedded = false,
}: {
  readonly sessionId: string
  readonly workspaceId: string | null
  readonly connected: boolean
  readonly labels: HbarComposerIntentLabels
  readonly surface?: 'all' | 'summary' | 'submission'
  readonly canPrepare?: boolean
  readonly runActive?: boolean
  readonly executionReadError?: boolean
  readonly executionChecking?: boolean
  readonly goalTriggerRef?: RefObject<HTMLButtonElement | null>
  readonly embedded?: boolean
}) {
  const { t } = ComposerGoalMessages.useMessages()
  const labels = t('intent')
  const runtime = useHbarRuntime()
  const state = useHbarRuntimeState(runtime.state.composerIntent)
  const entry = state.entries[sessionId]
  const facts = state.facts.sessionId === sessionId ? state.facts : null
  const goal = facts?.snapshot?.goal
  const [clearTarget, setClearTarget] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const lifetime = useRef(0)
  const clearButton = useRef<HTMLButtonElement>(null)
  const clearReturn = useRef<{
    readonly scope: GoalClearFocusScope & { readonly goalId: string }
    readonly source: HTMLButtonElement
    confirmed: boolean
    release: () => void
  } | null>(null)
  useLayoutEffect(() => {
    lifetime.current += 1
    clearReturn.current?.release()
    setClearTarget(null)
    setLocalError(null)
    setOpening(false)
    return () => {
      lifetime.current += 1
      clearReturn.current?.release()
    }
  }, [runtime, sessionId])
  const actionPending = entry?.goalAction.status === 'submitting'
  const actionUnknown = entry?.goalAction.status === 'unknown'
  const submitting = entry?.submission.status === 'submitting'
  const submissionUnknown = entry?.submission.status === 'unknown'
  const busy = !connected || actionPending || actionUnknown || submitting || submissionUnknown
  const showSummary = surface !== 'submission'
  const showSubmission = surface !== 'summary'
  const error =
    localError ?? (showSummary ? entry?.goalAction.error : null) ?? (showSubmission ? entry?.submission.error : null)
  const unknown = (showSummary && actionUnknown) || (showSubmission && submissionUnknown)
  const focusAvailable = (target: HTMLButtonElement | null | undefined) => {
    if (
      !target?.isConnected ||
      target.disabled ||
      target.closest('[inert], [hidden]') ||
      !target.getClientRects().length
    )
      return
    if (target.ownerDocument.defaultView?.getComputedStyle(target).visibility === 'hidden') return
    target.focus()
  }
  const captureClearReturn = (source: HTMLButtonElement, goalId: string) => {
    clearReturn.current?.release()
    const document = source.ownerDocument
    const latestFacts = runtime.state.composerIntent.getSnapshot().facts
    if (
      !goalTriggerRef ||
      document.activeElement !== source ||
      latestFacts.sessionId !== sessionId ||
      latestFacts.snapshot?.goal?.goalId !== goalId
    )
      return null
    const lease = {
      scope: { runtime, sessionId, goalId, lifetime: lifetime.current },
      source,
      confirmed: false,
      release: () => {},
    }
    const cancelOnPointer = (event: PointerEvent) => {
      if (event.target !== source && !(event.target instanceof Node && source.contains(event.target))) lease.release()
    }
    const cancelOnKey = (event: KeyboardEvent) => {
      if (event.target === source && ['Enter', ' '].includes(event.key)) return
      if (
        event.repeat &&
        ['Enter', ' '].includes(event.key) &&
        source.disabled &&
        document.activeElement === document.body
      )
        return
      lease.release()
    }
    const cancelOnFocus = (event: FocusEvent) => {
      if (event.target !== source && event.target !== document.body) lease.release()
    }
    // The lease ends at success/failure/scope change/user intent, with a hard upper bound if transport stalls.
    const deadline = setTimeout(() => lease.release(), 30_000)
    lease.release = () => {
      clearTimeout(deadline)
      document.removeEventListener('pointerdown', cancelOnPointer, true)
      document.removeEventListener('keydown', cancelOnKey, true)
      document.removeEventListener('focusin', cancelOnFocus, true)
      if (clearReturn.current === lease) clearReturn.current = null
    }
    clearReturn.current = lease
    document.addEventListener('pointerdown', cancelOnPointer, true)
    document.addEventListener('keydown', cancelOnKey, true)
    document.addEventListener('focusin', cancelOnFocus, true)
    return lease
  }
  useLayoutEffect(() => {
    const lease = clearReturn.current
    if (!lease) return
    const current = { runtime, sessionId, lifetime: lifetime.current }
    const latestFacts = runtime.state.composerIntent.getSnapshot().facts
    const latestGoalId = latestFacts.sessionId === sessionId ? latestFacts.snapshot?.goal?.goalId : undefined
    if (!sameGoalClearFocusScope(lease.scope, current) || (latestGoalId && latestGoalId !== lease.scope.goalId)) {
      lease.release()
      return
    }
    // A goal.cleared event may arrive before its ACK. Do not turn it into confirmation of this request.
    if (
      !lease.confirmed ||
      latestFacts.sessionId !== sessionId ||
      !latestFacts.snapshot ||
      latestFacts.snapshot.goal !== null
    )
      return
    const document = lease.source.ownerDocument
    const active = document.activeElement
    const navigation = runtime.state.navigation.getSnapshot()
    const allowed = canReturnGoalClearFocus({
      captured: lease.scope,
      current,
      kind: 'confirmed',
      currentGoalId: null,
      confirmed: true,
      selectedSessionId: navigation.sessionId,
      navigationIdle: navigation.status === 'idle',
      conversationVisible: runtime.state.presentation.getSnapshot().page.kind === 'session',
      focusOwned: active === lease.source || active === document.body || !active?.isConnected,
      otherTopLayer: Boolean(document.querySelector('dialog:modal, [popover]:popover-open')),
    })
    lease.release()
    if (allowed) focusAvailable(goalTriggerRef?.current)
  })
  const cancelClear = (source: HTMLButtonElement) => {
    const navigation = runtime.state.navigation.getSnapshot()
    const scope = { runtime, sessionId, lifetime: lifetime.current }
    const document = source.ownerDocument
    const latestFacts = runtime.state.composerIntent.getSnapshot().facts
    const allowed =
      clearTarget &&
      canReturnGoalClearFocus({
        captured: { ...scope, goalId: clearTarget },
        current: scope,
        kind: 'cancel',
        currentGoalId: latestFacts.sessionId === sessionId ? latestFacts.snapshot?.goal?.goalId : undefined,
        confirmed: false,
        selectedSessionId: navigation.sessionId,
        navigationIdle: navigation.status === 'idle',
        conversationVisible: runtime.state.presentation.getSnapshot().page.kind === 'session',
        focusOwned: document.activeElement === source,
        otherTopLayer: Boolean(document.querySelector('dialog:modal, [popover]:popover-open')),
      })
    setClearTarget(null)
    if (allowed) focusAvailable(clearButton.current)
  }
  const control = (action: 'pause' | 'resume' | 'clear', expectedGoalId: string, source?: HTMLButtonElement) => {
    const generation = lifetime.current
    const lease = action === 'clear' && source ? captureClearReturn(source, expectedGoalId) : null
    setLocalError(null)
    void runtime.commands
      .execute('composerIntent.controlGoal', { sessionId, expectedGoalId, action })
      .then(() => {
        if (lease && clearReturn.current === lease && generation === lifetime.current) lease.confirmed = true
        if (generation === lifetime.current) setClearTarget((current) => (current === expectedGoalId ? null : current))
      })
      .catch((reason: unknown) => {
        lease?.release()
        if (generation === lifetime.current) setLocalError(commandCode(reason))
      })
  }
  const expand = () => {
    if (opening || !workspaceId) return
    const generation = lifetime.current
    setOpening(true)
    setLocalError(null)
    void (async () => {
      const sourceTab = runtime.state.workspaceTabs
        .getSnapshot()
        .items.find(
          (item) => item.kind === 'session' && item.sessionId === sessionId && item.workspaceId === workspaceId,
        )
      const target = await runtime.commands.execute('sessionTools.open', {
        panelId: 'goals',
        sessionId,
        workspaceId,
        sourceTabInstanceKey: sourceTab?.instanceKey ?? null,
      })
      await runtime.commands.execute('goalPlanWorkspace.refresh', { instanceId: target.instanceId })
      if (
        runtime.state.navigation.getSnapshot().sessionId !== sessionId ||
        runtime.state.presentation.getSnapshot().toolInstanceId !== target.instanceId
      )
        return
      if (canPrepare && workspaceId && runtime.getSessionExecutionAccess({ sessionId, workspaceId }).kind === 'ready')
        await runtime.commands.execute('goalPlanWorkspace.showGoalEditor', { instanceId: target.instanceId })
    })()
      .catch((reason: unknown) => {
        if (generation === lifetime.current) setLocalError(commandCode(reason))
      })
      .finally(() => {
        if (generation === lifetime.current) setOpening(false)
      })
  }
  const reconcile = () => {
    const generation = lifetime.current
    setLocalError(null)
    void runtime.commands.execute('composerIntent.reconcile', { sessionId }).catch((reason: unknown) => {
      if (generation === lifetime.current) setLocalError(commandCode(reason))
    })
  }
  const visibleGoal = goal && goal.status !== 'complete'
  return (
    <LumenFrame className="hbar-composer-goal-context" data-embedded={embedded || undefined}>
      {showSummary && visibleGoal && (
        <LumenFrame className="hbar-composer-goal-strip" aria-label={labels.goal}>
          <LumenFrame className="hbar-composer-goal-summary">
            <LumenIcon icon={Target} tier="sm" />
            {!embedded && (
              <LumenContentText context="metadata" className="hbar-composer-current-goal-label">
                {labels.currentGoal}
              </LumenContentText>
            )}
            <LumenContentText context="control.status" className="hbar-composer-goal-status">
              {runActive ? labels.running : executionChecking ? labels.executionChecking : labels.statuses[goal.status]}
            </LumenContentText>
            <LumenContentText
              context="message.inline"
              className="hbar-composer-goal-objective"
              title={goal.objective}
              tabIndex={0}
            >
              {goal.objective}
            </LumenContentText>
          </LumenFrame>
          <LumenFrame className="hbar-composer-goal-tail">
            <LumenContentText context="message.inline" className="hbar-composer-goal-metric">
              <HbarGoalTiming
                goal={goal}
                receivedAt={facts?.goalReceivedAt}
                connected={connected}
                format={labels.elapsed}
              />
            </LumenContentText>
            {goal.tokenBudget !== null && (
              <LumenContentText context="message.inline" className="hbar-composer-goal-metric">
                {labels.budget(goal.tokensUsed, goal.tokenBudget)}
              </LumenContentText>
            )}
            <LumenFrame className="hbar-composer-goal-actions">
              {goal.status === 'active' ? (
                <LumenButton
                  type="button"
                  size="s"
                  variant="text"
                  indicator="none"
                  aria-label={labels.pause}
                  title={labels.pauseHint}
                  disabled={busy || !goal.goalId}
                  onClick={() => {
                    if (goal.goalId) control('pause', goal.goalId)
                  }}
                >
                  <LumenIcon icon={Pause} tier="sm" />
                </LumenButton>
              ) : (
                (goal.status === 'paused' || goal.status === 'blocked') && (
                  <LumenButton
                    type="button"
                    size="s"
                    variant="text"
                    indicator="none"
                    aria-label={labels.resume}
                    title={labels.resume}
                    disabled={busy || !canPrepare || !goal.goalId}
                    onClick={() => {
                      if (goal.goalId) control('resume', goal.goalId)
                    }}
                  >
                    <LumenIcon icon={Play} tier="sm" />
                  </LumenButton>
                )
              )}
              <LumenButton
                ref={clearButton}
                type="button"
                size="s"
                variant="text"
                indicator="none"
                aria-label={labels.clear}
                title={labels.clear}
                disabled={busy || !goal.goalId}
                onClick={() => setClearTarget(goal.goalId ?? null)}
              >
                <LumenIcon icon={Trash2} tier="sm" />
              </LumenButton>
              <LumenButton
                type="button"
                size="s"
                variant="text"
                indicator="none"
                aria-label={labels.expand}
                title={labels.expand}
                disabled={!connected || opening}
                onClick={expand}
              >
                <LumenIcon icon={Expand} tier="sm" />
              </LumenButton>
            </LumenFrame>
          </LumenFrame>
        </LumenFrame>
      )}
      {connected && showSummary && visibleGoal && executionReadError && (
        <HbarComposerFeedback tone="danger">
          <LumenFrame className="hbar-composer-goal-confirm" role="status">
            <LumenContentText context="message.inline">{labels.executionReadFailed}</LumenContentText>
            <LumenButton
              type="button"
              size="s"
              variant="text"
              indicator="none"
              disabled={!connected || !workspaceId}
              onClick={() => {
                if (!workspaceId) return
                void runtime.commands
                  .execute('selectedSessionExecution.refresh', { sessionId, workspaceId })
                  .catch(() => {})
              }}
            >
              {labels.retryExecution}
            </LumenButton>
          </LumenFrame>
        </HbarComposerFeedback>
      )}
      {showSummary && clearTarget && clearTarget === goal?.goalId && (
        <LumenFrame role="group" aria-label={labels.clear} className="hbar-composer-goal-confirm">
          <LumenContentText context="message.inline" tabIndex={embedded ? 0 : undefined}>
            {labels.confirmClear(goal.objective)}
          </LumenContentText>
          <LumenButton
            type="button"
            size="s"
            variant="text"
            indicator="none"
            disabled={actionPending}
            onClick={(event) => cancelClear(event.currentTarget)}
          >
            {labels.cancel}
          </LumenButton>
          <LumenButton
            type="button"
            size="s"
            tone="danger"
            disabled={busy}
            onClick={(event) => control('clear', clearTarget, event.currentTarget)}
          >
            {labels.clear}
          </LumenButton>
        </LumenFrame>
      )}
      <HbarComposerFeedback
        active={Boolean(
          (showSummary && actionPending) ||
          (showSubmission && (submitting || entry?.submission.status === 'partial')) ||
          (connected &&
            (unknown ||
              error ||
              (showSummary && facts?.status === 'error' && facts.error !== 'CAPABILITY_UNAVAILABLE'))),
        )}
        tone={unknown || error || facts?.status === 'error' ? 'danger' : 'neutral'}
      >
        {((showSummary && actionPending) || (showSubmission && submitting)) && (
          <LumenContentText context="feedback.message" role="status">
            {labels.pending}
          </LumenContentText>
        )}
        {showSubmission && entry?.submission.status === 'partial' && (
          <LumenContentText context="feedback.message" role="status">
            {labels.partial}
          </LumenContentText>
        )}
        {connected &&
          (showSummary && actionUnknown ? (
            <HbarComposerGoalRecovery
              action={entry?.goalAction}
              connected={connected}
              labels={labels.recovery}
              onReconcile={reconcile}
            />
          ) : unknown ? (
            <LumenFrame className="hbar-composer-intent-feedback" role="alert">
              <LumenContentText context="message.inline">{labels.unknown}</LumenContentText>
              <LumenButton type="button" size="s" disabled={!connected} onClick={reconcile}>
                {labels.reconcile}
              </LumenButton>
            </LumenFrame>
          ) : (
            error && (
              <LumenContentText context="feedback.message" role="alert">
                {labels.error(error)}
              </LumenContentText>
            )
          ))}
        {connected &&
          showSummary &&
          !unknown &&
          facts?.status === 'error' &&
          facts.error !== 'CAPABILITY_UNAVAILABLE' && (
            <LumenFrame className="hbar-composer-intent-feedback" role="alert">
              <LumenContentText context="message.inline">
                {labels.error(facts.error ?? 'EXECUTION_FAILED')}
              </LumenContentText>
              <LumenButton
                type="button"
                size="s"
                disabled={!connected}
                onClick={() => {
                  const generation = lifetime.current
                  setLocalError(null)
                  void runtime.commands.execute('composerIntent.refresh', { sessionId }).catch((reason: unknown) => {
                    if (generation === lifetime.current) setLocalError(commandCode(reason))
                  })
                }}
              >
                {labels.refresh}
              </LumenButton>
            </LumenFrame>
          )}
      </HbarComposerFeedback>
    </LumenFrame>
  )
}
