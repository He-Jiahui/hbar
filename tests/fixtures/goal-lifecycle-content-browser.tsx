import { createRoot, type Root } from 'react-dom/client'
import { goalHistoryFactSchema, goalHistorySnapshotSchema } from '@hbar/contracts/commands/goal-history'
import { threadGoalSchema } from '@hbar/contracts'
import { HbarGoalLifecycleCard, HbarGoalContinuation, projectGoalLifecycleRows } from '@hbar/app-react'
import { HbarGoalExecutionState } from '../../packages/app-react/src/goal-execution-state'
import { LumenProvider, LumenToolPane, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

export interface GoalLifecycleContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly kind: 'created' | 'replaced' | 'cleared' | 'continuation' | 'execution'
  readonly count: number
  readonly suffix: string
  readonly objective: string
}
declare global {
  interface Window {
    mountGoalLifecycleContent(input: GoalLifecycleContentInput): void
    reorderGoalLifecycleContent(): void
    disposeGoalLifecycleContent?: () => void
  }
}
let root: Root | undefined
window.mountGoalLifecycleContent = (input) => {
  window.disposeGoalLifecycleContent?.()
  const element = document.getElementById('goal-lifecycle-content-fixture')
  if (!element) throw new Error('Missing owned lifecycle fixture')
  const shell = getShellCopy(input.locale)
  const base = shell.session.goalLifecycle
  const labels = {
    ...base,
    titles: {
      created: base.titles.created + input.suffix,
      replaced: base.titles.replaced + input.suffix,
      updated: base.titles.updated + input.suffix,
      status: base.titles.status + input.suffix,
      paused: base.titles.paused + input.suffix,
      resumed: base.titles.resumed + input.suffix,
      completed: base.titles.completed + input.suffix,
      cleared: base.titles.cleared + input.suffix,
    },
    statuses: { ...base.statuses, active: base.statuses.active + input.suffix },
    previousObjective: base.previousObjective + input.suffix,
    nextObjective: base.nextObjective + input.suffix,
    showObjective: base.showObjective + input.suffix,
    hideObjective: base.hideObjective + input.suffix,
    showComparison: base.showComparison + input.suffix,
    hideComparison: base.hideComparison + input.suffix,
    budget: (used: number, limit: number | null) => base.budget(used, limit) + input.suffix,
    continuations: (count: number) => base.continuations(count) + input.suffix,
  }
  const goal = goalHistorySnapshotSchema.parse({
    goalId: 'original-goal',
    objective: input.objective,
    status: 'active',
    tokenBudget: 2000,
    tokensUsed: 1200,
    timeUsedSeconds: 10,
    continuationCount: 3,
    createdAt: 1,
    updatedAt: 2,
  })
  const previous = { ...goal, goalId: 'previous-goal', objective: input.objective.replace('窄屏🚀', '桌面🧭') }
  const facts = Array.from({ length: input.count }, (_, index) =>
    goalHistoryFactSchema.parse({
      eventId: `original-event-${index}`,
      sessionId: 'original-session',
      seq: index + 2,
      time: index + 2,
      runId: null,
      type: input.kind === 'cleared' ? 'goal.cleared' : 'goal.updated',
      goal:
        input.kind === 'cleared'
          ? null
          : { ...goal, objective: input.count === 1 ? input.objective : `${input.objective} ${index}` },
    }),
  )
  let rows = projectGoalLifecycleRows({
    sessionId: 'original-session',
    facts,
    preceding: { seq: 1, goal: input.kind === 'replaced' || input.kind === 'cleared' ? previous : null },
  })
  const execution = threadGoalSchema.parse({
    ...goal,
    threadId: 'original-session',
    continuationCount: undefined,
    executionBudget: {
      goalRemainingTokens: 800,
      sessionRemainingTokens: null,
      effectiveRemainingTokens: 800,
      limitingSource: 'goal',
    },
    continuation: {
      intentId: 'original-intent',
      phase: 'waiting',
      reason: 'retry_wait',
      trigger: 'owned-fixture',
      retryAt: 1000,
      updatedAt: 2,
    },
    blockerAudit:
      input.kind === 'execution' ? { reason: input.objective, consecutiveTurns: 3, requiredTurns: 3 } : undefined,
  })
  const executionBase = shell.goals.goal.execution
  const executionLabels = {
    ...executionBase,
    state: (phase: string, reason: string) => executionBase.state(phase, reason) + input.suffix,
    retryAt: (time: number) => executionBase.retryAt(time) + input.suffix,
    blocker: (reason: string, turns: number, required: number) =>
      executionBase.blocker(reason, turns, required) + input.suffix,
  }
  root = createRoot(element)
  const render = () =>
    root?.render(
      <LumenProvider
        className="goal-lifecycle-fixture-provider"
        appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}
      >
        <LumenToolPane title={shell.goals.title}>
          {input.kind === 'continuation' ? (
            <HbarGoalContinuation
              continuation={{
                id: 'original-boundary',
                runId: 'original-run',
                sessionId: 'original-session',
                status: 'completed',
                createdAt: 1,
                anchor: { kind: 'run', createdAt: 1 },
              }}
              labels={{
                ...shell.session.goalContinuation,
                title: shell.session.goalContinuation.title + input.suffix,
                statuses: {
                  ...shell.session.goalContinuation.statuses,
                  completed: shell.session.goalContinuation.statuses.completed + input.suffix,
                },
              }}
            />
          ) : input.kind === 'execution' ? (
            <HbarGoalExecutionState goal={execution} remainingTokens={800} labels={executionLabels} />
          ) : (
            rows.map((row) => <HbarGoalLifecycleCard key={row.id} row={row} labels={labels} />)
          )}
        </LumenToolPane>
      </LumenProvider>,
    )
  window.reorderGoalLifecycleContent = () => {
    rows = [...rows].reverse()
    render()
  }
  window.disposeGoalLifecycleContent = () => {
    root?.unmount()
    root = undefined
  }
  render()
}
