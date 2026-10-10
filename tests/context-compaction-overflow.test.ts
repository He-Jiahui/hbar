import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { DriverInput, HarnessDriver, ModelRequest } from '@hbar/plugin-sdk'
import { PiDriver } from '@hbar/pi-driver'
import { estimateContextTokens } from '../packages/kernel/src/context-usage'
import { compactionBoundary, nextSummaryChunk, summaryDocument } from '../packages/kernel/src/context-compaction'
import { providerSchema, HbarError } from '@hbar/contracts'
import type { Message } from '@hbar/contracts'

const resources: { root: string; kernel: Kernel }[] = []
afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    const owned = await realpath(root)
    if (dirname(owned) !== (await realpath(tmpdir())) || !basename(owned).startsWith('hbar-context-overflow-'))
      throw new Error('Refusing to remove non-owned context fixture')
    await rm(owned, { recursive: true, force: true })
  }
})

async function fixture(run: HarnessDriver['run'], summarizeOverride?: HarnessDriver['summarize']) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-context-overflow-'))
  const summaries: ModelRequest[] = []
  const pi = new PiDriver()
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Bounded context fixture',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      description: 'Exercise real Host context admission and local Pi summaries',
      provides: { driver: '1.0.0' },
      permissions: [],
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        supportsCanonicalSteering: true,
        supportsSteeringAdmissionClosure: true,
        run,
        async summarize(request, key, signal) {
          summaries.push(request)
          expect(estimateContextTokens(request) + request.model.maxOutput).toBeLessThanOrEqual(
            request.model.contextWindow,
          )
          return summarizeOverride ? summarizeOverride(request, key, signal) : pi.summarize(request, key, signal)
        },
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
  resources.push({ root, kernel })
  await kernel.changePlugin('budget.codex', true, { autoContinue: false })
  await kernel.saveProvider({
    id: 'context-overflow',
    name: 'Context overflow fixture',
    protocol: 'mock',
    model: 'context-overflow',
    baseUrl: 'http://localhost',
    contextWindow: 4096,
    maxOutput: 1024,
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id)
  return { kernel, session, summaries }
}

async function toolPair(input: DriverInput, index: number, size: number) {
  const callId = `call-${index}`
  await input.commit('assistant', [{ type: 'tool_call', callId, name: 'read', args: { path: 'fixture.txt' } }])
  await input.commit('tool', [
    { type: 'tool_result', callId, name: 'read', text: `Result ${index}: ${'x'.repeat(size)}`, isError: false },
  ])
}

test('a single long Run compacts completed tool groups before the next request without waiting for another user turn', async () => {
  const requests: ModelRequest[] = []
  const { kernel, session, summaries } = await fixture(async (input) => {
    requests.push(await input.beforeRequest(input.request, 'first'))
    for (let index = 0; index < 5; index++) await toolPair(input, index, 3000)
    requests.push(await input.beforeRequest(input.request, 'after-tools'))
    await input.commit('assistant', [{ type: 'text', text: 'Continued after compaction.' }])
  })
  const run = await kernel.submit(
    session.id,
    'long-run',
    { text: 'Review these files and preserve the objective.', images: [] },
    'context-overflow',
  )
  await kernel.waitForIdle()
  expect((await kernel.storage.call('run', run.id)).status).toBe('completed')
  expect(summaries.length).toBeGreaterThan(0)
  expect(requests).toHaveLength(2)
  expect(estimateContextTokens(requests[1]!) + requests[1]!.model.maxOutput).toBeLessThanOrEqual(4096)
  expect((await kernel.storage.call('events', session.id, 0)).some((event) => event.type === 'context.compacted')).toBe(
    true,
  )
  expect((await kernel.snapshot(session.id)).messages).toHaveLength(12)
})

test('a persisted oversized conversation is summarized in bounded requests and preserves all canonical messages', async () => {
  const { kernel, session, summaries } = await fixture(async () => {})
  for (let index = 0; index < 18; index++)
    await kernel.storage.call('commit', session.id, 'seed', index % 2 === 0 ? 'user' : 'assistant', [
      { type: 'text', text: `History ${index} ${'z'.repeat(3500)}` },
    ])
  const before = await kernel.getContextUsage(session.id, 'context-overflow')
  expect(before.inputTokens).toBeGreaterThan(4096)
  await kernel.compact(session.id, 'context-overflow')
  const after = await kernel.getContextUsage(session.id, 'context-overflow')
  expect(summaries.length).toBeGreaterThan(1)
  expect(after.inputTokens! + after.outputReserve!).toBeLessThanOrEqual(4096)
  expect((await kernel.snapshot(session.id)).messages).toHaveLength(18)
})

test('a single oversized new user input is rejected locally rather than being sent over capacity', async () => {
  const sent: ModelRequest[] = []
  const { kernel, session, summaries } = await fixture(async (input) => {
    sent.push(await input.beforeRequest(input.request, 'oversized-input'))
  })
  const run = await kernel.submit(
    session.id,
    'oversized-input',
    { text: 'x'.repeat(30_000), images: [] },
    'context-overflow',
  )
  await kernel.waitForIdle()
  expect((await kernel.storage.call('run', run.id)).failure?.code).toBe('CONTEXT_WINDOW_EXCEEDED')
  expect(sent).toHaveLength(0)
  expect(summaries).toHaveLength(0)
  expect((await kernel.storage.call('events', session.id, 0)).some((event) => event.type === 'request.started')).toBe(
    false,
  )
})

test('a single oversized completed tool result can be summarized while its raw output survives', async () => {
  const requests: ModelRequest[] = []
  const { kernel, session, summaries } = await fixture(async (input) => {
    await toolPair(input, 0, 45_000)
    requests.push(await input.beforeRequest(input.request, 'large-result'))
  })
  const run = await kernel.submit(
    session.id,
    'large-result',
    { text: 'Inspect the file.', images: [] },
    'context-overflow',
  )
  await kernel.waitForIdle()
  expect((await kernel.storage.call('run', run.id)).status).toBe('completed')
  expect(summaries.length).toBeGreaterThan(1)
  expect(requests[0]?.messages[0]?.role).toBe('user')
  expect((await kernel.snapshot(session.id)).messages[2]?.content[0]).toMatchObject({
    type: 'tool_result',
    text: `Result 0: ${'x'.repeat(45_000)}`,
  })
})

test('rechecks capacity after request hooks and compacts before admitting the provider request', async () => {
  const requests: ModelRequest[] = []
  const { kernel, session, summaries } = await fixture(async (input) => {
    requests.push(await input.beforeRequest(input.request, 'hooked-capacity'))
  })
  for (let index = 0; index < 5; index++)
    await kernel.storage.call('commit', session.id, 'seed', index % 2 ? 'assistant' : 'user', [
      { type: 'text', text: `History ${index} ${'h'.repeat(2600)}` },
    ])
  kernel.hooks.on('model.request', (request) => ({
    ...request,
    system: `${request.system}\n${'hook-instruction '.repeat(300)}`,
  }))
  const run = await kernel.submit(session.id, 'hooked-capacity', { text: 'Continue.', images: [] }, 'context-overflow')
  await kernel.waitForIdle()
  expect((await kernel.storage.call('run', run.id)).status).toBe('completed')
  expect(summaries.length).toBeGreaterThan(0)
  expect(requests).toHaveLength(1)
  expect(estimateContextTokens(requests[0]!) + requests[0]!.model.maxOutput).toBeLessThanOrEqual(4096)
})

test.each(['failure', 'cancellation'] as const)(
  'partial summary %s does not publish a compaction or discard history',
  async (outcome) => {
    let attempts = 0
    const controller = new AbortController()
    const { kernel, session } = await fixture(
      async () => {},
      async (_request, _key, signal) => {
        attempts++
        if (attempts === 2) {
          if (outcome === 'cancellation') {
            controller.abort(new HbarError('USER_CANCELLED', 'Fixture cancelled'))
            signal.throwIfAborted()
          }
          throw new HbarError('COMPACTION_FAILED', 'Fixture summary failed')
        }
        return { text: 'Partial summary.', usage: { input: 10, output: 10, cacheRead: 0, cacheWrite: 0, cost: 0 } }
      },
    )
    for (let index = 0; index < 12; index++)
      await kernel.storage.call('commit', session.id, 'seed', index % 2 ? 'assistant' : 'user', [
        { type: 'text', text: 'x'.repeat(3500) },
      ])
    const before = await kernel.storage.call('context', session.id)
    const error = await kernel.compact(session.id, 'context-overflow', controller.signal).then(
      () => null,
      (cause: unknown) => cause,
    )
    expect(error).toBeInstanceOf(HbarError)
    expect(attempts).toBe(2)
    expect(await kernel.storage.call('context', session.id)).toEqual(before)
    expect(
      (await kernel.storage.call('events', session.id, 0)).some((event) => event.type === 'context.compacted'),
    ).toBe(false)
  },
)

test('an oversized provider summary cannot replace valid canonical context', async () => {
  const { kernel, session } = await fixture(
    async () => {},
    async () => ({ text: 'x'.repeat(30_000), usage: { input: 10, output: 10, cacheRead: 0, cacheWrite: 0, cost: 0 } }),
  )
  await kernel.storage.call('commit', session.id, 'seed', 'user', [{ type: 'text', text: 'Initial task' }])
  await kernel.storage.call('commit', session.id, 'seed', 'assistant', [{ type: 'text', text: 'Completed work' }])
  const before = await kernel.storage.call('context', session.id)
  const error = await kernel.compact(session.id, 'context-overflow').then(
    () => null,
    (cause: unknown) => cause,
  )
  expect(error).toMatchObject({ code: 'COMPACTION_FAILED' })
  expect(await kernel.storage.call('context', session.id)).toEqual(before)
})

function boundaryRequest(messages: Message[]): ModelRequest {
  return {
    system: 'System instructions',
    messages,
    model: providerSchema.parse({
      id: 'plan',
      name: 'Plan',
      protocol: 'mock',
      model: 'plan',
      baseUrl: 'http://localhost',
      contextWindow: 4096,
      maxOutput: 1024,
    }),
  }
}
function planMessage(id: string, seq: number, role: Message['role'], content: Message['content']): Message {
  return { id, seq, role, content, runId: 'run', sessionId: 'session', createdAt: seq }
}

test('cuts completed parallel tool groups together, protects unfinished calls and undelivered guidance', () => {
  const initial = planMessage('initial', 1, 'user', [{ type: 'text', text: 'Task' }])
  const assistant = planMessage(
    'calls',
    2,
    'assistant',
    ['one', 'two'].map((callId) => ({ type: 'tool_call' as const, callId, name: 'read', args: {} })),
  )
  const tool = (callId: string, seq: number) =>
    planMessage(callId, seq, 'tool', [
      { type: 'tool_result', callId, name: 'read', text: 'x'.repeat(4000), isError: false },
    ])
  const first = tool('one', 3)
  const second = tool('two', 4)
  expect(compactionBoundary(boundaryRequest([initial, assistant, first]), 8, 80)).toBe(0)
  expect(compactionBoundary(boundaryRequest([initial, assistant, first, second]), 8, 80)).toBe(4)
  const guide = planMessage('guide', 5, 'user', [{ type: 'text', text: 'Undelivered guide' }])
  const later = planMessage('later', 6, 'assistant', [{ type: 'text', text: 'New work' }])
  const request = boundaryRequest([initial, assistant, first, second, guide, later])
  expect(compactionBoundary(request, 8, 80, { runId: 'run', initialUserMessageId: initial.id, deliveries: [] })).toBe(4)
  expect(
    compactionBoundary(request, 8, 80, {
      runId: 'run',
      initialUserMessageId: initial.id,
      deliveries: [{ message: guide, insertionAfterSeq: 6 }],
    }),
  ).toBeLessThanOrEqual(4)
})

test('chunks cover escaped and Unicode history exactly and stay within the input plus output capacity', () => {
  const request = boundaryRequest([
    planMessage('document', 1, 'user', [{ type: 'text', text: '路径 😀\n"quoted"\\file'.repeat(1800) }]),
  ])
  const document = summaryDocument(request)
  let offset = 0
  let covered = ''
  while (offset < document.length) {
    const next = nextSummaryChunk(request, document, offset, 'Previous summary')
    expect(estimateContextTokens(next.request) + next.request.model.maxOutput).toBeLessThanOrEqual(4096)
    const block = next.request.messages[0]!.content[0]!
    if (block.type !== 'text') throw new Error('Expected text document')
    covered += block.text.split('\n\nNext history chunk:\n')[1]
    expect(next.nextOffset).toBeGreaterThan(offset)
    offset = next.nextOffset
  }
  expect(covered).toBe(document)
})
