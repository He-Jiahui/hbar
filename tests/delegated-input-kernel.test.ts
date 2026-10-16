import { expect, test } from 'bun:test'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { Kernel, MemorySecrets, SettingsService } from '@hbar/kernel'
import {
  emptyUsage,
  HbarError,
  userInputResponseSchema,
  type UserInputQuestion,
  type UserInputResponse,
  type RunMode,
} from '@hbar/contracts'
import {
  AUTONOMY_DECISION_MODE_SETTING,
  AUTONOMY_DECISION_TARGET_SETTING,
  AUTONOMY_DECISION_TIMEOUT_SETTING,
} from '@hbar/contracts/autonomy'
import { delegatedInputEnvelopeSchema } from '@hbar/contracts/delegated-user-input'
import {
  definePlugin,
  provide,
  type DriverInput,
  type HarnessDriver,
  type GoalService,
  type BudgetService,
  type ModeService,
  type PlanService,
} from '@hbar/plugin-sdk'
import { removeOwnedTestDirectory } from './owned-temp-directory'
import type { StorageMethods } from '@hbar/storage'

const question: UserInputQuestion = {
  id: 'scope',
  header: 'Scope',
  question: 'Choose a scope',
  purpose: 'decision',
  isOther: false,
  isSecret: false,
  options: [
    { label: 'App', description: 'The application' },
    { label: 'API', description: 'The service' },
  ],
}
const pageSchema = z.object({ items: z.array(delegatedInputEnvelopeSchema) })
const approvalIdSchema = z.object({ id: z.string() })
async function originalApproval(kernel: Kernel, sessionId: string) {
  const event = (await kernel.storage.call('events', sessionId, 0, 256)).find(
    (item) => item.type === 'approval.requested',
  )
  return event ? kernel.storage.call('approval', approvalIdSchema.parse(event.data).id) : undefined
}
async function until<Result>(read: () => Promise<Result | undefined>): Promise<Result> {
  const deadline = performance.now() + 10_000
  while (true) {
    const result = await read()
    if (result !== undefined) return result
    if (performance.now() >= deadline) throw new Error('Delegation did not reach its expected boundary')
    await Bun.sleep(10)
  }
}
async function fixture(
  options: {
    active?: boolean
    question?: UserInputQuestion
    reply?: 'answered' | 'human'
    delayMs?: number
    idleMs?: number
    deferReply?: boolean
    shortDeadline?: boolean
    approvalChoice?: 'allowed' | 'denied' | 'implement' | 'continue'
    humanOnly?: boolean
  } = {},
) {
  const prefix = 'hbar-delegated-kernel-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const targetStarted = Promise.withResolvers<void>()
  const releaseTarget = Promise.withResolvers<void>()
  const targetReady = Promise.withResolvers<void>()
  const releaseReply = Promise.withResolvers<void>()
  const received: DriverInput[] = []
  const sourceAnswers: UserInputResponse[] = []
  const approvalResults: boolean[] = []
  const modes: RunMode[] = []
  const targetReceipts: string[] = []
  const envelopes: z.output<typeof delegatedInputEnvelopeSchema>[] = []
  const rejectedTools: string[] = []
  const profile = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Delegated decisions fixture',
      description: 'Structured replies from idle and active decision targets',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      permissions: [],
      provides: { driver: '1.0.0' },
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        supportsCanonicalSteering: true,
        supportsSteeringAdmissionClosure: true,
        async run(input) {
          received.push(input)
          const stepId = crypto.randomUUID()
          await input.beforeRequest(input.request, stepId)
          await input.emit('usage.recorded', { ...emptyUsage(), output: 1 }, stepId)
          if (input.run.input.text === 'source-task') {
            if (options.approvalChoice) {
              const plan = ['implement', 'continue'].includes(options.approvalChoice)
              const name = options.humanOnly ? 'web_search' : plan ? 'exit_plan_mode' : 'write_file'
              const args = options.humanOnly
                ? { query: 'A fact requiring human approval' }
                : plan
                  ? { plan: '# The original plan\n\nOnly change approved.txt.' }
                  : { path: 'approved.txt', text: 'The exact delegated change' }
              await input.commit('assistant', [{ type: 'tool_call', name, args, callId: 'source-approval' }])
              const result = await input.execute(name, args, 'source-approval')
              approvalResults.push(result.isError ?? false)
              modes.push((await input.beforeRequest(input.request, crypto.randomUUID())).context?.mode ?? 'default')
            } else {
              const result = await input.execute(
                'request_user_input',
                { questions: [options.question ?? question] },
                'source-question',
              )
              sourceAnswers.push(userInputResponseSchema.parse(JSON.parse(result.text) as unknown))
            }
          } else {
            if (input.run.input.delegatedDecision) {
              try {
                await input.execute('request_user_input', { questions: [question] }, 'excluded-tool')
                throw new Error('A dedicated decision executed an excluded tool')
              } catch (error) {
                if (!(error instanceof HbarError) || error.code !== 'DELEGATION_TOOL_FORBIDDEN') throw error
                rejectedTools.push(error.code)
              }
            }
            if (!input.run.input.delegatedDecision) {
              targetStarted.resolve()
              await until(async () => {
                input.signal.throwIfAborted()
                const messages = await input.getSteeringMessages?.({
                  sessionId: input.session.id,
                  runId: input.run.id,
                  signal: input.signal,
                })
                return messages?.length ? true : undefined
              })
            }
            const delayEnd = performance.now() + (options.delayMs ?? 0)
            let ticks = 0
            while (performance.now() < delayEnd) {
              input.signal.throwIfAborted()
              input.stream('target-thinking', '', `Thinking ${'.'.repeat(++ticks)}`)
              await Bun.sleep(80)
            }
            targetReady.resolve()
            if (options.deferReply) await releaseReply.promise
            const inbox = await input.execute('hbar_decisions_inbox', {}, 'target-inbox')
            const grant = pageSchema.parse(JSON.parse(inbox.text) as unknown).items[0]
            if (!grant) {
              if (input.run.input.delegatedDecision)
                throw new Error('The actual target did not receive its original grant')
              await releaseTarget.promise
              await input.commit('assistant', [
                { type: 'text', text: 'The original target task continues after delegation cancellation' },
              ])
              await input.stepEnded(stepId)
              return
            }
            envelopes.push(grant)
            const result = await input.execute(
              'hbar_decision_reply',
              {
                sessionId: grant.sessionId,
                requestId: grant.requestId,
                delegationId: grant.delegationId,
                expectedRevision: grant.revision,
                reply:
                  options.reply === 'human'
                    ? { kind: 'human', reason: 'missing_information' }
                    : {
                        kind: 'answered',
                        response: {
                          answers: options.approvalChoice
                            ? { decision: { answers: [options.approvalChoice] } }
                            : { scope: { answers: ['API'] } },
                        },
                      },
              },
              'target-reply',
            )
            targetReceipts.push(result.text)
            if (!input.run.input.delegatedDecision) await releaseTarget.promise
          }
          await input.commit('assistant', [{ type: 'text', text: 'Original task complete' }])
          await input.stepEnded(stepId)
        },
        summarize: async () => ({ text: '', usage: emptyUsage() }),
      })
    },
  })
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    profile: { replacements: { 'driver.pi': profile } },
    ...(options.idleMs === undefined ? {} : { runIdleTimeoutMs: options.idleMs }),
  }).catch(async (error: unknown) => {
    await removeOwnedTestDirectory(root, prefix)
    throw error
  })
  try {
    await kernel.changePlugin('goal.codex', true, { autoContinue: false, maxContinuations: 0 })
    await kernel.changePlugin('budget.codex', true, { autoContinue: false })
    const workspace = (await kernel.storage.call('workspaces'))[0]!
    const targetPath = join(root, 'target-workspace')
    await mkdir(targetPath)
    const targetWorkspace = await kernel.storage.call('createWorkspace', targetPath, 'Target workspace')
    await kernel.storage.call(
      'putDevice',
      { id: 'decision-owner', name: 'Fixture', role: 'operator', workspaceIds: null, createdAt: 1, lastSeenAt: 1 },
      'fixture-token',
    )
    const sessions = await Promise.all(
      ['source', 'target'].map((name, index) =>
        kernel.storage.call('createSessionCommand', {
          workspaceId: index === 0 ? workspace.id : targetWorkspace.id,
          actorId: 'decision-owner',
          idempotencyKey: name,
        }),
      ),
    )
    const source = sessions[0]!,
      target = sessions[1]!
    if (options.approvalChoice) await kernel.setPermissionMode('ask')
    if (options.humanOnly) await kernel.changePlugin('web-search.responses', true)
    const plan = options.approvalChoice === 'implement' || options.approvalChoice === 'continue'
    if (plan) await kernel.plugins.get<ModeService>('mode').set(source.id, 'plan')
    const settings = new SettingsService(kernel.storage)
    const snapshot = await settings.get({ kind: 'session', targetId: source.id })
    await settings.apply({
      schemaVersion: snapshot.schemaVersion,
      scope: { kind: 'session', targetId: source.id },
      baselineRevisions: snapshot.revisions,
      idempotencyKey: 'delegate-policy',
      actorId: 'decision-owner',
      changes: [
        { op: 'set', path: [{ kind: 'field', name: AUTONOMY_DECISION_MODE_SETTING }], value: 'delegate' },
        { op: 'set', path: [{ kind: 'field', name: AUTONOMY_DECISION_TARGET_SETTING }], value: target.id },
        {
          op: 'set',
          path: [{ kind: 'field', name: AUTONOMY_DECISION_TIMEOUT_SETTING }],
          value: options.shortDeadline ? 1 : 300,
        },
      ],
    })
    const human: string[] = []
    const unsubscribe = kernel.subscribe((event) => {
      if (event.method === 'user_input.requested') human.push(event.params.requestId)
    })
    return {
      kernel,
      source,
      target,
      received,
      sourceAnswers,
      approvalResults,
      modes,
      writePath: join(root, 'approved.txt'),
      targetReceipts,
      envelopes,
      rejectedTools,
      ready: targetReady.promise,
      releaseReply: () => releaseReply.resolve(),
      human,
      async start() {
        const targetRun = options.active
          ? await kernel.submit(target.id, 'target-original', { text: 'target-task', images: [] }, 'local-fixture')
          : null
        if (targetRun) await targetStarted.promise
        const run = await kernel.submit(
          source.id,
          'source-original',
          {
            text: 'source-task',
            images: [],
            ...(options.approvalChoice ? { approval: 'ask' as const } : {}),
            ...(plan ? { mode: 'plan' as const } : {}),
          },
          'local-fixture',
        )
        return { run, targetRun }
      },
      release: () => releaseTarget.resolve(),
      async close() {
        releaseTarget.resolve()
        releaseReply.resolve()
        unsubscribe()
        await kernel.close()
        await removeOwnedTestDirectory(root, prefix)
      },
    }
  } catch (error) {
    await kernel.close()
    await removeOwnedTestDirectory(root, prefix)
    throw error
  }
}

test.each([false, true])(
  'an %s active target receives the original task, Goal, plan and summary context',
  async (active) => {
    const f = await fixture({ active, deferReply: true })
    try {
      await f.kernel.plugins.get<GoalService>('goal').create(f.source.id, 'Original source objective', 100_000)
      const plans = f.kernel.plugins.get<PlanService>('plan')
      const original = await plans.update(
        f.source.id,
        [{ step: 'Original source step', status: 'in_progress' }],
        'Original plan',
      )
      await f.kernel.storage.call('compact', f.source.id, 0, 'Necessary source summary', 'fixture')
      const { run } = await f.start()
      await f.ready
      await plans.update(f.source.id, [{ step: 'A later source plan', status: 'pending' }], 'Changed after delegation')
      f.releaseReply()
      f.release()
      await f.kernel.waitForIdle()
      const context = f.envelopes[0]?.context
      expect(context).toMatchObject({
        sessionId: f.source.id,
        runId: run.id,
        task: { text: 'source-task', truncated: false },
        goal: { objective: { text: 'Original source objective' } },
        plan: { revision: original.revision, steps: [{ index: 0, text: 'Original source step' }] },
        summary: { text: 'Necessary source summary', throughSeq: 0, truncated: false },
      })
      expect((await f.kernel.storage.call('run', run.id)).status).toBe('completed')
      if (!active) {
        const dedicated = f.received.find((input) => input.run.input.delegatedDecision)
        expect(dedicated ? (JSON.parse(dedicated.run.input.text) as unknown) : null).toMatchObject({ context })
      }
    } finally {
      await f.close()
    }
  },
)

test('unavailable source context preserves the original human question without starting a target', async () => {
  const f = await fixture()
  const original = f.kernel.storage.call.bind(f.kernel.storage)
  try {
    f.kernel.storage.call = async <Name extends keyof StorageMethods>(
      method: Name,
      ...args: Parameters<StorageMethods[Name]>
    ): Promise<ReturnType<StorageMethods[Name]>> => {
      if (method === 'contextSummaryExcerpt') throw new HbarError('STORAGE_ERROR', 'Source summary is unavailable')
      return original(method, ...args)
    }
    const { run } = await f.start()
    const requestId = await until(async () => f.human[0])
    expect(f.received.filter((input) => input.session.id === f.target.id)).toEqual([])
    await f.kernel.resolveUserInput(requestId, { scope: { answers: ['App'] } })
    await f.kernel.waitForIdle()
    expect((await f.kernel.storage.call('run', run.id)).status).toBe('completed')
  } finally {
    f.kernel.storage.call = original
    await f.close()
  }
})

test.each(['allowed', 'denied', 'implement', 'continue'] as const)(
  'a delegated %s choice resumes the original tool or Plan decision',
  async (choice) => {
    const f = await fixture({ approvalChoice: choice })
    try {
      const { run } = await f.start()
      await until(async () => {
        const current = await f.kernel.storage.call('run', run.id)
        if (current.status === 'failed') throw new Error(current.error ?? 'The original source Run failed')
        return current.status === 'completed' ? true : undefined
      })
      await f.kernel.waitForIdle()
      expect((await originalApproval(f.kernel, f.source.id))?.status).toBe(
        ['allowed', 'implement'].includes(choice) ? 'allowed' : 'denied',
      )
      expect(f.approvalResults).toEqual([choice === 'denied' || choice === 'continue'])
      expect(f.modes).toEqual([choice === 'continue' ? 'plan' : 'default'])
      expect(await Bun.file(f.writePath).exists()).toBe(choice === 'allowed')
      const actual = f.received.find((input) => input.run.input.delegatedDecision)
      if (!actual) throw new Error('Missing the actual dedicated decision Run')
      const resolved = (await f.kernel.storage.call('events', f.source.id, 0, 256)).filter((event) =>
        ['approval.resolved', 'plan_exit.resolved'].includes(event.type),
      )
      expect(resolved).toHaveLength(1)
      expect(resolved[0]?.data).toMatchObject({
        automatic: { source: 'delegate', delegation: { targetSessionId: f.target.id, targetRunId: actual.run.id } },
      })
      expect((await f.kernel.snapshot(f.source.id)).userInputs).toEqual([])
    } finally {
      await f.close()
    }
  },
)

test.each(['allowed', 'implement'] as const)(
  'a lost %s approval acknowledgement reads its canonical result without replay',
  async (choice) => {
    const f = await fixture({ approvalChoice: choice })
    const original = f.kernel.storage.call.bind(f.kernel.storage)
    let writes = 0
    try {
      f.kernel.storage.call = async <Name extends keyof StorageMethods>(
        method: Name,
        ...args: Parameters<StorageMethods[Name]>
      ): Promise<ReturnType<StorageMethods[Name]>> => {
        const result = await original(method, ...args)
        if (method === (choice === 'allowed' ? 'resolveApproval' : 'resolvePlanExit')) {
          writes++
          if (writes === 1)
            throw new HbarError('STORAGE_RESULT_UNKNOWN', 'Injected source approval acknowledgement loss')
        }
        return result
      }
      const { run } = await f.start()
      await until(async () => {
        const current = await f.kernel.storage.call('run', run.id)
        if (current.status === 'failed') throw new Error(current.error ?? 'The original source Run failed')
        return current.status === 'completed' ? true : undefined
      })
      await f.kernel.waitForIdle()
      expect(writes).toBe(1)
      expect(f.approvalResults).toEqual([false])
      expect(f.modes).toEqual(['default'])
      expect(await Bun.file(f.writePath).exists()).toBe(choice === 'allowed')
      const events = await f.kernel.storage.call('events', f.source.id, 0, 256)
      expect(events.filter((event) => ['approval.resolved', 'plan_exit.resolved'].includes(event.type))).toHaveLength(1)
    } finally {
      f.kernel.storage.call = original
      await f.close()
    }
  },
)

test('a human-only tool keeps the original approval and does not create a delegated grant', async () => {
  const f = await fixture({ approvalChoice: 'allowed', humanOnly: true })
  try {
    const { run } = await f.start()
    const approval = await until(() => originalApproval(f.kernel, f.source.id))
    expect(approval.status).toBe('pending')
    expect(
      await f.kernel.storage.call('delegatedInputRead', { sessionId: f.source.id, requestId: approval.id }),
    ).toBeNull()
    expect(f.received.filter((input) => input.session.id === f.target.id)).toHaveLength(0)
    await f.kernel.resolveApproval(approval.id, 'denied')
    await until(async () => ((await f.kernel.storage.call('run', run.id)).status === 'completed' ? true : undefined))
    expect(f.approvalResults).toEqual([true])
  } finally {
    await f.close()
  }
})

test('manual takeover during delegated approval preserves an active target original task', async () => {
  const f = await fixture({ approvalChoice: 'allowed', active: true, deferReply: true })
  try {
    const { run, targetRun } = await f.start()
    if (!targetRun) throw new Error('Missing original target task')
    await f.ready
    const approval = await until(() => originalApproval(f.kernel, f.source.id))
    await f.kernel.resolveApproval(approval.id, 'denied')
    await until(async () => ((await f.kernel.storage.call('run', run.id)).status === 'completed' ? true : undefined))
    expect(f.approvalResults).toEqual([true])
    expect(await Bun.file(f.writePath).exists()).toBe(false)
    expect((await f.kernel.storage.call('run', targetRun.id)).status).toBe('running')
    f.releaseReply()
    f.release()
    await until(async () =>
      (await f.kernel.storage.call('run', targetRun.id)).status === 'completed' ? true : undefined,
    )
    const events = await f.kernel.storage.call('events', f.source.id, 0, 256)
    expect(events.find((event) => event.type === 'approval.resolved')?.data).not.toHaveProperty('automatic')
  } finally {
    await f.close()
  }
})

test('an active target approves an exact source write and then continues its original task', async () => {
  const f = await fixture({ approvalChoice: 'allowed', active: true })
  try {
    const { run, targetRun } = await f.start()
    if (!targetRun) throw new Error('Missing target original task')
    await until(async () => ((await f.kernel.storage.call('run', run.id)).status === 'completed' ? true : undefined))
    expect(await Bun.file(f.writePath).text()).toBe('The exact delegated change')
    expect((await f.kernel.storage.call('run', targetRun.id)).status).toBe('running')
    expect((await originalApproval(f.kernel, f.source.id))?.status).toBe('allowed')
    expect(f.received.filter((input) => input.run.input.delegatedDecision)).toHaveLength(0)
    f.release()
    await until(async () =>
      (await f.kernel.storage.call('run', targetRun.id)).status === 'completed' ? true : undefined,
    )
  } finally {
    await f.close()
  }
})

test('a declined approval delegation keeps the original approval for a human without fallback', async () => {
  const f = await fixture({ approvalChoice: 'allowed', reply: 'human' })
  try {
    const { run } = await f.start()
    const approval = await until(() => originalApproval(f.kernel, f.source.id))
    await until(async () =>
      (await f.kernel.storage.call('events', f.source.id, 0, 256)).some(
        (event) => event.type === 'approval.automationWaiting',
      )
        ? true
        : undefined,
    )
    expect((await f.kernel.storage.call('approval', approval.id)).status).toBe('pending')
    expect((await f.kernel.storage.call('run', run.id)).status).toBe('waiting_approval')
    expect(await Bun.file(f.writePath).exists()).toBe(false)
    await f.kernel.resolveApproval(approval.id, 'denied')
    await until(async () => ((await f.kernel.storage.call('run', run.id)).status === 'completed' ? true : undefined))
    const events = await f.kernel.storage.call('events', f.source.id, 0, 256)
    expect(events.find((event) => event.type === 'approval.resolved')?.data).not.toHaveProperty('automatic')
  } finally {
    await f.close()
  }
})

test('an unknown approval without a durable result does not replay or execute the source write', async () => {
  const f = await fixture({ approvalChoice: 'allowed' })
  const original = f.kernel.storage.call.bind(f.kernel.storage)
  let attempts = 0
  try {
    f.kernel.storage.call = async <Name extends keyof StorageMethods>(
      method: Name,
      ...args: Parameters<StorageMethods[Name]>
    ): Promise<ReturnType<StorageMethods[Name]>> => {
      if (method === 'resolveApproval') {
        attempts++
        throw new HbarError('STORAGE_RESULT_UNKNOWN', 'No committed source result')
      }
      return original(method, ...args)
    }
    const { run } = await f.start()
    await until(async () => ((await f.kernel.storage.call('run', run.id)).status === 'completed' ? true : undefined))
    expect(attempts).toBe(1)
    expect(f.approvalResults).toEqual([true])
    expect(await Bun.file(f.writePath).exists()).toBe(false)
    const approval = await originalApproval(f.kernel, f.source.id)
    if (!approval) throw new Error('Missing original approval')
    expect(await f.kernel.storage.call('approvalResolution', approval.id)).toBeNull()
  } finally {
    f.kernel.storage.call = original
    await f.close()
  }
})

test('a concurrent human Plan decision wins after the target reply but before source settlement', async () => {
  const f = await fixture({ approvalChoice: 'implement' })
  const original = f.kernel.storage.call.bind(f.kernel.storage)
  let injected = false
  try {
    f.kernel.storage.call = async <Name extends keyof StorageMethods>(
      method: Name,
      ...args: Parameters<StorageMethods[Name]>
    ): Promise<ReturnType<StorageMethods[Name]>> => {
      if (method === 'resolvePlanExit' && !injected) {
        injected = true
        const approval = await originalApproval(f.kernel, f.source.id)
        if (!approval) throw new Error('Missing original Plan request')
        await f.kernel.resolvePlanExit({
          sessionId: f.source.id,
          approvalId: approval.id,
          runId: approval.runId,
          callId: approval.callId,
          decision: 'continue',
          actorId: 'manual-owner',
        })
      }
      return original(method, ...args)
    }
    const { run } = await f.start()
    await until(async () => ((await f.kernel.storage.call('run', run.id)).status === 'completed' ? true : undefined))
    expect(injected).toBe(true)
    expect(f.approvalResults).toEqual([true])
    expect(f.modes).toEqual(['plan'])
    const approval = await originalApproval(f.kernel, f.source.id)
    expect(approval).toMatchObject({ status: 'denied', decidedBy: 'manual-owner' })
    const events = await f.kernel.storage.call('events', f.source.id, 0, 256)
    expect(events.filter((event) => event.type === 'plan_exit.resolved')).toHaveLength(1)
    expect(events.find((event) => event.type === 'plan_exit.resolved')?.data).not.toHaveProperty('automatic')
    expect(events.filter((event) => event.type === 'approval.automationWaiting')).toHaveLength(0)
  } finally {
    f.kernel.storage.call = original
    await f.close()
  }
})

test('an idle target answers through its actual dedicated Run while source idle timing remains suspended', async () => {
  const f = await fixture({ delayMs: 1_100, idleMs: 700 })
  try {
    const { run } = await f.start()
    await until(async () => {
      const current = await f.kernel.storage.call('run', run.id)
      if (f.human.length || ['failed', 'cancelled', 'interrupted'].includes(current.status))
        throw new Error(
          `Unexpected source wait: ${JSON.stringify((await f.kernel.snapshot(f.target.id)).runs.map((item) => ({ status: item.status, error: item.error })))}`,
        )
      return current.status === 'completed' ? true : undefined
    })
    await f.kernel.waitForIdle()
    expect((await f.kernel.storage.call('run', run.id)).status).toBe('completed')
    expect(f.sourceAnswers).toEqual([{ answers: { scope: { answers: ['API'] } } }])
    expect(f.human).toEqual([])
    const target = f.received.find((input) => input.run.input.delegatedDecision)
    expect(target?.tools.map((tool) => tool.name).sort()).toEqual(['hbar_decision_reply', 'hbar_decisions_inbox'])
    const events = await f.kernel.storage.call('events', f.source.id, 0, 256)
    const audit = events.find((event) => event.type === 'user_input.autoDecided')
    expect(audit?.data).toMatchObject({
      source: 'delegate',
      delegation: { targetSessionId: f.target.id, targetRunId: target?.run.id },
    })
    expect(f.targetReceipts).toHaveLength(1)
    expect(f.rejectedTools).toEqual(['DELEGATION_TOOL_FORBIDDEN'])
  } finally {
    await f.close()
  }
})

test('a live target answers at a steering boundary and its original Run continues after source completion', async () => {
  const f = await fixture({ active: true })
  try {
    const { run, targetRun } = await f.start()
    await until(async () => ((await f.kernel.storage.call('run', run.id)).status === 'completed' ? true : undefined))
    expect((await f.kernel.storage.call('run', targetRun!.id)).status).toBe('running')
    expect((await f.kernel.storage.call('run', targetRun!.id)).input.text).toBe('target-task')
    expect(f.received.filter((input) => input.session.id === f.target.id)).toHaveLength(1)
    expect(f.sourceAnswers).toEqual([{ answers: { scope: { answers: ['API'] } } }])
    expect(f.human).toEqual([])
    f.release()
    await f.kernel.waitForIdle()
    expect((await f.kernel.storage.call('run', targetRun!.id)).status).toBe('completed')
  } finally {
    await f.close()
  }
})

test('a dedicated answer preserves the target Goal ledger and accounts model usage to its actual Session budget', async () => {
  const f = await fixture()
  try {
    const goals = f.kernel.plugins.get<GoalService>('goal')
    const budgets = f.kernel.plugins.get<BudgetService>('budget')
    const before = await goals.create(f.target.id, 'Preserve the target goal', 10_000)
    await budgets.set(f.target.id, 20_000)
    const { run } = await f.start()
    await until(async () => ((await f.kernel.storage.call('run', run.id)).status === 'completed' ? true : undefined))
    await f.kernel.waitForIdle()
    const after = await goals.get(f.target.id)
    expect(after.goal?.goalId).toBe(before.goal?.goalId)
    expect(after.goal?.status).toBe(before.goal?.status)
    expect(after.goal?.executionBudget?.goalRemainingTokens).toBe(before.goal?.executionBudget?.goalRemainingTokens)
    expect((await budgets.get(f.target.id))?.usedTokens).toBeGreaterThan(0)
    const events = await f.kernel.storage.call('events', f.target.id, 0, 256)
    expect(events.some((event) => event.type === 'goal.run_bound')).toBe(false)
    expect(f.human).toEqual([])
  } finally {
    await f.close()
  }
})

test('a lost target reply acknowledgement is read from its original receipt without replay or duplicate source answers', async () => {
  const f = await fixture()
  const original = f.kernel.storage.call.bind(f.kernel.storage)
  let injected = false
  try {
    f.kernel.storage.call = async <Name extends keyof StorageMethods>(
      method: Name,
      ...args: Parameters<StorageMethods[Name]>
    ): Promise<ReturnType<StorageMethods[Name]>> => {
      const result = await original(method, ...args)
      if (method === 'delegatedInputComplete' && !injected) {
        injected = true
        throw new HbarError('STORAGE_RESULT_UNKNOWN', 'Injected delegated reply acknowledgement loss')
      }
      return result
    }
    const { run } = await f.start()
    await until(async () => ((await f.kernel.storage.call('run', run.id)).status === 'completed' ? true : undefined))
    await f.kernel.waitForIdle()
    expect(injected).toBe(true)
    expect(f.sourceAnswers).toEqual([{ answers: { scope: { answers: ['API'] } } }])
    expect(f.targetReceipts).toHaveLength(1)
    const events = await f.kernel.storage.call('events', f.source.id, 0, 256)
    expect(events.filter((event) => event.type === 'user_input.autoDecided')).toHaveLength(1)
    expect(
      events.filter(
        (event) =>
          /^decision\.delegation\.[a-f0-9]{64}$/.test(event.type) &&
          typeof event.data === 'object' &&
          event.data !== null &&
          'status' in event.data &&
          event.data.status === 'answered',
      ),
    ).toHaveLength(1)
  } finally {
    f.kernel.storage.call = original
    await f.close()
  }
})

test('cancelling the source withdraws only its decision while the live target original task completes', async () => {
  const f = await fixture({ active: true, deferReply: true })
  try {
    const { run, targetRun } = await f.start()
    await f.ready
    await f.kernel.cancel(run.id)
    await until(async () => ((await f.kernel.storage.call('run', run.id)).status === 'cancelled' ? true : undefined))
    expect((await f.kernel.storage.call('run', targetRun!.id)).status).toBe('running')
    f.releaseReply()
    f.release()
    await f.kernel.waitForIdle()
    expect((await f.kernel.storage.call('run', targetRun!.id)).status).toBe('completed')
    expect((await f.kernel.storage.call('run', targetRun!.id)).input.text).toBe('target-task')
    expect(f.sourceAnswers).toEqual([])
    expect(
      (await f.kernel.storage.call('events', f.source.id, 0, 256)).some(
        (event) => event.type === 'user_input.autoDecided',
      ),
    ).toBe(false)
  } finally {
    await f.close()
  }
})

test('a declined delegation and secret questions retain the human question without automatic recommendation fallback', async () => {
  for (const secret of [false, true]) {
    const f = await fixture(secret ? { question: { ...question, isSecret: true } } : { reply: 'human' })
    try {
      const { run } = await f.start()
      const id = await until(async () => f.human[0])
      expect(f.sourceAnswers).toEqual([])
      if (secret) expect(f.received.filter((input) => input.session.id === f.target.id)).toEqual([])
      await f.kernel.resolveUserInput(id, { scope: { answers: ['App'] } })
      await f.kernel.waitForIdle()
      expect((await f.kernel.storage.call('run', run.id)).status).toBe('completed')
      expect(f.sourceAnswers).toEqual([{ answers: { scope: { answers: ['App'] } } }])
      expect(
        (await f.kernel.storage.call('events', f.source.id, 0, 256)).some(
          (event) => event.type === 'user_input.autoDecided',
        ),
      ).toBe(false)
    } finally {
      await f.close()
    }
  }
})

test('manual takeover, policy replacement and an original short deadline invalidate late runtime replies', async () => {
  for (const boundary of ['manual', 'policy', 'timeout'] as const) {
    const f = await fixture({ deferReply: true, shortDeadline: boundary === 'timeout' })
    try {
      const { run } = await f.start()
      await f.ready
      if (boundary === 'policy') {
        const settings = new SettingsService(f.kernel.storage)
        const scope = { kind: 'session' as const, targetId: f.source.id }
        const before = await settings.get(scope)
        await settings.apply({
          schemaVersion: before.schemaVersion,
          scope,
          baselineRevisions: before.revisions,
          actorId: 'decision-owner',
          idempotencyKey: 'replace-policy',
          changes: [{ op: 'set', path: [{ kind: 'field', name: AUTONOMY_DECISION_MODE_SETTING }], value: 'wait_user' }],
        })
      }
      const pending =
        boundary === 'manual'
          ? (await f.kernel.snapshot(f.source.id)).userInputs[0]?.requestId
          : await until(async () => f.human[0])
      if (!pending) throw new Error('Missing original manual question')
      await f.kernel.resolveUserInput(pending, { scope: { answers: ['App'] } })
      await until(async () => ((await f.kernel.storage.call('run', run.id)).status === 'completed' ? true : undefined))
      f.releaseReply()
      await f.kernel.waitForIdle()
      expect(f.sourceAnswers).toEqual([{ answers: { scope: { answers: ['App'] } } }])
      expect(
        (await f.kernel.storage.call('events', f.source.id, 0, 256)).some(
          (event) => event.type === 'user_input.autoDecided',
        ),
      ).toBe(false)
      const grant = await f.kernel.storage.call('delegatedInputRead', { sessionId: f.source.id, requestId: pending })
      expect(grant?.status).toBe(boundary === 'manual' ? 'closed' : 'human')
      expect(grant?.reason).toBe(
        boundary === 'manual' ? 'source_resolved' : boundary === 'policy' ? 'policy_changed' : 'timeout',
      )
    } finally {
      await f.close()
    }
  }
}, 20_000)

test('a dedicated model Run stops at its original grant deadline even while it keeps producing progress', async () => {
  const f = await fixture({ shortDeadline: true, delayMs: 1_500 })
  try {
    const { run } = await f.start()
    const id = await until(async () => f.human[0])
    const grant = await f.kernel.storage.call('delegatedInputRead', { sessionId: f.source.id, requestId: id })
    expect(grant?.policy.policy).toMatchObject({ timeoutMs: 1_000 })
    expect(grant ? grant.expiresAt - grant.createdAt : undefined).toBe(1_000)
    const target = await until(async () => {
      const current = (await f.kernel.snapshot(f.target.id)).runs[0]
      return current && ['failed', 'cancelled'].includes(current.status) ? current : undefined
    })
    expect(target.failure?.code).toBe('DELEGATION_EXPIRED')
    expect(f.received.filter((input) => input.session.id === f.target.id)).toHaveLength(1)
    expect(f.targetReceipts).toEqual([])
    await f.kernel.resolveUserInput(id, { scope: { answers: ['App'] } })
    await f.kernel.waitForIdle()
    expect((await f.kernel.storage.call('run', run.id)).status).toBe('completed')
    expect(f.sourceAnswers).toEqual([{ answers: { scope: { answers: ['App'] } } }])
  } finally {
    await f.close()
  }
})
