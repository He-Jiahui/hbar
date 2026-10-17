import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { AgentRuntime, agentPlugin } from '@hbar/agent'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { AgentService, BudgetService, GitService, SessionService } from '@hbar/plugin-sdk'

test('create hydrates only its matching idempotency seed among thirty real siblings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-agent-create-selection-'))
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-agent-create-selection-'))
    throw new Error('Refusing to remove an unowned Agent creation fixture directory')
  const hydrations: string[] = []
  const fullEvents: string[] = []
  const configurations: string[] = []
  const fixture: { sessions?: SessionService } = {}
  const seedPages: { id: string; after: number; limit: number | undefined; seqs: number[]; types: string[] }[] = []
  const reset = () => {
    hydrations.length = 0
    fullEvents.length = 0
    configurations.length = 0
    seedPages.length = 0
  }
  const observedAgent = definePlugin({
    manifest: agentPlugin.manifest,
    apply(ctx) {
      const api = ctx.hbar.api
      fixture.sessions = api.sessions
      const configuration = api.sessions.agentConfiguration
      if (!configuration) throw new Error('Missing real Agent configuration port')
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
        readEventPage: async (input) => {
          const page = await api.sessions.readEventPage(input)
          if (input.types.includes('agent.created'))
            seedPages.push({
              id: input.sessionId,
              after: input.afterSeq,
              limit: input.limit,
              seqs: page.items.map((item) => item.event.seq),
              types: [...input.types],
            })
          else fullEvents.push(input.sessionId)
          return page
        },
        agentConfiguration: {
          ...configuration,
          read: (id, runId) => {
            configurations.push(id)
            return configuration.read(id, runId)
          },
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
    kernel.beginDrain()
    const sessions = fixture.sessions
    if (!sessions) throw new Error('Missing real Session service')
    const workspace = (await kernel.storage.call('workspaces')).at(0)
    if (!workspace) throw new Error('Missing workspace')
    const parent = await kernel.createSession(workspace.id, 'parent')
    const agents = kernel.plugins.get<AgentService>('agent')
    const input = { parentSessionId: parent.id, objective: 'deterministic queued child', modelId: 'local-fixture' }
    const siblings = new Set<string>()
    const records: Awaited<ReturnType<AgentService['create']>>[] = []
    let first: Awaited<ReturnType<AgentService['create']>> | undefined
    const assertNoUnrelatedReads = (ids: ReadonlySet<string>) => {
      expect(hydrations.filter((id) => ids.has(id))).toEqual([])
      expect(fullEvents.filter((id) => ids.has(id))).toEqual([])
      expect(configurations.filter((id) => ids.has(id))).toEqual([])
    }
    for (let index = 0; index < 30; index++) {
      reset()
      const created = await agents.create(input, {
        actorId: 'actor-one',
        idempotencyKey: 'child-' + index,
        requestId: 'request-' + index,
      })
      expect(created.runId).not.toBeNull()
      expect(created.status).toBe('queued')
      assertNoUnrelatedReads(siblings)
      siblings.add(created.sessionId)
      records.push(created)
      first ??= created
      // Give every real child a history larger than its seed page without
      // dispatching a provider or changing its queued Run.
      for (let event = 0; event < 3; event++)
        await sessions.append(created.sessionId, 'fixture.large-history', { text: 'x'.repeat(16_384) })
    }
    if (!first) throw new Error('Missing first child')
    reset()
    const repeated = await agents.create(input, {
      actorId: 'actor-one',
      idempotencyKey: 'child-0',
      requestId: 'repeat',
    })
    expect(repeated.agentId).toBe(first.agentId)
    expect(repeated.runId).toBe(first.runId)
    expect(seedPages).toHaveLength(30)
    expect(seedPages.every((page) => page.after === 0 && page.limit === 1 && page.seqs.join(',') === '2')).toBe(true)
    const firstSessionId = first.sessionId
    const unrelated = new Set([...siblings].filter((id) => id !== firstSessionId))
    assertNoUnrelatedReads(unrelated)
    expect(hydrations).toEqual([first.sessionId])
    const snapshot = await kernel.snapshot(first.sessionId)
    expect(snapshot.runs).toHaveLength(1)
    reset()
    const replays = await Promise.all(
      records.map((record, index) =>
        agents.create(input, {
          actorId: 'actor-one',
          idempotencyKey: 'child-' + index,
          requestId: 'parallel-repeat-' + record.sessionId,
        }),
      ),
    )
    expect(replays.map((record) => [record.agentId, record.runId])).toEqual(
      records.map((record) => [record.agentId, record.runId]),
    )
    expect(seedPages).toHaveLength(900)
    expect(seedPages.every((page) => page.after === 0 && page.limit === 1 && page.seqs.join(',') === '2')).toBe(true)
    expect(hydrations).toHaveLength(30)
    expect(seedPages.every((page) => page.types.length === 1 && page.types[0] === 'agent.created')).toBe(true)
    for (const record of records) {
      expect(hydrations.filter((id) => id === record.sessionId)).toHaveLength(1)
      expect((await kernel.snapshot(record.sessionId)).runs).toHaveLength(1)
    }
    reset()
    let conflict: unknown
    try {
      await agents.create(
        { ...input, objective: 'changed' },
        {
          actorId: 'actor-one',
          idempotencyKey: 'child-0',
          requestId: 'conflict',
        },
      )
    } catch (error) {
      conflict = error
    }
    expect(conflict).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    assertNoUnrelatedReads(siblings)
    expect(seedPages).toHaveLength(30)
    expect(seedPages.every((page) => page.after === 0 && page.limit === 1 && page.seqs.join(',') === '2')).toBe(true)
    expect(seedPages.every((page) => page.types.length === 1 && page.types[0] === 'agent.created')).toBe(true)
    reset()
    const other = await agents.create(input, {
      actorId: 'actor-two',
      idempotencyKey: 'child-0',
      requestId: 'other-actor',
    })
    expect(other.agentId).not.toBe(first.agentId)
    expect(other.runId).not.toBe(first.runId)
    assertNoUnrelatedReads(siblings)
    reset()
    let missingParent: unknown
    try {
      await agents.create(
        { ...input, parentSessionId: 'missing-parent' },
        {
          actorId: 'actor-one',
          idempotencyKey: 'missing-parent',
          requestId: 'missing-parent',
        },
      )
    } catch (error) {
      missingParent = error
    }
    expect(missingParent).toBeDefined()
    expect(hydrations).toEqual([])
    expect(fullEvents).toEqual([])
  } finally {
    await kernel.close()
    await rm(target, { recursive: true, force: true })
  }
})
