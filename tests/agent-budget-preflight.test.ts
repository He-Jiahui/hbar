import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { Kernel, MemorySecrets, createAgentCommands } from '@hbar/kernel'
import { AgentRuntime, agentPlugin } from '@hbar/agent'
import { BudgetRuntime } from '@hbar/budget'
import { Storage } from '@hbar/storage'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { AgentService, BudgetService, GitService } from '@hbar/plugin-sdk'

async function removeFixture(rootPath: string): Promise<void> {
  const root = resolve(rootPath)
  if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith('hbar-agent-budget-preflight-'))
    throw new Error('Unsafe fixture cleanup path')
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

async function fixture(maxLimit?: number, stricterFinalOwner = false) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-agent-budget-preflight-'))
  const storage = new Storage(join(root, 'state.sqlite'))
  const counts = { childCreates: 0, worktrees: 0, validations: 0 }
  const observed = definePlugin({
    manifest: agentPlugin.manifest,
    async apply(ctx) {
      const api = ctx.hbar.api
      const realBudget = api.service<BudgetService>('budget')
      const stricter = new BudgetRuntime(api, 100, false)
      await stricter.restore()
      const budgets: BudgetService = {
        async validateLimit(limit) {
          counts.validations++
          await realBudget.validateLimit(limit)
        },
        get: (sessionId) => realBudget.get(sessionId),
        set: (sessionId, limit) =>
          stricterFinalOwner ? stricter.set(sessionId, limit) : realBudget.set(sessionId, limit),
        setCommand: (input, context) => realBudget.setCommand(input, context),
        getCommandReceipt: (sessionId, actorId, key) => realBudget.getCommandReceipt(sessionId, actorId, key),
        clear: (sessionId) => realBudget.clear(sessionId),
        assertCanStart: (sessionId, source) => realBudget.assertCanStart(sessionId, source),
      }
      const realGit = api.service<GitService>('git')
      const git = new Proxy(realGit, {
        get(target, key, receiver): unknown {
          if (key === 'worktree')
            return (...args: Parameters<GitService['worktree']>) => {
              counts.worktrees++
              return target.worktree(...args)
            }
          const value: unknown = Reflect.get(target, key, receiver)
          return value
        },
      })
      provide<AgentService>(
        ctx,
        'agent',
        new AgentRuntime(
          {
            ...api.sessions,
            create: async (...args) => {
              counts.childCreates++
              return api.sessions.create(...args)
            },
          },
          budgets,
          git,
          api,
        ),
      )
    },
  })
  let kernel: Kernel | undefined
  try {
    await storage.call('ready')
    if (maxLimit !== undefined) await storage.call('setPlugin', 'budget.codex', true, { maxLimit, autoContinue: false })
    kernel = await Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      lifecycle: 'managed',
      profile: { replacements: { 'agent.codex': observed }, createStorage: async () => storage },
    })
    await kernel.saveProvider({
      id: 'local-fixture',
      name: 'Budget preflight fixture',
      protocol: 'mock',
      baseUrl: 'http://127.0.0.1',
      model: 'local-fixture',
    })
    kernel.beginDrain()
    const workspace = await storage.call('createWorkspace', root, 'Fixture')
    const parent = await storage.call('createSession', workspace.id)
    const commands = createAgentCommands(kernel.plugins.get<AgentService>('agent'))
    return { root, storage, kernel, parent, commands, counts }
  } catch (error) {
    const errors: unknown[] = [error]
    try {
      await kernel?.close()
    } catch (cleanupError) {
      errors.push(cleanupError)
    }
    try {
      await storage.close()
    } catch (cleanupError) {
      errors.push(cleanupError)
    }
    try {
      await removeFixture(root)
    } catch (cleanupError) {
      errors.push(cleanupError)
    }
    if (errors.length > 1)
      throw new AggregateError(errors, 'Agent budget fixture setup and cleanup failed', { cause: error })
    throw error
  }
}
async function scenario(
  maxLimit: number | undefined,
  strict: boolean,
  operation: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>,
) {
  const f = await fixture(maxLimit, strict)
  let failed = false
  let primary: unknown
  const errors: unknown[] = []
  try {
    await operation(f)
  } catch (error) {
    failed = true
    primary = error
  }
  try {
    await f.kernel.close()
  } catch (error) {
    errors.push(error)
  }
  try {
    await f.storage.close()
  } catch (error) {
    errors.push(error)
  }
  try {
    await removeFixture(f.root)
  } catch (error) {
    errors.push(error)
  }
  if (failed) {
    if (errors.length)
      throw new AggregateError([primary, ...errors], 'Agent budget scenario and cleanup failed', { cause: primary })
    throw primary
  }
  if (errors.length) throw new AggregateError(errors, 'Agent budget fixture cleanup failed')
}
const actor = { actorId: 'budget-test-device', idempotencyKey: 'child', requestId: 'create-child' }
async function rejected(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Expected rejection')
}
for (const maxLimit of [undefined, 100, 1_000_000_000]) {
  test(`Agent budget preflight honors configured maximum ${maxLimit ?? 'default'} before durable creation`, async () => {
    await scenario(maxLimit, false, async (f) => {
      const cap = maxLimit ?? 10_000_000
      const input = { parentSessionId: f.parent.id, objective: 'Queued local task', modelId: 'local-fixture' }
      const before = (await f.storage.call('sessions')).length
      if (cap < 1_000_000_000) {
        for (const patch of [false, true]) {
          const error = await rejected(
            f.commands.execute(
              'agent.create',
              {
                ...input,
                tokenBudget: cap + 1,
                ...(patch
                  ? {
                      patchTask: {
                        itemId: 'slice',
                        planRevision: 1,
                        scope: { readPaths: ['.'], writePaths: ['owned'], tools: [] },
                        acceptanceChecks: [],
                      },
                    }
                  : {}),
              },
              { ...actor, idempotencyKey: patch ? 'invalid-patch' : 'invalid-normal' },
            ),
          )
          expect(error).toMatchObject({ code: 'BUDGET_INVALID' })
        }
        expect((await f.storage.call('sessions')).length).toBe(before)
        expect(
          (await f.storage.call('events', f.parent.id, 0, 1_000)).some((event) => event.type === 'agent.childCreated'),
        ).toBe(false)
        expect(f.counts.childCreates).toBe(0)
        expect(f.counts.worktrees).toBe(0)
      }
      const created = await f.commands.execute('agent.create', { ...input, tokenBudget: cap }, actor)
      expect(created.status).toBe('queued')
      expect((await f.kernel.plugins.get<BudgetService>('budget').get(created.sessionId))?.limit).toBe(cap)
      expect((await f.commands.execute('agent.create', { ...input, tokenBudget: cap }, actor)).agentId).toBe(
        created.agentId,
      )
      expect(
        await rejected(f.commands.execute('agent.create', { ...input, objective: 'Changed', tokenBudget: cap }, actor)),
      ).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
      const beforeUnbudgeted = f.counts.validations
      const unbudgeted = await f.commands.execute('agent.create', input, { ...actor, idempotencyKey: 'no-budget' })
      expect(unbudgeted.status).toBe('queued')
      expect(f.counts.validations).toBe(beforeUnbudgeted)
      expect(await f.kernel.plugins.get<BudgetService>('budget').get(unbudgeted.sessionId)).toBeNull()
    })
  }, 30_000)
}
test('authoritative final Budget owner revalidates after a successful preflight; failed receipt is preserved', async () => {
  await scenario(undefined, true, async (f) => {
    // Two real BudgetRuntime configurations represent a stricter owner at final commit, not a reusable grant.
    const input = { parentSessionId: f.parent.id, objective: 'Queued task', modelId: 'local-fixture', tokenBudget: 101 }
    const first = await f.commands.execute('agent.create', input, actor)
    expect(first.status).toBe('failed')
    expect(first.runId).toBeNull()
    expect(f.counts.childCreates).toBe(1)
    expect(f.counts.validations).toBe(1)
    const second = await f.commands.execute('agent.create', input, actor)
    expect(second).toEqual(first)
    expect(f.counts.validations).toBe(1)
    expect(await rejected(f.commands.execute('agent.create', { ...input, tokenBudget: 100 }, actor))).toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    })
    expect(f.counts.childCreates).toBe(1)
    expect(await f.kernel.plugins.get<BudgetService>('budget').get(first.sessionId)).toBeNull()
  })
}, 30_000)
