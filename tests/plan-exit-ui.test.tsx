import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { CommandError, CommandRegistry } from '@hbar/commands'
import type { Approval } from '@hbar/contracts'
import { HbarSessionDecision } from '../packages/app-react/src/session-interactions'
import { createInteractions } from '../packages/app-runtime/src/interactions'
import { readInteractionResolution } from '../packages/app-runtime/src/interaction-recovery'
import { createState } from '../packages/app-runtime/src/state'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { decisionsTimeline } from './session-decisions.fixtures'

const approval: Approval = {
  id: 'exit',
  sessionId: 'one',
  runId: 'run',
  callId: 'exit-call',
  tool: 'exit_plan_mode',
  args: { plan: '# Verified plan\n\n- Keep the original run.' },
  status: 'pending',
  createdAt: 1,
}
const target = { sessionId: 'one', approvalId: 'exit', runId: 'run', callId: 'exit-call' }
const callbacks = { onDecision() {}, onPlanExit() {}, onAnswer() {}, onSubmit() {}, onReconcile() {} }

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`Plan exit uses the supplied document and localized same-request actions: ${locale}`, () => {
    const labels = getShellCopy(locale).session.decisions
    const render = (value: Approval, action?: Parameters<typeof HbarSessionDecision>[0]['action']) =>
      renderToStaticMarkup(
        <HbarSessionDecision
          decision={{
            kind: 'approval',
            id: value.id,
            sessionId: value.sessionId,
            runId: value.runId,
            callId: value.callId,
            tool: value.tool,
            approval: value,
          }}
          action={action}
          labels={labels}
          connected
          {...callbacks}
        />,
      )
    const pending = render(approval)
    expect(pending).toContain('<h1>Verified plan</h1>')
    expect(pending).toContain(labels.planExit.implement)
    expect(pending).toContain(labels.planExit.continuePlanning)
    expect(pending.toLowerCase()).toContain('maxlength="4000"')
    expect(pending).not.toContain(labels.allow)
    const confirmed = render({ ...approval, status: 'denied', feedback: 'Recheck the database risk.' })
    expect(confirmed).toContain('Recheck the database risk.')
    expect(confirmed).toContain(labels.planExit.continued)
    expect(confirmed).toContain('<h1>Verified plan</h1>')
    expect(confirmed).not.toContain('<textarea')
    const unknown = render(approval, {
      id: 'approval:exit',
      kind: 'approval',
      targetId: 'exit',
      sessionId: 'one',
      status: 'unknown',
      error: 'RESULT_UNKNOWN',
    })
    expect(unknown).toContain(labels.reconcile)
    expect(unknown.match(/disabled=""/g)?.length).toBe(3)
    // One document is bounded at 20k characters, never a hidden unbounded list.
    expect(render({ ...approval, args: { plan: 'x'.repeat(20_000) } })).not.toContain(labels.planExit.invalidPlan)
    for (const plan of ['', 'x'.repeat(20_001), null]) {
      const invalid = render({ ...approval, args: { plan } })
      expect(invalid).toContain(labels.planExit.invalidPlan)
      expect(invalid.match(/disabled=""/g)?.length).toBe(3)
    }
  })
}

test('Plan runtime binds the original call, rejects ordinary approval and keeps unknown writes blocked', async () => {
  const local = new CommandRegistry()
  const timeline = createState({ ...decisionsTimeline(), approvals: [approval] }, () => {})
  const calls: { name: string; input: unknown }[] = []
  const interactions = createInteractions(
    local,
    {
      async execute(name, input) {
        calls.push({ name, input })
        throw new CommandError('DISCONNECTED', 'lost after acceptance')
      },
    },
    timeline.reader,
    () => {},
    () => false,
  )
  try {
    expect(
      await interactions
        .execute('approval.resolve', { sessionId: 'one', approvalId: 'exit', decision: 'allowed' })
        .catch((error: unknown) => error),
    ).toMatchObject({ code: 'PLAN_EXIT_DECISION_REQUIRED' })
    expect(
      await interactions
        .execute('planExit.resolve', { ...target, callId: 'wrong', decision: 'implement' })
        .catch((error: unknown) => error),
    ).toMatchObject({ code: 'PLAN_EXIT_TARGET' })
    expect(calls).toHaveLength(0)
    expect(
      await interactions
        .execute('planExit.resolve', { ...target, decision: 'continue', feedback: 'Review the migration.' })
        .catch((error: unknown) => error),
    ).toMatchObject({ code: 'DISCONNECTED' })
    expect(calls).toEqual([
      { name: 'planExit.resolve', input: { ...target, decision: 'continue', feedback: 'Review the migration.' } },
    ])
    expect(interactions.reader.getSnapshot()['approval:exit']).toMatchObject({
      status: 'unknown',
      submittedFeedback: 'Review the migration.',
      approval,
    })
    timeline.replace({ ...decisionsTimeline(), sessionId: 'two', approvals: [] })
    expect(
      await interactions
        .execute('planExit.resolve', { ...target, decision: 'implement' })
        .catch((error: unknown) => error),
    ).toMatchObject({ code: 'BUSY' })
    expect(calls).toHaveLength(1)
  } finally {
    interactions.dispose()
    timeline.dispose()
    local.dispose()
  }
})

test('unknown Plan decisions are recovered read-only by exact identity even when the event cursor expired', async () => {
  const action = {
    id: 'approval:exit',
    kind: 'approval' as const,
    targetId: 'exit',
    sessionId: 'one',
    status: 'unknown' as const,
    error: 'RESULT_UNKNOWN',
    startCursor: 1,
    approval,
  }
  let calls = 0
  const port = {
    async follow() {
      throw new Error('Should use exact-identity query instead of expired history')
    },
    async getPlanExit(input: unknown) {
      calls++
      expect(input).toEqual(target)
      return { ...target, status: 'allowed' }
    },
  }
  expect(await readInteractionResolution(action, port)).toEqual({ resolution: { kind: 'approval', status: 'allowed' } })
  expect(calls).toBe(1)
  expect(
    await readInteractionResolution(action, {
      ...port,
      async getPlanExit() {
        return { ...target, callId: 'other', status: 'allowed' }
      },
    }),
  ).toBeNull()
  expect(
    await readInteractionResolution(action, {
      ...port,
      async getPlanExit() {
        return { ...target, status: 'pending' }
      },
    }),
  ).toBeNull()
})
