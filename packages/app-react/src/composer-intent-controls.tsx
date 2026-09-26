import { useState } from 'react'
import { Expand, Pause, Play, Target, Trash2 } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import type { ComposerIntentState } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import type { HbarComposerIntentControlLabels } from './composer-intent-blocked'
import './composer-intent-controls.css'

type Goal = NonNullable<NonNullable<ComposerIntentState['facts']['snapshot']>['goal']>

export interface HbarComposerIntentLabels extends HbarComposerIntentControlLabels {
  readonly currentGoal: string
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

export { HbarComposerIntentControl as HbarComposerIntentControls } from './composer-intent-blocked'

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
  surface = 'all',
  canPrepare = true,
}: {
  readonly sessionId: string
  readonly workspaceId: string | null
  readonly connected: boolean
  readonly labels: HbarComposerIntentLabels
  readonly surface?: 'all' | 'summary' | 'submission'
  readonly canPrepare?: boolean
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
  const showSummary = surface !== 'submission'
  const showSubmission = surface !== 'summary'
  const error =
    localError ?? (showSummary ? entry?.goalAction.error : null) ?? (showSubmission ? entry?.submission.error : null)
  const unknown = (showSummary && actionUnknown) || (showSubmission && submissionUnknown)
  const control = (action: 'pause' | 'resume' | 'clear', expectedGoalId: string) => {
    setLocalError(null)
    void runtime.commands
      .execute('composerIntent.controlGoal', { sessionId, expectedGoalId, action })
      .then(() => setClearTarget(null))
      .catch((reason: unknown) => setLocalError(commandCode(reason)))
  }
  const expand = () => {
    if (opening || !workspaceId) return
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
      .catch((reason: unknown) => setLocalError(commandCode(reason)))
      .finally(() => setOpening(false))
  }
  const visibleGoal = goal && goal.status !== 'complete'
  return (
    <LumenFrame className="hbar-composer-goal-context">
      {showSummary && visibleGoal && (
        <LumenFrame className="hbar-composer-goal-strip" aria-label={labels.goal}>
          <LumenFrame className="hbar-composer-goal-summary">
            <LumenIcon icon={Target} tier="sm" />
            <LumenText as="span" className="hbar-composer-current-goal-label">
              {labels.currentGoal}
            </LumenText>
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
      {showSummary && clearTarget && clearTarget === goal?.goalId && (
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
      {((showSummary && actionPending) || (showSubmission && submitting)) && (
        <LumenText as="p" role="status">
          {labels.pending}
        </LumenText>
      )}
      {showSubmission && entry?.submission.status === 'partial' && (
        <LumenText as="p" role="status">
          {labels.partial}
        </LumenText>
      )}
      {unknown ? (
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
      {showSummary && facts?.status === 'error' && facts.error !== 'CAPABILITY_UNAVAILABLE' && (
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
