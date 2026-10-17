import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { emptyUsage } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import {
  definePlugin,
  provide,
  type HarnessDriver,
  type GoalService,
  type BudgetService,
  type PlanService,
  type ModeService,
} from '@hbar/plugin-sdk'
import { Storage, type StoragePort } from '@hbar/storage'
import { removeOwnedTestDirectory } from './owned-temp-directory'

test('startup restores Goal, Plan, budget and legacy policy and wakes queued work beyond the old 2000-session window', async () => {
  const prefix = 'hbar-session-startup-page-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const storage = new Storage(join(root, 'state.sqlite'))
  const kernels = new Set<Kernel>()
  const calls = { scans: 0, lists: 0 }
  const executions: string[] = []
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Paged startup fixture',
      description: 'No provider',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      provides: { driver: '1.0.0' },
      permissions: [],
    },
    apply(api) {
      provide<HarnessDriver>(api, 'driver', {
        async run(input) {
          executions.push(input.run.id)
          await input.commit('assistant', [{ type: 'text', text: 'Completed once' }])
        },
        summarize: async () => ({ text: '', usage: emptyUsage() }),
      })
    },
  })
  const port: StoragePort = {
    call(method, ...args) {
      if (method === 'sessionScanPage') calls.scans++
      if (method === 'sessions') calls.lists++
      return storage.call(method, ...args)
    },
    close: async () => {},
  }
  const open = async () => {
    const kernel = await Kernel.create({
      home: join(root, 'data'),
      demo: true,
      lifecycle: 'managed',
      secrets: new MemorySecrets(),
      profile: { createStorage: async () => port, replacements: { 'driver.pi': driver } },
    })
    kernels.add(kernel)
    return kernel
  }
  try {
    await storage.call('ready')
    await storage.call('setPlugin', 'goal.codex', true, { autoContinue: false })
    await storage.call('setPlugin', 'budget.codex', true, { autoContinue: false })
    const initial = await open()
    await initial.saveProvider({
      id: 'fixture',
      name: 'Fixture',
      protocol: 'mock',
      baseUrl: 'http://127.0.0.1',
      model: 'fixture',
    })
    const workspace = await storage.call('createWorkspace', root, 'Startup fixture')
    const legacy = await storage.call('createSession', workspace.id, 'Old controlled task')
    const queued = await storage.call('createSession', workspace.id, 'Old queued work')
    const goals = initial.plugins.get<GoalService>('goal')
    const original = await goals.create(legacy.id, 'Preserve this task and its constraints')
    await goals.set(legacy.id, { status: 'paused', expectedGoalId: original.goal?.goalId })
    await initial.plugins.get<BudgetService>('budget').set(legacy.id, 1000)
    await initial.plugins
      .get<PlanService>('plan')
      .update(legacy.id, [{ step: 'Preserve saved plan', status: 'pending' }])
    await initial.plugins.get<ModeService>('mode').set(legacy.id, 'plan')
    await storage.call('append', legacy.id, 'automation.changed', {
      sessionId: legacy.id,
      unattended: true,
      goalEnabled: true,
    })
    const run = await storage.call(
      'enqueue',
      queued.id,
      'queued-original',
      { text: 'Finish queued work', images: [] },
      'fixture',
    )
    await initial.close()
    kernels.delete(initial)
    await Bun.sleep(2)
    for (let i = 0; i < 2001; i++) await storage.call('createSession', workspace.id, `Newer Session ${i}`)
    const oldList = await storage.call('sessions')
    expect(oldList).toHaveLength(2000)
    expect(oldList.some((session) => session.id === legacy.id || session.id === queued.id)).toBe(false)
    calls.lists = 0
    calls.scans = 0
    const restored = await open()
    expect(calls.lists).toBe(0)
    expect(calls.scans).toBeGreaterThan(31)
    expect((await restored.plugins.get<GoalService>('goal').get(legacy.id)).goal).toMatchObject({
      goalId: original.goal?.goalId,
      status: 'paused',
    })
    expect(await restored.plugins.get<BudgetService>('budget').get(legacy.id)).toMatchObject({
      limit: 1000,
      usedTokens: 0,
    })
    expect(await restored.plugins.get<ModeService>('mode').get(legacy.id)).toEqual({ mode: 'plan' })
    expect((await restored.plugins.get<PlanService>('plan').get(legacy.id))?.plan[0]?.step).toBe('Preserve saved plan')
    expect(await restored.automationGet(legacy.id)).toMatchObject({ unattended: true, goalEnabled: true })
    await Promise.all([restored.activate(), restored.activate()])
    await restored.waitForIdle()
    expect(executions).toEqual([run.id])
    expect((await storage.call('run', run.id)).status).toBe('completed')
    expect((await restored.plugins.get<GoalService>('goal').get(legacy.id)).goal?.status).toBe('paused')
    expect(calls.lists).toBe(0)
  } finally {
    for (const kernel of kernels) await kernel.close()
    await storage.close()
    await removeOwnedTestDirectory(root, prefix)
  }
}, 60_000)

test('concurrent activation shares a discovery read and shutdown joins it before releasing storage', async () => {
  const prefix = 'hbar-session-startup-close-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const storage = new Storage(join(root, 'state.sqlite'))
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let intercept = false
  let reads = 0
  let kernel: Kernel | undefined
  try {
    await storage.call('ready')
    const port: StoragePort = {
      call(method, ...args) {
        if (method === 'sessionScanPage' && intercept) {
          reads++
          entered.resolve()
          return release.promise.then(() => storage.call(method, ...args))
        }
        return storage.call(method, ...args)
      },
      close: async () => {},
    }
    kernel = await Kernel.create({
      home: join(root, 'data'),
      demo: true,
      lifecycle: 'managed',
      secrets: new MemorySecrets(),
      profile: { createStorage: async () => port },
    })
    intercept = true
    const first = kernel.activate(),
      second = kernel.activate()
    await entered.promise
    expect(kernel.chatDatabaseIsIdle()).toBe(false)
    let closed = false
    const closing = kernel.close().then(() => {
      closed = true
    })
    await Bun.sleep(5)
    expect(closed).toBe(false)
    expect(reads).toBe(1)
    release.resolve()
    await Promise.all([first, second, closing])
    expect(closed).toBe(true)
    expect(reads).toBe(1)
    kernel = undefined
  } finally {
    release.resolve()
    await kernel?.close()
    await storage.close()
    await removeOwnedTestDirectory(root, prefix)
  }
}, 20_000)
