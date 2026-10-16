import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { agentPlugin } from '@hbar/agent'
import { planPlugin } from '@hbar/plan'
import { budgetPlugin } from '@hbar/budget'
import { definePlugin, runtimePluginIdleCheckpointSchema } from '@hbar/plugin-sdk'
import type {
  AgentService,
  BudgetService,
  HbarPlugin,
  PlanService,
  RuntimePluginIdleRegistry,
  SessionService,
} from '@hbar/plugin-sdk'

function gate() {
  let release: () => void = () => {
    throw new Error('Fixture gate not initialized')
  }
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}

type Owner = 'agent.codex' | 'plan.codex' | 'budget.codex'
interface Control {
  readonly boundary: 'get' | 'plan.updated' | 'budget.created'
  readonly outcome: 'reject-read' | 'commit' | 'lose-ack'
  readonly entered: ReturnType<typeof gate>
  readonly finish: ReturnType<typeof gate>
}

// Actual Kernel + its default Storage Worker + production plugin.apply/runtime.
// Only the public SessionService boundary is gated; no private maps are modified.
async function fixture() {
  const root = resolve(await mkdtemp(join(tmpdir(), 'hbar-domain-owner-idle-')))
  if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith('hbar-domain-owner-idle-'))
    throw new Error('Unowned domain idle fixture path')
  const readers = new Map<Owner, Parameters<RuntimePluginIdleRegistry['register']>[0]>()
  const controls = new Map<Owner, Control>()
  const allControls: Control[] = []
  const pending = new Set<Promise<unknown>>()
  const observe = (plugin: HbarPlugin, owner: Owner) =>
    definePlugin({
      ...plugin,
      async apply(context, config) {
        const original = context.hbar.api
        const sessions: SessionService = {
          ...original.sessions,
          async get(id) {
            const control = controls.get(owner)
            if (control?.boundary === 'get') {
              control.entered.release()
              await control.finish.promise
              controls.delete(owner)
              throw new HbarError('FIXTURE_READ_REJECTED', 'Controlled pre-dispatch Session read rejected')
            }
            return original.sessions.get(id)
          },
          async append(sessionId, type, data, runId, stepId) {
            const control = controls.get(owner)
            if (control && control.boundary === type) {
              control.entered.release()
              await control.finish.promise
              controls.delete(owner)
              const event = await original.sessions.append(sessionId, type, data, runId, stepId)
              if (control.outcome === 'lose-ack')
                throw new HbarError('RESULT_UNKNOWN', 'Controlled loss of a completed append acknowledgement')
              return event
            }
            return original.sessions.append(sessionId, type, data, runId, stepId)
          },
        }
        // Preserve the full real API and services. Production apply captures this
        // scoped public port object; restore the shared assembly API immediately.
        context.hbar.api = {
          ...original,
          sessions,
          runtimeIdle: {
            register(read) {
              if (readers.has(owner)) throw new Error('Duplicate owner idle registration')
              readers.set(owner, read)
              return () => {
                if (readers.get(owner) === read) readers.delete(owner)
              }
            },
          },
        }
        try {
          await plugin.apply(context, config)
        } finally {
          context.hbar.api = original
        }
      },
    })
  const replacements = {
    'agent.codex': observe(agentPlugin, 'agent.codex'),
    'plan.codex': observe(planPlugin, 'plan.codex'),
    'budget.codex': observe(budgetPlugin, 'budget.codex'),
  }
  let current: Kernel | undefined
  const boot = async () => {
    const kernel = await Kernel.create({
      dataRoot: join(root, 'data'),
      cacheRoot: join(root, 'cache'),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      profile: { replacements },
    })
    kernel.beginDrain()
    return kernel
  }
  const close = async () => {
    for (const control of allControls) control.finish.release()
    await Promise.allSettled([...pending])
    const errors: unknown[] = []
    try {
      await current?.close()
    } catch (error) {
      errors.push(error)
    }
    // Keep a failed-close fixture intact; never remove a possibly live Worker DB.
    if (!errors.length) {
      try {
        await rm(root, { recursive: true, force: true })
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length) throw new AggregateError(errors, 'Domain idle fixture cleanup failed', { cause: errors[0] })
  }
  try {
    current = await boot()
    const workspace = (await current.storage.call('workspaces')).at(0)
    if (!workspace) throw new Error('Real fixture workspace missing')
    const session = await current.createSession(workspace.id, 'Owner idle checkpoint fixture')
    return {
      session,
      get kernel() {
        if (!current) throw new Error('Fixture Kernel unavailable')
        return current
      },
      read(owner: Owner) {
        const reader = readers.get(owner)
        if (!reader) throw new Error('Production plugin did not register its idle reader')
        return runtimePluginIdleCheckpointSchema.parse(reader())
      },
      arm(owner: Owner, boundary: Control['boundary'], outcome: Control['outcome']) {
        if (controls.has(owner)) throw new Error('Fixture operation already controlled')
        const control: Control = { boundary, outcome, entered: gate(), finish: gate() }
        controls.set(owner, control)
        allControls.push(control)
        return control
      },
      track<T>(operation: Promise<T>): Promise<T> {
        pending.add(operation)
        void operation.then(
          () => pending.delete(operation),
          () => pending.delete(operation),
        )
        return operation
      },
      async reopen() {
        await current?.close()
        current = undefined
        readers.clear()
        current = await boot()
      },
      close,
    }
  } catch (primary) {
    try {
      await close()
    } catch (cleanup) {
      throw new AggregateError([primary, cleanup], 'Domain idle setup and cleanup failed', { cause: cleanup })
    }
    throw primary
  }
}

async function scenario(operation: (value: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
  const value = await fixture()
  let failed = false
  let primary: unknown
  try {
    await operation(value)
  } catch (error) {
    failed = true
    primary = error
  }
  try {
    await value.close()
  } catch (cleanup) {
    if (failed) throw new AggregateError([primary, cleanup], 'Domain idle test and cleanup failed', { cause: cleanup })
    throw cleanup
  }
  if (failed) throw primary
}

test('production Agent create and patch locks stay busy through public reads then settle after known rejection', async () => {
  await scenario(async (value) => {
    const agents = value.kernel.plugins.get<AgentService>('agent')
    expect(value.read('agent.codex').background).toBe(0)
    const before = await value.kernel.storage.call('sessions')
    const control = value.arm('agent.codex', 'get', 'reject-read')
    const outcome = value.track(
      agents
        .create(
          { parentSessionId: value.session.id, objective: 'Must never reach model dispatch' },
          { actorId: 'fixture-actor', idempotencyKey: 'agent-idle-reject', requestId: 'agent-idle-reject' },
        )
        .then(
          () => null,
          (error: unknown) => error,
        ),
    )
    const patchOutcome = value.track(
      agents
        .applyPatch(value.session.id, 'fixture-missing-agent', 1, {
          actorId: 'fixture-actor',
          idempotencyKey: 'patch-idle-reject',
          requestId: 'patch-idle-reject',
        })
        .then(
          () => null,
          (error: unknown) => error,
        ),
    )
    await control.entered.promise
    expect(value.read('agent.codex')).toMatchObject({ supported: true, background: 2, unconfirmed: 0 })
    control.finish.release()
    expect(await outcome).toHaveProperty('code', 'FIXTURE_READ_REJECTED')
    expect(await patchOutcome).toHaveProperty('code', 'FIXTURE_READ_REJECTED')
    expect(value.read('agent.codex')).toEqual({
      supported: true,
      requests: 0,
      resources: 0,
      background: 0,
      unconfirmed: 0,
    })
    expect(await value.kernel.storage.call('sessions')).toEqual(before)
    expect(await agents.list(value.session.id)).toEqual({ items: [], nextCursor: null })
  })
})

test('production Plan update remains busy until its real Worker append completes then exposes the committed plan', async () => {
  await scenario(async (value) => {
    const plans = value.kernel.plugins.get<PlanService>('plan')
    const control = value.arm('plan.codex', 'plan.updated', 'commit')
    const operation = value.track(plans.update(value.session.id, [{ step: 'Owned idle boundary', status: 'pending' }]))
    await control.entered.promise
    expect(value.read('plan.codex')).toMatchObject({ supported: true, background: 1, unconfirmed: 0 })
    expect(await plans.get(value.session.id)).toBeNull()
    control.finish.release()
    const plan = await operation
    expect(await plans.get(value.session.id)).toEqual(plan)
    expect(value.read('plan.codex')).toEqual({
      supported: true,
      requests: 0,
      resources: 0,
      background: 0,
      unconfirmed: 0,
    })
    const events = await value.kernel.storage.call('events', value.session.id, 0)
    expect(events.filter((event) => event.type === 'plan.updated')).toHaveLength(1)
    expect(plan.revision).toBe(1)
  })
})

test('production Budget keeps lost-ACK writes unconfirmed until a fresh owner restores the original receipt without replay', async () => {
  await scenario(async (value) => {
    const budgets = value.kernel.plugins.get<BudgetService>('budget')
    const input = { sessionId: value.session.id, tokens: 500, expectedRevision: null }
    const command = {
      actorId: 'fixture-actor',
      idempotencyKey: 'budget-idle-lost-ack',
      requestId: 'budget-idle-lost-ack',
    }
    const control = value.arm('budget.codex', 'budget.created', 'lose-ack')
    const outcome = value.track(
      budgets.setCommand(input, command).then(
        () => null,
        (error: unknown) => error,
      ),
    )
    await control.entered.promise
    expect(value.read('budget.codex')).toMatchObject({ supported: true, background: 1, unconfirmed: 0 })
    control.finish.release()
    expect(await outcome).toHaveProperty('code', 'RESULT_UNKNOWN')
    expect(value.read('budget.codex')).toEqual({
      supported: true,
      requests: 0,
      resources: 0,
      background: 0,
      unconfirmed: 1,
    })
    let receiptFailure: unknown
    try {
      await budgets.getCommandReceipt(value.session.id, command.actorId, command.idempotencyKey)
    } catch (error) {
      receiptFailure = error
    }
    expect(receiptFailure).toHaveProperty('code', 'RESULT_UNKNOWN')
    let retryFailure: unknown
    try {
      await budgets.setCommand(input, command)
    } catch (error) {
      retryFailure = error
    }
    expect(retryFailure).toHaveProperty('code', 'RESULT_UNKNOWN')
    expect(value.read('budget.codex').unconfirmed).toBe(1)
    const events = await value.kernel.storage.call('events', value.session.id, 0)
    expect(events.filter((event) => event.type === 'budget.created')).toHaveLength(1)
    await value.reopen()
    const restored = value.kernel.plugins.get<BudgetService>('budget')
    const receipt = await restored.getCommandReceipt(value.session.id, command.actorId, command.idempotencyKey)
    if (!receipt) throw new Error('Fresh Budget owner did not recover the original receipt')
    expect(receipt).toMatchObject({
      status: 'succeeded',
      requestId: command.requestId,
      revision: 1,
      budget: { limit: 500 },
    })
    expect(await restored.setCommand(input, command)).toEqual(receipt)
    expect(value.read('budget.codex')).toEqual({
      supported: true,
      requests: 0,
      resources: 0,
      background: 0,
      unconfirmed: 0,
    })
    const reopened = await value.kernel.storage.call('events', value.session.id, 0)
    expect(reopened.filter((event) => event.type === 'budget.created')).toHaveLength(1)
  })
})
