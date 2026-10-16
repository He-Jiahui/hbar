import { ManagedProcess, RuntimeArtifactStore, RuntimeValuePort } from '@hbar/runtime'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { runtimePluginStateSchema } from '@hbar/plugin-sdk/runtime-plugin'
import type { RuntimePluginState } from '@hbar/plugin-sdk/runtime-plugin'
import {
  PLUGIN_RUNTIME_FINGERPRINT,
  RUNTIME_PLUGIN_CONTROL_METHODS,
  runtimePluginResultSchema,
} from '../apps/host/src/runtime-plugin-contract'
import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { GoalService, PlanService, WorkflowService } from '@hbar/plugin-sdk'
import { workflowExpandScopeToolSchema } from '../plugins/workflow/src'

test('registered scope tool rejects conflicting and stale identities, expands with pair, and preserves numeric update and write fencing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-scope-pair-'))
  let kernel: Kernel | undefined
  try {
    await writeFile(join(root, 'proof.txt'), 'initial')
    kernel = await Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
    })
    const host = kernel
    await host.changePlugin('goal.codex', true, { autoContinue: false })
    await host.setPermissionMode('allow')
    const workspace = (await host.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Fixture workspace missing')
    const session = await host.createSession(workspace.id)
    const goals = host.plugins.get<GoalService>('goal')
    const plans = host.plugins.get<PlanService>('plan')
    const workflows = host.plugins.get<WorkflowService>('workflow')
    await goals.create(session.id, 'Produce the authorized proof')
    const plan = await plans.update(session.id, [{ step: 'Produce proof', status: 'in_progress' }])
    await workflows.focus(
      session.id,
      0,
      {
        id: 'proof',
        title: 'Produce proof',
        scope: { readPaths: ['proof.txt'], writePaths: [], tools: ['read_file'] },
        acceptanceChecks: [],
      },
      'user',
      plan.revision,
    )
    const tool = host.tools.get('workflow_expand_scope')
    if (!tool) throw new Error('Registered scope tool missing')
    const current = (await workflows.get(session.id)).workflow
    if (!current || current.focusRevision === undefined) throw new Error('Fixture focus missing')
    const input = {
      itemId: 'proof',
      scope: { readPaths: [], writePaths: ['proof.txt'], tools: ['write_file'] },
      reason: 'Write the authorized proof',
      expectedFocusRevision: current.focusRevision,
      expectedPlanRevision: current.planRevision,
    }
    expect(tool.inputSchema.safeParse(input).success).toBe(true)
    expect(tool.inputSchema.safeParse({ ...input, expectedRevision: current.revision }).success).toBe(false)
    expect(tool.inputSchema.safeParse({ ...input, expectedPlanRevision: undefined }).success).toBe(false)
    expect(
      tool.inputSchema.safeParse({
        itemId: 'proof',
        scope: {},
        reason: input.reason,
        expectedRevision: current.revision,
      }).success,
    ).toBe(false)
    expect(tool.inputSchema.safeParse({ ...input, scope: { writePaths: ['../escape'] } }).success).toBe(false)
    expect(tool.inputSchema.safeParse(input)).toEqual(workflowExpandScopeToolSchema.safeParse(input))
    const invoke = async (name: string, args: unknown) => {
      const run = await host.submit(
        session.id,
        crypto.randomUUID(),
        { text: `/tool ${name} ${JSON.stringify(args)}`, images: [] },
        'local-fixture',
      )
      await host.waitForIdle()
      const result = (await host.snapshot(session.id)).messages
        .filter((message) => message.runId === run.id)
        .flatMap((message) => message.content)
        .find((block) => block.type === 'tool_result' && block.name === name)
      if (!result || result.type !== 'tool_result') throw new Error('Fixture tool result missing')
      return result
    }
    for (const invalid of [
      { ...input, expectedRevision: current.revision },
      { itemId: 'proof', scope: input.scope, reason: input.reason, expectedRevision: current.revision },
      { ...input, expectedPlanRevision: undefined },
      { ...input, expectedFocusRevision: current.focusRevision + 1 },
      { ...input, expectedPlanRevision: current.planRevision + 1 },
    ]) {
      expect((await invoke('workflow_expand_scope', invalid)).isError).toBe(true)
      expect((await workflows.get(session.id)).workflow?.scopeExpansions).toHaveLength(0)
    }
    expect((await invoke('workflow_expand_scope', input)).isError).toBe(false)
    expect((await workflows.get(session.id)).workflow?.scopeExpansions).toHaveLength(1)
    expect((await invoke('write_file', { path: 'proof.txt', text: 'authorized' })).isError).toBe(false)
    expect(await readFile(join(root, 'proof.txt'), 'utf8')).toBe('authorized')
    expect((await invoke('write_file', { path: 'outside.txt', text: 'forbidden' })).isError).toBe(true)
    await expect(readFile(join(root, 'outside.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    const after = (await workflows.get(session.id)).workflow
    if (!after) throw new Error('Fixture workflow missing')
    expect(
      (
        await invoke('workflow_update', {
          action: 'expand_scope',
          itemId: 'proof',
          expectedRevision: after.revision,
          scope: { readPaths: ['another.txt'], writePaths: [], tools: [] },
          reason: 'Inspect authorized proof context',
        })
      ).isError,
    ).toBe(false)
    expect((await workflows.get(session.id)).workflow?.scopeExpansions).toHaveLength(2)
    const publicCurrent = (await workflows.get(session.id)).workflow
    if (!publicCurrent) throw new Error('Fixture workflow missing')
    await workflows.expandScope(
      session.id,
      'proof',
      { readPaths: ['public.txt'], writePaths: [], tools: [] },
      'Public numeric CAS remains supported',
      publicCurrent.revision,
    )
    expect((await workflows.get(session.id)).workflow?.scopeExpansions).toHaveLength(3)
  } finally {
    try {
      await kernel?.close()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
}, 60_000)

test('managed owned RPC enforces pair-only scope input and redacts invalid paths', async () => {
  const root = await mkdtemp(join(process.cwd(), 'artifacts', 'owned-validation-'))
  const source = join(root, 'plugin.ts')
  const secretMarker = 'fixture-secret-do-not-echo-54905'
  await writeFile(
    source,
    `
    import { definePlugin } from '@hbar/plugin-sdk'
    import { workflowExpandScopeToolSchema } from '../../plugins/workflow/src'
    import { createRuntimePlugin } from '../../apps/host/src/runtime-plugin-process'
    const plugin = definePlugin({ manifest: { id: 'validation.fixture', name: 'Validation fixture',
      description: 'Real workflow validation boundary', version: '1.0.0', apiVersion: '^1.0.0', scope: 'host', permissions: [] },
      apply(ctx) { ctx.hbar.api.tools.register({ name: 'workflow_expand_scope', description: 'Validate only',
        effect: 'read', inputSchema: workflowExpandScopeToolSchema, execute: async () => ({ text: 'unused' }) }) } })
    export const create = context => createRuntimePlugin(context, { plugins: [plugin] })
  `,
  )
  const descriptor = {
    id: 'plugin.validation-fixture',
    kind: 'plugin' as const,
    isolation: 'process' as const,
    dependencies: [],
    required: true,
    reloadable: true,
    contractFingerprint: PLUGIN_RUNTIME_FINGERPRINT,
    storageSchema: STORAGE_SCHEMA_VERSION,
  }
  const artifacts = new RuntimeArtifactStore(join(root, 'bundles'), process.cwd())
  let application: RuntimeValuePort | undefined
  let readState: (() => Promise<RuntimePluginState>) | undefined
  let owner: ManagedProcess | undefined
  try {
    const artifact = await artifacts.build({ descriptor, entrypoint: source })
    owner = new ManagedProcess({
      descriptor,
      artifactId: artifact.id,
      generation: 1,
      modulePath: await artifacts.modulePath(artifact.id),
      configuration: { dataRoot: root, cacheRoot: join(root, 'cache') },
      parent: { unitId: 'base', generation: 1, incarnation: 'validation-fixture-base' },
      controlMethods: RUNTIME_PLUGIN_CONTROL_METHODS,
      onPeer: (peer) => {
        readState = () => peer.call('plugin.state', undefined, runtimePluginStateSchema)
        application = new RuntimeValuePort(peer, { prefix: 'plugin.application' })
      },
    })
    await owner.prepare()
    await owner.activate()
    const port = application
    if (!port || !readState) throw new Error('Owned validation fixture port missing')
    const state = await readState()
    expect(owner.snapshot().pid).not.toBe(process.pid)
    const validate = async (input: unknown) =>
      runtimePluginResultSchema.parse(
        await port.call('invoke', [
          { operation: 'validate', name: 'workflow_expand_scope', catalog: state.tools },
          [input],
          async () => {
            throw new Error('Validation cannot invoke Host services')
          },
        ]),
      )
    const input = {
      itemId: 'focus',
      scope: { readPaths: ['src'], writePaths: ['src'], tools: ['read_file'] },
      reason: 'Authorized repair',
    }
    const missing = await validate(input)
    expect(missing).toMatchObject({ kind: 'error', code: 'INVALID_TOOL_INPUT' })
    if (missing.kind !== 'error') throw new Error('Missing precondition was accepted')
    expect(missing.message).toContain('expectedFocusRevision')
    const mixed = await validate({ ...input, expectedRevision: 1, expectedFocusRevision: 1, expectedPlanRevision: 1 })
    expect(mixed).toMatchObject({ kind: 'error', code: 'INVALID_TOOL_INPUT' })
    const invalid = await validate({
      ...input,
      expectedRevision: 1,
      scope: { ...input.scope, readPaths: [`../${secretMarker}`] },
      [secretMarker]: secretMarker,
    })
    expect(invalid).toMatchObject({ kind: 'error', code: 'INVALID_TOOL_INPUT' })
    if (invalid.kind !== 'error') throw new Error('Invalid paths were accepted')
    expect(invalid.message).toContain('scope.readPaths.0')
    expect(JSON.stringify(invalid)).not.toContain(secretMarker)
    expect(invalid.message.length).toBeLessThanOrEqual(1_600)
    expect(await validate({ ...input, expectedRevision: 1 })).toMatchObject({
      kind: 'error',
      code: 'INVALID_TOOL_INPUT',
    })
    expect(await validate({ ...input, expectedFocusRevision: 1, expectedPlanRevision: 1 })).toMatchObject({
      kind: 'value',
    })
    expect(port.snapshot().callbacks).toBe(0)
  } finally {
    try {
      await owner?.dispose()
    } finally {
      application?.dispose()
      await rm(root, { recursive: true, force: true })
    }
  }
}, 60_000)
