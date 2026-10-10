import { expect, test } from 'bun:test'
import { diagnosticEventSchema, type DiagnosticEvent, type DiagnosticSink } from '@hbar/contracts'
import {
  createKernelExecutionDiagnostics,
  type KernelContinuationDiagnostic,
} from '../packages/kernel/src/execution-diagnostics'
import { HbarError, RUN_STEP_LIMIT_CODE } from '@hbar/contracts'
import { definePlugin, provide, type DriverInput, type HarnessDriver } from '@hbar/plugin-sdk'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

function collector(events: DiagnosticEvent[]): DiagnosticSink {
  return { emit: (event) => events.push(event) }
}

const identity = { sessionId: 'session-1', runId: 'run-1', requestId: 'request-1' }

async function removeOwnedRoot(root: string): Promise<void> {
  const resolved = await realpath(root)
  const parent = await realpath(tmpdir())
  if (dirname(resolved) !== parent || !basename(resolved).startsWith('hbar-step-diagnostic-'))
    throw new Error('Refusing to remove an unexpected diagnostics fixture')
  await rm(resolved, { recursive: true, force: true })
}

test('bounded step terminal diagnostics preserve completed model steps and hard limit', () => {
  const events: DiagnosticEvent[] = []
  const diagnostics = createKernelExecutionDiagnostics({ sink: collector(events) })

  diagnostics.runSettled(identity, 'failure', 12, 'RUN_STEP_LIMIT', 'step_limit', {
    startedStepCount: 64,
    completedStepCount: 64,
    hardStepLimit: 64,
  })

  expect(events[0]).toMatchObject({
    event: 'run.settled',
    errorCode: 'RUN_STEP_LIMIT',
    phase: 'step_limit',
    startedStepCount: 64,
    completedStepCount: 64,
    hardStepLimit: 64,
  })
  expect(diagnosticEventSchema.safeParse(events[0]).success).toBe(true)
  expect(JSON.stringify(events)).not.toContain('Run reached the 64-step limit')
})

test('continuation diagnostics expose only redacted lifecycle facts and tolerate sink failure', () => {
  const events: DiagnosticEvent[] = []
  const diagnostics = createKernelExecutionDiagnostics({
    sink: {
      emit: (event) => {
        events.push(event)
        throw new Error('sink failure')
      },
    },
  })
  const continuation: KernelContinuationDiagnostic = {
    sessionId: 'session-1',
    goalId: 'goal-1',
    intentId: 'intent-1',
    phase: 'waiting',
    reason: 'workflow_wait',
    triggerKind: 'step_limit',
  }

  expect(() => diagnostics.continuationUpdated(continuation)).not.toThrow()
  expect(events[0]).toMatchObject({
    event: 'goal.continuation',
    continuationGoalId: 'goal-1',
    continuationIntentId: 'intent-1',
    continuationPhase: 'waiting',
    continuationReason: 'workflow_wait',
    continuationTriggerKind: 'step_limit',
  })
  expect(diagnosticEventSchema.safeParse(events[0]).success).toBe(true)
  expect(JSON.stringify(events)).not.toContain('objective')
  expect(JSON.stringify(events)).not.toContain('step-limit:run-1')
})

test('diagnostic fact getters cannot break terminal emission', () => {
  const events: DiagnosticEvent[] = []
  const diagnostics = createKernelExecutionDiagnostics({ sink: collector(events) })
  const facts = Object.defineProperty({}, 'startedStepCount', {
    get: () => {
      throw new Error('getter')
    },
  })
  expect(() => diagnostics.runSettled(identity, 'failure', 1, 'RUN_FAILED', undefined, facts)).not.toThrow()
  expect(events[0]?.event).toBe('run.settled')
})

test('diagnostic schema rejects unbounded step facts and unknown continuation payload fields', () => {
  const parsed = diagnosticEventSchema.safeParse({
    schemaVersion: 1,
    time: 1,
    monotonicMs: 1,
    component: 'kernel',
    level: 'error',
    event: 'run.settled',
    startedStepCount: 1_000_001,
  })
  expect(parsed.success).toBe(false)
  const extra = diagnosticEventSchema.safeParse({
    schemaVersion: 1,
    time: 1,
    monotonicMs: 1,
    component: 'kernel',
    level: 'info',
    event: 'goal.continuation',
    continuationPhase: 'queued',
    prompt: 'redacted by contract',
  })
  expect(extra.success).toBe(false)
})

test('real Kernel counts durable distinct steps for typed limit and ordinary failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-step-diagnostic-'))
  const events: DiagnosticEvent[] = []
  let ordinary = false
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Step diagnostic fixture',
      description: 'Bounded diagnostic fixture',
      permissions: [],
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      provides: { driver: '1.0.0' },
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        run: async (input: DriverInput) => {
          const limit = ordinary ? 2 : 64
          for (let index = 0; index < limit; index += 1) {
            const step = `step-${index}`
            await input.emit('step.started', { step: index + 1 }, step)
            if (ordinary && index === 1) throw new Error('ordinary fixture failure')
            await input.emit('step.ended', {}, step)
            await input.emit('step.started', { step: index + 1 }, step)
            await input.emit('step.ended', {}, step)
          }
          if (ordinary) throw new Error('ordinary fixture failure')
          throw new HbarError(RUN_STEP_LIMIT_CODE, 'bounded fixture failure')
        },
        summarize: async () => ({
          text: 'summary',
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
        }),
      })
    },
  })
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    diagnostics: collector(events),
    profile: { replacements: { 'driver.pi': driver } },
  })
  try {
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Expected the step diagnostic fixture workspace')
    const session = await kernel.createSession(workspace.id)
    await kernel.submit(session.id, 'bounded', { text: 'bounded', images: [] }, 'local-fixture')
    await kernel.waitForIdle()
    const bounded = events.find((event) => event.event === 'run.settled' && event.errorCode === RUN_STEP_LIMIT_CODE)
    expect(bounded).toMatchObject({
      startedStepCount: 64,
      completedStepCount: 64,
      hardStepLimit: 64,
      phase: 'step_limit',
    })
    ordinary = true
    await kernel.submit(session.id, 'ordinary', { text: 'ordinary', images: [] }, 'local-fixture')
    await kernel.waitForIdle()
    const failure = events.find((event) => event.event === 'run.settled' && event.errorCode === 'RUN_FAILED')
    expect(failure).toMatchObject({ startedStepCount: 2, completedStepCount: 1 })
    expect(failure?.hardStepLimit).toBeUndefined()
  } finally {
    await kernel.close()
    await removeOwnedRoot(root)
  }
})

test('real Goal continuation diagnostics follow persisted queued and running phases without payloads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-step-diagnostic-goal-'))
  const diagnostics: DiagnosticEvent[] = []
  const publicStates: Array<{ goalId: string | undefined; intentId: string; phase: string; reason: string }> = []
  let turns = 0
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Goal continuation diagnostic fixture',
      description: 'Durable bounded continuation lifecycle fixture',
      permissions: [],
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      provides: { driver: '1.0.0' },
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        run: async (input: DriverInput) => {
          turns += 1
          const callId = `goal-call-${turns}`
          if (turns === 1) {
            await input.commit('assistant', [
              {
                type: 'tool_call',
                callId,
                name: 'update_plan',
                args: { plan: [{ step: 'Durable milestone', status: 'in_progress' }] },
              },
            ])
            const result = await input.execute(
              'update_plan',
              { plan: [{ step: 'Durable milestone', status: 'in_progress' }] },
              callId,
            )
            if (result.isError) throw new Error(result.text)
            throw new HbarError(RUN_STEP_LIMIT_CODE, 'bounded Goal fixture failure')
          }
          await input.commit('assistant', [
            {
              type: 'tool_call',
              callId,
              name: 'update_plan',
              args: { plan: [{ step: 'Durable milestone', status: 'completed' }] },
            },
          ])
          const planResult = await input.execute(
            'update_plan',
            { plan: [{ step: 'Durable milestone', status: 'completed' }] },
            callId,
          )
          if (planResult.isError) throw new Error(planResult.text)
          const goalCallId = `${callId}-complete`
          await input.commit('assistant', [
            { type: 'tool_call', callId: goalCallId, name: 'update_goal', args: { status: 'complete' } },
          ])
          const goalResult = await input.execute('update_goal', { status: 'complete' }, goalCallId)
          if (goalResult.isError) throw new Error(goalResult.text)
        },
        summarize: async () => ({
          text: 'summary',
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
        }),
      })
    },
  })
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    diagnostics: collector(diagnostics),
    profile: { replacements: { 'driver.pi': driver } },
  })
  const unsubscribe = kernel.subscribe((event) => {
    if (event.method !== 'goal.updated' || !event.params.goal.continuation) return
    publicStates.push({
      goalId: event.params.goal.goalId,
      intentId: event.params.goal.continuation.intentId,
      phase: event.params.goal.continuation.phase,
      reason: event.params.goal.continuation.reason,
    })
  })
  try {
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Expected the Goal diagnostic fixture workspace')
    const session = await kernel.createSession(workspace.id)
    const goals = kernel.plugins.get<{ create(sessionId: string, objective: string): Promise<unknown> }>('goal')
    await goals.create(session.id, 'OBJECTIVE_CANARY_DO_NOT_LOG')
    await kernel.submit(session.id, 'goal-start', { text: 'Begin bounded work', images: [] }, 'local-fixture')
    await kernel.waitForIdle()
    const continuationEvents = diagnostics.filter((event) => event.event === 'goal.continuation')
    expect(continuationEvents.map((event) => event.continuationPhase)).toEqual([
      'pending',
      'queued',
      'running',
      'stopped',
    ])
    expect(continuationEvents.at(-1)?.continuationReason).toBe('complete')
    expect(continuationEvents.every((event) => event.continuationReason !== undefined)).toBe(true)
    expect(JSON.stringify(continuationEvents)).not.toContain('OBJECTIVE_CANARY_DO_NOT_LOG')
    expect(JSON.stringify(continuationEvents)).not.toContain('step-limit:')
    const first = continuationEvents[0]
    if (!first?.continuationGoalId || !first.continuationIntentId) throw new Error('Expected bound Goal diagnostics')
    expect(
      continuationEvents.every(
        (event) =>
          event.continuationGoalId === first.continuationGoalId &&
          event.continuationIntentId === first.continuationIntentId,
      ),
    ).toBe(true)
    for (const event of continuationEvents) {
      if (!event.continuationIntentId || !event.continuationPhase || !event.continuationReason)
        throw new Error('Expected complete continuation lifecycle metadata')
      expect(publicStates).toContainEqual({
        goalId: event.continuationGoalId,
        intentId: event.continuationIntentId,
        phase: event.continuationPhase,
        reason: event.continuationReason,
      })
    }
    expect(turns).toBe(2)
  } finally {
    unsubscribe()
    await kernel.close()
    await removeOwnedRoot(root)
  }
})
