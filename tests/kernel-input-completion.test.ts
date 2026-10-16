import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError, userInputAutomaticDecisionSchema, type Usage } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { DecisionCompletionRequest, HarnessDriver, BudgetService } from '@hbar/plugin-sdk'
import type { StorageMethods } from '@hbar/storage'
import { usageRecordedDataSchema } from '@hbar/contracts/usage'
import { removeOwnedTestDirectory } from './owned-temp-directory'

const question = {
  id: 'scope',
  header: 'Scope',
  question: 'Choose the implementation scope.',
  purpose: 'decision',
  options: [
    { label: 'App', description: 'Implement App.' },
    { label: 'API', description: 'Implement API.' },
  ],
}
const usage: Usage = { input: 70, output: 20, cacheRead: 0, cacheWrite: 0, cost: 0 }
const answer = (choice: string) => JSON.stringify({ kind: 'answer', answers: { scope: { answers: [choice] } } })

async function fixture() {
  const prefix = 'hbar-kernel-input-completion-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  await kernel.changePlugin('budget.codex', true, { autoContinue: false })
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Expected completion fixture workspace')
  const session = await kernel.createSession(workspace.id)
  await kernel.automationSet(session.id, true)
  const driver = kernel.plugins.get<HarnessDriver>('driver')
  const requests: DecisionCompletionRequest[] = []
  let output: (request: DecisionCompletionRequest) => Promise<string> = async () => answer('API')
  driver.completeDecision = async (request) => {
    requests.push(request)
    return { text: await output(request), usage }
  }
  const replies: Promise<unknown>[] = []
  let human = 0
  const unsubscribe = kernel.subscribe((event) => {
    if (event.method === 'user_input.requested') {
      human++
      replies.push(kernel.resolveUserInput(event.params.requestId, { scope: { answers: ['API'] } }))
    }
  })
  return {
    kernel,
    session,
    requests,
    get human() {
      return human
    },
    setOutput(callback: typeof output) {
      output = callback
    },
    async run() {
      const run = await kernel.submit(
        session.id,
        crypto.randomUUID(),
        { text: `/tool request_user_input ${JSON.stringify({ questions: [question] })}`, images: [] },
        'local-fixture',
      )
      await kernel.waitForIdle()
      await Promise.all(replies)
      return {
        run,
        snapshot: await kernel.snapshot(session.id),
        events: await kernel.storage.call('events', session.id, 0, 2000),
      }
    },
    async close() {
      unsubscribe()
      await Promise.all(replies)
      await kernel.close()
      await removeOwnedTestDirectory(root, prefix)
    },
  }
}

test('a real Kernel repairs an invalid automatic answer once, records both source usages and charges the budget once', async () => {
  const f = await fixture()
  try {
    const budget = f.kernel.plugins.get<BudgetService>('budget')
    await budget.set(f.session.id, 100_000)
    f.setOutput(async () => (f.requests.length === 1 ? 'invalid JSON' : answer('API')))
    const { run, snapshot, events } = await f.run()
    expect(snapshot.runs.find((item) => item.id === run.id)?.status).toBe('completed')
    expect(snapshot.runs).toHaveLength(1)
    expect(f.human).toBe(0)
    expect(f.requests).toHaveLength(2)
    const audit = userInputAutomaticDecisionSchema.parse(
      events.find((event) => event.type === 'user_input.autoDecided')?.data,
    )
    expect(audit).toMatchObject({
      source: 'model',
      modelId: 'local-fixture',
      policy: { policy: { mode: 'recommended' } },
      response: { answers: { scope: { answers: ['API'] } } },
    })
    expect(audit.attemptIds).toHaveLength(2)
    const usages = events.filter((event) => event.type === 'usage.recorded')
    const actual = usages.map((event) => ({ event, usage: usageRecordedDataSchema.parse(event.data) }))
    expect(actual.filter((entry) => audit.attemptIds?.includes(entry.usage.attemptId))).toHaveLength(2)
    expect(actual.every((entry) => entry.event.runId === run.id)).toBe(true)
    expect((await budget.get(f.session.id))?.usedTokens).toBe(
      actual.reduce(
        (total, entry) => total + Math.max(0, entry.usage.input - entry.usage.cacheRead) + entry.usage.output,
        0,
      ),
    )
    expect(events.some((event) => event.type === 'goal.created')).toBe(false)
  } finally {
    await f.close()
  }
})

test('changing the policy while the model answers preserves usage and waits for the human answer', async () => {
  const f = await fixture()
  try {
    f.setOutput(async () => {
      await f.kernel.automationSet(f.session.id, false)
      return answer('App')
    })
    const { run, snapshot, events } = await f.run()
    expect(snapshot.runs.find((item) => item.id === run.id)?.status).toBe('completed')
    expect(f.requests).toHaveLength(1)
    expect(f.human).toBe(1)
    expect(events.some((event) => event.type === 'user_input.autoDecided')).toBe(false)
    expect(events.find((event) => event.type === 'user_input.automationWaiting')?.data).toMatchObject({
      reason: 'policy_changed',
    })
    const result = snapshot.messages
      .flatMap((message) => message.content)
      .find((block) => block.type === 'tool_result' && block.name === 'request_user_input')
    expect(result?.type === 'tool_result' ? JSON.parse(result.text) : null).toEqual({
      answers: { scope: { answers: ['API'] } },
    })
  } finally {
    await f.close()
  }
})

test('a model that needs user input or fails two answer validations retains one human request', async () => {
  for (const output of [JSON.stringify({ kind: 'need_user' }), answer('not an allowed choice')]) {
    const f = await fixture()
    try {
      f.setOutput(async () => output)
      const { events } = await f.run()
      expect(f.requests).toHaveLength(output.includes('need_user') ? 1 : 2)
      expect(f.human).toBe(1)
      expect(events.filter((event) => event.type === 'user_input.requested')).toHaveLength(1)
      expect(events.some((event) => event.type === 'user_input.autoDecided')).toBe(false)
    } finally {
      await f.close()
    }
  }
})

test('uncertain decision usage stops the source Run before another model request or automatic answer', async () => {
  const f = await fixture()
  const original = f.kernel.storage.call.bind(f.kernel.storage)
  try {
    f.kernel.storage.call = async <Name extends keyof StorageMethods>(
      method: Name,
      ...args: Parameters<StorageMethods[Name]>
    ): Promise<ReturnType<StorageMethods[Name]>> => {
      if (method === 'append' && args[1] === 'usage.recorded' && f.requests.length)
        throw new HbarError('STORAGE_RESULT_UNKNOWN', 'Injected decision usage write failure')
      return original(method, ...args)
    }
    const { run, snapshot, events } = await f.run()
    expect(snapshot.runs.find((item) => item.id === run.id)?.status).not.toBe('completed')
    expect(f.requests).toHaveLength(1)
    expect(f.human).toBe(0)
    expect(events.some((event) => event.type === 'user_input.autoDecided')).toBe(false)
    expect(events.filter((event) => event.type === 'request.started')).toHaveLength(2)
  } finally {
    f.kernel.storage.call = original
    await f.close()
  }
})
