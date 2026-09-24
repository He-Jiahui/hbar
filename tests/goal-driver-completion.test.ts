import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { providerSchema } from '@hbar/contracts'
import type { BudgetService, GoalService, PlanService } from '@hbar/plugin-sdk'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function fixture(firstTool = 'update_goal', args: Record<string, unknown> = { status: 'complete' }) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-goal-driver-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  let requests = 0
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      requests++
      const first = requests === 1
      const chunk = (delta: unknown, finish_reason: string | null) =>
        `data: ${JSON.stringify({ id: 'completion', object: 'chat.completion.chunk', created: 1, model: 'fixture-network', choices: [{ index: 0, delta, finish_reason }] })}\n\n`
      return new Response(
        chunk(
          first
            ? {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'control',
                    type: 'function',
                    function: { name: firstTool, arguments: JSON.stringify(args) },
                  },
                ],
              }
            : { role: 'assistant', content: 'Follow-up inference' },
          null,
        ) +
          chunk({}, first ? 'tool_calls' : 'stop') +
          `data: ${JSON.stringify({ id: 'completion', object: 'chat.completion.chunk', created: 1, model: 'fixture-network', choices: [], usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 } })}\n\n` +
          'data: [DONE]\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
    },
  })
  cleanups.push(async () => {
    await server.stop(true)
  })
  const kernel = await Kernel.create({ home: join(root, 'data'), workspace: root, secrets: new MemorySecrets() })
  cleanups.push(() => kernel.close())
  await kernel.changePlugin('goal.codex', true, { autoContinue: false })
  await kernel.saveProvider(
    providerSchema.parse({
      id: 'completion',
      name: 'Completion fixture',
      protocol: 'openai-completions',
      baseUrl: `http://127.0.0.1:${server.port}/v1`,
      model: 'fixture-network',
    }),
    'fixture-only',
  )
  await kernel.setPermissionMode('allow')
  const session = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id)
  const goals = kernel.plugins.get<GoalService>('goal')
  const plans = kernel.plugins.get<PlanService>('plan')
  const budgets = kernel.plugins.get<BudgetService>('budget')
  await goals.create(session.id, 'Complete a verified task', 10000)
  await budgets.set(session.id, 10000)
  const run = async () => {
    await kernel.submit(session.id, crypto.randomUUID(), { text: 'Continue the task', images: [] }, 'completion')
    await kernel.waitForIdle()
    return kernel.snapshot(session.id)
  }
  return { kernel, session, goals, plans, budgets, run, requests: () => requests }
}

test('a completed bound Goal stops after settlement without another paid inference and preserves both ledgers', async () => {
  const { session, goals, plans, budgets, run, requests } = await fixture()
  await plans.update(session.id, [{ step: 'Verified task', status: 'completed' }])
  const snapshot = await run()
  expect(snapshot.runs[0]?.status).toBe('completed')
  expect((await goals.get(session.id)).goal).toMatchObject({ status: 'complete', tokensUsed: 60 })
  expect(await budgets.get(session.id)).toMatchObject({ usedTokens: 60, remainingTokens: 9940 })
  expect(requests()).toBe(1)
  expect(
    snapshot.messages
      .flatMap((message) => message.content)
      .some((block) => block.type === 'tool_result' && block.name === 'update_goal' && !block.isError),
  ).toBe(true)
})

test('rejected premature completion continues the model loop and keeps the Goal active', async () => {
  const { session, goals, plans, run, requests } = await fixture()
  await plans.update(session.id, [{ step: 'Unverified task', status: 'in_progress' }])
  const snapshot = await run()
  expect(requests()).toBe(2)
  expect(snapshot.runs[0]?.status).toBe('completed')
  expect((await goals.get(session.id)).goal).toMatchObject({ status: 'active', tokensUsed: 120 })
  expect(
    snapshot.messages
      .flatMap((message) => message.content)
      .some((block) => block.type === 'tool_result' && block.name === 'update_goal' && block.isError),
  ).toBe(true)
})

test('a previously completed Goal cannot truncate an unrelated new user Run', async () => {
  const { session, goals, budgets, run, requests } = await fixture('get_goal', {})
  await goals.update(session.id, 'complete')
  const snapshot = await run()
  expect(requests()).toBe(2)
  expect(snapshot.runs[0]?.status).toBe('completed')
  expect((await goals.get(session.id)).goal).toMatchObject({ status: 'complete', tokensUsed: 0 })
  expect(await budgets.get(session.id)).toMatchObject({ usedTokens: 120 })
})
