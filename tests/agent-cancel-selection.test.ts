import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { AgentRuntime, agentPlugin } from '@hbar/agent'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { AgentService, BudgetService, GitService, SessionService } from '@hbar/plugin-sdk'

test('cancel selects one direct child before full records among thirty real sibling sessions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-agent-cancel-selection-'))
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-agent-cancel-selection-'))
    throw new Error('Refusing to remove an unowned Agent cancellation fixture directory')
  const hydrations: string[] = []
  const fullEvents: string[] = []
  const cancelled: string[] = []
  const observedAgent = definePlugin({
    manifest: agentPlugin.manifest,
    apply(ctx) {
      const api = ctx.hbar.api
      const sessions: SessionService = {
        ...api.sessions,
        readFacts: (input) => {
          if (input.includeRuns !== false) hydrations.push(input.sessionId)
          if (!api.sessions.readFacts) throw new Error('Missing bounded Session facts')
          return api.sessions.readFacts(input)
        },
        snapshot: () => {
          throw new Error('Agent reads must not hydrate a full snapshot')
        },
        events: () => {
          throw new Error('Agent reads must not hydrate raw event history')
        },
        readEventPage: (input) => {
          if (!input.types.includes('agent.created')) fullEvents.push(input.sessionId)
          return api.sessions.readEventPage(input)
        },
        cancel: (id) => {
          cancelled.push(id)
          return api.sessions.cancel(id)
        },
      }
      provide<AgentService>(
        ctx,
        'agent',
        new AgentRuntime(sessions, api.service<BudgetService>('budget'), api.service<GitService>('git'), api),
      )
    },
  })
  const kernel = await Kernel.create({
    dataRoot: join(root, 'data'),
    cacheRoot: join(root, 'cache'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    profile: { replacements: { 'agent.codex': observedAgent } },
  })
  try {
    const workspace = (await kernel.storage.call('workspaces')).at(0)
    if (!workspace) throw new Error('Missing workspace')
    const parent = await kernel.createSession(workspace.id, 'parent')
    const seed = async (parentId: string, title: string) => {
      const child = await kernel.createSession(workspace.id, title, parentId)
      const requestId = crypto.randomUUID()
      await kernel.append(child.id, 'agent.created', {
        agentId: child.id,
        parentSessionId: parentId,
        sessionId: child.id,
        requestId,
        objective: title,
        modelId: 'local-fixture',
        tokenBudget: null,
        createdAt: Date.now(),
        command: { actorId: 'test', idempotencyKey: requestId, requestId, inputHash: 'a'.repeat(64) },
      })
      const run = await kernel.storage.call(
        'enqueue',
        child.id,
        requestId,
        { text: title, images: [] },
        'local-fixture',
      )
      return { child, run }
    }
    const siblings = []
    for (let index = 0; index < 30; index++) siblings.push(await seed(parent.id, 'child-' + index))
    const target = siblings.at(0)
    if (!target) throw new Error('Missing target')
    const descendant = await seed(target.child.id, 'descendant')
    const leaf = await seed(descendant.child.id, 'leaf')
    hydrations.length = 0
    fullEvents.length = 0
    const agent = kernel.plugins.get<AgentService>('agent')
    const result = await agent.cancel(parent.id, target.child.id)
    expect(result.agentId).toBe(target.child.id)
    expect(cancelled).toEqual([leaf.run.id, descendant.run.id, target.run.id])
    const unrelated = new Set(siblings.slice(1).map((entry) => entry.child.id))
    expect(hydrations.filter((id) => unrelated.has(id))).toEqual([])
    expect(fullEvents.filter((id) => unrelated.has(id))).toEqual([])
    hydrations.length = 0
    fullEvents.length = 0
    let refused: unknown
    try {
      await agent.cancel(parent.id, leaf.child.id)
    } catch (error) {
      refused = error
    }
    expect(refused).toMatchObject({ code: 'AGENT_NOT_FOUND' })
    expect(hydrations).toEqual([])
    expect(fullEvents).toEqual([])
    const parentEvents = await kernel.storage.call('events', parent.id, 0, 100)
    expect(parentEvents.some((event) => event.type === 'agent.cancelRequested')).toBe(true)
  } finally {
    await kernel.close()
    await rm(target, { recursive: true, force: true })
  }
})
