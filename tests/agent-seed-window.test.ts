import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { AgentRuntime, agentPlugin } from '@hbar/agent'
import type { SessionEvent } from '@hbar/contracts'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { AgentService, BudgetService, GitService, SessionService } from '@hbar/plugin-sdk'

test('creation seed lookup preserves its first-100-event window across old and malformed histories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-agent-seed-window-'))
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-agent-seed-window-'))
    throw new Error('Refusing to remove an unowned Agent seed fixture directory')
  const fixture: { sessions?: SessionService } = {}
  const histories = new Map<string, SessionEvent[]>()
  const reads: { id: string; after: number; limit: number | undefined; seqs: number[] }[] = []
  const snapshots: string[] = []
  const observedAgent = definePlugin({
    manifest: agentPlugin.manifest,
    apply(ctx) {
      const api = ctx.hbar.api
      fixture.sessions = api.sessions
      const sessions: SessionService = {
        ...api.sessions,
        snapshot: (id) => {
          snapshots.push(id)
          return api.sessions.snapshot(id)
        },
        events: async (id, after, limit) => {
          const history = histories.get(id)
          // Only adapt the seed scan. Full record hydration still reads the real
          // queued Run and its actual persisted event history.
          if (!history || limit === 100_000) return api.sessions.events(id, after, limit)
          const events = history.filter((event) => event.seq > (after ?? 0)).slice(0, limit)
          reads.push({ id, after: after ?? 0, limit, seqs: events.map((event) => event.seq) })
          return events
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
    const agents = kernel.plugins.get<AgentService>('agent')
    const cases = [
      { name: 'legacy first event', count: 1, seedIndex: 0, legacy: true },
      { name: 'late hundredth event', count: 101, seedIndex: 99 },
      { name: 'beyond the original window', count: 101, seedIndex: 100 },
      { name: 'malformed first then valid second', count: 100, seedIndex: 1, malformedIndex: 0 },
      { name: 'malformed second then valid hundredth', count: 101, seedIndex: 99, malformedIndex: 1 },
      { name: 'empty history', count: 0, seedIndex: -1 },
      { name: 'short history', count: 1, seedIndex: -1 },
      { name: 'two events without seed', count: 2, seedIndex: -1 },
      { name: 'partial second page without seed', count: 7, seedIndex: -1 },
      { name: 'long history without seed', count: 130, seedIndex: -1 },
    ]
    for (const scenario of cases) {
      const parent = await kernel.createSession(workspace.id, scenario.name)
      const input = { parentSessionId: parent.id, objective: scenario.name, modelId: 'local-fixture' }
      const context = { actorId: 'seed-window-actor', idempotencyKey: scenario.name, requestId: 'initial' }
      const original = await agents.create(input, context)
      expect(original.status).toBe('queued')
      const originalEvents = await sessions.events(original.sessionId, 0, 100)
      const seed = originalEvents.find((event) => event.type === 'agent.created')
      if (!seed) throw new Error('Missing real persisted Agent seed')
      const seedData = z.record(z.string(), z.unknown()).parse(seed.data)
      if (scenario.legacy) {
        delete seedData.configuration
        delete seedData.profileId
      }
      // Sparse sequences make the continuation cursor observable: the second
      // page must begin after seq 6, rather than after the number of events 2.
      const history = Array.from({ length: scenario.count }, (_, index): SessionEvent => ({
        ...seed,
        eventId: `seed-window-${original.sessionId}-${index}`,
        seq: (index + 1) * 3,
        type: index === scenario.seedIndex || index === scenario.malformedIndex ? 'agent.created' : 'fixture.padding',
        data: index === scenario.seedIndex ? seedData : index === scenario.malformedIndex ? { agentId: 42 } : {},
      }))
      histories.set(original.sessionId, history)
      reads.length = 0
      snapshots.length = 0
      const repeated = await agents.create(input, { ...context, requestId: 'repeat' })
      const found = scenario.seedIndex >= 0 && scenario.seedIndex < 100
      if (found) {
        expect(repeated.agentId).toBe(original.agentId)
        expect(repeated.runId).toBe(original.runId)
        expect(snapshots).toEqual([original.sessionId])
      } else {
        expect(repeated.agentId).not.toBe(original.agentId)
        expect(repeated.runId).not.toBe(original.runId)
        expect(snapshots).not.toContain(original.sessionId)
      }
      expect((await kernel.snapshot(original.sessionId)).runs).toHaveLength(1)
      const expected = [
        { id: original.sessionId, after: 0, limit: 2, seqs: history.slice(0, 2).map((event) => event.seq) },
      ]
      if (scenario.count >= 2 && !(found && scenario.seedIndex < 2))
        expected.push({
          id: original.sessionId,
          after: 6,
          limit: 98,
          seqs: history.slice(2, 100).map((event) => event.seq),
        })
      expect(reads).toEqual(expected)
      expect(reads.flatMap((read) => read.seqs)).not.toContain(303)
    }
  } finally {
    await kernel.close()
    await rm(target, { recursive: true, force: true })
  }
})
