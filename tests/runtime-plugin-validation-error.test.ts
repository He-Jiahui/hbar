import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { ManagedProcess, RuntimeArtifactStore, RuntimeValuePort } from '@hbar/runtime'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { runtimePluginStateSchema } from '@hbar/plugin-sdk/runtime-plugin'
import type { RuntimePluginState } from '@hbar/plugin-sdk/runtime-plugin'
import {
  PLUGIN_RUNTIME_FINGERPRINT,
  RUNTIME_PLUGIN_CONTROL_METHODS,
  runtimePluginResultSchema,
} from '../apps/host/src/runtime-plugin-contract'
import { runtimePluginValidationError } from '../apps/host/src/runtime-plugin-validation-error'

test('validation summaries bound issue count and redact custom messages and arbitrary path keys', () => {
  const marker = 'fixture-private-value-5398'
  const invalid = z
    .object({ [marker]: z.array(z.string().max(0)) })
    .safeParse({ [marker]: Array.from({ length: 16 }, () => marker) })
  if (invalid.success) throw new Error('Fixture must fail validation')
  const summary = runtimePluginValidationError(invalid.error, 'fixture')
  if (summary === null) throw new Error('Validation summary missing')
  expect(summary.split('too_big at')).toHaveLength(9)
  expect(summary).toContain('field.0')
  expect(summary).not.toContain(marker)
  expect(summary.length).toBeLessThanOrEqual(1_600)
  const custom = z
    .string()
    .superRefine((_value, context) => context.addIssue({ code: 'custom', message: marker }))
    .safeParse(marker)
  if (custom.success) throw new Error('Custom fixture must fail validation')
  expect(runtimePluginValidationError(custom.error, 'fixture')).toBe('Invalid tool arguments: custom at input.')
  expect(runtimePluginValidationError(new Error(marker), 'fixture')).toBeNull()
})

test('actual owned validation reports workflow preconditions without echoing invalid values or unknown keys', async () => {
  const root = await mkdtemp(join(process.cwd(), 'artifacts', 'owned-validation-'))
  const source = join(root, 'plugin.ts')
  const secretMarker = 'fixture-secret-do-not-echo-54905'
  await writeFile(
    source,
    `
    import { definePlugin } from '@hbar/plugin-sdk'
    import { workflowExpandScopeToolSchema } from '../../plugins/workflow/src/update-tool-schema'
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
    expect(missing.message).toContain('expectedRevision alone OR both expectedFocusRevision and expectedPlanRevision')
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
    expect(await validate({ ...input, expectedRevision: 1 })).toMatchObject({ kind: 'value' })
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
