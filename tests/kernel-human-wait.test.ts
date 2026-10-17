import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { emptyUsage, HbarError, type UserInputRequest } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide, type BudgetService, type DriverInput, type HarnessDriver } from '@hbar/plugin-sdk'
import { removeOwnedTestDirectory } from './owned-temp-directory'

function deferred<Value>() {
  let resolve!: (value: Value) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<Value>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  void promise.catch(() => {})
  return { promise, resolve, reject }
}
async function fixture(script: (input: DriverInput) => Promise<void>, failed: (error: unknown) => void) {
  const prefix = 'hbar-kernel-human-wait-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Human wait fixture',
      description: 'Exercise confirmed interaction waits',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      permissions: [],
      provides: { driver: '1.0.0' },
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        run: async (input) => {
          try {
            await script(input)
          } catch (error) {
            failed(error)
            throw error
          }
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
    runIdleTimeoutMs: 600,
    profile: { replacements: { 'driver.pi': driver } },
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Missing human wait workspace')
  const session = await kernel.createSession(workspace.id)
  await kernel.changePlugin('budget.codex', true, { autoContinue: false })
  await kernel.plugins.get<BudgetService>('budget').set(session.id, 100)
  return {
    kernel,
    session,
    submit: (mode: 'default' | 'plan' = 'plan') =>
      kernel.submit(
        session.id,
        crypto.randomUUID(),
        { text: 'Complete the task after the original human decision', images: [], approval: 'ask', mode },
        'local-fixture',
      ),
    async close() {
      await kernel.close()
      await removeOwnedTestDirectory(root, prefix)
    },
  }
}

for (const action of ['answer', 'cancel', 'nonblocking-timeout'] as const)
  test(`a durable question survives both local deadlines and permits ${action}`, async () => {
    const requested = deferred<UserInputRequest>()
    const f = await fixture(async (input) => {
      await input.beforeRequest(input.request, 'human-step')
      const result = await input.execute('human_wait_probe', {}, 'human-call')
      if (result.isError) {
        const error = new HbarError('HUMAN_WAIT_FAILED', result.text)
        requested.reject(error)
        throw error
      }
      await input.commit('assistant', [{ type: 'text', text: 'Completed after the human answer.' }])
      await input.stepEnded('human-step')
    }, requested.reject)
    const unsubscribe = f.kernel.subscribe((event) => {
      if (event.method === 'user_input.requested') requested.resolve(event.params)
    })
    try {
      f.kernel.tools.register({
        name: 'human_wait_probe',
        description: 'Wait for a human answer',
        inputSchema: z.strictObject({}),
        effect: 'read',
        timeoutMs: 400,
        execute: async (_args, context) => {
          const response = await f.kernel.requestUserInput(
            {
              requestId: crypto.randomUUID(),
              sessionId: context.session.id,
              runId: context.run.id,
              callId: context.callId,
              isBlocking: action !== 'nonblocking-timeout',
              questions: [
                {
                  id: 'scope',
                  header: 'Scope',
                  question: 'Choose a scope.',
                  purpose: 'decision',
                  isOther: false,
                  isSecret: false,
                  options: [
                    { label: 'App', description: 'Implement the App.' },
                    { label: 'API', description: 'Implement the API.' },
                  ],
                },
              ],
            },
            context.signal,
          )
          return { text: JSON.stringify(response) }
        },
      })
      const run = await f.submit()
      const request = await requested.promise
      await Bun.sleep(850)
      if (action === 'nonblocking-timeout') {
        await f.kernel.waitForIdle()
        const recorded = await f.kernel.storage.call('run', run.id)
        expect(recorded.status).toBe('failed')
        expect(recorded.failure?.code).toBe('HUMAN_WAIT_FAILED')
        const state = await f.kernel.storage.call('userInputRead', {
          sessionId: f.session.id,
          requestId: request.requestId,
        })
        expect(state?.settlement).toMatchObject({ kind: 'cancelled', reason: 'TOOL_TIMEOUT' })
        return
      }
      expect((await f.kernel.storage.call('run', run.id)).status).toBe('running')
      expect((await f.kernel.snapshot(f.session.id)).userInputs).toHaveLength(1)
      if (action === 'answer')
        expect(await f.kernel.resolveUserInput(request.requestId, { scope: { answers: ['API'] } })).toBe(true)
      else await f.kernel.cancel(run.id)
      await f.kernel.waitForIdle()
      const recorded = await f.kernel.storage.call('run', run.id)
      expect(recorded.status).toBe(action === 'answer' ? 'completed' : 'cancelled')
      expect((await f.kernel.snapshot(f.session.id)).userInputs).toHaveLength(0)
      const state = await f.kernel.storage.call('userInputRead', {
        sessionId: f.session.id,
        requestId: request.requestId,
      })
      expect(state?.settlement?.kind).toBe(action === 'answer' ? 'answered' : 'cancelled')
      if (action === 'cancel') expect(recorded.failure?.code).toBe('USER_CANCELLED')
    } finally {
      unsubscribe()
      await f.close()
    }
  }, 15_000)

for (const kind of ['approval', 'plan-exit'] as const)
  test(`${kind} waits suspend the original Run idle deadline until an explicit human decision`, async () => {
    const requested = deferred<string>()
    let effects = 0
    const f = await fixture(async (input) => {
      await input.beforeRequest(input.request, 'approval-step')
      const result = await input.execute(
        kind === 'approval' ? 'approval_wait_probe' : 'exit_plan_mode',
        kind === 'approval' ? {} : { plan: '# Plan\n\nImplement the requested change.' },
        'approval-call',
      )
      if (result.isError) {
        const error = new HbarError('APPROVAL_WAIT_FAILED', result.text)
        requested.reject(error)
        throw error
      }
      await input.commit('assistant', [{ type: 'text', text: 'Completed after explicit approval.' }])
      await input.stepEnded('approval-step')
    }, requested.reject)
    const unsubscribe = f.kernel.subscribe((event) => {
      if (event.method === 'session.event' && event.params.type === 'approval.requested')
        requested.resolve(z.object({ id: z.string() }).parse(event.params.data).id)
    })
    try {
      if (kind === 'approval')
        f.kernel.tools.register({
          name: 'approval_wait_probe',
          description: 'An explicitly approved test operation',
          inputSchema: z.strictObject({}),
          effect: 'read',
          humanApproval: 'required',
          timeoutMs: 400,
          execute: async () => {
            effects++
            return { text: 'Approved operation completed.' }
          },
        })
      const run = await f.submit(kind === 'approval' ? 'default' : 'plan')
      const approval = await f.kernel.storage.call('approval', await requested.promise)
      await Bun.sleep(850)
      expect((await f.kernel.storage.call('run', run.id)).status).toBe('waiting_approval')
      expect((await f.kernel.storage.call('approval', approval.id)).status).toBe('pending')
      expect(effects).toBe(0)
      if (kind === 'approval') await f.kernel.resolveApproval(approval.id, 'allowed')
      else
        await f.kernel.resolvePlanExit({
          sessionId: f.session.id,
          approvalId: approval.id,
          runId: run.id,
          callId: approval.callId,
          decision: 'implement',
          actorId: 'human-fixture',
        })
      await f.kernel.waitForIdle()
      expect((await f.kernel.storage.call('run', run.id)).status).toBe('completed')
      expect((await f.kernel.storage.call('approval', approval.id)).status).toBe('allowed')
      expect(effects).toBe(kind === 'approval' ? 1 : 0)
    } finally {
      unsubscribe()
      await f.close()
    }
  }, 15_000)
