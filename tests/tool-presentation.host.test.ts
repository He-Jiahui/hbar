import { afterEach, expect, test } from 'bun:test'
import { lstat, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { z } from 'zod'
import { emptyUsage, providerSchema, HbarError, type ContentBlock, type SessionEvent } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide, type DriverInput, type HarnessDriver, type ToolDefinition } from '@hbar/plugin-sdk'
import { PiDriver } from '@hbar/pi-driver'

const resources: { root: string; kernel: Kernel }[] = []
afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    const info = await lstat(root)
    const exact = await realpath(root)
    if (
      info.isSymbolicLink() ||
      !info.isDirectory() ||
      exact !== resolve(root) ||
      dirname(exact) !== (await realpath(tmpdir())) ||
      !basename(exact).startsWith('hbar-tool-presentation-')
    )
      throw new Error('Refusing cleanup outside this owned tool-presentation fixture')
    await rm(exact, { recursive: true })
  }
})

async function fixture(script?: (input: DriverInput) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'hbar-tool-presentation-')))
  const driver = script
    ? definePlugin({
        manifest: {
          id: 'driver.pi',
          name: 'Presentation fixture driver',
          description: 'No network fixture',
          permissions: [],
          version: '1.0.0',
          apiVersion: '^1.0.0',
          scope: 'host',
          provides: { driver: '1.0.0' },
        },
        apply(ctx) {
          provide<HarnessDriver>(ctx, 'driver', {
            run: script,
            summarize: async () => ({ text: 'unused', usage: emptyUsage() }),
          })
        },
      })
    : undefined
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    ...(driver ? { profile: { replacements: { 'driver.pi': driver } } } : {}),
  })
  resources.push({ root, kernel })
  await kernel.changePlugin('goal.codex', true, { autoContinue: false })
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Owned fixture workspace missing')
  const session = await kernel.createSession(workspace.id)
  return { root, kernel, session }
}

test('actual local Pi Run persists requested file semantics through the common Host commit seam', async () => {
  const f = await fixture()
  await writeFile(join(f.root, 'actual.txt'), 'Read this owned file only.')
  f.kernel.hooks.on('tool.before', (event) =>
    event.name === 'read_file' ? { ...event, args: { ...event.args, path: 'actual.txt' } } : event,
  )
  const run = await f.kernel.submit(
    f.session.id,
    crypto.randomUUID(),
    {
      text: '/tool read_file {"path":"requested.txt"}',
      images: [],
      approval: 'ask',
    },
    'local-fixture',
  )
  await f.kernel.waitForIdle()
  const snapshot = await f.kernel.snapshot(f.session.id)
  expect(snapshot.runs[0]?.status).toBe('completed')
  const blocks = snapshot.messages.filter((message) => message.runId === run.id).flatMap((message) => message.content)
  const call = blocks.find((block) => block.type === 'tool_call')
  const assistant = snapshot.messages.find((message) => message.content.some((block) => block.type === 'tool_call'))
  expect(assistant?.providerData).toBeDefined()
  const providerPayload = JSON.stringify(assistant?.providerData)
  expect(providerPayload).not.toContain('presentation')
  expect(providerPayload).not.toContain('pathField')
  expect(call).toMatchObject({
    name: 'read_file',
    args: { path: 'requested.txt' },
    presentation: { version: 1, kind: 'file-read', pathField: 'path' },
  })
  expect(blocks.find((block) => block.type === 'tool_result')).toMatchObject({
    text: 'Read this owned file only.',
    outcome: { kind: 'succeeded' },
  })
  const names = ['read_file', 'write_file', 'edit_file', 'shell', 'search_text', 'find_files', 'list_directory']
  expect(names.map((name) => f.kernel.tools.get(name)?.presentation?.kind)).toEqual([
    'file-read',
    'file-write',
    'file-edit',
    'command',
    'text-search',
    'file-search',
    'directory-list',
  ])
  expect(f.kernel.tools.get('find_files')?.presentation).toEqual({
    kind: 'file-search',
    queryField: 'nameQuery',
    includeField: 'include',
    pathField: 'path',
  })
})

test('real Kernel strips forged calls in every role and captures actual registrations rather than selected spoof objects', async () => {
  let registered: ToolDefinition | undefined
  let dispose: (() => void | Promise<void>) | undefined
  const args = {
    originalPath: 'exact-request.txt',
    path: 'different.txt',
    body: 'Full text retained',
    include: ['**/*.ts'],
  }
  const f = await fixture(async (input) => {
    if (!registered || !dispose) throw new Error('Fixture registration missing')
    // This happens after Run capture, before its first assistant commit.
    expect(Reflect.set(registered, 'presentation', { kind: 'file-write', pathField: 'path' })).toBe(false)
    await dispose()
    const call: Extract<ContentBlock, { type: 'tool_call' }> = {
      type: 'tool_call',
      callId: 'exact-call',
      name: 'custom_display',
      args,
      presentation: { version: 1, kind: 'command', commandField: 'body' },
    }
    for (const role of ['assistant', 'user', 'tool'] as const) await input.commit(role, [call])
    await input.commit('assistant', [
      { ...call, callId: 'plain-call', name: 'plain_display' },
      { ...call, callId: 'unknown-call', name: 'unknown_display' },
    ])
  })
  const definition: ToolDefinition = {
    name: 'custom_display',
    description: 'Owned declaration',
    effect: 'read',
    inputSchema: z.object({}),
    presentation: { kind: 'file-read', pathField: 'originalPath' },
    execute: async () => ({ text: 'not executed' }),
  }
  dispose = f.kernel.tools.register(definition)
  registered = f.kernel.tools.get(definition.name)
  f.kernel.tools.register({
    name: 'plain_display',
    description: 'No declaration',
    effect: 'read',
    inputSchema: z.object({}),
    execute: async () => ({ text: 'not executed' }),
  })
  f.kernel.hooks.on('tools.select', (event) => {
    const actual = event.tools.find((tool) => tool.name === 'custom_display')
    if (!actual) throw new Error('Actual registered fixture missing')
    expect(Reflect.set(actual, 'presentation', { kind: 'file-edit', pathField: 'path' })).toBe(false)
    return {
      ...event,
      tools: event.tools.map((tool) =>
        tool.name === 'custom_display' ? { ...tool, presentation: { kind: 'command', commandField: 'body' } } : tool,
      ),
    }
  })
  await f.kernel.submit(
    f.session.id,
    crypto.randomUUID(),
    { text: 'Commit requested input only', images: [] },
    'local-fixture',
  )
  await f.kernel.waitForIdle()
  const snapshot = await f.kernel.snapshot(f.session.id)
  expect(snapshot.runs[0]?.status).toBe('completed')
  const messages = snapshot.messages.filter((message) => message.content.some((block) => block.type === 'tool_call'))
  expect(messages).toHaveLength(4)
  for (const message of messages)
    for (const block of message.content) {
      if (block.type !== 'tool_call') continue
      expect(block.args).toEqual(args)
      expect(block.presentation).toEqual(
        message.role === 'assistant' && block.name === 'custom_display'
          ? { version: 1, kind: 'file-read', pathField: 'originalPath' }
          : undefined,
      )
    }
})

test('selection hooks cannot replace or delete declarations and contaminate a subsequent Run', async () => {
  const f = await fixture(async (input) => {
    await input.commit('assistant', [
      { type: 'tool_call', name: 'read_file', callId: crypto.randomUUID(), args: { path: 'requested.txt' } },
    ])
  })
  f.kernel.hooks.on('tools.select', (event) => {
    const tool = event.tools.find((item) => item.name === 'read_file')
    if (!tool) throw new Error('Expected registered read_file')
    expect(Reflect.set(tool, 'presentation', { kind: 'command', commandField: 'path' })).toBe(false)
    expect(Reflect.deleteProperty(tool, 'presentation')).toBe(false)
    return event
  })
  for (let index = 0; index < 2; index += 1) {
    await f.kernel.submit(
      f.session.id,
      crypto.randomUUID(),
      { text: 'Presentation-only driver fixture', images: [] },
      'local-fixture',
    )
    await f.kernel.waitForIdle()
  }
  const snapshot = await f.kernel.snapshot(f.session.id)
  expect(snapshot.runs).toHaveLength(2)
  expect(snapshot.runs.every((run) => run.status === 'completed')).toBe(true)
  const calls = snapshot.messages.flatMap((message) => message.content).filter((block) => block.type === 'tool_call')
  expect(calls).toHaveLength(2)
  expect(calls.map((call) => call.presentation)).toEqual([
    { version: 1, kind: 'file-read', pathField: 'path' },
    { version: 1, kind: 'file-read', pathField: 'path' },
  ])
})

test('a tool registered during selection uses its actual validated declaration, not the returned spoof', async () => {
  const f = await fixture(async (input) => {
    await input.commit('assistant', [
      { type: 'tool_call', name: 'selection_added', callId: 'added-call', args: { location: 'requested' } },
    ])
  })
  f.kernel.hooks.on('tools.select', (event) => {
    f.kernel.tools.register({
      name: 'selection_added',
      description: 'Dynamic fixture',
      inputSchema: z.object({}),
      effect: 'read',
      presentation: { kind: 'directory-list', pathField: 'location' },
      execute: async () => ({ text: 'not executed' }),
    })
    const actual = f.kernel.tools.get('selection_added')
    if (!actual) throw new Error('Dynamic fixture missing')
    return {
      ...event,
      tools: [...event.tools, { ...actual, presentation: { kind: 'command', commandField: 'location' } }],
    }
  })
  await f.kernel.submit(
    f.session.id,
    crypto.randomUUID(),
    { text: 'Capture selected dynamic tool', images: [] },
    'local-fixture',
  )
  await f.kernel.waitForIdle()
  const snapshot = await f.kernel.snapshot(f.session.id)
  expect(snapshot.runs[0]?.status).toBe('completed')
  expect(
    snapshot.messages.flatMap((message) => message.content).find((block) => block.type === 'tool_call'),
  ).toMatchObject({ presentation: { version: 1, kind: 'directory-list', pathField: 'location' } })
})

test('reserved driver emit cannot create a ghost message; ordinary events and canonical commit still work', async () => {
  const f = await fixture(async (input) => {
    let rejected: unknown
    try {
      await input.emit('message.committed', {
        id: 'ghost-message',
        role: 'assistant',
        content: [
          {
            type: 'tool_call',
            callId: 'ghost-call',
            name: 'read_file',
            args: { path: 'forged' },
            presentation: { version: 1, kind: 'command', commandField: 'path' },
          },
        ],
      })
    } catch (error) {
      rejected = error
    }
    expect(rejected).toBeInstanceOf(HbarError)
    if (!(rejected instanceof HbarError)) throw new Error('Expected canonical-event rejection')
    expect(rejected.code).toBe('RESERVED_EVENT')
    await input.emit('step.started', { id: 'ordinary-step' })
    await input.commit('assistant', [
      { type: 'tool_call', callId: 'real-call', name: 'read_file', args: { path: 'requested' } },
    ])
  })
  const events: SessionEvent[] = []
  const off = f.kernel.subscribe((notification) => {
    if (notification.method === 'session.event') events.push(notification.params)
  })
  try {
    await f.kernel.submit(
      f.session.id,
      crypto.randomUUID(),
      { text: 'Check canonical boundary', images: [] },
      'local-fixture',
    )
    await f.kernel.waitForIdle()
    const snapshot = await f.kernel.snapshot(f.session.id)
    expect(snapshot.runs[0]?.status).toBe('completed')
    const journal = await f.kernel.storage.call('events', f.session.id, 0)
    for (const source of [snapshot.messages, journal, events]) expect(JSON.stringify(source)).not.toContain('ghost-')
    expect(journal.some((event) => event.type === 'step.started')).toBe(true)
    expect(events.some((event) => event.type === 'step.started')).toBe(true)
    const call = snapshot.messages.flatMap((message) => message.content).find((block) => block.type === 'tool_call')
    expect(call).toMatchObject({
      callId: 'real-call',
      presentation: { version: 1, kind: 'file-read', pathField: 'path' },
    })
    expect(journal.filter((event) => event.type === 'message.committed')).toHaveLength(2)
    expect(events.filter((event) => event.type === 'message.committed')).toHaveLength(2)
  } finally {
    off()
  }
})

test('actual Pi provider transport omits persisted presentation metadata from outbound tool-call messages', async () => {
  const requests: unknown[] = []
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      requests.push(await request.json())
      const chunk = (delta: unknown, finish_reason: string | null) =>
        `data: ${JSON.stringify({ id: 'display', object: 'chat.completion.chunk', created: 1, model: 'fixture-network', choices: [{ index: 0, delta, finish_reason }] })}\n\n`
      return new Response(
        chunk({ role: 'assistant', content: 'Summary' }, null) + chunk({}, 'stop') + 'data: [DONE]\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
    },
  })
  try {
    const model = providerSchema.parse({
      id: 'local-summary',
      name: 'Local test adapter',
      protocol: 'openai-completions',
      baseUrl: `http://127.0.0.1:${server.port}/v1`,
      model: 'fixture-network',
    })
    const args = { path: 'requested.txt', extra: 'retained' }
    await new PiDriver().summarize(
      {
        system: 'Summarize locally',
        model,
        messages: [
          {
            id: 'message',
            sessionId: 'session',
            runId: 'run',
            seq: 1,
            createdAt: 1,
            role: 'assistant',
            content: [
              {
                type: 'tool_call',
                callId: 'call',
                name: 'read_file',
                args,
                presentation: { version: 1, kind: 'file-read', pathField: 'path' },
              },
            ],
          },
        ],
      },
      'test-only',
      AbortSignal.timeout(5_000),
    )
    expect(requests).toHaveLength(1)
    const wire = z
      .object({
        messages: z.array(
          z.object({
            role: z.string(),
            tool_calls: z
              .array(
                z.object({
                  id: z.string(),
                  type: z.string(),
                  function: z.object({ name: z.string(), arguments: z.string() }),
                }),
              )
              .optional(),
          }),
        ),
      })
      .parse(requests[0])
    expect(wire.messages.find((message) => message.role === 'assistant')?.tool_calls).toEqual([
      { id: 'call', type: 'function', function: { name: 'read_file', arguments: JSON.stringify(args) } },
    ])
    expect(JSON.stringify(requests[0])).not.toContain('presentation')
    expect(JSON.stringify(requests[0])).not.toContain('pathField')
  } finally {
    await server.stop(true)
  }
})
