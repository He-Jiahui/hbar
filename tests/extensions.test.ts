import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin } from '@hbar/plugin-sdk'
import readonlyProfile from '../examples/read-only.profile'

const resources: { root: string; kernel: Kernel }[] = []
afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-extension-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  return { root, kernel, workspace }
}
test('local plugin registers a tool, configuration, host/client panels and releases effects on disable', async () => {
  const { kernel, workspace } = await fixture()
  await kernel.installPlugin(resolve('examples/observer'))
  await kernel.changePlugin('hbar-example-observer', true, { greeting: 'Configured greeting' })
  expect(kernel.plugins.list().find((p) => p.id === 'hbar-example-observer')?.config.greeting).toBe(
    'Configured greeting',
  )
  expect(kernel.plugins.clientCode('hbar-example-observer')).toContain('Increment counter')
  const session = await kernel.createSession(workspace.id)
  await kernel.submit(session.id, 'extension', { text: '/tool workspace_status {}', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  expect(
    (await kernel.snapshot(session.id)).messages.some((m) =>
      m.content.some((b) => b.type === 'tool_result' && b.text.includes('Configured greeting')),
    ),
  ).toBeTrue()
  expect((await kernel.storage.call('events', session.id, 0)).some((e) => e.type === 'example.observed')).toBeTrue()
  await kernel.changePlugin('hbar-example-observer', false)
  expect(kernel.tools.get('workspace_status')).toBeUndefined()
  expect([...kernel.plugins.panels.values()].filter((p) => p.owner === 'hbar-example-observer')).toHaveLength(0)
  expect(() => kernel.plugins.clientCode('hbar-example-observer')).toThrow('not found')
  await kernel.submit(session.id, 'after-disable', { text: 'hello', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  expect(
    (await kernel.storage.call('events', session.id, 0)).filter((e) => e.type === 'example.observed'),
  ).toHaveLength(1)
})

test('disables an entire downstream plugin tree atomically', async () => {
  const { kernel } = await fixture()
  kernel.plugins.add(
    definePlugin({
      manifest: {
        id: 'tree.base', name: 'Tree base', version: '1.0.0', apiVersion: '^1.0.0', scope: 'host',
        description: '', permissions: [],
      },
      apply() {},
    }),
  )
  kernel.plugins.add(
    definePlugin({
      manifest: {
        id: 'tree.child', packageName: 'tree.child', name: 'Tree child', version: '1.0.0', apiVersion: '^1.0.0',
        scope: 'host', description: '', permissions: [], dependencies: { 'tree.base': '^1.0.0' },
      },
      apply() {},
    }),
  )
  kernel.plugins.add(
    definePlugin({
      manifest: {
        id: 'tree.optional', name: 'Tree optional', version: '1.0.0', apiVersion: '^1.0.0',
        scope: 'host', description: '', permissions: [], optionalDependencies: { 'tree.base': '^1.0.0' },
      },
      apply() {},
    }),
  )
  await kernel.changePlugin('tree.child', true)
  await kernel.changePlugin('tree.optional', true)
  expect(kernel.plugins.list().filter((plugin) => plugin.id.startsWith('tree.')).every((plugin) => plugin.status === 'active')).toBeTrue()
  await kernel.changePluginTree('tree.base')
  expect(kernel.plugins.list().filter((plugin) => plugin.id.startsWith('tree.')).every((plugin) => plugin.status !== 'active')).toBeTrue()
})

test('scopes dependency graphs and tree shutdown to a project installation', async () => {
  const { kernel, workspace } = await fixture()
  kernel.plugins.add(
    definePlugin({
      manifest: {
        id: 'project.base', name: 'Project base', version: '1.0.0', apiVersion: '^1.0.0',
        scope: 'workspace', description: '', permissions: [],
      },
      apply() {},
    }),
    undefined,
    workspace.id,
  )
  kernel.plugins.add(
    definePlugin({
      manifest: {
        id: 'project.child', name: 'Project child', version: '1.0.0', apiVersion: '^1.0.0',
        scope: 'workspace', description: '', permissions: [], dependencies: { 'project.base': '^1.0.0' },
      },
      apply() {},
    }),
    undefined,
    workspace.id,
  )
  expect(kernel.plugins.list().find((plugin) => plugin.id === 'project.base')?.status).toBe('active')
  const projectNodeIds = kernel.plugins.graph(workspace.id).nodes.map((node) => node.id)
  expect(projectNodeIds).toContain('project.base')
  expect(projectNodeIds).toContain('project.child')
  expect(kernel.plugins.graph('other-project').nodes.map((node) => node.id)).not.toContain('project.base')
  await kernel.changePluginTree('project.base', workspace.id)
  expect(kernel.plugins.list().filter((plugin) => plugin.id.startsWith('project.')).every((plugin) => plugin.status !== 'active')).toBeTrue()
})

test('keeps same plugin id isolated across global and project installations', async () => {
  const { kernel, workspace } = await fixture()
  const plugin = (label: string) =>
    definePlugin({
      manifest: {
        id: 'shared.plugin', name: label, version: '1.0.0', apiVersion: '^1.0.0',
        scope: 'workspace', description: '', permissions: [],
      },
      apply() {},
    })
  kernel.plugins.add(plugin('Global shared'))
  kernel.plugins.add(plugin('Project shared'), undefined, workspace.id)

  expect(kernel.plugins.list().filter((entry) => entry.id === 'shared.plugin')).toHaveLength(2)
  expect(kernel.plugins.graph(workspace.id).nodes.filter((node) => node.id === 'shared.plugin')).toEqual([
    { id: 'shared.plugin', version: '1.0.0', enabled: true, projectId: workspace.id },
  ])
  await kernel.changePlugin('shared.plugin', false, undefined, workspace.id)
  expect(kernel.plugins.list().find((entry) => entry.projectId === workspace.id)?.status).toBe('disabled')
  expect(kernel.plugins.list().find((entry) => !entry.projectId)?.status).toBe('active')
  expect(kernel.plugins.graph(workspace.id).nodes.filter((node) => node.id === 'shared.plugin')).toEqual([
    { id: 'shared.plugin', version: '1.0.0', enabled: false, projectId: workspace.id },
  ])
  kernel.plugins.add(
    definePlugin({
      manifest: {
        id: 'global.fallback', name: 'Global fallback', version: '1.0.0', apiVersion: '^1.0.0',
        scope: 'host', description: '', permissions: [],
      },
      apply() {},
    }),
  )
  await kernel.changePlugin('global.fallback', false, undefined, workspace.id)
  expect(kernel.plugins.list().find((entry) => entry.id === 'global.fallback')?.status).toBe('disabled')
})

test('concurrent run plugins see their own scopes and dispose at settlement', async () => {
  const { kernel, workspace } = await fixture()
  const disposed: string[] = []
  kernel.plugins.add(
    definePlugin({
      manifest: {
        id: 'test.scope',
        name: 'Scoped fixture',
        version: '1.0.0',
        apiVersion: '^1.0.0',
        description: '',
        scope: 'run',
        permissions: [],
      },
      apply(ctx) {
        const runId = ctx.hbar.api.scope.runId!
        ctx.hbar.api.tools.register({
          name: 'scope_identity',
          description: 'Current scope',
          effect: 'read',
          inputSchema: z.object({}),
          async execute() {
            return { text: runId }
          },
        })
        ctx.effect(() => () => {
          disposed.push(runId)
        })
      },
    }),
  )
  await kernel.changePlugin('test.scope', true)
  const sessions = await Promise.all([kernel.createSession(workspace.id), kernel.createSession(workspace.id)])
  const runs = await Promise.all(
    sessions.map((s) =>
      kernel.submit(s.id, 'scoped', { text: '/tool scope_identity {}', images: [] }, 'local-fixture'),
    ),
  )
  await kernel.waitForIdle()
  for (const run of runs) {
    expect(disposed).toContain(run.id)
    expect(
      (await kernel.snapshot(run.sessionId)).messages
        .flatMap((m) => m.content)
        .some((b) => b.type === 'tool_result' && b.text === run.id),
    ).toBeTrue()
  }
  expect(kernel.tools.get('scope_identity')).toBeUndefined()
})

test('compaction retains raw history and fork can reconstruct context', async () => {
  const { kernel, workspace } = await fixture()
  const session = await kernel.createSession(workspace.id)
  for (let i = 0; i < 7; i++) {
    await kernel.submit(session.id, String(i), { text: `Message ${i}`, images: [] }, 'local-fixture')
    await kernel.waitForIdle()
  }
  const before = await kernel.snapshot(session.id)
  const result = await kernel.compact(session.id, 'local-fixture')
  expect(result.summary).toContain('Summary:')
  const context = await kernel.storage.call('context', session.id)
  expect(context.messages.length).toBeLessThan(before.messages.length)
  expect((await kernel.snapshot(session.id)).messages).toHaveLength(before.messages.length)
  const branch = await kernel.storage.call('fork', session.id)
  expect((await kernel.snapshot(branch.id)).messages).toHaveLength(before.messages.length)
  await kernel.submit(branch.id, 'branch-run', { text: 'Continue from fork', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  expect((await kernel.snapshot(branch.id)).runs[0]?.status).toBe('completed')
  expect((await kernel.snapshot(session.id)).messages).toHaveLength(before.messages.length)
})

test('startup profiles replace a required provider without changing the kernel', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-profile-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    profile: readonlyProfile,
  })
  resources.push({ root, kernel })
  const session = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id)
  await kernel.submit(
    session.id,
    'readonly',
    { text: '/tool write_file {"path":"denied.txt","text":"denied"}', images: [] },
    'local-fixture',
  )
  await kernel.waitForIdle()
  expect(await Bun.file(join(root, 'denied.txt')).exists()).toBe(false)
  expect((await kernel.snapshot(session.id)).approvals).toHaveLength(0)
  expect(
    (await kernel.snapshot(session.id)).messages
      .flatMap((m) => m.content)
      .some((b) => b.type === 'tool_result' && b.isError && b.text.includes('denied')),
  ).toBe(true)
  expect(kernel.plugins.list().find((p) => p.id === 'policy.readonly')?.required).toBe(true)
})
