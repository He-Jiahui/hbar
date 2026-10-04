import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createAppRuntime, type ComposerIntentState, type StateReader } from '@hbar/app-runtime'
import { HbarRuntimeProvider } from '@hbar/app-react'
import { HbarComposerGoal } from '../packages/app-react/src/composer-intent-controls'
import { HbarComposerIntentControl } from '../packages/app-react/src/composer-intent-blocked'
import { HbarComposerGoalRecovery } from '../packages/app-react/src/composer-goal-recovery'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'

type Action = ComposerIntentState['entries'][string]['goalAction']
const operation = { sessionId: 'a', expectedGoalId: 'original-goal', action: 'pause' as const }
function action(status: 'checking' | 'unconfirmed' | 'failed', requestInFlight = false): Action {
  return {
    status: 'unknown',
    error: 'PRIVATE original failure',
    reconciliation: { status, requestInFlight, error: status === 'failed' ? 'PRIVATE read failure' : null, operation },
  }
}
function reader<Value>(value: Value): StateReader<Value> {
  return { getSnapshot: () => value, subscribe: () => () => {} }
}
function renderSurfaces(locale: ShellLocale, goalAction: Action, failedRead = true) {
  const runtime = createAppRuntime({
    instanceId: 'goal-recovery-render',
    hostId: 'fixture',
    directory: { execute: async () => ({ items: [], nextCursor: null }) },
  })
  const intent: ComposerIntentState = {
    entries: {
      a: {
        sessionId: 'a',
        intent: 'default',
        revision: 3,
        submission: { status: 'idle', phase: null, error: null, preparedGoalId: null },
        goalAction,
      },
    },
    facts: {
      sessionId: 'a',
      status: failedRead ? 'error' : 'ready',
      error: failedRead ? 'PRIVATE read failure' : null,
      snapshot: {
        sessionId: 'a',
        goalSeq: 7,
        planSeq: 0,
        remainingTokens: null,
        plan: null,
        goal: {
          threadId: 'a',
          goalId: 'original-goal',
          objective: 'Keep the original objective',
          status: 'paused',
          tokenBudget: null,
          tokensUsed: 0,
          timeUsedSeconds: 0,
          createdAt: 1,
          updatedAt: 2,
        },
      },
    },
  }
  const labels = getShellCopy(locale).session.intent
  try {
    const view = { ...runtime.view, state: { ...runtime.view.state, composerIntent: reader(intent) } }
    return {
      summary: renderToStaticMarkup(
        <HbarRuntimeProvider view={view}>
          <HbarComposerGoal sessionId="a" workspaceId="w" connected labels={labels} surface="summary" />
        </HbarRuntimeProvider>,
      ),
      blocker: renderToStaticMarkup(
        <HbarRuntimeProvider view={view}>
          <HbarComposerIntentControl sessionId="a" connected disabled={false} labels={labels} />
        </HbarRuntimeProvider>,
      ),
    }
  } finally {
    runtime.dispose()
  }
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`${locale}: summary and Goal preparation show the same owner-held check without a second refresh`, () => {
    const copy = getShellCopy(locale).session.intent
    const rendered = renderSurfaces(locale, action('checking', true))
    for (const html of [rendered.summary, rendered.blocker]) {
      expect(html).toContain(copy.recovery.checking)
      expect(html).toContain('aria-busy="true"')
      expect(html).toContain(copy.recovery.reconcile)
      expect(html).not.toContain('PRIVATE')
      expect(html).not.toContain(copy.refresh)
      expect(html.match(/data-testid="composer-goal-recovery"/g)).toHaveLength(1)
    }
    expect(rendered.blocker).toContain(`aria-label="${copy.blocked.close}"`)
    expect(rendered.summary).toContain('Keep the original objective')
  })
  test(`${locale}: failed check remains unknown with one safe retry, while ordinary read failure retains refresh`, () => {
    const copy = getShellCopy(locale).session.intent
    const rendered = renderSurfaces(locale, action('failed'))
    for (const html of [rendered.summary, rendered.blocker]) {
      expect(html).toContain(copy.recovery.failed)
      expect(html).toContain(copy.recovery.reconcile)
      expect(html).not.toContain(copy.refresh)
      expect(html).not.toContain('PRIVATE')
    }
    const ordinary = renderSurfaces(locale, { status: 'succeeded', error: null })
    expect(ordinary.summary).toContain(copy.refresh)
    expect(ordinary.summary).not.toContain(copy.recovery.reconcile)
    expect(ordinary.summary).not.toContain('PRIVATE')
  })
}

test('an unsettled physical read stays locked after logical failure; offline is not a failed write', () => {
  const labels = getShellCopy('zh-CN').session.intent.recovery
  for (const connected of [true, false]) {
    const html = renderToStaticMarkup(
      <HbarComposerGoalRecovery
        action={action('failed', true)}
        connected={connected}
        labels={labels}
        onReconcile={() => {}}
      />,
    )
    expect(html).toContain(connected ? labels.waiting : labels.offline)
    expect(html).toContain('disabled=""')
    expect(html).toContain('aria-busy="true"')
    expect(html).not.toContain('PRIVATE')
  }
})

test('recovery is absent for a known action and accepts long host-provided copy without side effects', () => {
  const labels = getShellCopy('en-US').session.intent.recovery
  let calls = 0
  const onReconcile = () => {
    calls++
  }
  expect(
    renderToStaticMarkup(
      <HbarComposerGoalRecovery
        action={{ status: 'succeeded', error: null }}
        connected
        labels={labels}
        onReconcile={onReconcile}
      />,
    ),
  ).toBe('')
  const html = renderToStaticMarkup(
    <HbarComposerGoalRecovery
      action={action('unconfirmed')}
      connected
      labels={{ ...labels, unknown: labels.unknown.repeat(8), reconcile: labels.reconcile.repeat(4) }}
      onReconcile={onReconcile}
    />,
  )
  expect(html).toContain(labels.unknown.repeat(8))
  expect(html).toContain(labels.reconcile.repeat(4))
  expect(calls).toBe(0)
})

test('shared submission error copy does not mislabel an ordinary send as a Goal action', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = getShellCopy(locale).session.intent
    const message = labels.error('PRIVATE_FAILURE_PAYLOAD')
    expect(message).not.toContain('PRIVATE_FAILURE_PAYLOAD')
    expect(message).not.toMatch(/Goal|目标/)
    expect(message).toBe(labels.error('EXECUTION_FAILED'))
  }
})
