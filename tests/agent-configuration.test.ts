import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets, SettingsService, createModelCommands } from '@hbar/kernel'
import { providerSchema } from '@hbar/contracts'
import type { AgentService } from '@hbar/plugin-sdk'
import { DEFAULT_SANDBOX_PROFILE_ID } from '@hbar/contracts/sandbox'
import { agentDispatchCandidatesSchema } from '@hbar/contracts/commands/agents'

async function fixture(operation: (kernel: Kernel, parentId: string, settings: SettingsService) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-agent-config-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  try {
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Fixture workspace missing')
    const parent = await kernel.createSession(workspace.id)
    const settings = new SettingsService(kernel.storage)
    await change(settings, parent.id, {
      'provider.model': 'local-fixture',
      'provider.thinkingLevel': 'max',
      'session.approval': 'allow',
    })
    await operation(kernel, parent.id, settings)
  } finally {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
}

async function change(settings: SettingsService, sessionId: string, values: Readonly<Record<string, string>>) {
  const scope = { kind: 'session' as const, targetId: sessionId }
  const snapshot = await settings.get(scope)
  return settings.apply({
    scope,
    schemaVersion: 1,
    baselineRevisions: snapshot.revisions,
    actorId: 'fixture',
    idempotencyKey: crypto.randomUUID(),
    changes: Object.entries(values).map(([name, value]) => ({ op: 'set', path: [{ kind: 'field', name }], value })),
  })
}

test('difficulty selection is deterministic, weighted and audited without widening permissions', async () => {
  await fixture(async (kernel, parentSessionId, settings) => {
    await kernel.saveProvider(
      providerSchema.parse({
        id: 'small',
        name: 'Small fixture',
        protocol: 'mock',
        baseUrl: 'http://127.0.0.1',
        model: 'small',
        thinkingLevels: ['low', 'high'],
        defaultThinkingLevel: 'low',
      }),
    )
    await change(settings, parentSessionId, { 'session.approval': 'deny' })
    const agents = kernel.plugins.get<AgentService>('agent')
    const baseline = await agents.policy(parentSessionId)
    expect(baseline).toMatchObject({ candidates: [], inherited: true })
    const input = {
      parentSessionId,
      baselineRevisions: baseline.revisions,
      candidates: [
        { difficulty: 'simple' as const, modelId: 'small', thinkingLevel: 'low' as const, weight: 100 },
        { difficulty: 'complex' as const, modelId: 'small', thinkingLevel: 'high' as const, weight: 20 },
        { difficulty: 'complex' as const, modelId: 'local-fixture', thinkingLevel: 'max' as const, weight: 100 },
      ],
    }
    const saved = await agents.setPolicy(input, { actorId: 'fixture', idempotencyKey: 'policy-1' })
    expect(saved.inherited).toBe(false)
    const conflict = await agents
      .setPolicy({ ...input, candidates: [] }, { actorId: 'fixture', idempotencyKey: 'policy-conflict' })
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(conflict).toMatchObject({ code: 'REVISION_CONFLICT' })
    const child = await agents.create(
      { parentSessionId, objective: 'Complex review', difficulty: 'complex' },
      { actorId: 'fixture', idempotencyKey: 'weighted', requestId: 'weighted' },
    )
    await kernel.waitForIdle()
    expect(child.dispatchConfiguration).toMatchObject({
      modelId: 'local-fixture',
      thinkingLevel: 'max',
      approval: 'deny',
      sources: { model: 'policy', thinking: 'policy', approval: 'parent' },
      selection: { difficulty: 'complex', weight: 100, candidateCount: 2 },
    })
    const simple = await agents.create(
      { parentSessionId, objective: 'Simple review', difficulty: 'simple' },
      { actorId: 'fixture', idempotencyKey: 'small', requestId: 'small' },
    )
    await kernel.waitForIdle()
    expect(simple.configuration).toMatchObject({ modelId: 'small', thinkingLevel: 'low', approval: 'deny' })
    const missingTier = await agents.create(
      { parentSessionId, objective: 'Inherit empty tier', difficulty: 'medium' },
      { actorId: 'fixture', idempotencyKey: 'empty', requestId: 'empty' },
    )
    await kernel.waitForIdle()
    expect(missingTier.dispatchConfiguration?.sources.model).toBe('parent')
    const disabled = await agents.setPolicy(
      { parentSessionId, candidates: [], baselineRevisions: saved.revisions },
      { actorId: 'fixture', idempotencyKey: 'disable' },
    )
    expect(disabled.candidates).toEqual([])
    expect(await agents.setPolicy(input, { actorId: 'fixture', idempotencyKey: 'policy-1' })).toEqual(saved)
    expect((await agents.policy(parentSessionId)).candidates).toEqual([])
    const invalid = await agents
      .setPolicy(
        {
          parentSessionId,
          baselineRevisions: disabled.revisions,
          candidates: [{ difficulty: 'complex', modelId: 'small', thinkingLevel: 'max', weight: 100 }],
        },
        { actorId: 'fixture', idempotencyKey: 'invalid' },
      )
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(invalid).toMatchObject({ code: 'THINKING_LEVEL_UNSUPPORTED' })
    expect((await agents.policy(parentSessionId)).candidates).toEqual([])
    const restored = await agents.setPolicy(
      { parentSessionId, candidates: null, baselineRevisions: disabled.revisions },
      { actorId: 'fixture', idempotencyKey: 'restore' },
    )
    expect(restored.inherited).toBe(true)
  })
})

test('candidate contracts bound capacity, reject duplicate tier models and invalid weights', () => {
  const candidate = { difficulty: 'simple', modelId: 'fixture', thinkingLevel: 'max', weight: 100 }
  expect(agentDispatchCandidatesSchema.safeParse([]).success).toBe(true)
  expect(agentDispatchCandidatesSchema.safeParse([candidate]).success).toBe(true)
  expect(agentDispatchCandidatesSchema.safeParse([candidate, candidate]).success).toBe(false)
  expect(agentDispatchCandidatesSchema.safeParse([{ ...candidate, weight: 0 }]).success).toBe(false)
  const boundary = Array.from({ length: 32 }, (_, index) => ({ ...candidate, modelId: `model-${index}` }))
  expect(agentDispatchCandidatesSchema.safeParse(boundary).success).toBe(true)
  expect(agentDispatchCandidatesSchema.safeParse([...boundary, { ...candidate, modelId: 'overflow' }]).success).toBe(
    false,
  )
})

test('child inherits confirmed parent choices, persists independent settings, and replay never overwrites later edits', async () => {
  await fixture(async (kernel, parentSessionId, settings) => {
    const agents = kernel.plugins.get<AgentService>('agent')
    const input = { parentSessionId, objective: 'Inspect without changing files.' }
    const identity = { actorId: 'fixture', idempotencyKey: 'inherit', requestId: 'inherit-request' }
    const created = await agents.create(input, identity)
    await kernel.waitForIdle()
    const initial = (await kernel.snapshot(created.sessionId)).runs[0]
    expect(initial?.input).toMatchObject({ thinking: 'max', approval: 'allow' })
    expect(created.dispatchConfiguration?.sources).toMatchObject({
      model: 'parent',
      thinking: 'parent',
      approval: 'parent',
    })
    const modelCommands = createModelCommands(kernel, settings)
    try {
      expect(await modelCommands.execute('session.getModel', { sessionId: created.sessionId })).toMatchObject({
        status: 'configured',
        modelId: 'local-fixture',
        thinkingLevel: 'max',
      })
      await change(settings, parentSessionId, { 'provider.thinkingLevel': 'low', 'session.approval': 'deny' })
      expect((await agents.result(parentSessionId, created.agentId)).configuration).toMatchObject({
        thinkingLevel: 'max',
        approval: 'allow',
      })
      await change(settings, created.sessionId, { 'provider.thinkingLevel': 'high', 'session.approval': 'deny' })
      const replay = await agents.create(input, identity)
      expect(replay.agentId).toBe(created.agentId)
      expect(replay.configuration).toMatchObject({ thinkingLevel: 'high', approval: 'deny' })
      expect(replay.dispatchConfiguration?.thinkingLevel).toBe('max')
      expect((await kernel.snapshot(created.sessionId)).runs).toHaveLength(1)
      expect((await kernel.snapshot(created.sessionId)).runs[0]?.input.approval).toBe('allow')
    } finally {
      modelCommands.dispose()
    }
  })
})

test('explicit child overrides do not alter the parent, and unsupported explicit effort is rejected before creation', async () => {
  await fixture(async (kernel, parentSessionId, settings) => {
    await kernel.saveProvider(
      providerSchema.parse({
        id: 'alternate',
        name: 'Alternate fixture',
        protocol: 'mock',
        baseUrl: 'http://127.0.0.1',
        model: 'alternate',
        reasoning: true,
        thinkingLevels: ['low', 'high'],
        defaultThinkingLevel: 'low',
      }),
    )
    const agents = kernel.plugins.get<AgentService>('agent')
    const child = await agents.create(
      { parentSessionId, objective: 'Alternate task', modelId: 'alternate', approval: 'deny' },
      { actorId: 'fixture', idempotencyKey: 'alternate', requestId: 'alternate-request' },
    )
    await kernel.waitForIdle()
    expect(child.dispatchConfiguration).toMatchObject({
      modelId: 'alternate',
      thinkingLevel: 'low',
      approval: 'deny',
      sources: { model: 'override', thinking: 'default', approval: 'override' },
    })
    const parent = await settings.get({ kind: 'session', targetId: parentSessionId })
    expect(JSON.stringify(parent.resolution)).toContain('max')
    let failure: unknown
    try {
      await agents.create(
        { parentSessionId, objective: 'Invalid effort', modelId: 'alternate', thinkingLevel: 'max' },
        { actorId: 'fixture', idempotencyKey: 'invalid', requestId: 'invalid-request' },
      )
    } catch (error) {
      failure = error
    }
    expect(failure).toMatchObject({ code: 'THINKING_LEVEL_UNSUPPORTED' })
    expect((await agents.list(parentSessionId)).items).toHaveLength(1)
  })
})

test('automated dispatch inherits the admitted parent sandbox and max despite later parent setting changes', async () => {
  await fixture(async (kernel, parentSessionId, settings) => {
    const run = await kernel.submit(
      parentSessionId,
      'parent-slow',
      { text: '/slow parent inference', images: [], thinking: 'max', approval: 'sandbox' },
      'local-fixture',
    )
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        if ((await kernel.storage.call('run', run.id)).status === 'running') break
        await Bun.sleep(10)
      }
      await change(settings, parentSessionId, { 'provider.thinkingLevel': 'low', 'session.approval': 'allow' })
      const agents = kernel.plugins.get<AgentService>('agent')
      const child = await agents.create(
        { parentSessionId, objective: 'Read-only child objective', profileId: 'explore' },
        { actorId: 'fixture', idempotencyKey: 'pinned', requestId: 'pinned-request', parentRunId: run.id },
      )
      const snapshot = await kernel.snapshot(child.sessionId)
      expect(snapshot.runs[0]?.input).toMatchObject({
        thinking: 'max',
        approval: 'sandbox',
        sandbox: run.input.sandbox,
      })
      expect(child.dispatchConfiguration).toMatchObject({
        thinkingLevel: 'max',
        approval: 'sandbox',
        sandboxProfileId: DEFAULT_SANDBOX_PROFILE_ID,
      })
      expect(child.dispatchConfiguration?.sandbox?.digest).toBe(run.input.sandbox?.digest)
    } finally {
      await kernel.cancel(run.id)
      await kernel.waitForIdle()
    }
  })
}, 15_000)
