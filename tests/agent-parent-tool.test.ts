import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { emptyUsage, providerSchema } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { AgentService, DriverInput, HarnessDriver, ModeService, ToolContext } from '@hbar/plugin-sdk'
import type { AgentTaskDifficulty } from '@hbar/contracts/commands/agents'

import { AGENT_TOOL_NAME, advertiseAgentTool } from '../plugins/agent/src/agent-tool'

type Action = 'create' | 'duplicate' | 'archive' | 'foreign' | 'isolated' | 'none'
interface DriverState {
  readonly requests: { system: string; toolNames?: readonly string[] }[]
  readonly results: {
    text: string
    isError?: boolean
    hostFailure?: { code: string; executionStarted: boolean } | undefined
  }[]
  directError: unknown
}
const identitySchema = z.object({
  agentId: z.string(),
  sessionId: z.string(),
  parentSessionId: z.string(),
  requestId: z.string(),
})

const resources: { readonly root: string; readonly kernel: Kernel }[] = []

afterEach(async () => {
  for (const resource of resources.splice(0)) {
    await resource.kernel.close()
    const target = resolve(resource.root)
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-agent-parent-tool-'))
      throw new Error('Refusing non-owned Agent tool fixture cleanup')
    await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
})

async function fixture(action: Action, difficulty?: AgentTaskDifficulty) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-agent-parent-tool-'))
  let kernel!: Kernel
  const state: DriverState = { requests: [], results: [], directError: null }
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Parent Agent fixture driver',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      description: 'Invokes the registered Agent tool from a parent Run',
      scope: 'host' as const,
      required: true,
      provides: { driver: '1.0.0' },
      permissions: [],
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        async run(input: DriverInput) {
          const request = await input.beforeRequest(input.request, `agent-parent-step-${input.run.id}`)
          state.requests.push({
            system: request.system,
            ...(request.toolNames ? { toolNames: request.toolNames } : {}),
          })
          if (input.session.parentId === null) {
            const args = {
              subagent_type: 'explore',
              prompt: 'Inspect the parent Session exactly as written.',
              ...(difficulty ? { difficulty } : {}),
            }
            if (action === 'archive') {
              await kernel.updateSession(input.session.id, { archived: true })
              state.results.push(await input.execute(AGENT_TOOL_NAME, args, 'agent-call'))
            } else if (action === 'foreign' || action === 'isolated') {
              const tool = kernel.tools.get(AGENT_TOOL_NAME)
              if (!tool) throw new Error('Agent tool was not registered')
              const forged: ToolContext = {
                session: action === 'foreign' ? { ...input.session, workspaceId: 'foreign-workspace' } : input.session,
                workspace:
                  action === 'isolated'
                    ? { ...input.workspace, path: join(input.workspace.path, 'isolated') }
                    : input.workspace,
                run: input.run,
                signal: input.signal,
                callId: 'foreign-call',
              }
              try {
                await tool.execute(args, forged)
              } catch (error) {
                state.directError = error
              }
            } else if (action !== 'none') {
              const first = await input.execute(AGENT_TOOL_NAME, args, 'agent-call')
              state.results.push(first)
              if (action === 'duplicate') {
                const tool = kernel.tools.get(AGENT_TOOL_NAME)
                if (!tool) throw new Error('Agent tool is missing')
                const context: ToolContext = {
                  session: input.session,
                  workspace: input.workspace,
                  run: input.run,
                  signal: input.signal,
                  callId: 'agent-call',
                }
                state.results.push(await tool.execute(args, context))
                try {
                  await tool.execute(
                    { ...args, prompt: 'A different prompt must conflict with the same call key.' },
                    context,
                  )
                } catch (error) {
                  state.directError = error
                }
              }
            }
          }
          await input.commit('assistant', [{ type: 'text', text: 'fixture complete' }])
        },
        summarize: async () => ({ text: 'fixture summary', usage: emptyUsage() }),
      })
    },
  })
  kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    profile: { replacements: { 'driver.pi': driver } },
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const parent = await kernel.createSession(workspace.id, 'parent')
  resources.push({ root, kernel })
  return { root, kernel, workspace, parent, state }
}

test('the registered Agent tool uses weighted difficulty policy while preserving the parent permissions', async () => {
  const f = await fixture('create', 'complex')
  await f.kernel.saveProvider(
    providerSchema.parse({
      id: 'weighted-fixture',
      name: 'Weighted fixture',
      protocol: 'mock',
      baseUrl: 'http://127.0.0.1',
      model: 'review',
      thinkingLevels: ['low', 'high'],
      defaultThinkingLevel: 'low',
    }),
  )
  const agents = f.kernel.plugins.get<AgentService>('agent')
  const baseline = await agents.policy(f.parent.id)
  await agents.setPolicy(
    {
      parentSessionId: f.parent.id,
      baselineRevisions: baseline.revisions,
      candidates: [{ difficulty: 'complex', modelId: 'weighted-fixture', thinkingLevel: 'high', weight: 100 }],
    },
    { actorId: 'fixture', idempotencyKey: 'weighted-policy' },
  )
  await f.kernel.submit(
    f.parent.id,
    'weighted-parent',
    { text: 'Inspect task', images: [], thinking: 'max', approval: 'allow' },
    'local-fixture',
  )
  await f.kernel.waitForIdle()
  expect(Boolean(f.state.results[0]?.isError)).toBe(false)
  const identity = identitySchema.passthrough().parse(JSON.parse(f.state.results[0]!.text))
  expect(identity).toMatchObject({ modelId: 'weighted-fixture', profileId: 'explore' })
  const child = await agents.result(f.parent.id, identity.agentId)
  expect(child.dispatchConfiguration).toMatchObject({
    modelId: 'weighted-fixture',
    thinkingLevel: 'high',
    approval: 'allow',
    sources: { model: 'policy', approval: 'parent' },
  })
  expect((await f.kernel.snapshot(child.sessionId)).runs[0]?.input).toMatchObject({
    thinking: 'high',
    approval: 'allow',
  })
})

test('a parent Run invokes the registered Agent tool with exact identity and advertised instructions', async () => {
  const f = await fixture('create')
  const run = await f.kernel.submit(
    f.parent.id,
    'parent-agent-run',
    {
      text: '/agent explore Inspect the parent Session exactly as written.',
      images: [],
      thinking: 'high',
      approval: 'allow',
    },
    'local-fixture',
  )
  await f.kernel.waitForIdle()

  expect(f.state.requests[0]?.toolNames).toContain(AGENT_TOOL_NAME)
  expect(f.state.requests[0]?.system).toContain('`/agent <subagent_type> <prompt>`')
  expect(f.state.requests[0]?.system).toContain('exact remaining prompt unchanged')
  expect(Boolean(f.state.results[0]?.isError)).toBe(false)
  const identity = identitySchema.passthrough().parse(JSON.parse(f.state.results[0]!.text))
  expect(identity).toMatchObject({
    parentSessionId: f.parent.id,
    profileId: 'explore',
    objective: 'Inspect the parent Session exactly as written.',
    modelId: 'local-fixture',
  })
  expect(identity.agentId).toBe(identity.sessionId)
  expect(identity.requestId).toStartWith('agent-')
  expect((await f.kernel.storage.call('session', identity.sessionId)).parentId).toBe(f.parent.id)
  const parentRun = await f.kernel.storage.call('run', run.id)
  const childRun = (await f.kernel.snapshot(identity.sessionId)).runs.find(
    (candidate) => candidate.requestId === identity.requestId,
  )
  expect(parentRun.status).toBe('completed')
  expect(childRun?.modelId).toBe(parentRun.modelId)
  expect(childRun?.input.thinking).toBe(parentRun.input.thinking)
  expect(childRun?.input.approval).toBe(parentRun.input.approval)
  expect(f.state.requests[1]?.toolNames).not.toContain(AGENT_TOOL_NAME)
  expect(
    (await f.kernel.storage.call('events', f.parent.id, 0)).some((event) => event.type === 'agent.childCreated'),
  ).toBe(true)
})

test('the same parent tool call is idempotent and a different prompt conflicts without another child', async () => {
  const f = await fixture('duplicate')
  await f.kernel.submit(
    f.parent.id,
    'parent-agent-duplicate',
    { text: '/agent explore inspect', images: [], approval: 'allow' },
    'local-fixture',
  )
  await f.kernel.waitForIdle()

  expect(f.state.results).toHaveLength(2)
  const first = identitySchema.parse(JSON.parse(f.state.results[0]!.text))
  const duplicate = identitySchema.parse(JSON.parse(f.state.results[1]!.text))
  expect(duplicate.agentId).toBe(first.agentId)
  expect(f.state.directError).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  expect(await f.kernel.storage.call('childSessions', f.parent.id, undefined, 50)).toHaveLength(1)
})

test('an archived parent is rejected before Agent creation', async () => {
  const f = await fixture('archive')
  await f.kernel.submit(
    f.parent.id,
    'parent-agent-archive',
    { text: 'archive', images: [], approval: 'allow' },
    'local-fixture',
  )
  await f.kernel.waitForIdle()

  expect(f.state.results[0]).toMatchObject({ isError: true, hostFailure: { code: 'SESSION_ARCHIVED' } })
  expect(await f.kernel.storage.call('childSessions', f.parent.id, undefined, 50)).toHaveLength(0)
})

test('a forged foreign Session target is rejected by the registered Agent tool', async () => {
  const f = await fixture('foreign')
  await f.kernel.submit(
    f.parent.id,
    'parent-agent-foreign',
    { text: 'foreign', images: [], approval: 'allow' },
    'local-fixture',
  )
  await f.kernel.waitForIdle()

  expect(f.state.directError).toMatchObject({ code: 'STALE_TARGET' })
  expect(await f.kernel.storage.call('childSessions', f.parent.id, undefined, 50)).toHaveLength(0)
})

test('Plan mode denies the Agent tool before it can create a child', async () => {
  const f = await fixture('create')
  await f.kernel.plugins.get<ModeService>('mode').set(f.parent.id, 'plan')
  await f.kernel.submit(
    f.parent.id,
    'parent-agent-plan',
    { text: '/agent explore plan-only', images: [], approval: 'allow' },
    'local-fixture',
  )
  await f.kernel.waitForIdle()

  expect(f.state.results[0]).toMatchObject({ isError: true, hostFailure: { code: 'PLAN_READ_ONLY' } })
  expect(await f.kernel.storage.call('childSessions', f.parent.id, undefined, 50)).toHaveLength(0)
})

test('a settled parent Run cannot be reused as an Agent tool target', async () => {
  const f = await fixture('none')
  const run = await f.kernel.submit(
    f.parent.id,
    'parent-agent-settled',
    { text: 'settled', images: [], approval: 'allow' },
    'local-fixture',
  )
  await f.kernel.waitForIdle()
  const snapshot = await f.kernel.snapshot(f.parent.id)
  const session = await f.kernel.storage.call('session', f.parent.id)
  const workspace = await f.kernel.storage.call('workspace', session.workspaceId)
  const tool = f.kernel.tools.get(AGENT_TOOL_NAME)!
  const context: ToolContext = {
    session,
    workspace,
    run: snapshot.runs.find((item) => item.id === run.id)!,
    signal: new AbortController().signal,
    callId: 'settled-call',
  }
  await expect(
    tool.execute({ subagent_type: 'explore', prompt: 'must not create after settlement' }, context),
  ).rejects.toMatchObject({ code: 'STALE_TARGET' })
  expect(await f.kernel.storage.call('childSessions', f.parent.id, undefined, 50)).toHaveLength(0)
})

test('Agent advertisement fails closed rather than truncating existing Host instructions', async () => {
  const f = await fixture('create')
  const long = 'x'.repeat(16_000)
  const tool = f.kernel.tools.get(AGENT_TOOL_NAME)!
  const event = advertiseAgentTool({ sessionId: f.parent.id, runId: 'unused', tools: [tool], instructions: long })
  expect(event.instructions).toBe(long)
  expect(event.tools).toHaveLength(0)
})

test('an isolated parent execution path fails instead of silently creating a child against another checkout', async () => {
  const f = await fixture('isolated')
  await f.kernel.submit(
    f.parent.id,
    'isolated-parent',
    { text: 'inspect', images: [], approval: 'allow' },
    'local-fixture',
  )
  await f.kernel.waitForIdle()
  expect(f.state.directError).toMatchObject({ code: 'AGENT_EXECUTION_TARGET_UNSUPPORTED' })
  expect(await f.kernel.storage.call('childSessions', f.parent.id, undefined, 50)).toHaveLength(0)
})
