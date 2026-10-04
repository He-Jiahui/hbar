import { expect, test } from 'bun:test'
import {
  composerGoalAvailability,
  type ComposerGoalAvailabilityInput,
} from '../packages/app-react/src/composer-intent-availability'

function input(): ComposerGoalAvailabilityInput {
  return {
    sessionId: 'original',
    connected: true,
    disabled: false,
    canPrepare: true,
    intent: {
      entries: {},
      facts: {
        sessionId: 'original',
        status: 'ready',
        snapshot: { sessionId: 'original', goal: null, remainingTokens: null, goalSeq: 0, plan: null, planSeq: 0 },
        error: null,
      },
    },
    plan: {
      available: true,
      entries: { original: { sessionId: 'original', status: 'ready', mode: 'plan', error: null, revision: 1 } },
    },
  }
}

test('confirmed Plan allows Goal preparation without exiting or changing its canonical mode', () => {
  const state = input()
  expect(composerGoalAvailability(state)).toEqual({ kind: 'ready' })
  expect(state.plan.entries.original?.mode).toBe('plan')
  expect(state.intent.entries).toEqual({})
})

test('prepared Goal remains prepared in Plan; execution uncertainty still fences new preparation', () => {
  const state = input()
  const prepared = {
    ...state,
    intent: {
      ...state.intent,
      entries: {
        original: {
          sessionId: 'original',
          intent: 'goal' as const,
          revision: 2,
          submission: { status: 'idle' as const, phase: null, error: null, preparedGoalId: null },
          goalAction: { status: 'idle' as const, error: null },
        },
      },
    },
  }
  expect(composerGoalAvailability(prepared)).toEqual({ kind: 'prepared' })
  for (const [status, reason] of [
    ['pending', 'busy'],
    ['unknown', 'planUnknown'],
  ] as const) {
    const canonical = state.plan.entries.original
    if (!canonical) throw new Error('Missing original mode fixture')
    expect(
      composerGoalAvailability({
        ...prepared,
        plan: { ...state.plan, entries: { original: { ...canonical, status } } },
      }),
    ).toMatchObject({ kind: 'blocked', reason })
  }
})

test('coexistence does not bypass readonly, offline or mismatched Goal facts', () => {
  const state = input()
  expect(composerGoalAvailability({ ...state, canPrepare: false })).toMatchObject({ reason: 'readonly' })
  expect(composerGoalAvailability({ ...state, connected: false })).toMatchObject({ reason: 'offline' })
  expect(
    composerGoalAvailability({
      ...state,
      intent: { ...state.intent, facts: { ...state.intent.facts, sessionId: 'other' } },
    }),
  ).toMatchObject({ reason: 'goalLoading' })
})
