import { expect, test } from 'bun:test'
import { z } from 'zod'
import { describeRuntimeTool, runtimeToolAdapter, describeRuntimeHook, restoreRuntimeHook } from '@hbar/plugin-sdk/runtime-plugin'
import type { HarnessDriver, ToolDefinition } from '@hbar/plugin-sdk'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

test('plugin descriptions contain JSON alone and owner validation retains schema defaults', async () => {
  const owned: ToolDefinition = { name: 'owned_probe', description: 'Owned argument checks', effect: 'write', timeoutMs: 1_000,
    inputSchema: z.object({ count: z.number().int().positive().default(7) }), execute: async () => ({ text: 'owned' }) }
  const description = describeRuntimeTool(owned)
  expect(JSON.parse(JSON.stringify(description))).toEqual(description)
  expect(Object.values(description).some(value => typeof value === 'function' || value instanceof z.ZodType)).toBe(false)
  const adapter = runtimeToolAdapter(description, { validate: async (_name, args) => owned.inputSchema.parse(args), execute: async () => ({ text: 'owned' }) })
  expect(await adapter.validate?.({})).toEqual({ count: 7 })
  await expect(adapter.validate?.({ count: 0 })!).rejects.toMatchObject({ code: 'INVALID_TOOL_INPUT' })
})

test('Hook descriptions keep schemas and executors local and reject unbound tool or effect substitution', () => {
  const tool: ToolDefinition = { name: 'read_owned', description: 'Original read tool', effect: 'read', inputSchema: z.object({ path: z.string() }),
    execute: async () => ({ text: 'read' }) }
  const data = describeRuntimeHook('tools.advertise', { sessionId: 'session', runId: 'run', tools: [tool] })
  expect(() => JSON.stringify(data)).not.toThrow()
  const updated = { ...data, tools: [{ ...describeRuntimeTool(tool), description: 'Advertised read tool' }] }
  const restored = restoreRuntimeHook('tools.advertise', updated, [tool])
  expect(restored.tools[0]?.inputSchema).toBe(tool.inputSchema); expect(restored.tools[0]?.execute).toBe(tool.execute)
  expect(restored.tools[0]?.description).toBe('Advertised read tool')
  for (const replacement of [{ name: 'write_foreign' }, { effect: 'write' }])
    expect(() => restoreRuntimeHook('tools.select', { ...data, tools: [{ ...describeRuntimeTool(tool), ...replacement }] }, [tool])).toThrow('unbound tool')
})
test('the actual Kernel validates in the owner before and after Hooks and never records intent for rejected transformed arguments', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-owned-tool-'))
  let validated = 0, executed = 0
  const owned: ToolDefinition = { name: 'owned_probe', description: 'Validate before intent', effect: 'write', timeoutMs: 1_000,
    inputSchema: z.object({ count: z.number().int().positive().default(7) }), execute: async () => { executed++; return { text: 'executed' } } }
  const plugin = definePlugin({ manifest: { id: 'fixture.owned-tool', name: 'Owned fixture', description: 'Remote validation adapter', version: '1.0.0', apiVersion: '^1.0.0', scope: 'host', permissions: [] },
    apply(ctx) {
      ctx.hbar.api.tools.register(runtimeToolAdapter(describeRuntimeTool(owned), {
        validate: async (_name, args) => { validated++; return owned.inputSchema.parse(args) }, execute: (_name, args, context) => owned.execute(args, context),
      }))
      ctx.hbar.api.hooks.on('tool.before', value => value.name === 'owned_probe' ? { ...value, args: { count: 0 } } : value)
    } })
  const driver = definePlugin({ manifest: { id: 'driver.pi', name: 'Fixture', description: 'Call the owned tool', version: '1.0.0', apiVersion: '^1.0.0', scope: 'host', provides: { driver: '1.0.0' }, permissions: [] },
    apply(ctx) { provide<HarnessDriver>(ctx, 'driver', { run: async input => { await input.execute('owned_probe', {}, 'call'); await input.commit('assistant', [{ type: 'text', text: 'Rejected safely' }]) },
      summarize: async () => ({ text: '', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 } }) }) } })
  const kernel = await Kernel.create({ home: root, demo: true, secrets: new MemorySecrets(), profile: { plugins: [plugin], replacements: { 'driver.pi': driver } } })
  try {
    const workspace = await kernel.createWorkspace(root), session = await kernel.storage.call('createSession', workspace.id)
    const run = await kernel.submit(session.id, 'owned-tool-validation', { text: 'validate twice', images: [], approval: 'allow' }, 'local-fixture')
    await kernel.waitForIdle()
    expect(validated).toBe(2); expect(executed).toBe(0)
    expect((await kernel.storage.call('events', session.id, 0)).filter(event => event.type === 'tool.started' && event.runId === run.id)).toEqual([])
  } finally { await kernel.close(); await rm(root, { recursive: true, force: true }) }
})
