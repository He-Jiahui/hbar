import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { providerSchema } from '@hbar/contracts'
import { SKILL_TOOL_NAMES } from '@hbar/plugin-sdk'
import type { AgentService, PlanService, WorkflowService } from '@hbar/plugin-sdk'

const requestSchema = z.object({
  tools: z.array(z.object({ function: z.object({ name: z.string() }) })),
  messages: z.array(z.object({ role: z.string(), content: z.unknown() })),
})
type Received = z.output<typeof requestSchema>
type Call = { name: string; args: unknown }
const calls: Call[] = [
  { name: 'skill', args: { name: 'proof-writing' } },
  { name: 'skill_read', args: { name: 'proof-writing', path: 'references/recipe.md' } },
  { name: 'write_file', args: { path: 'proof.txt', text: 'verified-from-skill-reference' } },
]
function system(request: Received | undefined) {
  return (
    request?.messages
      .filter((message) => ['system', 'developer'].includes(message.role))
      .map((message) => z.string().parse(message.content))
      .join('\n') ?? ''
  )
}
async function fixture(
  sequence: readonly Call[],
  run: (kernel: Kernel, sessionId: string, root: string, received: Received[]) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-skill-execution-'))
  const received: Received[] = []
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      received.push(requestSchema.parse(await request.json()))
      const call = sequence[received.length - 1]
      const delta = call
        ? {
            role: 'assistant',
            tool_calls: [
              {
                index: 0,
                id: `skill-call-${received.length}`,
                type: 'function',
                function: { name: call.name, arguments: JSON.stringify(call.args) },
              },
            ],
          }
        : { role: 'assistant', content: 'Skill workflow completed.' }
      const chunk = (value: unknown, reason: string | null) =>
        `data: ${JSON.stringify({ id: 'skill-fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture-network', choices: [{ index: 0, delta: value, finish_reason: reason }] })}\n\n`
      return new Response(chunk(delta, null) + chunk({}, call ? 'tool_calls' : 'stop') + 'data: [DONE]\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      })
    },
  })
  const kernel = await Kernel.create({ home: join(root, 'data'), workspace: root, secrets: new MemorySecrets() })
  try {
    await kernel.saveProvider(
      providerSchema.parse({
        id: 'skill-fixture',
        name: 'Skill fixture',
        protocol: 'openai-completions',
        baseUrl: `http://127.0.0.1:${server.port}/v1`,
        model: 'fixture-network',
      }),
      'fixture-only',
    )
    await kernel.setPermissionMode('allow')
    const directory = join(root, '.agents', 'skills', 'proof-writing')
    await mkdir(join(directory, 'references'), { recursive: true })
    await writeFile(
      join(directory, 'SKILL.md'),
      '---\nname: proof-writing\ndescription: 编写验证证明文件，先读取引用配方。Write verified proof files from a recipe.\n---\nENTRY_BODY_ONLY_AFTER_LOADING: Read references/recipe.md before writing the proof.\n',
    )
    await writeFile(
      join(directory, 'references', 'recipe.md'),
      'REFERENCE_BODY_ONLY_AFTER_LOADING: Write proof.txt containing verified-from-skill-reference.',
    )
    const global = join((await kernel.storageLocations()).active.skillsRoot, 'global-proof')
    await mkdir(global, { recursive: true })
    await writeFile(
      join(global, 'SKILL.md'),
      '---\nname: global-proof\ndescription: Global proof inspection.\n---\nGLOBAL_BODY_ONLY_AFTER_LOADING',
    )
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Fixture workspace missing')
    const session = await kernel.createSession(workspace.id)
    await run(kernel, session.id, root, received)
  } finally {
    await kernel.close()
    await server.stop(true)
    await rm(root, { recursive: true, force: true })
  }
}

for (const task of ['请帮我编写验证证明文件', 'Use $proof-writing to write verified proof.'])
  test(`native skill instructions and references reach the real model loop before task actions: ${task}`, async () => {
    await fixture(calls, async (kernel, sessionId, root, received) => {
      await kernel.submit(sessionId, 'skill-flow', { text: task, images: [] }, 'skill-fixture')
      await kernel.waitForIdle()
      const snapshot = await kernel.snapshot(sessionId)
      expect(snapshot.runs[0]?.status).toBe('completed')
      const activities = snapshot.messages
        .flatMap((message) => message.content)
        .flatMap((block) => (block.type === 'tool_result' && block.activity ? [block.activity] : []))
      expect(activities.filter((activity) => activity.skill?.completed)).toHaveLength(1)
      const report = await kernel.directoryQueries.execute('session.observability', { sessionId, detail: 'files' })
      expect(report.skills).toMatchObject({ used: 1, uses: 1, resourceReads: 1 })
      expect(report.files).toMatchObject({ writes: 1, measuredWrites: 1, addedLines: 1 })
      expect(activities.find((activity) => activity.skill?.resource === 'references/recipe.md')?.skill?.completed).toBe(
        false,
      )
      expect(activities.find((activity) => activity.files?.[0]?.path === 'proof.txt')?.files?.[0]).toMatchObject({
        operation: 'write',
        addedLines: 1,
        removedLines: 0,
      })
      expect(received).toHaveLength(4)
      const initial = system(received[0])
      expect(initial).toContain('proactively load it with skill')
      expect(initial).toContain('proof-writing')
      expect(initial).toContain('global-proof')
      expect(initial).not.toContain('ENTRY_BODY_ONLY_AFTER_LOADING')
      expect(initial).not.toContain('GLOBAL_BODY_ONLY_AFTER_LOADING')
      for (const name of SKILL_TOOL_NAMES) expect(received[0]?.tools.map((tool) => tool.function.name)).toContain(name)
      expect(JSON.stringify(received[1]?.messages)).toContain('ENTRY_BODY_ONLY_AFTER_LOADING')
      expect(JSON.stringify(received[1]?.messages)).not.toContain('REFERENCE_BODY_ONLY_AFTER_LOADING')
      expect(JSON.stringify(received[2]?.messages)).toContain('REFERENCE_BODY_ONLY_AFTER_LOADING')
      expect(await readFile(join(root, 'proof.txt'), 'utf8')).toBe('verified-from-skill-reference')
      const blocks = snapshot.messages.flatMap((message) => message.content)
      expect(blocks.filter((block) => block.type === 'tool_call').map((block) => block.name)).toEqual([
        'skill',
        'skill_read',
        'write_file',
      ])
      expect(blocks.filter((block) => block.type === 'tool_result' && block.isError)).toEqual([])
    })
  })

test('skill reads remain available in Plan mode without permitting a write side effect', async () => {
  await fixture(calls, async (kernel, sessionId, root, received) => {
    await kernel.submit(
      sessionId,
      'plan-skills',
      { text: 'Plan proof using its recipe.', images: [], mode: 'plan' },
      'skill-fixture',
    )
    await kernel.waitForIdle()
    const snapshot = await kernel.snapshot(sessionId)
    expect(snapshot.runs[0]?.status).toBe('completed')
    expect(JSON.stringify(received[2]?.messages)).toContain('REFERENCE_BODY_ONLY_AFTER_LOADING')
    const errors = snapshot.messages
      .flatMap((message) => message.content)
      .filter((block) => block.type === 'tool_result' && block.isError)
    expect(errors).toHaveLength(1)
    expect(JSON.stringify(errors)).toContain('Plan mode cannot execute write_file')
    expect(errors[0]).toMatchObject({ outcome: { kind: 'failed', executionStarted: false } })
    await expect(readFile(join(root, 'proof.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

test('focused workflows retain native skill reads and still enforce the task path scope', async () => {
  await fixture(
    [...calls.slice(0, 2), { name: 'write_file', args: { path: 'outside.txt', text: 'forbidden' } }],
    async (kernel, sessionId, root, received) => {
      const plan = await kernel.plugins
        .get<PlanService>('plan')
        .update(sessionId, [{ step: 'Produce proof', status: 'in_progress' }])
      await kernel.plugins.get<WorkflowService>('workflow').focus(
        sessionId,
        0,
        {
          id: 'proof',
          title: 'Produce proof',
          scope: { readPaths: ['proof.txt'], writePaths: ['proof.txt'], tools: ['read_file', 'write_file'] },
          acceptanceChecks: [],
        },
        'agent',
        plan.revision,
      )
      await kernel.submit(
        sessionId,
        'focus-skills',
        { text: 'Produce proof using its recipe.', images: [] },
        'skill-fixture',
      )
      await kernel.waitForIdle()
      for (const name of SKILL_TOOL_NAMES) expect(received[0]?.tools.map((tool) => tool.function.name)).toContain(name)
      expect(JSON.stringify(received[2]?.messages)).toContain('REFERENCE_BODY_ONLY_AFTER_LOADING')
      const snapshot = await kernel.snapshot(sessionId)
      expect(snapshot.runs[0]?.status).toBe('completed')
      const errors = snapshot.messages
        .flatMap((message) => message.content)
        .filter((block) => block.type === 'tool_result' && block.isError)
      expect(errors).toHaveLength(1)
      expect(JSON.stringify(errors)).toContain('outside the current workflow scope')
      expect(errors[0]).toMatchObject({ outcome: { kind: 'failed', executionStarted: false } })
      await expect(readFile(join(root, 'outside.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    },
  )
})

test('Run tool selection excludes both native skills and their model context', async () => {
  await fixture([], async (kernel, sessionId, _root, received) => {
    kernel.hooks.on('tools.select', (event) => ({
      ...event,
      tools: event.tools.filter((tool) => tool.name === 'read_file'),
    }))
    await kernel.submit(sessionId, 'exclude-skills', { text: 'Inspect proof', images: [] }, 'skill-fixture')
    await kernel.waitForIdle()
    expect((await kernel.snapshot(sessionId)).runs[0]?.status).toBe('completed')
    expect(received[0]?.tools.map((tool) => tool.function.name)).toEqual(['read_file'])
    expect(system(received[0])).not.toContain('Skill discovery:')
    expect(system(received[0])).not.toContain('proof-writing')
  })
})

test('Explore child agents can discover global instructions through their read-only tool profile', async () => {
  await fixture(
    [{ name: 'skill', args: { name: 'global-proof' } }],
    async (kernel, parentSessionId, _root, received) => {
      const agent = await kernel.plugins.get<AgentService>('agent').create(
        {
          parentSessionId,
          objective: 'Inspect proof using global-proof',
          modelId: 'skill-fixture',
          profileId: 'explore',
        },
        { actorId: 'fixture', idempotencyKey: 'explore-skills', requestId: 'explore-skills' },
      )
      await kernel.waitForIdle()
      expect((await kernel.snapshot(agent.sessionId)).runs[0]?.status).toBe('completed')
      const names = received[0]?.tools.map((tool) => tool.function.name)
      for (const name of SKILL_TOOL_NAMES) expect(names).toContain(name)
      expect(names).not.toContain('write_file')
      expect(names).not.toContain('exec')
      expect(JSON.stringify(received[1]?.messages)).toContain('GLOBAL_BODY_ONLY_AFTER_LOADING')
    },
  )
})

test('native skill_search exposes metadata and lets the next step load current global instructions', async () => {
  await fixture(
    [
      { name: 'skill_search', args: { query: 'Global proof inspection' } },
      { name: 'skill', args: { name: 'global-proof' } },
    ],
    async (kernel, sessionId, _root, received) => {
      await kernel.submit(
        sessionId,
        'discover-global',
        { text: 'Inspect available proof skills.', images: [] },
        'skill-fixture',
      )
      await kernel.waitForIdle()
      expect((await kernel.snapshot(sessionId)).runs[0]?.status).toBe('completed')
      const search = received[1]?.messages.find((message) => message.role === 'tool')
      const metadata = z
        .object({ items: z.array(z.object({ name: z.string(), scope: z.string() })) })
        .parse(JSON.parse(z.string().parse(search?.content)))
      expect(metadata.items.find((item) => item.name === 'global-proof')?.scope).toBe('global')
      expect(search?.content).not.toContain('GLOBAL_BODY_ONLY_AFTER_LOADING')
      expect(JSON.stringify(received[2]?.messages)).toContain('GLOBAL_BODY_ONLY_AFTER_LOADING')
    },
  )
})

test('missing skills settle as recoverable tool results and discovery can continue in the same Run', async () => {
  await fixture(
    [
      { name: 'skill', args: { name: 'removed-skill' } },
      { name: 'skill_search', args: { query: 'proof-writing' } },
      { name: 'skill', args: { name: 'proof-writing' } },
    ],
    async (kernel, sessionId, _root, received) => {
      await kernel.submit(
        sessionId,
        'recover-skill',
        { text: 'Find the current proof instructions.', images: [] },
        'skill-fixture',
      )
      await kernel.waitForIdle()
      const snapshot = await kernel.snapshot(sessionId)
      expect(snapshot.runs[0]?.status).toBe('completed')
      const errors = snapshot.messages
        .flatMap((message) => message.content)
        .filter((block) => block.type === 'tool_result' && block.isError)
      expect(errors).toHaveLength(1)
      expect(JSON.stringify(errors)).toContain('Skill is unavailable; search the current catalog')
      expect(JSON.stringify(received[3]?.messages)).toContain('ENTRY_BODY_ONLY_AFTER_LOADING')
    },
  )
})

test('model context discovers skills from the actual isolated root instead of the Session original checkout', async () => {
  await fixture([], async (kernel, sessionId, root) => {
    const executionRoot = join(root, 'isolated')
    const directory = join(executionRoot, '.agents', 'skills', 'isolated-proof')
    await mkdir(directory, { recursive: true })
    await writeFile(
      join(directory, 'SKILL.md'),
      '---\nname: isolated-proof\ndescription: Inspect isolated proof.\n---\nISOLATED_BODY_ONLY_AFTER_LOADING',
    )
    const context = await kernel.hooks.dispatch('context.build', {
      system: 'Work in the isolated workspace.',
      messages: [],
      model: providerSchema.parse({
        id: 'projection',
        name: 'Projection',
        protocol: 'mock',
        model: 'fixture',
        baseUrl: 'http://localhost',
      }),
      context: { sessionId, workspacePath: executionRoot, selectedToolNames: SKILL_TOOL_NAMES },
    })
    expect(context.system).toContain('isolated-proof')
    expect(context.system).toContain('global-proof')
    expect(context.system).not.toContain('"name":"proof-writing"')
    expect(context.system).not.toContain('ISOLATED_BODY_ONLY_AFTER_LOADING')
  })
})
