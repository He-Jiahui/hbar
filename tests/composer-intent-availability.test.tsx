import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createAppRuntime, type ComposerIntentEntry, type StateReader } from '@hbar/app-runtime'
import type { ThreadGoal } from '@hbar/contracts'
import { HbarRuntimeProvider } from '@hbar/app-react'
import {
  composerGoalAvailability,
  sameComposerIntentInteraction,
  type ComposerGoalAvailabilityInput,
  type ComposerGoalBlockedReason,
} from '../packages/app-react/src/composer-intent-availability'
import {
  canReturnComposerGoalFocus,
  HbarComposerIntentControl,
} from '../packages/app-react/src/composer-intent-blocked'
import { composerIntentBlockedCopy } from '../apps/web/src/composer-intent-blocked-copy'

function entry(): ComposerIntentEntry {
  return {
    sessionId: 'a',
    intent: 'default',
    revision: 2,
    submission: { status: 'idle', phase: null, error: null, preparedGoalId: null },
    goalAction: { status: 'idle', error: null },
  }
}
function goal(status: ThreadGoal['status'] = 'active'): ThreadGoal {
  return {
    threadId: 'a',
    goalId: 'goal-a',
    objective: 'Keep the original Goal',
    status,
    tokenBudget: 1000,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    createdAt: 1,
    updatedAt: 1,
  }
}
function input(): ComposerGoalAvailabilityInput {
  return {
    sessionId: 'a',
    connected: true,
    disabled: false,
    canPrepare: true,
    intent: {
      entries: { a: entry() },
      facts: {
        sessionId: 'a',
        status: 'ready',
        snapshot: { sessionId: 'a', goal: null, remainingTokens: null, goalSeq: 0, plan: null, planSeq: 0 },
        error: null,
      },
    },
    plan: {
      available: true,
      entries: { a: { sessionId: 'a', status: 'ready', mode: 'plan', error: null, revision: 4 } },
    },
  }
}
function withGoal(value: ComposerGoalAvailabilityInput, next: ThreadGoal | null): ComposerGoalAvailabilityInput {
  const snapshot = value.intent.facts.snapshot
  if (!snapshot) throw new Error('Fixture needs a Goal snapshot')
  return {
    ...value,
    intent: { ...value.intent, facts: { ...value.intent.facts, snapshot: { ...snapshot, goal: next } } },
  }
}
function withEntry(value: ComposerGoalAvailabilityInput, next: ComposerIntentEntry): ComposerGoalAvailabilityInput {
  return { ...value, intent: { ...value.intent, entries: { a: next } } }
}
function reason(value: ComposerGoalAvailabilityInput): ComposerGoalBlockedReason | null {
  const result = composerGoalAvailability(value)
  return result.kind === 'blocked' ? result.reason : null
}

test('only a confirmed Plan with matching ready Goal facts offers the independent exit action', () => {
  const value = input()
  expect(composerGoalAvailability(value)).toEqual({ kind: 'blocked', reason: 'plan', recovery: 'exitPlan' })
  expect(composerGoalAvailability({ ...value, plan: { available: false, entries: {} } })).toEqual({ kind: 'ready' })
  expect(
    composerGoalAvailability({
      ...value,
      plan: {
        available: true,
        entries: { a: { sessionId: 'a', revision: 5, status: 'ready', mode: 'default', error: null } },
      },
    }),
  ).toEqual({ kind: 'ready' })
  // A confirmed exit does not prepare a Goal; this reader has no write or optimistic intent projection.
  expect(value.intent.entries.a?.intent).toBe('default')
})

for (const status of ['active', 'paused', 'blocked', 'budget_limited', 'usage_limited'] as const) {
  test(`an existing ${status} Goal takes precedence over Plan and offers no replacement/exit shortcut`, () => {
    const value = withGoal(input(), goal(status))
    expect(composerGoalAvailability(value)).toEqual({ kind: 'blocked', reason: 'existingGoal', recovery: null })
    const partial = withEntry(value, {
      ...entry(),
      submission: { ...entry().submission, status: 'partial', preparedGoalId: 'goal-a' },
    })
    expect(reason(partial)).toBe('existingGoal')
  })
}

test('completed Goal may prepare again; a prepared local intent may only be cancelled without consulting a new Goal', () => {
  expect(reason(withGoal(input(), goal('complete')))).toBe('plan')
  const prepared = withEntry(input(), { ...entry(), intent: 'goal' })
  expect(composerGoalAvailability(prepared)).toEqual({ kind: 'prepared' })
  expect(composerGoalAvailability(withGoal(prepared, goal()))).toEqual({ kind: 'prepared' })
  expect(reason({ ...prepared, disabled: true })).toBe('busy')
})

test('missing, loading, stale and cross-session Goal facts cannot be presented as Plan blocking', () => {
  const base = input()
  for (const status of ['idle', 'loading'] as const)
    expect(reason({ ...base, intent: { ...base.intent, facts: { ...base.intent.facts, status } } })).toBe('goalLoading')
  for (const facts of [
    { ...base.intent.facts, sessionId: 'b' },
    { ...base.intent.facts, snapshot: null },
    {
      ...base.intent.facts,
      snapshot: { sessionId: 'b', goal: null, remainingTokens: null, goalSeq: 0, plan: null, planSeq: 0 },
    },
    withGoal(base, { ...goal(), threadId: 'b' }).intent.facts,
  ])
    expect(reason({ ...base, intent: { ...base.intent, facts } })).toBe('goalLoading')
})

test('Goal read failure is a read retry, unavailable capability has no counterfeit retry or exit', () => {
  const base = input()
  for (const error of ['DISCONNECTED', 'TIMEOUT', 'INVALID_OUTPUT'])
    expect(
      composerGoalAvailability({
        ...base,
        intent: { ...base.intent, facts: { ...base.intent.facts, status: 'error', error } },
      }),
    ).toEqual({ kind: 'blocked', reason: 'goalFailed', recovery: 'refreshGoal' })
  expect(
    reason({
      ...base,
      intent: { ...base.intent, facts: { ...base.intent.facts, status: 'error', error: 'CAPABILITY_UNAVAILABLE' } },
    }),
  ).toBe('unavailable')
})

test('Plan loading, pending, failed, unknown and stale targets have distinct guarded recovery', () => {
  const base = input()
  for (const [status, expected, recovery] of [
    ['loading', 'planLoading', null],
    ['pending', 'busy', null],
    ['failed', 'planFailed', 'refreshPlan'],
    ['unknown', 'planUnknown', 'reconcilePlan'],
  ] as const) {
    const value = {
      ...base,
      plan: {
        available: true,
        entries: { a: { sessionId: 'a', revision: 4, mode: null, status, error: 'RESULT_UNKNOWN' } },
      },
    }
    expect(composerGoalAvailability(value)).toEqual({ kind: 'blocked', reason: expected, recovery })
  }
  expect(reason({ ...base, plan: { available: true, entries: {} } })).toBe('planLoading')
  expect(
    reason({
      ...base,
      plan: {
        available: true,
        entries: { a: { sessionId: 'b', revision: 4, mode: 'plan', status: 'ready', error: null } },
      },
    }),
  ).toBe('planLoading')
})

test('transaction state, readonly and disconnected do not masquerade as Plan; original unknown receipts stay readable', () => {
  expect(reason({ ...input(), disabled: true })).toBe('busy')
  expect(reason({ ...input(), canPrepare: false })).toBe('readonly')
  expect(reason({ ...input(), connected: false })).toBe('offline')
  for (const part of ['submission', 'goalAction'] as const) {
    const before = entry()
    expect(reason(withEntry(input(), { ...before, [part]: { ...before[part], status: 'submitting' } }))).toBe('busy')
    const unknown = withEntry(input(), { ...before, [part]: { ...before[part], status: 'unknown' } })
    expect(composerGoalAvailability({ ...unknown, disabled: true, canPrepare: false })).toEqual({
      kind: 'blocked',
      reason: 'composerUnknown',
      recovery: 'reconcileComposer',
    })
    expect(reason({ ...unknown, connected: false })).toBe('offline')
  }
  // A stale entry under the current key is never allowed to cancel or reconcile another session.
  expect(
    reason(
      withEntry(input(), {
        ...entry(),
        sessionId: 'b',
        intent: 'goal',
        submission: { ...entry().submission, status: 'unknown' },
      }),
    ),
  ).toBe('plan')
})

test('lifetime identity rejects late A→B→A replies, runtime replacement and unmount without a focus action', async () => {
  const captured = { sessionId: 'a', lifetime: 1 }
  const result = Promise.withResolvers<string>()
  const applied: string[] = []
  let current: typeof captured | null = captured
  const pending = result.promise.then((value) => {
    if (sameComposerIntentInteraction(captured, current)) applied.push(value)
  })
  expect(sameComposerIntentInteraction(captured, current)).toBe(true)
  current = { sessionId: 'b', lifetime: 2 }
  expect(sameComposerIntentInteraction(captured, current)).toBe(false)
  current = { sessionId: 'a', lifetime: 3 }
  result.resolve('old feedback')
  await pending
  expect(applied).toEqual([])
  expect(sameComposerIntentInteraction(captured, { sessionId: 'a', lifetime: 4 })).toBe(false)
  current = null
  expect(sameComposerIntentInteraction(captured, current)).toBe(false)
})

test('native close returns vacant focus only to the current lifetime, never across navigation or another overlay', () => {
  const target = { sessionId: 'a', lifetime: 1 }
  const initial = {
    captured: target,
    current: target,
    selectedSessionId: 'a',
    navigationIdle: true,
    popupOpen: false,
    otherTopLayer: false,
    focusVacant: true,
  }
  expect(canReturnComposerGoalFocus(initial)).toBe(true)
  for (const changed of [
    { captured: null },
    { current: null },
    { current: { sessionId: 'b', lifetime: 2 } },
    { current: { sessionId: 'a', lifetime: 3 } },
    { selectedSessionId: 'b' },
    { navigationIdle: false },
    { popupOpen: true },
    { otherTopLayer: true },
    { focusVacant: false },
  ])
    expect(canReturnComposerGoalFocus({ ...initial, ...changed })).toBe(false)
})

function reader<T>(value: T): StateReader<T> {
  return { getSnapshot: () => value, subscribe: () => () => {} }
}
function render(value: ComposerGoalAvailabilityInput, locale: 'en-US' | 'zh-CN', long = false) {
  const runtime = createAppRuntime({
    instanceId: 'goal-ui-fixture',
    hostId: 'host',
    directory: {
      execute: async () => {
        throw new Error('SSR must not query')
      },
    },
  })
  const blocked = composerIntentBlockedCopy(locale)
  try {
    return renderToStaticMarkup(
      <HbarRuntimeProvider
        view={{
          ...runtime.view,
          state: { ...runtime.view.state, composerIntent: reader(value.intent), composerPlanMode: reader(value.plan) },
        }}
      >
        <HbarComposerIntentControl
          sessionId={value.sessionId}
          connected={value.connected}
          disabled={value.disabled}
          canPrepare={value.canPrepare}
          labels={{
            goal: locale === 'zh-CN' ? '目标' : 'Goal',
            goalHint: 'Prepare this prompt',
            cancelGoal: 'Cancel prepared Goal',
            blocked: long
              ? {
                  ...blocked,
                  title: blocked.title.repeat(10),
                  reasons: { ...blocked.reasons, plan: blocked.reasons.plan.repeat(6) },
                }
              : blocked,
          }}
        />
      </HbarRuntimeProvider>,
    )
  } finally {
    runtime.dispose()
  }
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`blocked Goal is focusable with an associated explanation and closeable native popover: ${locale}`, () => {
    const copy = composerIntentBlockedCopy(locale)
    const html = render(input(), locale)
    expect(html).toContain('popover="auto"')
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('aria-describedby=')
    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain(copy.reasons.plan)
    expect(html).toContain(copy.exitPlan)
    expect(html).toContain(`aria-label="${copy.close}"`)
    expect(html).not.toContain('disabled=""')
    expect(html).not.toContain(copy.exited)
    expect(html).not.toContain('role="tooltip"')
    expect(render(input(), locale, true)).toContain(copy.title.repeat(10))
  })
  test(`unknown only exposes read reconciliation, not an exit write: ${locale}`, () => {
    const base = input()
    const copy = composerIntentBlockedCopy(locale)
    const html = render(
      {
        ...base,
        plan: {
          available: true,
          entries: { a: { sessionId: 'a', revision: 4, mode: null, status: 'unknown', error: 'RESULT_UNKNOWN' } },
        },
      },
      locale,
    )
    expect(html).toContain(copy.reconcilePlan)
    expect(html).toContain(copy.reasons.planUnknown)
    expect(html).not.toContain(copy.exitPlan)
    expect(html).not.toContain(copy.exited)
    expect(html).toContain(`aria-label="${copy.close}"`)
  })
}

test('localized failure copy never prints raw error payload or an arbitrary code', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = composerIntentBlockedCopy(locale)
    for (const code of [
      'private-token-or-path',
      'EXECUTION_FAILED',
      'RESULT_UNKNOWN',
      'VERSION_CONFLICT',
      'DISCONNECTED',
      'BUSY',
    ]) {
      expect(labels.error(code)).not.toContain(code)
      expect(labels.error(code).length).toBeGreaterThan(0)
    }
  }
})
