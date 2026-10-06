import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { providerSchema } from '@hbar/contracts'
import type { BudgetService, GoalService, PlanService } from '@hbar/plugin-sdk'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function fixture(
  firstTool = 'update_goal',
  args: Record<string, unknown> = { status: 'complete' },
  tail: { name: string; args: Record<string, unknown> }[] = [],
  completeNext = false,
) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-goal-driver-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'proof.txt'), 'verified')
  let requests = 0
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      requests++
      const first = requests === 1
      const toolTurn = first || completeNext
      const chunk = (delta: unknown, finish_reason: string | null) =>
        `data: ${JSON.stringify({ id: 'completion', object: 'chat.completion.chunk', created: 1, model: 'fixture-network', choices: [{ index: 0, delta, finish_reason }] })}\n\n`
      return new Response(
        chunk(
          toolTurn
            ? {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'control',
                    type: 'function',
                    function: {
                      name: first ? firstTool : 'update_goal',
                      arguments: JSON.stringify(first ? args : { status: 'complete' }),
                    },
                  },
                  ...(first ? tail : []).map((tool, index) => ({
                    index: index + 1,
                    id: `tail-${index}`,
                    type: 'function',
                    function: { name: tool.name, arguments: JSON.stringify(tool.args) },
                  })),
                ],
              }
            : { role: 'assistant', content: 'Follow-up inference' },
          null,
        ) +
          chunk({}, toolTurn ? 'tool_calls' : 'stop') +
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
  return { root, kernel, session, goals, plans, budgets, run, requests: () => requests }
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

test('completion seals its bound Run against late mutations in the same tool batch', async () => {
  const { root, run, requests } = await fixture('update_goal', { status: 'complete' }, [
    { name: 'write_file', args: { path: 'proof.txt', text: 'broken after completion' } },
  ])
  const snapshot = await run()
  expect(await readFile(join(root, 'proof.txt'), 'utf8')).toBe('verified')
  expect(requests()).toBe(1)
  expect(snapshot.runs[0]?.status).toBe('completed')
  expect(
    snapshot.messages
      .flatMap((message) => message.content)
      .some((block) => block.type === 'tool_result' && block.name === 'write_file' && block.isError),
  ).toBe(true)
})

test('real Pi tool batches hand off normally and use the next request only for the replacement Goal', async () => {
  const { kernel, session, root, run, requests } = await fixture(
    'get_goal',
    {},
    [{ name: 'write_file', args: { path: 'proof.txt', text: 'obsolete write' } }],
    true,
  )
  await kernel.changePlugin('goal.codex', true, { autoContinue: true })
  const goals = kernel.plugins.get<GoalService>('goal')
  const budgets = kernel.plugins.get<BudgetService>('budget')
  let replaced = false
  const dispose = kernel.hooks.on('tool.after', async (event) => {
    if (event.name !== 'get_goal' || replaced) return
    replaced = true
    const current = (await goals.get(session.id)).goal!
    await goals.set(session.id, {
      objective: 'Verify the preserved proof for the new objective',
      expectedGoalId: current.goalId,
    })
  })
  try {
    const snapshot = await run()
    expect(requests()).toBe(2)
    expect(snapshot.runs.map((item) => item.status)).toEqual(['completed', 'completed'])
    expect(snapshot.runs.every((item) => item.error === null && !item.failure)).toBe(true)
    expect(await readFile(join(root, 'proof.txt'), 'utf8')).toBe('verified')
    expect((await goals.get(session.id)).goal).toMatchObject({ status: 'complete', tokensUsed: 60 })
    expect((await budgets.get(session.id))?.usedTokens).toBe(120)
    const cancelled = snapshot.messages
      .flatMap((message) => message.content)
      .find((block) => block.type === 'tool_result' && block.name === 'write_file')
    expect(cancelled).toMatchObject({ isError: false, outcome: { kind: 'cancelled', reason: 'goal_replaced' } })
  } finally {
    await dispose()
  }
})
