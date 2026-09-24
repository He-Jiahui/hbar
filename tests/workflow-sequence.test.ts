import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { z } from 'zod'
import { providerSchema } from '@hbar/contracts'
import type { GoalService, PlanService, ToolContext, WorkflowService } from '@hbar/plugin-sdk'
import { auditProgress } from '../plugins/goal/src/continuation'

const resources: { root: string; kernel: Kernel }[] = []
afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-sequence-'))
  await writeFile(join(root, 'proof.txt'), 'initial')
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const resource = { root, kernel }
  resources.push(resource)
  await kernel.changePlugin('goal.codex', true, { autoContinue: false })
  await kernel.setPermissionMode('allow')
  const session = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id)
  const goals = kernel.plugins.get<GoalService>('goal')
  const plans = kernel.plugins.get<PlanService>('plan')
  const workflows = kernel.plugins.get<WorkflowService>('workflow')
  await goals.create(session.id, 'Produce verified proof without further user decisions')
  const plan = await plans.update(session.id, [{ step: 'Produce verified proof', status: 'in_progress' }])
  await workflows.focus(
    session.id,
    0,
    {
      id: 'proof',
      title: 'Produce verified proof',
      scope: { readPaths: ['proof.txt'], writePaths: ['proof.txt'], tools: ['read_file', 'write_file'] },
      acceptanceChecks: [
        {
          id: 'content',
          description: 'Correct proof',
          verifier: { kind: 'tool', toolName: 'read_file', result: { kind: 'textContains', value: 'verified proof' } },
        },
      ],
    },
    'agent',
    plan.revision,
  )
  const run = async (calls: { name: string; arguments: Record<string, unknown> }[]) => {
    await kernel.submit(
      session.id,
      crypto.randomUUID(),
      { text: `/tool workflow_execute ${JSON.stringify({ calls })}`, images: [] },
      'local-fixture',
    )
    await kernel.waitForIdle()
    return kernel.snapshot(session.id)
  }
  return { resource, root, kernel, session, goals, workflows, run }
}

const successfulCalls = [
  { name: 'write_file', arguments: { path: 'proof.txt', text: 'verified proof' } },
  { name: 'read_file', arguments: { path: 'proof.txt' } },
  {
    name: 'workflow_checkpoint',
    arguments: {
      itemId: 'proof',
      outcome: 'complete',
      summary: 'Host checked the proof',
      expectedFocusRevision: 1,
      expectedPlanRevision: 1,
    },
  },
  { name: 'update_goal', arguments: { status: 'complete' } },
]

const boundCheckpointCalls = successfulCalls.map((call) =>
  call.name === 'workflow_checkpoint'
    ? { name: call.name, arguments: { itemId: 'proof', outcome: 'complete', summary: 'Host checked the proof' } }
    : call,
)

test('scope-gated catalog tools stay denied until expansion and then regain standalone inspection', async () => {
  const { kernel, session, workflows, run } = await fixture()
  await run([{ name: 'list_directory', arguments: { path: '.' } }])
  const rejected = (await workflows.get(session.id)).workflow!
  expect(rejected.rejection?.toolName).toBe('list_directory')
  const journal = async () =>
    (await kernel.storage.call('events', session.id, 0))
      .filter((event) => event.type === 'request.started')
      .map(
        (event) =>
          z.object({ request: z.object({ system: z.string(), toolNames: z.array(z.string()) }) }).parse(event.data)
            .request,
      )
  const before = (await journal())[0]!
  expect(before.toolNames).not.toContain('list_directory')
  expect(before.system).toContain('list_directory(')
  expect(before.system).toContain('require explicit authorized scope expansion')
  const expanded = await run([
    {
      name: 'workflow_expand_scope',
      arguments: {
        itemId: 'proof',
        expectedRevision: rejected.revision,
        reason: 'Inspect the authorized temporary repository',
        scope: { readPaths: ['.'], writePaths: [], tools: ['list_directory'] },
      },
    },
    { name: 'list_directory', arguments: { path: '.' } },
  ])
  const latest = expanded.messages
    .flatMap((message) => message.content)
    .filter((block) => block.type === 'tool_result')
    .at(-1)
  expect(latest).toMatchObject({ isError: false })
  if (latest?.type !== 'tool_result') throw new Error('Missing sequence result')
  expect(latest.text).toContain('proof.txt')
  await kernel.submit(
    session.id,
    'inspect-new-scope',
    { text: '/tool list_directory {"path":"."}', images: [] },
    'local-fixture',
  )
  await kernel.waitForIdle()
  const after = (await journal()).at(-1)!
  expect(after.toolNames).toContain('list_directory')
  expect(after.system).not.toContain('list_directory(')
})

test('scope-expanded large reads keep the standalone escape hatch after bounded sequence output', async () => {
  const { kernel, root, session, workflows, run } = await fixture()
  const plan = await kernel.plugins.get<PlanService>('plan').get(session.id)
  if (!plan) throw new Error('Missing fixture plan')
  await writeFile(join(root, 'proof.txt'), 'large proof '.repeat(900))
  const focused = await workflows.focus(
    session.id,
    0,
    {
      id: 'proof',
      title: 'Produce verified proof',
      scope: { readPaths: [], writePaths: ['proof.txt'], tools: ['write_file'] },
      acceptanceChecks: [],
    },
    'agent',
    plan.revision,
  )
  const snapshot = await run([
    {
      name: 'workflow_expand_scope',
      arguments: {
        itemId: 'proof',
        expectedRevision: focused.workflow!.revision,
        reason: 'Read back the authorized proof',
        scope: { readPaths: ['proof.txt'], writePaths: [], tools: ['read_file'] },
      },
    },
    { name: 'read_file', arguments: { path: 'proof.txt' } },
  ])
  expect(
    snapshot.messages
      .flatMap((message) => message.content)
      .some((block) => block.type === 'tool_result' && block.text.includes('"truncated":true')),
  ).toBe(true)
  await kernel.submit(
    session.id,
    'full-read',
    { text: '/tool read_file {"path":"proof.txt"}', images: [] },
    'local-fixture',
  )
  await kernel.waitForIdle()
  const result = (await kernel.snapshot(session.id)).messages
    .flatMap((message) => message.content)
    .filter((block) => block.type === 'tool_result')
    .at(-1)
  if (result?.type !== 'tool_result') throw new Error('Missing full read result')
  expect(result.isError).toBe(false)
  expect(result.text.length).toBeGreaterThan(8000)
  const request = (await kernel.storage.call('events', session.id, 0))
    .filter((event) => event.type === 'request.started')
    .at(-1)
  expect(
    z.object({ request: z.object({ toolNames: z.array(z.string()) }) }).parse(request?.data).request.toolNames,
  ).toContain('read_file')
})

test('Host binds omitted checkpoint versions before scope expansion and bookkeeping', async () => {
  const { run, workflows, goals, session } = await fixture()
  const current = (await workflows.get(session.id)).workflow!
  await run([
    {
      name: 'workflow_expand_scope',
      arguments: {
        itemId: 'proof',
        expectedRevision: current.revision,
        scope: { tools: [], readPaths: ['another.txt'], writePaths: [] },
        reason: 'Expand a bounded read path',
      },
    },
    ...boundCheckpointCalls,
  ])
  expect((await goals.get(session.id)).goal?.status).toBe('complete')
})

for (const conflict of ['explicit-version', 'changed-plan'] as const)
  test(`snapshot-bound checkpoint still rejects ${conflict}`, async () => {
    const { kernel, session, run, goals } = await fixture()
    if (conflict === 'changed-plan')
      kernel.hooks.on('tool.after', async (event) => {
        if (event.name === 'write_file')
          await kernel.plugins
            .get<PlanService>('plan')
            .update(session.id, [{ step: 'Changed concurrently; verify this instead', status: 'in_progress' }])
      })
    const calls =
      conflict === 'explicit-version'
        ? successfulCalls.map((call) =>
            call.name === 'workflow_checkpoint'
              ? { ...call, arguments: { ...call.arguments, expectedFocusRevision: 99 } }
              : call,
          )
        : boundCheckpointCalls
    const snapshot = await run(calls)
    expect((await goals.get(session.id)).goal?.status).toBe('active')
    expect(
      snapshot.messages
        .flatMap((message) => message.content)
        .some((block) => block.type === 'tool_result' && block.name === 'workflow_execute' && block.isError),
    ).toBe(true)
  })

test('one workflow function request runs a guarded sequence and completes without orphan protocol messages', async () => {
  const { root, kernel, session, goals, workflows, run } = await fixture()
  const snapshot = await run(successfulCalls)
  expect(await readFile(join(root, 'proof.txt'), 'utf8')).toBe('verified proof')
  expect((await goals.get(session.id)).goal?.status).toBe('complete')
  expect((await workflows.get(session.id)).workflow?.status).toBe('completed')
  const results = snapshot.messages
    .flatMap((message) => message.content)
    .filter((block) => block.type === 'tool_result')
  expect(results).toHaveLength(1)
  expect(results[0]).toMatchObject({ name: 'workflow_execute', isError: false })
  const events = await kernel.storage.call('events', session.id, 0)
  expect(events.filter((event) => event.type === 'request.started')).toHaveLength(1)
  expect(events.filter((event) => event.type === 'tool.sequence_result')).toHaveLength(4)
})

test('large Plan and Workflow queries remain available without the sequence text truncation limit', async () => {
  const { kernel, session, workflows, run } = await fixture()
  const previous = (await workflows.get(session.id)).workflow!
  const plan = await kernel.plugins.get<PlanService>('plan').update(
    session.id,
    Array.from({ length: 40 }, (_, index) => ({
      step: `Step ${index}: ${'detailed task '.repeat(30)}`,
      status: index === 0 ? 'in_progress' : 'pending',
    })),
  )
  const item = previous.focus!
  await workflows.focus(
    session.id,
    0,
    { id: item.focusId, title: item.title, scope: item.scope, acceptanceChecks: [] },
    'agent',
    plan.revision,
  )
  const bounded = await run([{ name: 'get_plan', arguments: {} }])
  expect(
    bounded.messages
      .flatMap((message) => message.content)
      .some(
        (block) =>
          block.type === 'tool_result' && block.name === 'workflow_execute' && block.text.includes('"truncated":true'),
      ),
  ).toBe(true)
  await kernel.submit(session.id, 'large-query', { text: '/tool get_plan {}', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  const request = (await kernel.storage.call('events', session.id, 0)).find(
    (event) => event.type === 'request.started',
  )!
  const names = z.object({ request: z.object({ toolNames: z.array(z.string()) }) }).parse(request.data)
    .request.toolNames
  expect(names).toContain('get_plan')
  expect(names).toContain('get_workflow')
  expect(names).not.toContain('workflow_checkpoint')
  expect(
    (await kernel.snapshot(session.id)).messages
      .flatMap((message) => message.content)
      .some((block) => block.type === 'tool_result' && block.name === 'get_plan' && block.text.includes('Step 39:')),
  ).toBe(true)
})

test('failed verification stops the sequence before completion and later side effects', async () => {
  const { root, kernel, session, goals, run } = await fixture()
  await run([
    { name: 'write_file', arguments: { path: 'proof.txt', text: 'wrong proof' } },
    ...successfulCalls.slice(1),
    { name: 'write_file', arguments: { path: 'proof.txt', text: 'must not run' } },
  ])
  expect(await readFile(join(root, 'proof.txt'), 'utf8')).toBe('wrong proof')
  expect((await goals.get(session.id)).goal?.status).toBe('active')
  const events = await kernel.storage.call('events', session.id, 0)
  expect(events.filter((event) => event.type === 'tool.sequence_result')).toHaveLength(3)
})

test('check IDs cannot substitute for evidence IDs and recovery does not require replaying writes', async () => {
  const { kernel, session, goals, run } = await fixture()
  const rejected = await run(
    successfulCalls.map((call) =>
      call.name === 'workflow_checkpoint'
        ? { ...call, arguments: { ...call.arguments, evidenceIds: ['content'] } }
        : call,
    ),
  )
  expect((await goals.get(session.id)).goal?.status).toBe('active')
  expect(
    rejected.messages
      .flatMap((message) => message.content)
      .some(
        (block) => block.type === 'tool_result' && block.isError && block.text.includes('not acceptance-check IDs'),
      ),
  ).toBe(true)
  await run(successfulCalls.slice(2))
  expect((await goals.get(session.id)).goal?.status).toBe('complete')
  const writes = (await kernel.storage.call('events', session.id, 0)).filter(
    (event) => event.type === 'tool.started' && z.object({ name: z.string() }).parse(event.data).name === 'write_file',
  )
  expect(writes).toHaveLength(1)
})

for (const gate of ['policy', 'scope', 'selected-tools', 'recursion'] as const)
  test(`sequence respects the ${gate} gate`, async () => {
    const { root, kernel, session, run } = await fixture()
    if (gate === 'policy') await kernel.setPermissionMode('deny')
    if (gate === 'selected-tools')
      kernel.hooks.on('tools.select', (event) => ({
        ...event,
        tools: event.tools.filter((tool) => tool.name !== 'write_file'),
      }))
    const snapshot = await run(
      gate === 'scope'
        ? [{ name: 'write_file', arguments: { path: 'outside.txt', text: 'must not write' } }, ...successfulCalls]
        : gate === 'recursion'
          ? [{ name: 'workflow_execute', arguments: { calls: successfulCalls } }, ...successfulCalls]
          : successfulCalls,
    )
    expect(await readFile(join(root, 'proof.txt'), 'utf8')).toBe('initial')
    expect(await Bun.file(join(root, 'outside.txt')).exists()).toBe(false)
    expect(
      snapshot.messages
        .flatMap((message) => message.content)
        .some((block) => block.type === 'tool_result' && block.name === 'workflow_execute' && block.isError),
    ).toBe(true)
    const intents = (await kernel.storage.call('events', session.id, 0)).filter(
      (event) => event.type === 'tool.started',
    )
    expect(intents).toHaveLength(1)
  })

test('sequence length and payload are bounded and its callback expires after the parent settles', async () => {
  const { kernel, session, run } = await fixture()
  let invoke: ToolContext['executeSequence']
  kernel.hooks.on('tool.before', (event) => {
    if (event.name === 'workflow_execute') invoke = event.context.executeSequence
  })
  await run([{ name: 'get_goal', arguments: {} }])
  if (!invoke) throw new Error('Expected the parent sequence capability')
  let failure: unknown
  try {
    await invoke([{ name: 'get_goal', arguments: {} }])
  } catch (error) {
    failure = error
  }
  expect(failure).toMatchObject({ code: 'TOOL_SEQUENCE_CLOSED' })
  await run(Array.from({ length: 9 }, () => ({ name: 'get_goal', arguments: {} })))
  await run([{ name: 'write_file', arguments: { path: 'proof.txt', text: 'x'.repeat(64001) } }])
  expect(
    (await kernel.storage.call('events', session.id, 0)).filter((event) => event.type === 'tool.sequence_call'),
  ).toHaveLength(1)
})

test('cancellation reaches an in-flight child and prevents the remaining writes', async () => {
  const { kernel, root, session, workflows, run } = await fixture()
  const entered = Promise.withResolvers<void>()
  kernel.tools.register({
    name: 'delayed_write',
    description: 'Cancellation fixture',
    inputSchema: z.object({ path: z.string() }),
    effect: 'write',
    workspaceAccess: { kind: 'paths', arguments: [{ field: 'path', access: 'write' }] },
    execute: async (_args, context) => {
      await writeFile(join(root, 'proof.txt'), 'partial write')
      entered.resolve()
      await new Promise<void>((_resolve, reject) => {
        const abort = () => reject(context.signal.reason)
        if (context.signal.aborted) abort()
        else context.signal.addEventListener('abort', abort, { once: true })
      })
      return { text: 'unreachable' }
    },
  })
  const before = (await workflows.get(session.id)).workflow!
  await workflows.expandScope(
    session.id,
    'proof',
    { tools: ['delayed_write'], readPaths: [], writePaths: [] },
    'Exercise cancellation',
    before.revision,
  )
  const running = run([{ name: 'delayed_write', arguments: { path: 'proof.txt' } }, ...successfulCalls])
  await entered.promise
  const active = kernel.active.get(session.id)
  if (!active) throw new Error('Expected an active sequence')
  await kernel.cancel(active.run.id)
  const snapshot = await running
  expect(snapshot.runs[0]?.status).toBe('cancelled')
  expect(await readFile(join(root, 'proof.txt'), 'utf8')).toBe('partial write')
  expect((await workflows.get(session.id)).workflow?.pendingMutations).toEqual([])
  expect(
    (await kernel.storage.call('events', session.id, 0)).filter((event) => event.type === 'tool.sequence_call'),
  ).toHaveLength(1)
})

for (const resultWritten of [false, true])
  test(`restart preserves nested results without orphan messages or replay (${resultWritten})`, async () => {
    const { root, resource, kernel, session } = await fixture()
    const run = await kernel.storage.call(
      'enqueue',
      session.id,
      'crash',
      { text: 'Sequence crash fixture', images: [] },
      'local-fixture',
    )
    await kernel.storage.call('claim', session.id)
    await kernel.storage.call('commit', session.id, run.id, 'assistant', [
      { type: 'tool_call', callId: 'parent', name: 'workflow_execute', args: { calls: successfulCalls } },
    ])
    await kernel.storage.call('toolStart', session.id, run.id, 'parent', 'workflow_execute', { calls: successfulCalls })
    await kernel.append(
      session.id,
      'tool.sequence_call',
      {
        parentCallId: 'parent',
        callId: 'child',
        index: 0,
        name: 'write_file',
        arguments: { path: 'proof.txt', text: 'partial persisted result' },
      },
      run.id,
    )
    await kernel.storage.call('toolStart', session.id, run.id, 'child', 'write_file', {
      path: 'proof.txt',
      text: 'partial persisted result',
    })
    await writeFile(join(root, 'proof.txt'), 'partial persisted result')
    if (resultWritten)
      await kernel.append(
        session.id,
        'tool.sequence_result',
        {
          parentCallId: 'parent',
          content: [{ type: 'tool_result', callId: 'child', name: 'write_file', text: 'Written', isError: false }],
        },
        run.id,
      )
    await kernel.close()
    resource.kernel = await Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
    })
    const snapshot = await resource.kernel.snapshot(session.id)
    expect(
      snapshot.messages
        .flatMap((message) => message.content)
        .filter((block) => block.type === 'tool_result')
        .map((block) => block.callId),
    ).toEqual(['parent'])
    expect(await readFile(join(root, 'proof.txt'), 'utf8')).toBe('partial persisted result')
    const events = await resource.kernel.storage.call('events', session.id, 0)
    expect(events.filter((event) => event.type === 'tool.sequence_result')).toHaveLength(1)
    expect(
      events
        .filter((event) => event.type === 'tool.unknown')
        .some((event) => z.object({ callId: z.string() }).parse(event.data).callId === 'child'),
    ).toBe(!resultWritten)
  })

test('sequence wrapper IDs and repeated control snapshots cannot manufacture Goal progress', async () => {
  const { kernel, session, run } = await fixture()
  const first = await run([{ name: 'get_goal', arguments: {} }])
  const events = await kernel.storage.call('events', session.id, 0)
  expect(auditProgress(events, first.runs[0]!.id, []).progress).toBe(false)
  const written = await run([successfulCalls[0]!])
  const writtenEvents = await kernel.storage.call('events', session.id, 0)
  const audit = auditProgress(writtenEvents, written.runs[0]!.id, [])
  expect(audit.progress).toBe(true)
  const repeated = await run([successfulCalls[0]!])
  expect(
    auditProgress(await kernel.storage.call('events', session.id, 0), repeated.runs[0]!.id, audit.keys).progress,
  ).toBe(false)
})

test('Plan read-only mode cannot gain write authority through a sequence', async () => {
  const { kernel, session, root } = await fixture()
  await kernel.submit(
    session.id,
    'readonly',
    {
      text: `/tool workflow_execute ${JSON.stringify({ calls: successfulCalls })}`,
      images: [],
      mode: 'plan',
    },
    'local-fixture',
  )
  await kernel.waitForIdle()
  expect(await readFile(join(root, 'proof.txt'), 'utf8')).toBe('initial')
  expect(
    (await kernel.snapshot(session.id)).messages
      .flatMap((message) => message.content)
      .some((block) => block.type === 'tool_result' && block.isError),
  ).toBe(true)
})

test('image results stop the text sequence and request a separate visual inspection', async () => {
  const { kernel, session, root, workflows, run } = await fixture()
  kernel.tools.register({
    name: 'image_fixture',
    description: 'Visual inspection fixture',
    inputSchema: z.object({}),
    effect: 'read',
    workspaceAccess: { kind: 'none' },
    execute: async () => ({ text: 'Image', content: [{ type: 'image', data: 'fixture', mimeType: 'image/png' }] }),
  })
  const before = (await workflows.get(session.id)).workflow!
  await workflows.expandScope(
    session.id,
    'proof',
    { tools: ['image_fixture'], readPaths: [], writePaths: [] },
    'Inspect a fixture image',
    before.revision,
  )
  const snapshot = await run([{ name: 'image_fixture', arguments: {} }, ...successfulCalls])
  expect(await readFile(join(root, 'proof.txt'), 'utf8')).toBe('initial')
  expect(
    snapshot.messages
      .flatMap((message) => message.content)
      .some((block) => block.type === 'tool_result' && block.isError && block.text.includes('Call it separately')),
  ).toBe(true)
})

for (const failFirst of [false, true])
  test(`Responses HTTP transport preserves sequence settlement, protocol and inclusive usage (${failFirst})`, async () => {
    const { kernel, session, root, goals } = await fixture()
    const requestSchema = z.object({
      parallel_tool_calls: z.boolean(),
      input: z.array(z.record(z.string(), z.unknown())),
      tools: z.array(z.object({ name: z.string() })),
    })
    const requests: z.infer<typeof requestSchema>[] = []
    const provider = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        requests.push(requestSchema.parse(await request.json()))
        const calls =
          failFirst && requests.length === 1
            ? [
                { name: 'write_file', arguments: { path: 'proof.txt', text: 'wrong proof' } },
                ...successfulCalls.slice(1),
              ]
            : successfulCalls
        const item = {
          id: `fc_${requests.length}`,
          call_id: `call_${requests.length}`,
          type: 'function_call',
          name: 'workflow_execute',
          arguments: JSON.stringify({ calls }),
          status: 'completed',
        }
        const event = (type: string, data: Record<string, unknown>) =>
          `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
        return new Response(
          event('response.created', { response: { id: `resp_${requests.length}`, status: 'in_progress' } }) +
            event('response.output_item.added', { output_index: 0, item: { ...item, arguments: '' } }) +
            event('response.function_call_arguments.delta', { output_index: 0, delta: item.arguments }) +
            event('response.output_item.done', { output_index: 0, item }) +
            event('response.completed', {
              response: {
                id: `resp_${requests.length}`,
                status: 'completed',
                output: [item],
                usage: {
                  input_tokens: 1500,
                  input_tokens_details: { cached_tokens: 300 },
                  output_tokens: 50,
                  total_tokens: 1550,
                },
              },
            }),
          { headers: { 'Content-Type': 'text/event-stream' } },
        )
      },
    })
    try {
      await kernel.saveProvider(
        providerSchema.parse({
          id: 'sequence-responses',
          name: 'Sequence Responses fixture',
          protocol: 'openai-responses',
          baseUrl: `http://127.0.0.1:${provider.port}/v1`,
          model: 'fixture-network',
        }),
        'fixture-only',
      )
      await kernel.submit(
        session.id,
        'responses',
        { text: 'Complete the configured Goal', images: [] },
        'sequence-responses',
      )
      await kernel.waitForIdle()
      const count = failFirst ? 2 : 1
      expect(requests).toHaveLength(count)
      expect(requests.every((request) => request.parallel_tool_calls)).toBe(true)
      for (const request of requests) {
        const names = request.tools.map((tool) => tool.name)
        expect(names).toContain('workflow_execute')
        expect(names).not.toContain('workflow_checkpoint')
        expect(names).not.toContain('get_plan')
        expect(JSON.stringify(request.input)).toContain('workflow_sequence_controls')
        expect(JSON.stringify(request.input)).toContain('workflow_checkpoint(')
      }
      expect(await readFile(join(root, 'proof.txt'), 'utf8')).toBe('verified proof')
      // Host input includes cache; the established budget unit excludes cache reads exactly once.
      const usage = (await kernel.storage.call('events', session.id, 0))
        .filter((event) => event.type === 'usage.recorded')
        .map((event) => z.object({ input: z.number(), output: z.number(), cacheRead: z.number() }).parse(event.data))
      expect(usage).toHaveLength(count)
      expect(usage.every((fact) => fact.input === 1500 && fact.cacheRead === 300 && fact.output === 50)).toBe(true)
      expect((await goals.get(session.id)).goal).toMatchObject({ status: 'complete', tokensUsed: count * 1250 })
      expect((await kernel.snapshot(session.id)).runs[0]?.status).toBe('completed')
      if (failFirst) {
        const outputs = requests[1]!.input.filter((item) => item.type === 'function_call_output')
        expect(outputs).toHaveLength(1)
        expect(outputs[0]?.call_id).toBe('call_1')
        expect(String(outputs[0]?.output)).toContain('"isError":true')
      }
    } finally {
      await provider.stop(true)
    }
  })
