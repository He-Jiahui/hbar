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
