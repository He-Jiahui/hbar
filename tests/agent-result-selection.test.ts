import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { AgentRuntime, agentPlugin } from '@hbar/agent'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { AgentService, BudgetService, GitService, SessionService } from '@hbar/plugin-sdk'

test('result and paged list hydrate only selected real children despite large sibling histories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-agent-result-selection-'))
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-agent-result-selection-'))
    throw new Error('Refusing to remove an unowned Agent creation fixture directory')
  const snapshots: string[] = []
  const fullEvents: string[] = []
  const configurations: string[] = []
  const fixture: { sessions?: SessionService } = {}
  const seedPages: { id: string; after: number; limit: number | undefined; seqs: number[] }[] = []
  const reset = () => {
    snapshots.length = 0
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
        snapshot: (id) => {
          snapshots.push(id)
          return api.sessions.snapshot(id)
        },
        events: async (id, after, limit) => {
          if (limit === 100_000) fullEvents.push(id)
          const events = await api.sessions.events(id, after, limit)
          if (limit !== 100_000)
            seedPages.push({ id, after: after ?? 0, limit, seqs: events.map((event) => event.seq) })
          return events
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
    const input = { parentSessionId: parent.id, objective: 'queued observer fixture', modelId: 'local-fixture' }
    const records: Awaited<ReturnType<AgentService['create']>>[] = []
    for (let index = 0; index < 12; index++) {
      const record = await agents.create(input, {
        actorId: 'observer-fixture',
        idempotencyKey: `child-${index}`,
        requestId: `request-${index}`,
      })
      records.push(record)
      for (let event = 0; event < 3; event++)
        await sessions.append(record.sessionId, 'fixture.large-history', { text: 'x'.repeat(32_768) })
    }
    records.sort((left, right) => left.agentId.localeCompare(right.agentId))
    const selected = records[5]
    if (!selected) throw new Error('Missing selected child')
    reset()
    const observed = await agents.result(parent.id, selected.agentId)
    expect(observed.agentId).toBe(selected.agentId)
    expect(observed.runId).toBe(selected.runId)
    expect(snapshots).toEqual([selected.sessionId])
    expect(new Set(fullEvents)).toEqual(new Set([selected.sessionId]))
    expect(configurations).toEqual([selected.sessionId])
    expect(seedPages).toHaveLength(records.length)
    expect(seedPages.every((page) => page.limit === 2)).toBe(true)
    const foreignParent = await kernel.createSession(workspace.id, 'foreign parent')
    reset()
    // Match the existing real-Kernel selection fixtures: await rejection before
    // entering a synchronous matcher, so Worker RPC settlement remains observable.
    let refused: unknown
    try {
      await agents.result(foreignParent.id, selected.agentId)
    } catch (error: unknown) {
      refused = error
    }
    expect(refused).toMatchObject({ code: 'AGENT_NOT_FOUND' })
    expect(snapshots).toEqual([])
    expect(fullEvents).toEqual([])
    expect(configurations).toEqual([])
    let cursor: string | undefined
    const all: string[] = []
    for (let offset = 0; offset < records.length; offset += 5) {
      reset()
      const expected = records.slice(offset, offset + 5)
      const page = await agents.list(parent.id, cursor, 5)
      expect(page.items.map((record) => record.agentId)).toEqual(expected.map((record) => record.agentId))
      expect(snapshots).toEqual(expected.map((record) => record.sessionId))
      expect(configurations).toEqual(expected.map((record) => record.sessionId))
      expect(new Set(fullEvents)).toEqual(new Set(expected.map((record) => record.sessionId)))
      const expectedNextCursor: string | null = offset + 5 < records.length ? (expected.at(-1)?.agentId ?? null) : null
      expect(page.nextCursor).toBe(expectedNextCursor)
      all.push(...page.items.map((record) => record.agentId))
      cursor = page.nextCursor ?? undefined
    }
    expect(all).toEqual(records.map((record) => record.agentId))
    reset()
    expect(await agents.list(parent.id, records.at(-1)?.agentId, 5)).toEqual({ items: [], nextCursor: null })
    expect(snapshots).toEqual([])
    expect(fullEvents).toEqual([])
    expect(configurations).toEqual([])
    for (const limit of [0, 101, 1.5]) {
      let invalid: unknown
      try {
        await agents.list(parent.id, undefined, limit)
      } catch (error: unknown) {
        invalid = error
      }
      expect(invalid).toMatchObject({ code: 'INVALID_INPUT' })
    }
  } finally {
    await kernel.close()
    await rm(target, { recursive: true, force: true })
  }
})
