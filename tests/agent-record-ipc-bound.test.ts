import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { AgentRuntime, agentPlugin } from '@hbar/agent'
import { Kernel, MemorySecrets, SettingsService } from '@hbar/kernel'
import { IpcPeer, RuntimeValuePort } from '@hbar/runtime'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import { sessionEventPageInputSchema, sessionReadFactsInputSchema } from '@hbar/contracts'
import type { SessionEventPage, SessionReadFacts } from '@hbar/contracts'
import type { AgentPage, AgentRecord, AgentSessionConfiguration } from '@hbar/contracts/commands/agents'
import type { AgentService, BudgetService, GitService, HbarAPI, SessionService } from '@hbar/plugin-sdk'

function boundary() {
  const frames: string[] = []
  let right: IpcPeer | undefined
  const left = new IpcPeer({
    owner: { unitId: 'base', generation: 1, incarnation: 'agent-facts-base' },
    remote: { unitId: 'agent', generation: 1, incarnation: 'agent-facts-plugin' },
    transport: {
      send: (frame) => {
        frames.push(JSON.stringify(frame))
        right?.receive(frame)
      },
    },
  })
  right = new IpcPeer({
    owner: left.remote,
    remote: left.owner,
    transport: {
      send: (frame) => {
        frames.push(JSON.stringify(frame))
        left.receive(frame)
      },
    },
  })
  const local = new RuntimeValuePort(left, { prefix: 'agent.facts' })
  const remote = new RuntimeValuePort(right, { prefix: 'agent.facts' })
  return {
    local,
    remote,
    frames,
    close() {
      local.dispose()
      remote.dispose()
      left.close()
      right?.close()
    },
  }
}

test('real Agent list/result cross unchanged IPC bounds without transporting unrelated history and shrink large record pages', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-agent-record-ipc-'))
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-agent-record-ipc-'))
    throw new Error('Refusing to remove an unowned Agent facts fixture')
  const ipc = boundary()
  const fixture: { sessions?: SessionService; api?: HbarAPI } = {}
  const hydrationIds: string[] = []
  const observedAgent = definePlugin({
    manifest: agentPlugin.manifest,
    apply(ctx) {
      const api = ctx.hbar.api
      fixture.api = api
      fixture.sessions = api.sessions
      const configuration = api.sessions.agentConfiguration
      const readFacts = api.sessions.readFacts
      if (!configuration || !readFacts) throw new Error('Missing real bounded Session ports')
      ipc.remote.register('session.facts', ([value]) => readFacts(sessionReadFactsInputSchema.parse(value)))
      ipc.remote.register('session.page', ([value]) =>
        api.sessions.readEventPage(sessionEventPageInputSchema.parse(value)),
      )
      ipc.remote.register('session.configuration', ([id]) => configuration.read(z.string().parse(id)))
      // These are the actual former intermediate reads over the real value/IPC
      // boundary, kept solely as an immutable negative control for this fixture.
      ipc.remote.register('unsafe.events', ([id]) => api.sessions.events(z.string().parse(id), 0, 100_000))
      ipc.remote.register('unsafe.snapshot', ([id]) => api.sessions.snapshot(z.string().parse(id)))
      const sessions: SessionService = {
        ...api.sessions,
        snapshot: () => {
          throw new Error('Agent record must not read full snapshots')
        },
        events: () => {
          throw new Error('Agent record must not read raw event arrays')
        },
        readFacts: (input) => {
          if (input.includeRuns !== false) hydrationIds.push(input.sessionId)
          return ipc.local.call<SessionReadFacts>('session.facts', [input])
        },
        readEventPage: (input) => ipc.local.call<SessionEventPage>('session.page', [input]),
        agentConfiguration: {
          ...configuration,
          read: (id) => ipc.local.call<AgentSessionConfiguration>('session.configuration', [id]),
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
    const workspace = (await kernel.storage.call('workspaces')).at(0)
    const sessions = fixture.sessions
    const api = fixture.api
    if (!workspace || !sessions?.agentConfiguration || !api) throw new Error('Missing real fixture services')
    const parent = await kernel.createSession(workspace.id, 'parent')
    const foreignParent = await kernel.createSession(workspace.id, 'foreign')
    const agents = kernel.plugins.get<AgentService>('agent')
    ipc.remote.register('agent.list', ([id, cursor, limit]) =>
      agents.list(z.string().parse(id), z.string().optional().parse(cursor), z.number().parse(limit)),
    )
    ipc.remote.register('agent.result', ([id, agentId]) =>
      agents.result(z.string().parse(id), z.string().parse(agentId)),
    )
    const records: AgentRecord[] = []
    for (let index = 0; index < 22; index++)
      records.push(
        await agents.create(
          {
            parentSessionId: parent.id,
            objective: `owned-${index}`,
            modelId: 'local-fixture',
          },
          { actorId: 'ipc-fixture', idempotencyKey: `child-${index}`, requestId: `create-${index}` },
        ),
      )
    records.sort((a, b) => a.agentId.localeCompare(b.agentId))
    const selected = records[0]
    if (!selected?.runId) throw new Error('Missing selected Run')
    const foreign = await agents.create(
      {
        parentSessionId: foreignParent.id,
        objective: 'FOREIGN_SESSION_PRIVATE',
        modelId: 'local-fixture',
      },
      { actorId: 'ipc-fixture', idempotencyKey: 'foreign', requestId: 'foreign' },
    )
    let nested: unknown = 'TOOL_PAYLOAD_PRIVATE'
    for (let depth = 0; depth < 29; depth++) nested = { child: nested }
    await sessions.append(
      selected.sessionId,
      'tool.execution',
      { callId: 'private-tool', output: nested },
      selected.runId,
    )
    await kernel.storage.call('commit', selected.sessionId, selected.runId, 'user', [
      { type: 'text', text: 'USER_ATTACHMENT_PRIVATE' },
    ])
    await kernel.storage.call('commit', selected.sessionId, selected.runId, 'assistant', [
      { type: 'text', text: 'first' },
      { type: 'text', text: 'second' },
    ])
    await kernel.storage.call('commit', selected.sessionId, selected.runId, 'assistant', [
      { type: 'text', text: 'third' },
    ])
    await kernel.storage.call('setRun', selected.runId, 'completed')
    let oldEventsError: unknown
    try {
      await ipc.local.call('unsafe.events', [selected.sessionId])
    } catch (error: unknown) {
      oldEventsError = error
    }
    expect(oldEventsError).toMatchObject({ code: 'IPC_PAYLOAD_LIMIT', message: 'IPC data structure exceeds its bound' })
    let oldSnapshotError: unknown
    try {
      await ipc.local.call('unsafe.snapshot', [selected.sessionId])
    } catch (error: unknown) {
      oldSnapshotError = error
    }
    expect(oldSnapshotError).toMatchObject({ code: 'IPC_PAYLOAD_LIMIT' })
    ipc.frames.length = 0
    hydrationIds.length = 0
    const result = await ipc.local.call<AgentRecord>('agent.result', [parent.id, selected.agentId])
    expect(result).toMatchObject({
      agentId: selected.agentId,
      runId: selected.runId,
      status: 'completed',
      resultSummary: 'first\nsecond\nthird',
    })
    expect(hydrationIds).toEqual([selected.sessionId])
    for (const limit of [8, 100]) {
      const page = await ipc.local.call<AgentPage>('agent.list', [parent.id, undefined, limit])
      expect(page.items.map((record) => record.agentId)).toEqual(
        records.slice(0, limit).map((record) => record.agentId),
      )
      expect(page.nextCursor).toBe(limit < records.length ? (records.at(limit - 1)?.agentId ?? null) : null)
    }
    const frames = ipc.frames.join('')
    for (const secret of [
      'TOOL_PAYLOAD_PRIVATE',
      'USER_ATTACHMENT_PRIVATE',
      'FOREIGN_SESSION_PRIVATE',
      foreign.sessionId,
    ])
      expect(frames).not.toContain(secret)
    const hydratedBeforeRefusal = hydrationIds.length
    let forbidden: unknown
    try {
      await ipc.local.call('agent.result', [foreignParent.id, selected.agentId])
    } catch (error: unknown) {
      forbidden = error
    }
    expect(forbidden).toMatchObject({ code: 'AGENT_NOT_FOUND' })
    expect(hydrationIds).toHaveLength(hydratedBeforeRefusal)
    // Configuration fallback is the same bounded SQL projection even when the
    // stored model is unset; current configuration still comes from Host settings.
    const settings = new SettingsService(kernel.storage)
    const scope = { kind: 'session' as const, targetId: selected.sessionId }
    const baseline = await settings.get(scope)
    await settings.apply({
      scope,
      schemaVersion: 1,
      baselineRevisions: baseline.revisions,
      actorId: 'ipc-fixture',
      idempotencyKey: 'unset-selected-model',
      changes: [{ op: 'set', path: [{ kind: 'field', name: 'provider.model' }], value: null }],
    })
    const fallback = await sessions.agentConfiguration.read(selected.sessionId, undefined)
    expect(fallback.modelId).toBe('local-fixture')

    for (const record of records)
      await sessions.append(record.sessionId, 'agent.patch.updated', {
        patch: {
          patchId: `patch-${record.agentId}`,
          agentId: record.agentId,
          parentSessionId: parent.id,
          itemId: 'item',
          planRevision: 1,
          status: 'ready',
          artifactId: 'artifact',
          artifactSha256: 'a'.repeat(64),
          files: Array.from({ length: 512 }, (_, index) => ({
            path: `scope/${'x'.repeat(200)}/${index}`,
            operation: 'update',
            beforeSha256: 'a'.repeat(64),
            afterSha256: 'b'.repeat(64),
          })),
          summary: 'bounded patch metadata',
          createdAt: Date.now(),
          appliedAt: null,
        },
      })
    const all: string[] = []
    let cursor: string | undefined
    for (let attempt = 0; attempt < records.length; attempt++) {
      const page = await ipc.local.call<AgentPage>('agent.list', [parent.id, cursor, 100])
      expect(page.items.length).toBeGreaterThan(0)
      expect(page.items.length).toBeLessThan(8)
      for (const record of page.items) expect(record.patch?.files).toHaveLength(512)
      all.push(...page.items.map((record) => record.agentId))
      cursor = page.nextCursor ?? undefined
      if (!cursor) break
    }
    expect(cursor).toBeUndefined()
    expect(all).toEqual(records.map((record) => record.agentId))
    expect(
      (await ipc.local.call<AgentRecord>('agent.result', [parent.id, selected.agentId])).patch?.files,
    ).toHaveLength(512)

    await sessions.append(selected.sessionId, 'agent.failed', { error: 42 })
    await sessions.append(selected.sessionId, 'agent.failed', {
      error: 'later failure must not replace the first event',
    })
    await sessions.append(selected.sessionId, 'agent.patch.rejected', {
      error: 'patch rejection',
      summary: 'patch fallback',
      updatedAt: Date.now(),
    })
    await sessions.append(selected.sessionId, 'agent.patch.updated', { patch: 42 })
    await sessions.append(selected.sessionId, 'run.cancelRequested', {}, selected.runId)
    const preserved = await ipc.local.call<AgentRecord>('agent.result', [parent.id, selected.agentId])
    expect(preserved).toMatchObject({
      status: 'completed',
      error: 'patch rejection',
      resultSummary: 'first\nsecond\nthird',
    })
    expect(preserved.patch?.files).toHaveLength(512)
    const active = records[1]
    if (!active?.runId) throw new Error('Missing active fixture Run')
    await kernel.storage.call('setRun', active.runId, 'running')
    await sessions.append(active.sessionId, 'run.cancelRequested', {}, active.runId)
    expect(await ipc.local.call<AgentRecord>('agent.result', [parent.id, active.agentId])).toMatchObject({
      runId: active.runId,
      status: 'cancelRequested',
    })
    await kernel.storage.call('setRun', active.runId, 'cancelled')

    const prefix = 'first\nsecond\nthird\n'
    const text = '😀'.repeat(3_000)
    await kernel.storage.call('commit', selected.sessionId, selected.runId, 'assistant', [{ type: 'text', text }])
    expect(
      (
        await ipc.local.call<SessionReadFacts>('session.facts', [
          { sessionId: selected.sessionId, requestId: selected.requestId },
        ])
      ).resultSummary,
    ).toBe((prefix + text).slice(0, 4_000))
    // Reuse the public projection immediately after an iterator stopped early,
    // including another Session, before changing the selected message window.
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(
        (
          await ipc.local.call<SessionReadFacts>('session.facts', [
            { sessionId: selected.sessionId, requestId: selected.requestId },
          ])
        ).resultSummary,
      ).toBe((prefix + text).slice(0, 4_000))
      expect(
        (
          await ipc.local.call<SessionReadFacts>('session.facts', [
            { sessionId: active.sessionId, requestId: active.requestId },
          ])
        ).resultSummary,
      ).toBe('')
    }
    for (let index = 0; index < 60; index++)
      await kernel.storage.call('commit', selected.sessionId, selected.runId, 'user', [
        { type: 'text', text: `latest-message-${index}` },
      ])
    const facts = await ipc.local.call<SessionReadFacts>('session.facts', [
      { sessionId: selected.sessionId, requestId: selected.requestId },
    ])
    expect(facts.resultSummary).toBe('')
    expect(facts.runs.find((run) => run.id === selected.runId)?.input).not.toHaveProperty('text')
    expect(facts.runs.find((run) => run.id === selected.runId)?.input).not.toHaveProperty('images')
    for (let index = 0; index < 41; index++)
      await kernel.storage.call(
        'enqueue',
        selected.sessionId,
        `later-${index}`,
        {
          text: 'LATER_ADMITTED_INPUT_PRIVATE',
          images: [],
        },
        'local-fixture',
      )
    const later = await ipc.local.call<SessionReadFacts>('session.facts', [
      { sessionId: selected.sessionId, requestId: selected.requestId },
    ])
    expect(later.runs).toHaveLength(40)
    expect(later.runs.some((run) => run.id === selected.runId)).toBe(false)
    expect(JSON.stringify(later)).not.toContain('LATER_ADMITTED_INPUT_PRIVATE')
    const legacySessions: SessionService = {
      ...sessions,
      snapshot: () => {
        throw new Error('Legacy adapter used an unsafe snapshot fallback')
      },
      events: () => {
        throw new Error('Legacy adapter used an unsafe events fallback')
      },
    }
    delete legacySessions.readFacts
    const legacy = new AgentRuntime(
      legacySessions,
      api.service<BudgetService>('budget'),
      api.service<GitService>('git'),
      api,
    )
    let unavailable: unknown
    try {
      await legacy.result(parent.id, selected.agentId)
    } catch (error: unknown) {
      unavailable = error
    }
    expect(unavailable).toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' })
  } finally {
    await kernel.close()
    ipc.close()
    await rm(target, { recursive: true, force: true })
  }
}, 60_000)
