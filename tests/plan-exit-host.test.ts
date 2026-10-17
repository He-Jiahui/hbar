import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createInteractionCommandClient } from '@hbar/client'
import { emptyUsage } from '@hbar/contracts'
import type { Approval, RunMode } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { HarnessDriver, ModeService } from '@hbar/plugin-sdk'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function waitForApproval(kernel: Kernel, sessionId: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const approval = (await kernel.snapshot(sessionId)).approvals.find((item) => item.tool === 'exit_plan_mode')
    if (approval) return approval
    await Bun.sleep(5)
  }
  throw new Error('Plan exit approval did not appear')
}

async function fixture(approval: 'allow' | 'ask' | 'deny' = 'ask') {
  const root = await mkdtemp(join(tmpdir(), 'hbar-plan-exit-'))
  const observed: RunMode[] = []
  const results: { exit?: boolean; write?: boolean } = {}
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Plan exit fixture',
      description: 'Same-Run transition probe',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      required: true,
      provides: { driver: '1.0.0' },
      permissions: [],
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        async run(input) {
          observed.push((await input.beforeRequest(input.request, crypto.randomUUID())).context?.mode ?? 'default')
          const exitArgs = { plan: '# Implement carefully\n\n- Verify the change.' }
          const exitCallId = crypto.randomUUID()
          await input.commit('assistant', [
            { type: 'tool_call', name: 'exit_plan_mode', args: exitArgs, callId: exitCallId },
          ])
          results.exit = (await input.execute('exit_plan_mode', exitArgs, exitCallId)).isError ?? false
          observed.push((await input.beforeRequest(input.request, crypto.randomUUID())).context?.mode ?? 'default')
          const writeArgs = { path: 'approved.txt', text: 'same run' }
          const writeCallId = crypto.randomUUID()
          await input.commit('assistant', [
            { type: 'tool_call', name: 'write_file', args: writeArgs, callId: writeCallId },
          ])
          results.write = (await input.execute('write_file', writeArgs, writeCallId)).isError ?? false
          await input.commit('assistant', [{ type: 'text', text: 'The original run continued.' }])
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
    profile: { replacements: { 'driver.pi': driver } },
  })
  await kernel.setPermissionMode(approval)
  const session = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id)
  await kernel.plugins.get<ModeService>('mode').set(session.id, 'plan')
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  await client.pair(host.pairing.code, 'Plan exit test')
  cleanups.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  const run = await kernel.submit(
    session.id,
    'plan-exit',
    { text: 'Prepare a plan', images: [], approval },
    'local-fixture',
  )
  return { root, kernel, client, session, run, observed, results }
}

test('the common decision directory keeps Plan-exit identity and continues the original Run through the original mode transition', async () => {
  const f = await fixture('allow')
  const approval = await waitForApproval(f.kernel, f.session.id)
  const commands = createInteractionCommandClient(f.client)
  const target = { sessionId: f.session.id, kind: 'plan_exit' as const, id: approval.id }
  expect(
    (await commands.execute('decision.list', { sessionId: f.session.id, kind: 'plan_exit' })).items.map(
      (item) => item.id,
    ),
  ).toContain(approval.id)
  expect(await commands.execute('decision.get', target)).toMatchObject({
    runId: f.run.id,
    callId: approval.callId,
    revision: 1,
    status: 'pending',
    tool: 'exit_plan_mode',
  })
  expect(
    await commands.execute(
      'decision.resolve',
      {
        sessionId: target.sessionId,
        id: target.id,
        expectedRevision: 1,
        resolution: { kind: 'plan_exit', decision: 'implement' },
      },
      { idempotencyKey: 'directory-plan-exit' },
    ),
  ).toMatchObject({ accepted: true, decision: { status: 'allowed', revision: 2 } })
  await f.kernel.waitForIdle()
  expect(f.observed).toEqual(['plan', 'default'])
  expect(f.results).toEqual({ exit: false, write: false })
  expect(await Bun.file(join(f.root, 'approved.txt')).text()).toBe('same run')
})

test.each(['allow', 'ask', 'deny'] as const)(
  'Plan exit always waits for the exact user decision, then writes in the same Run: %s',
  async (approvalMode) => {
    const f = await fixture(approvalMode)
    const approval = await waitForApproval(f.kernel, f.session.id)
    expect(approval).toMatchObject({ runId: f.run.id, tool: 'exit_plan_mode', status: 'pending' })
    expect(f.observed).toEqual(['plan'])
    const commands = createInteractionCommandClient(f.client)
    await Bun.sleep(0)
    const ordinaryResult = await commands
      .execute('approval.resolve', {
        sessionId: f.session.id,
        approvalId: approval.id,
        decision: 'allowed',
      })
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(ordinaryResult).toMatchObject({ code: 'PLAN_EXIT_DECISION_REQUIRED' })
    expect(
      await commands
        .execute('planExit.resolve', {
          sessionId: f.session.id,
          approvalId: approval.id,
          runId: f.run.id,
          callId: 'wrong',
          decision: 'implement',
        })
        .then(
          () => null,
          (error: unknown) => error,
        ),
    ).toMatchObject({ code: 'PLAN_EXIT_TARGET' })
    expect(
      await commands.execute('planExit.resolve', {
        sessionId: f.session.id,
        approvalId: approval.id,
        runId: f.run.id,
        callId: approval.callId,
        decision: 'implement',
      }),
    ).toMatchObject({ status: 'allowed', runId: f.run.id, callId: approval.callId })
    if (approvalMode === 'ask') {
      let writeApproval: Approval | undefined
      for (let attempt = 0; attempt < 100; attempt++) {
        writeApproval = (await f.kernel.snapshot(f.session.id)).approvals.find((item) => item.tool === 'write_file')
        if (writeApproval) break
        await Bun.sleep(5)
      }
      expect(writeApproval).toBeDefined()
      if (!writeApproval) throw new Error('Write approval did not appear')
      await commands.execute('approval.resolve', {
        sessionId: f.session.id,
        approvalId: writeApproval.id,
        decision: 'allowed',
      })
    }
    await f.kernel.waitForIdle()
    expect(f.observed).toEqual(['plan', 'default'])
    expect(f.results).toEqual({ exit: false, write: approvalMode === 'deny' })
    if (approvalMode === 'deny') expect(await Bun.file(join(f.root, 'approved.txt')).exists()).toBe(false)
    else expect(await Bun.file(join(f.root, 'approved.txt')).text()).toBe('same run')
    expect((await f.kernel.storage.call('run', f.run.id)).input.mode).toBe('plan')
    expect((await f.kernel.plugins.get<ModeService>('mode').get(f.session.id)).mode).toBe('default')
    expect(
      (await f.kernel.storage.call('events', f.session.id, 0)).filter((event) => event.type === 'mode.changed'),
    ).toHaveLength(1)
    expect(
      (await f.kernel.storage.call('events', f.session.id, 0)).filter((event) => event.type === 'plan_exit.resolved'),
    ).toHaveLength(1)
    expect(
      await commands.execute('planExit.resolve', {
        sessionId: f.session.id,
        approvalId: approval.id,
        runId: f.run.id,
        callId: approval.callId,
        decision: 'implement',
      }),
    ).toMatchObject({ status: 'allowed', runId: f.run.id })
    expect(
      await commands.execute('planExit.get', {
        sessionId: f.session.id,
        approvalId: approval.id,
        runId: f.run.id,
        callId: approval.callId,
      }),
    ).toMatchObject({ status: 'allowed' })
    expect(
      (await f.kernel.storage.call('events', f.session.id, 0)).filter((event) => event.type === 'plan_exit.resolved'),
    ).toHaveLength(1)
  },
)

test('continuing to plan persists feedback, returns it to the same Run and keeps writes denied', async () => {
  const f = await fixture('allow')
  const approval = await waitForApproval(f.kernel, f.session.id)
  const commands = createInteractionCommandClient(f.client)
  expect(
    await commands.execute('planExit.resolve', {
      sessionId: f.session.id,
      approvalId: approval.id,
      runId: f.run.id,
      callId: approval.callId,
      decision: 'continue',
      feedback: 'Check the migration risk.',
    }),
  ).toMatchObject({ status: 'denied' })
  await f.kernel.waitForIdle()
  expect(f.observed).toEqual(['plan', 'plan'])
  expect(f.results).toEqual({ exit: true, write: true })
  expect(await Bun.file(join(f.root, 'approved.txt')).exists()).toBe(false)
  expect((await f.kernel.plugins.get<ModeService>('mode').get(f.session.id)).mode).toBe('plan')
  expect(await f.kernel.storage.call('approval', approval.id)).toMatchObject({
    feedback: 'Check the migration risk.',
    status: 'denied',
  })
  const results = (await f.kernel.snapshot(f.session.id)).messages.flatMap((message) => message.content)
  expect(
    results.some(
      (block) =>
        block.type === 'tool_result' &&
        block.name === 'exit_plan_mode' &&
        block.text.includes('Check the migration risk.'),
    ),
  ).toBe(true)
  expect(
    results.some(
      (block) =>
        block.type === 'tool_result' && block.name === 'write_file' && block.text.includes('Plan mode cannot execute'),
    ),
  ).toBe(true)
})

test('a cancelled original Run cannot accept a late Plan exit decision, and can be checked read-only', async () => {
  const f = await fixture('allow')
  const approval = await waitForApproval(f.kernel, f.session.id)
  await f.kernel.cancel(f.run.id)
  await f.kernel.waitForIdle()
  const commands = createInteractionCommandClient(f.client)
  const target = { sessionId: f.session.id, approvalId: approval.id, runId: f.run.id, callId: approval.callId }
  expect(
    await commands.execute('planExit.resolve', { ...target, decision: 'implement' }).then(
      () => null,
      (error: unknown) => error,
    ),
  ).toMatchObject({ code: 'PLAN_EXIT_UNAVAILABLE' })
  expect(await commands.execute('planExit.get', target)).toMatchObject({ status: 'cancelled' })
  expect((await f.kernel.plugins.get<ModeService>('mode').get(f.session.id)).mode).toBe('plan')
  expect(await Bun.file(join(f.root, 'approved.txt')).exists()).toBe(false)
})
