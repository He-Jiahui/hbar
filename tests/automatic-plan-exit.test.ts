import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { emptyUsage, type RunMode } from '@hbar/contracts'
import { automaticPlanExitDecisionSchema, automaticToolApprovalDecisionSchema } from '@hbar/contracts/autonomy'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide, type BudgetService, type HarnessDriver, type ModeService } from '@hbar/plugin-sdk'
import { removeOwnedTestDirectory } from './owned-temp-directory'

async function fixture(approval: 'allow' | 'deny' | 'ask', actor = true, humanOnly = false) {
  const prefix = 'hbar-automatic-plan-exit-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const modes: RunMode[] = []
  const results: boolean[] = []
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Automatic Plan fixture',
      description: 'Verify the original mode and permission',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      permissions: [],
      provides: { driver: '1.0.0' },
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        async run(input) {
          modes.push((await input.beforeRequest(input.request, crypto.randomUUID())).context?.mode ?? 'default')
          const calls: Array<readonly [string, Record<string, unknown>]> = [
            ['exit_plan_mode', { plan: '# Implement the requested change\n\n- Validate its behavior.' }],
            ['write_file', { path: 'approved.txt', text: 'original permission' }],
          ]
          if (humanOnly) calls.push(['web_search', { query: 'A public fact' }])
          for (const [name, args] of calls) {
            const callId = crypto.randomUUID()
            await input.commit('assistant', [{ type: 'tool_call', name, args, callId }])
            results.push((await input.execute(name, args, callId)).isError ?? false)
            if (name === 'exit_plan_mode')
              modes.push((await input.beforeRequest(input.request, crypto.randomUUID())).context?.mode ?? 'default')
          }
          await input.commit('assistant', [{ type: 'text', text: 'The original Run completed.' }])
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
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Missing automatic Plan workspace')
  await kernel.setPermissionMode(approval)
  const session = await kernel.storage.call(
    'createSession',
    workspace.id,
    undefined,
    undefined,
    actor ? { kind: 'command', actorId: 'fixture-owner' } : undefined,
  )
  await kernel.plugins.get<ModeService>('mode').set(session.id, 'plan')
  await kernel.automationSet(session.id, true)
  await kernel.changePlugin('budget.codex', true, { autoContinue: false })
  await kernel.plugins.get<BudgetService>('budget').set(session.id, 100)
  if (humanOnly) await kernel.changePlugin('web-search.responses', true)
  await kernel.waitForIdle()
  return {
    kernel,
    session,
    root,
    modes,
    results,
    submit: () =>
      kernel.submit(
        session.id,
        crypto.randomUUID(),
        { text: 'Prepare and implement the plan', images: [], approval, mode: 'plan' },
        'local-fixture',
      ),
    close: async () => {
      await kernel.close()
      await removeOwnedTestDirectory(root, prefix)
    },
  }
}

test.each(['allow', 'deny', 'ask'] as const)(
  'recommended Plan exit continues the same Run without changing %s permission',
  async (permission) => {
    const f = await fixture(permission)
    try {
      const run = await f.submit()
      await f.kernel.waitForIdle()
      expect((await f.kernel.storage.call('run', run.id)).status).toBe('completed')
      expect(f.modes).toEqual(['plan', 'default'])
      expect(f.results).toEqual([false, permission === 'deny'])
      expect(await Bun.file(join(f.root, 'approved.txt')).exists()).toBe(permission !== 'deny')
      const snapshot = await f.kernel.snapshot(f.session.id)
      expect(snapshot.runs).toHaveLength(1)
      expect(snapshot.approvals.filter((approval) => approval.status === 'pending')).toHaveLength(0)
      const events = await f.kernel.storage.call('events', f.session.id, 0, 2000)
      const exits = events.filter((event) => event.type === 'plan_exit.resolved')
      expect(exits).toHaveLength(1)
      const data = z
        .object({ automatic: automaticPlanExitDecisionSchema, approval: z.object({ decidedBy: z.string() }) })
        .parse(exits[0]?.data)
      expect(data.automatic.policy.policy.mode).toBe('recommended')
      expect(data.approval.decidedBy).toBe('fixture-owner')
      expect(events.some((event) => event.type === 'goal.created')).toBe(false)
    } finally {
      await f.close()
    }
  },
  30_000,
)

test('recommended ask-mode approval cannot automate a tool that explicitly requires a human', async () => {
  const f = await fixture('ask', true, true)
  try {
    const run = await f.submit()
    const deadline = Date.now() + 5_000
    let pending
    while (!pending) {
      pending = (await f.kernel.snapshot(f.session.id)).approvals.find(
        (approval) => approval.tool === 'web_search' && approval.status === 'pending',
      )
      if (!pending && Date.now() > deadline) throw new Error('A human-only tool did not retain its approval')
      if (!pending) await Bun.sleep(10)
    }
    expect(f.results).toEqual([false, false])
    const events = await f.kernel.storage.call('events', f.session.id, 0, 2000)
    const automated = events
      .filter((event) => event.type === 'approval.resolved')
      .map((event) =>
        z.object({ automatic: automaticToolApprovalDecisionSchema, decidedBy: z.string() }).parse(event.data),
      )
    expect(automated).toHaveLength(1)
    expect(automated[0]?.decidedBy).toBe('fixture-owner')
    expect(automated[0]?.automatic.admission).toEqual({ mode: 'ask', decision: 'ask', humanApproval: false })
    await f.kernel.resolveApproval(pending.id, 'denied')
    await f.kernel.waitForIdle()
    expect(f.results).toEqual([false, false, true])
    expect((await f.kernel.storage.call('run', run.id)).status).toBe('completed')
  } finally {
    await f.close()
  }
}, 30_000)

test('a legacy Run without an actor waits for human Plan exit even when recommended mode is enabled', async () => {
  const f = await fixture('deny', false)
  try {
    const run = await f.submit()
    const deadline = Date.now() + 5_000
    while (!(await f.kernel.snapshot(f.session.id)).approvals.length) {
      if (Date.now() > deadline) throw new Error('Expected human Plan exit')
      await Bun.sleep(10)
    }
    expect(f.modes).toEqual(['plan'])
    expect(f.results).toEqual([])
    await f.kernel.cancel(run.id)
    await f.kernel.waitForIdle()
    expect((await f.kernel.storage.call('run', run.id)).status).toBe('cancelled')
  } finally {
    await f.close()
  }
}, 30_000)

test.each(['policy', 'actor', 'cancel', 'manual'] as const)(
  'the durable automatic Plan exit loses to a changed %s without changing the original pending decision',
  async (change) => {
    const f = await fixture('deny')
    try {
      await f.submit()
      await f.kernel.waitForIdle()
      const events = await f.kernel.storage.call('events', f.session.id, 0, 2000)
      const { automatic } = z
        .object({ automatic: automaticPlanExitDecisionSchema })
        .parse(events.find((event) => event.type === 'plan_exit.resolved')?.data)
      await f.kernel.plugins.get<ModeService>('mode').set(f.session.id, 'plan')
      await f.kernel.waitForIdle()
      const run = await f.kernel.storage.call(
        'enqueue',
        f.session.id,
        crypto.randomUUID(),
        { text: 'Another plan', images: [], mode: 'plan', approval: 'deny' },
        'local-fixture',
      )
      await f.kernel.storage.call('claim', f.session.id)
      const approval = {
        id: crypto.randomUUID(),
        sessionId: f.session.id,
        runId: run.id,
        callId: crypto.randomUUID(),
        tool: 'exit_plan_mode',
        args: { plan: '# The original plan' },
        status: 'pending' as const,
        createdAt: Date.now(),
      }
      await f.kernel.storage.call('commit', f.session.id, run.id, 'assistant', [
        { type: 'tool_call', name: approval.tool, callId: approval.callId, args: approval.args },
      ])
      await f.kernel.storage.call('createApproval', approval)
      await f.kernel.storage.call('setRun', run.id, 'waiting_approval')
      if (change === 'policy') await f.kernel.automationSet(f.session.id, false)
      if (change === 'cancel') await f.kernel.storage.call('requestCancel', run.id)
      if (change === 'manual')
        await f.kernel.storage.call(
          'resolvePlanExit',
          approval.id,
          f.session.id,
          run.id,
          approval.callId,
          'continue',
          'Revise this plan',
          'human-reviewer',
        )
      const result: unknown = await f.kernel.storage
        .call(
          'resolvePlanExit',
          approval.id,
          f.session.id,
          run.id,
          approval.callId,
          'implement',
          undefined,
          change === 'actor' ? 'another-owner' : 'fixture-owner',
          automatic,
        )
        .catch((error: unknown) => error)
      expect(result).toMatchObject({
        code: {
          policy: 'DECISION_POLICY_CHANGED',
          actor: 'EXECUTION_PRINCIPAL_UNAVAILABLE',
          cancel: 'PLAN_EXIT_CANCELLED',
          manual: 'PLAN_EXIT_SETTLED',
        }[change],
      })
      expect((await f.kernel.storage.call('approval', approval.id)).status).toBe(
        change === 'manual' ? 'denied' : 'pending',
      )
      expect((await f.kernel.storage.call('run', run.id)).input.mode).toBe('plan')
      expect(
        (await f.kernel.storage.call('events', f.session.id, 0, 2000)).filter(
          (event) => event.runId === run.id && event.type === 'plan_exit.resolved',
        ),
      ).toHaveLength(change === 'manual' ? 1 : 0)
    } finally {
      await f.close()
    }
  },
  30_000,
)

test.each(['policy', 'cancel', 'mode', 'manual'] as const)(
  'an automatic ordinary approval respects the original %s boundary at durable commit',
  async (change) => {
    const f = await fixture('ask')
    try {
      await f.submit()
      await f.kernel.waitForIdle()
      const events = await f.kernel.storage.call('events', f.session.id, 0, 2000)
      const { automatic } = z
        .object({ automatic: automaticToolApprovalDecisionSchema })
        .parse(events.find((event) => event.type === 'approval.resolved')?.data)
      const run = await f.kernel.storage.call(
        'enqueue',
        f.session.id,
        crypto.randomUUID(),
        {
          text: 'Write the requested file',
          images: [],
          mode: 'default',
          approval: change === 'mode' ? 'sandbox' : 'ask',
        },
        'local-fixture',
      )
      await f.kernel.storage.call('claim', f.session.id)
      const approval = {
        id: crypto.randomUUID(),
        sessionId: f.session.id,
        runId: run.id,
        callId: crypto.randomUUID(),
        tool: 'write_file',
        args: { path: 'another.txt', text: 'requested' },
        status: 'pending' as const,
        createdAt: Date.now(),
      }
      await f.kernel.storage.call('commit', f.session.id, run.id, 'assistant', [
        { type: 'tool_call', name: approval.tool, callId: approval.callId, args: approval.args },
      ])
      await f.kernel.storage.call('createApproval', approval)
      await f.kernel.storage.call('setRun', run.id, 'waiting_approval')
      if (change === 'policy') await f.kernel.automationSet(f.session.id, false)
      if (change === 'cancel') await f.kernel.storage.call('requestCancel', run.id)
      if (change === 'manual') await f.kernel.storage.call('resolveApproval', approval.id, 'denied')
      const result: unknown = await f.kernel.storage
        .call('resolveApproval', approval.id, 'allowed', automatic)
        .catch((error: unknown) => error)
      if (change === 'manual') expect(result).toBeNull()
      else
        expect(result).toMatchObject({
          code: {
            policy: 'DECISION_POLICY_CHANGED',
            cancel: 'USER_CANCELLED',
            mode: 'AUTOMATIC_APPROVAL_INVALID',
          }[change],
        })
      expect((await f.kernel.storage.call('approval', approval.id)).status).toBe(
        change === 'manual' ? 'denied' : 'pending',
      )
      expect(await Bun.file(join(f.root, 'another.txt')).exists()).toBe(false)
    } finally {
      await f.close()
    }
  },
  30_000,
)
