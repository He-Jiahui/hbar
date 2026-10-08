import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { HbarError, providerSchema } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { PiDriver } from '@hbar/pi-driver'
import type { GoalService, ModelRegistry } from '@hbar/plugin-sdk'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

const requestSchema = z.object({ input: z.array(z.unknown()) })
function event(type: string, data: Record<string, unknown>) {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
}
function toolResponse(name: string, args: Record<string, unknown>, callId: string) {
  const item = { id: `fc_${callId}`, type: 'function_call', name, arguments: JSON.stringify(args), call_id: callId }
  return new Response(
    event('response.created', { response: { id: 'resp_fixture', status: 'in_progress' } }) +
      event('response.output_item.added', { output_index: 0, item: { ...item, arguments: '' } }) +
      event('response.function_call_arguments.delta', { output_index: 0, delta: item.arguments }) +
      event('response.output_item.done', { output_index: 0, item }) +
      event('response.completed', {
        response: {
          id: 'resp_fixture',
          status: 'completed',
          output: [item],
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        },
      }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  )
}
function interruptedResponse(malformed: boolean) {
  return new Response(
    event('response.created', { response: { id: 'resp_broken', status: 'in_progress' } }) +
      event('response.output_item.added', {
        output_index: 0,
        item: { id: 'fc_unfinished', type: 'function_call', name: 'write_file', arguments: '', call_id: 'unfinished' },
      }) +
      event('response.function_call_arguments.delta', {
        output_index: 0,
        delta: JSON.stringify({ path: 'unfinished.txt', text: 'Do not execute incomplete output' }),
      }) +
      (malformed
        ? 'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"id":"fc_broken:\n\n'
        : ''),
    { headers: { 'Content-Type': 'text/event-stream' } },
  )
}

async function fixture(response: (index: number) => Response) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-stream-recovery-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const requests: z.infer<typeof requestSchema>[] = []
  const serve = (port: number) =>
    Bun.serve({
      hostname: '127.0.0.1',
      port,
      async fetch(request) {
        expect(new URL(request.url).pathname).toBe('/v1/responses')
        requests.push(requestSchema.parse(await request.json()))
        return response(requests.length)
      },
    })
  let server = serve(0)
  const port = server.port
  if (port === undefined) throw new Error('Fixture provider missing port')
  cleanups.push(async () => {
    await server.stop(true)
  })
  const kernel = await Kernel.create({ home: join(root, 'data'), workspace: root, secrets: new MemorySecrets() })
  cleanups.push(() => kernel.close())
  await kernel.changePlugin('goal.codex', true, { retryDelayMs: 20 })
  await kernel.saveProvider(
    providerSchema.parse({
      id: 'responses-recovery',
      name: 'Responses recovery fixture',
      protocol: 'openai-responses',
      model: 'fixture-network',
      baseUrl: `http://127.0.0.1:${port}/v1`,
    }),
    'fixture-only',
  )
  await kernel.setPermissionMode('allow')
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Fixture workspace missing')
  const session = await kernel.createSession(workspace.id)
  const goals = kernel.plugins.get<GoalService>('goal')
  await goals.create(session.id, 'Finish the task after safely recovering model transport', 10_000)
  return {
    root,
    kernel,
    session,
    requests,
    goals,
    stopProvider: () => server.stop(true),
    restartProvider: () => {
      server = serve(port)
    },
    async run() {
      await kernel.submit(session.id, 'work', { text: 'Complete the task.', images: [] }, 'responses-recovery')
      await kernel.waitForIdle()
      const snapshot = await kernel.snapshot(session.id)
      return { ...snapshot, runs: [...snapshot.runs].sort((a, b) => a.createdAt - b.createdAt) }
    },
  }
}

for (const malformed of [true, false])
  test(`${malformed ? 'malformed JSON' : 'missing terminal event'} resumes from settled writes and never executes partial tools`, async () => {
    const f = await fixture((index) =>
      index === 1
        ? toolResponse('write_file', { path: 'proof.txt', text: 'Saved once' }, 'proof')
        : index === 2
          ? interruptedResponse(malformed)
          : toolResponse('update_goal', { status: 'complete' }, 'complete'),
    )
    const writes: string[] = []
    f.kernel.hooks.on('tool.settled', (value) => {
      if (value.name === 'write_file') writes.push(value.context.callId)
    })
    const snapshot = await f.run()
    expect(snapshot.runs.map((run) => run.status)).toEqual(['failed', 'completed'])
    expect(snapshot.runs[0]?.failure).toEqual({
      code: 'PROVIDER_STREAM_INTERRUPTED',
      category: 'transient',
      retryable: true,
    })
    expect(f.requests).toHaveLength(3)
    expect(writes).toHaveLength(1)
    expect(writes[0]).toContain('proof')
    expect(await readFile(join(f.root, 'proof.txt'), 'utf8')).toBe('Saved once')
    expect(await Bun.file(join(f.root, 'unfinished.txt')).exists()).toBe(false)
    expect(JSON.stringify(f.requests[2])).toContain('function_call_output')
    expect(JSON.stringify(f.requests[2])).not.toContain('unfinished')
    expect((await f.goals.get(f.session.id)).goal?.status).toBe('complete')
  })

test('persistent malformed provider output exhausts the existing retry bound', async () => {
  const f = await fixture(() => interruptedResponse(true))
  const snapshot = await f.run()
  expect(f.requests).toHaveLength(3)
  expect(snapshot.runs).toHaveLength(3)
  expect(snapshot.runs.every((run) => run.failure?.code === 'PROVIDER_STREAM_INTERRUPTED')).toBe(true)
  expect((await f.goals.get(f.session.id)).goal?.continuation).toMatchObject({
    phase: 'stopped',
    reason: 'retry_exhausted',
  })
  expect(await Bun.file(join(f.root, 'unfinished.txt')).exists()).toBe(false)
})

for (const malformed of [true, false])
  test(`compaction retains the provider ${malformed ? 'malformed JSON' : 'missing terminal'} failure code for the owning Run`, async () => {
    const f = await fixture(() => interruptedResponse(malformed))
    const model = await f.kernel.plugins.get<ModelRegistry>('models').get('responses-recovery')
    const failure = await new PiDriver()
      .summarize(
        { system: 'Summarize the conversation.', messages: [], model },
        'fixture-only',
        new AbortController().signal,
      )
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(HbarError)
    expect(failure).toMatchObject({ code: 'PROVIDER_STREAM_INTERRUPTED' })
    expect(f.requests).toHaveLength(1)
  })

test('an SDK Connection error resumes after the local provider becomes available', async () => {
  const f = await fixture(() => toolResponse('update_goal', { status: 'complete' }, 'connected'))
  await f.stopProvider()
  f.kernel.hooks.on('run.end', (value) => {
    if (value.run.failure?.code === 'PROVIDER_CONNECTION_FAILED') f.restartProvider()
  })
  const snapshot = await f.run()
  expect(snapshot.runs.map((run) => run.status)).toEqual(['failed', 'completed'])
  expect(snapshot.runs[0]?.failure).toEqual({
    code: 'PROVIDER_CONNECTION_FAILED',
    category: 'transient',
    retryable: true,
  })
  expect(f.requests).toHaveLength(1)
  expect((await f.goals.get(f.session.id)).goal?.status).toBe('complete')
})

for (const message of [
  'JSON Parse error: Unterminated string',
  'Error reading response: malformed server-sent event JSON.',
  'Connection error.',
])
  test(`a Host context failure containing ${message} remains permanent and cannot start provider retries`, async () => {
    const f = await fixture(() => toolResponse('update_goal', { status: 'complete' }, 'unused'))
    f.kernel.hooks.on('model.request', () => {
      throw new HbarError('STORAGE_FAILURE', message)
    })
    const snapshot = await f.run()
    expect(snapshot.runs).toHaveLength(1)
    expect(snapshot.runs[0]?.failure).toEqual({ code: 'STORAGE_FAILURE', category: 'execution', retryable: false })
    expect(f.requests).toHaveLength(0)
    expect((await f.goals.get(f.session.id)).goal?.continuation).toMatchObject({
      phase: 'stopped',
      reason: 'run_failed',
    })
  })
