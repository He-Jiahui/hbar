import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { HbarError, providerSchema } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { LocalExecution } from '@hbar/local-tools'
import { definePlugin, describeToolTimeout, provide, resolveToolTimeoutMs } from '@hbar/plugin-sdk'
import type { DriverInput, HarnessDriver, ToolContext, ToolDefinition, ToolResult } from '@hbar/plugin-sdk'
import { Tools } from '../packages/kernel/src/plugins'
import { ToolExecutions, ToolTimeoutError } from '../packages/kernel/src/tool-timeout'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

function deferred<Result>() {
  let resolve!: (result: Result) => void
  const promise = new Promise<Result>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

test('tool deadlines are validated and cannot be changed through a registered declaration', () => {
  const tools = new Tools()
  const tool: ToolDefinition = {
    name: 'probe',
    description: 'Probe',
    inputSchema: z.object({}),
    effect: 'read',
    execute: async () => ({ text: 'ok' }),
  }
  for (const timeoutMs of [0, -1, NaN, Infinity, 1.5, 2_147_483_648])
    expect(() => tools.register({ ...tool, timeoutMs })).toThrow('Tool timeout')
  tools.register({ ...tool, timeoutMs: 1_000, timeoutArgument: 'timeout_ms' })
  const registered = tools.get('probe')
  if (!registered) throw new Error('Missing tool')
  expect(Reflect.set(registered, 'timeoutMs', 0)).toBe(false)
  expect(resolveToolTimeoutMs(registered, { timeout_ms: 100 })).toBe(100)
  for (const value of [0, 1_001, '100', 1.1])
    expect(() => resolveToolTimeoutMs(registered, { timeout_ms: value })).toThrow('Tool timeout')
  expect(describeToolTimeout(registered)).toContain('1000 ms')
})

test('timeout aborts only the tool and retains bounded capacity until an ignored abort settles', async () => {
  const executions = new ToolExecutions(1)
  const pending = deferred<ToolResult>()
  const controller = new AbortController()
  await expect(
    executions.run('session:probe', 'probe', 'call', controller, 20, () => pending.promise),
  ).rejects.toBeInstanceOf(ToolTimeoutError)
  expect(controller.signal.reason).toMatchObject({ code: 'TOOL_TIMEOUT', timeoutMs: 20 })
  expect(() => executions.assertAvailable('session:probe', 'probe')).toThrow('unsettled execution')
  expect(() => executions.assertAvailable('other:probe', 'probe')).toThrow('capacity')
  pending.resolve({ text: 'late' })
  await Bun.sleep(0)
  expect(
    await executions.run('session:probe', 'probe', 'next', new AbortController(), 100, async () => ({ text: 'next' })),
  ).toEqual({ text: 'next' })
  executions.dispose()
})

test('Host cancellation and shutdown retain their own cause', async () => {
  for (const source of ['user', 'shutdown'] as const) {
    const executions = new ToolExecutions()
    const controller = new AbortController()
    const pending = deferred<ToolResult>()
    const run = executions.run('session:probe', 'probe', 'call', controller, 1_000, () => pending.promise)
    await Bun.sleep(0)
    const reason = new HbarError('USER_CANCELLED', 'Cancelled by user')
    if (source === 'user') controller.abort(reason)
    else executions.dispose()
    await expect(run).rejects.toMatchObject({ code: source === 'user' ? 'USER_CANCELLED' : 'HOST_SHUTTING_DOWN' })
    pending.resolve({ text: 'late' })
    executions.dispose()
  }
})

test('physical settlement callbacks survive logical timeouts and release pre-admission cancellation exactly once', async () => {
  const executions = new ToolExecutions(1)
  const pending = deferred<ToolResult>()
  let released = 0
  await expect(executions.run('session:physical', 'physical', 'first', new AbortController(), 10,
    () => pending.promise, async () => { released++ })).rejects.toBeInstanceOf(ToolTimeoutError)
  expect(released).toBe(0)
  expect(() => executions.assertAvailable('other', 'other')).toThrow('capacity')
  pending.resolve({ text: 'settled after timeout' })
  await Bun.sleep(0)
  expect(released).toBe(1)
  const cancelled = new AbortController()
  cancelled.abort(new HbarError('USER_CANCELLED', 'Cancelled before physical admission'))
  await expect(executions.run('other', 'other', 'cancelled', cancelled, 100,
    async () => { throw new Error('Must not execute') }, async () => { released++ })).rejects.toMatchObject({ code: 'USER_CANCELLED' })
  expect(released).toBe(2)
  executions.dispose()
})

async function fixture(script?: (input: DriverInput) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-tool-timeout-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const driver = script
    ? definePlugin({
        manifest: {
          id: 'driver.pi',
          name: 'Timeout fixture',
          description: 'Test tool settlement',
          version: '1.0.0',
          apiVersion: '^1.0.0',
          scope: 'host',
          permissions: [],
          provides: { driver: '1.0.0' },
        },
        apply(ctx) {
          provide<HarnessDriver>(ctx, 'driver', {
            run: script,
            summarize: async () => ({ text: '', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 } }),
          })
        },
      })
    : undefined
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    runIdleTimeoutMs: 600,
    ...(driver ? { profile: { replacements: { 'driver.pi': driver } } } : {}),
  })
  cleanups.push(() => kernel.close())
  await kernel.setPermissionMode('allow')
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Missing workspace')
  const session = await kernel.createSession(workspace.id)
  return {
    root,
    kernel,
    session,
    async submit(model = 'local-fixture') {
      const run = await kernel.submit(
        session.id,
        crypto.randomUUID(),
        { text: 'Continue after a tool timeout', images: [] },
        model,
      )
      await kernel.waitForIdle()
      return kernel.storage.call('run', run.id)
    },
  }
}

function waitForAbort(context: ToolContext): Promise<ToolResult> {
  return new Promise((_resolve, reject) => {
    if (context.signal.aborted) reject(context.signal.reason)
    else context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true })
  })
}

test('a tool timeout longer than Run idle timeout returns an error and the same Run continues', async () => {
  let toolAborted = false
  const f = await fixture(async (input) => {
    const result = await input.execute('slow_probe', {}, 'slow')
    expect(result).toMatchObject({ isError: true, details: { code: 'TOOL_TIMEOUT', timeoutMs: 800 } })
    expect(input.signal.aborted).toBe(false)
    expect((await input.execute('get_goal', {}, 'next')).isError).not.toBe(true)
    await input.commit('assistant', [{ type: 'text', text: 'Continued in the same Run' }])
  })
  f.kernel.tools.register({
    name: 'slow_probe',
    description: 'Wait for cancellation',
    inputSchema: z.object({}),
    effect: 'read',
    timeoutMs: 800,
    execute: async (_args, context) => {
      try {
        return await waitForAbort(context)
      } finally {
        toolAborted = context.signal.aborted
      }
    },
  })
  expect(await f.submit()).toMatchObject({ status: 'completed' })
  expect(toolAborted).toBe(true)
  const snapshot = await f.kernel.snapshot(f.session.id)
  const result = snapshot.messages
    .flatMap((message) => message.content)
    .find((block) => block.type === 'tool_result' && block.callId === 'slow')
  expect(result).toMatchObject({
    isError: true,
    details: { timeoutMs: 800 },
    outcome: { kind: 'failed', executionStarted: true },
  })
  expect(
    snapshot.messages.flatMap((message) => message.content).filter((block) => block.type === 'tool_result'),
  ).toHaveLength(2)
  expect(
    (await f.kernel.storage.call('events', f.session.id, 0)).filter((event) => event.type === 'tool.settled'),
  ).toHaveLength(2)
})

test('late writes cannot duplicate results or be repeated while their original execution is unsettled', async () => {
  const pending = deferred<ToolResult>()
  let executions = 0
  const f = await fixture(async (input) => {
    const first = await input.execute('uncooperative_probe', {}, 'first')
    expect(first.isError).toBe(true)
    const again = await input.execute('uncooperative_probe', {}, 'again')
    expect(again.hostFailure).toEqual({ code: 'TOOL_STILL_RUNNING', executionStarted: false })
    expect(input.signal.aborted).toBe(false)
    await input.commit('assistant', [{ type: 'text', text: 'Inspect the previous write before retrying' }])
  })
  f.kernel.tools.register({
    name: 'uncooperative_probe',
    description: 'Ignore abort',
    inputSchema: z.object({}),
    effect: 'write',
    timeoutMs: 40,
    execute: () => {
      executions++
      return pending.promise
    },
  })
  expect((await f.submit()).status).toBe('completed')
  const before = await f.kernel.snapshot(f.session.id)
  expect(
    before.messages
      .flatMap((message) => message.content)
      .find((block) => block.type === 'tool_result' && block.callId === 'first'),
  ).toMatchObject({ outcome: { kind: 'unknown' }, details: { resultUnknown: true, timeoutMs: 40 } })
  pending.resolve({ text: 'Late success must not replace timeout' })
  await Bun.sleep(10)
  expect((await f.kernel.snapshot(f.session.id)).messages).toEqual(before.messages)
  expect(executions).toBe(1)
})

test('parent timeout cancels a sequence child and leaves later calls undispatched', async () => {
  let skipped = 0
  const f = await fixture(async (input) => {
    expect((await input.execute('batch_probe', {}, 'parent')).hostFailure?.code).toBe('TOOL_TIMEOUT')
    expect(input.signal.aborted).toBe(false)
  })
  f.kernel.tools.register({
    name: 'batch_probe',
    description: 'Execute a bounded batch',
    inputSchema: z.object({}),
    effect: 'read',
    timeoutMs: 400,
    execute: async (_args, context) => ({
      text: JSON.stringify(
        await context.executeSequence?.([
          { name: 'child_probe', arguments: {} },
          { name: 'skipped_probe', arguments: {} },
        ]),
      ),
    }),
  })
  f.kernel.tools.register({
    name: 'child_probe',
    description: 'Wait on the parent signal',
    inputSchema: z.object({}),
    effect: 'read',
    timeoutMs: 1_000,
    execute: (_args, context) => waitForAbort(context),
  })
  f.kernel.tools.register({
    name: 'skipped_probe',
    description: 'Must not run',
    inputSchema: z.object({}),
    effect: 'write',
    execute: async () => {
      skipped++
      return { text: 'unexpected' }
    },
  })
  expect((await f.submit()).status).toBe('completed')
  expect(skipped).toBe(0)
  const parent = (await f.kernel.snapshot(f.session.id)).messages
    .flatMap((message) => message.content)
    .find((block) => block.type === 'tool_result' && block.callId === 'parent')
  expect(parent).toMatchObject({ batch: { running: 0, pending: 0, skipped: 1, unknown: 1 } })
})

test('the gateway applies a requested deadline after hooks and rejects invalid durations before execution', async () => {
  const durations: number[] = []
  const f = await fixture(async (input) => {
    expect((await input.execute('argument_probe', { timeout_ms: 100 }, 'first')).isError).not.toBe(true)
    expect((await input.execute('argument_probe', { timeout_ms: 0 }, 'invalid')).isError).toBe(true)
    expect((await input.execute('argument_probe', { timeout_ms: 1_001 }, 'excess')).isError).toBe(true)
  })
  f.kernel.tools.register({
    name: 'argument_probe',
    description: 'Select an execution duration',
    effect: 'read',
    inputSchema: z.object({ timeout_ms: z.number() }),
    timeoutMs: 1_000,
    timeoutArgument: 'timeout_ms',
    execute: async (_args, context) => {
      if (context.timeoutMs === undefined) throw new Error('Missing Host deadline')
      durations.push(context.timeoutMs)
      return { text: 'ok' }
    },
  })
  f.kernel.hooks.on('tool.before', (event) => {
    if (event.name === 'argument_probe' && event.args.timeout_ms === 100) {
      event.args.timeout_ms = 200
      event.context.timeoutMs = 9_999
    }
  })
  expect((await f.submit()).status).toBe('completed')
  expect(durations).toEqual([200])
})

function event(type: string, data: Record<string, unknown>) {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
}

test('real Pi receives a timeout as function output and makes the next model request in the same Run', async () => {
  const schema = z.object({
    input: z.array(z.unknown()),
    tools: z.array(z.object({ name: z.string(), description: z.string().optional() })).optional(),
  })
  const requests: z.infer<typeof schema>[] = []
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      requests.push(schema.parse(await request.json()))
      const tool = requests.length === 1
      const item = tool
        ? { id: 'fc_slow', type: 'function_call', name: 'slow_probe', call_id: 'slow', arguments: '{}' }
        : {
            id: 'msg_done',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'The tool timed out; continuing safely.', annotations: [] }],
          }
      return new Response(
        event('response.created', { response: { id: 'resp_fixture', status: 'in_progress' } }) +
          event('response.output_item.added', {
            output_index: 0,
            item: tool ? { ...item, arguments: '' } : { ...item, content: [] },
          }) +
          (tool
            ? event('response.function_call_arguments.delta', { output_index: 0, delta: '{}' })
            : event('response.content_part.added', {
                output_index: 0,
                content_index: 0,
                part: { type: 'output_text', text: '', annotations: [] },
              }) +
              event('response.output_text.delta', {
                output_index: 0,
                content_index: 0,
                delta: 'The tool timed out; continuing safely.',
              })) +
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
    },
  })
  cleanups.push(async () => {
    await server.stop(true)
  })
  const f = await fixture()
  f.kernel.tools.register({
    name: 'slow_probe',
    description: 'A slow operation',
    inputSchema: z.object({}),
    effect: 'read',
    timeoutMs: 800,
    execute: (_args, context) => waitForAbort(context),
  })
  await f.kernel.saveProvider(
    providerSchema.parse({
      id: 'timeout-provider',
      name: 'Local timeout fixture',
      protocol: 'openai-responses',
      model: 'fixture-network',
      baseUrl: `http://127.0.0.1:${server.port}/v1`,
    }),
    'fixture-only',
  )
  const run = await f.submit('timeout-provider')
  expect(run.status).toBe('completed')
  expect(run.failure).toBeUndefined()
  expect(requests).toHaveLength(2)
  expect(requests[0]?.tools?.find((tool) => tool.name === 'slow_probe')?.description).toContain('800 ms')
  expect(JSON.stringify(requests[1]?.input)).toContain('timed out after 800 milliseconds')
  const snapshot = await f.kernel.snapshot(f.session.id)
  expect(snapshot.runs).toHaveLength(1)
  expect(snapshot.messages.at(-1)?.role).toBe('assistant')
})

test('local shell timeout includes its deadline and kills the process before a delayed write', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-shell-timeout-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const execution = new LocalExecution()
  cleanups.push(async () => {
    execution.dispose()
  })
  const marker = join(root, 'late.txt')
  const command =
    process.platform === 'win32'
      ? `Start-Sleep -Seconds 2; Set-Content -LiteralPath '${marker.replaceAll("'", "''")}' -Value 'late'`
      : `sleep 2; printf late > '${marker.replaceAll("'", "'\\''")}'`
  const result = await execution.exec(root, command, new AbortController().signal, { timeoutMs: 200 })
  expect(result).toMatchObject({ isError: true, details: { code: 'TOOL_TIMEOUT', timeoutMs: 200 } })
  expect(result.text).toContain('200 milliseconds')
  await Bun.sleep(2_100)
  expect(await Bun.file(marker).exists()).toBe(false)
})
