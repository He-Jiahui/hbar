import { useState } from 'react'
import { Expand, Lightbulb, Pause, Play, Target, Trash2, X } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import type { ComposerIntentState } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './composer-intent-controls.css'

type Goal = NonNullable<NonNullable<ComposerIntentState['facts']['snapshot']>['goal']>

export interface HbarComposerIntentLabels {
  readonly goal: string
  readonly goalHint: string
  readonly plan: string
  readonly planSelected: string
  readonly planHint: string
  readonly cancelGoal: string
  readonly cancelPlan: string
  readonly goalPlaceholder: string
  readonly planPlaceholder: string
  readonly statuses: Readonly<Record<Goal['status'], string>>
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

export function HbarComposerIntentControls({
  sessionId,
  connected,
  disabled,
  labels,
}: {
  readonly sessionId: string
  readonly connected: boolean
  readonly disabled: boolean
  readonly labels: HbarComposerIntentLabels
}) {
  const runtime = useHbarRuntime()
  const state = useHbarRuntimeState(runtime.state.composerIntent)
  const entry = state.entries[sessionId]
  const intent = entry?.intent ?? 'default'
  const busy =
    disabled || !connected || entry?.submission.status === 'submitting' || entry?.submission.status === 'unknown'
  const existingGoal = state.facts.sessionId === sessionId ? state.facts.snapshot?.goal : null
  const [error, setError] = useState<string | null>(null)
  const toggle = (next: 'goal' | 'plan') => {
    setError(null)
    void runtime.commands
      .execute('composerIntent.setIntent', {
        sessionId,
        intent: intent === next ? 'default' : next,
        expectedRevision: entry?.revision ?? 0,
      })
      .catch((reason: unknown) => setError(commandCode(reason)))
  }
  return (
    <LumenFrame className="hbar-composer-intents">
      <LumenButton
        type="button"
        size="s"
        variant="text"
        indicator="none"
        aria-pressed={intent === 'goal'}
        aria-label={intent === 'goal' ? labels.cancelGoal : labels.goal}
        title={labels.goalHint}
        disabled={
          busy ||
          (intent !== 'goal' &&
            (state.facts.status !== 'ready' || Boolean(existingGoal && existingGoal.status !== 'complete')))
        }
        onClick={() => toggle('goal')}
      >
        <LumenIcon icon={Target} tier="sm" />
        {labels.goal}
        {intent === 'goal' && <LumenIcon icon={X} tier="sm" />}
      </LumenButton>
      <LumenButton
        type="button"
        size="s"
        variant="text"
        indicator="none"
        aria-pressed={intent === 'plan'}
        aria-label={intent === 'plan' ? labels.cancelPlan : labels.plan}
        title={labels.planHint}
        disabled={busy}
        onClick={() => toggle('plan')}
      >
        <LumenIcon icon={Lightbulb} tier="sm" />
        {intent === 'plan' ? labels.planSelected : labels.plan}
        {intent === 'plan' && <LumenIcon icon={X} tier="sm" />}
      </LumenButton>
      {error && (
        <LumenText as="span" role="alert">
          {labels.error(error)}
        </LumenText>
      )}
    </LumenFrame>
  )
}

function commandCode(reason: unknown) {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

export function HbarComposerGoal({
  sessionId,
  workspaceId,
  connected,
  labels,
}: {
  readonly sessionId: string
  readonly workspaceId: string | null
  readonly connected: boolean
  readonly labels: HbarComposerIntentLabels
}) {
  const runtime = useHbarRuntime()
  const state = useHbarRuntimeState(runtime.state.composerIntent)
  const entry = state.entries[sessionId]
  const facts = state.facts.sessionId === sessionId ? state.facts : null
  const goal = facts?.snapshot?.goal
  const [clearTarget, setClearTarget] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const actionPending = entry?.goalAction.status === 'submitting'
  const actionUnknown = entry?.goalAction.status === 'unknown'
  const submitting = entry?.submission.status === 'submitting'
  const submissionUnknown = entry?.submission.status === 'unknown'
  const busy = !connected || actionPending || actionUnknown || submitting || submissionUnknown
  const error = localError ?? entry?.goalAction.error ?? entry?.submission.error
  const control = (action: 'pause' | 'resume' | 'clear', expectedGoalId: string) => {
    setLocalError(null)
    void runtime.commands
      .execute('composerIntent.controlGoal', { sessionId, expectedGoalId, action })
      .then(() => setClearTarget(null))
      .catch((reason: unknown) => setLocalError(commandCode(reason)))
  }
  const expand = () => {
    if (opening) return
    setOpening(true)
    setLocalError(null)
    void (async () => {
      const target = await runtime.commands.execute('app.openPanel', {
        panelId: 'goals',
        sessionId,
        ...(workspaceId ? { workspaceId } : {}),
        binding: 'pinned',
      })
      await runtime.commands.execute('goalPlanWorkspace.refresh', { instanceId: target.instanceId })
      if (
        runtime.state.navigation.getSnapshot().sessionId !== sessionId ||
        runtime.state.presentation.getSnapshot().toolInstanceId !== target.instanceId
      )
        return
      await runtime.commands.execute('goalPlanWorkspace.showGoalEditor', { instanceId: target.instanceId })
    })()
      .catch((reason: unknown) => setLocalError(commandCode(reason)))
      .finally(() => setOpening(false))
  }
  const visibleGoal = goal && goal.status !== 'complete'
  return (
    <LumenFrame className="hbar-composer-goal-context">
      {visibleGoal && (
        <LumenFrame className="hbar-composer-goal-strip" aria-label={labels.goal}>
          <LumenFrame className="hbar-composer-goal-summary">
            <LumenIcon icon={Target} tier="sm" />
            <LumenText as="span" className="hbar-composer-goal-status">
              {labels.statuses[goal.status]}
            </LumenText>
            <LumenText as="span" className="hbar-composer-goal-objective" title={goal.objective}>
              {goal.objective}
            </LumenText>
          </LumenFrame>
          <LumenFrame className="hbar-composer-goal-tail">
            <LumenText as="span" className="hbar-composer-goal-metric">
              {labels.elapsed(goal.timeUsedSeconds)}
            </LumenText>
            {goal.tokenBudget !== null && (
              <LumenText as="span" className="hbar-composer-goal-metric">
                {labels.budget(goal.tokensUsed, goal.tokenBudget)}
              </LumenText>
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
                    disabled={busy || !goal.goalId}
                    onClick={() => {
                      if (goal.goalId) control('resume', goal.goalId)
                    }}
                  >
                    <LumenIcon icon={Play} tier="sm" />
                  </LumenButton>
                )
              )}
              <LumenButton
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
      {clearTarget && clearTarget === goal?.goalId && (
        <LumenFrame role="group" aria-label={labels.clear} className="hbar-composer-goal-confirm">
          <LumenText as="span">{labels.confirmClear(goal.objective)}</LumenText>
          <LumenButton
            type="button"
            size="s"
            variant="text"
            indicator="none"
            disabled={actionPending}
            onClick={() => setClearTarget(null)}
          >
            {labels.cancel}
          </LumenButton>
          <LumenButton
            type="button"
            size="s"
            tone="danger"
            disabled={busy}
            onClick={() => control('clear', clearTarget)}
          >
            {labels.clear}
          </LumenButton>
        </LumenFrame>
      )}
      {(actionPending || submitting) && (
        <LumenText as="p" role="status">
          {labels.pending}
        </LumenText>
      )}
      {entry?.submission.status === 'partial' && (
        <LumenText as="p" role="status">
          {labels.partial}
        </LumenText>
      )}
      {actionUnknown || submissionUnknown ? (
        <LumenFrame className="hbar-composer-intent-feedback" role="alert">
          <LumenText as="span">{labels.unknown}</LumenText>
          <LumenButton
            type="button"
            size="s"
            disabled={!connected}
            onClick={() => {
              setLocalError(null)
              void runtime.commands
                .execute('composerIntent.reconcile', { sessionId })
                .catch((reason: unknown) => setLocalError(commandCode(reason)))
            }}
          >
            {labels.reconcile}
          </LumenButton>
        </LumenFrame>
      ) : (
        error && (
          <LumenText as="p" role="alert">
            {labels.error(error)}
          </LumenText>
        )
      )}
      {facts?.status === 'error' && facts.error !== 'CAPABILITY_UNAVAILABLE' && (
        <LumenFrame className="hbar-composer-intent-feedback" role="alert">
          <LumenText as="span">{labels.error(facts.error ?? 'EXECUTION_FAILED')}</LumenText>
          <LumenButton
            type="button"
            size="s"
            disabled={!connected}
            onClick={() => {
              void runtime.commands
                .execute('composerIntent.refresh', { sessionId })
                .catch((reason: unknown) => setLocalError(commandCode(reason)))
            }}
          >
            {labels.refresh}
          </LumenButton>
        </LumenFrame>
      )}
    </LumenFrame>
  )
}
