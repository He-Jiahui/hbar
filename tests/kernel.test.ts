import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { Approval, StreamDelta } from '@hbar/contracts'
import { dependencyOrder } from '../packages/kernel/src/plugins.ts'
import type { PluginManifest } from '@hbar/plugin-sdk'

const resources: { root: string; kernel: Kernel }[] = []
afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-kernel-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id)
  return { root, kernel, session }
}
test('Pi streams and persists a real run; duplicate request ids do not duplicate model execution', async () => {
  const { kernel, session } = await fixture()
  const input = { text: 'hello', images: [] }
  const a = await kernel.submit(session.id, 'same-request', input, 'local-fixture')
  const b = await kernel.submit(session.id, 'same-request', input, 'local-fixture')
  expect(a.id).toBe(b.id)
  await kernel.waitForIdle()
  const snapshot = await kernel.snapshot(session.id)
  expect(snapshot.runs[0]?.status).toBe('completed')
  expect(snapshot.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
  expect(snapshot.usage.output).toBeGreaterThan(0)
  expect((await kernel.storage.call('events', session.id, 0)).filter((e) => e.type === 'request.started')).toHaveLength(
    1,
  )
})
test('write approval runs through the tool gate; denial never writes', async () => {
  const { root, kernel, session } = await fixture()
  let approvals = 0
  kernel.subscribe((event) => {
    if (event.method === 'session.event' && event.params.type === 'approval.requested') {
      const approval = event.params.data as Approval
      void kernel.resolveApproval(approval.id, ++approvals === 1 ? 'denied' : 'allowed')
    }
  })
  await kernel.submit(
    session.id,
    'denied',
    { text: '/tool write_file {"path":"result.txt","text":"accepted"}', images: [] },
    'local-fixture',
  )
  await kernel.waitForIdle()
  expect(await Bun.file(join(root, 'result.txt')).exists()).toBe(false)
  await kernel.submit(
    session.id,
    'allowed',
    { text: '/tool write_file {"path":"result.txt","text":"accepted"}', images: [] },
    'local-fixture',
  )
  await kernel.waitForIdle()
  expect(await readFile(join(root, 'result.txt'), 'utf8')).toBe('accepted')
  expect((await kernel.snapshot(session.id)).messages.filter((m) => m.role === 'tool')).toHaveLength(2)
})
test('permission presets can allow writes without a per-call approval and survive restart', async () => {
  const { root, kernel, session } = await fixture()
  await kernel.setPermissionMode('allow')
  expect(kernel.permissionMode()).toBe('allow')
  await kernel.submit(
    session.id,
    'auto-allow',
    { text: '/tool write_file {"path":"automatic.txt","text":"no prompt"}', images: [] },
    'local-fixture',
  )
  await kernel.waitForIdle()
  expect(await readFile(join(root, 'automatic.txt'), 'utf8')).toBe('no prompt')
  expect((await kernel.snapshot(session.id)).approvals).toHaveLength(0)

  await kernel.close()
  const index = resources.findIndex((entry) => entry.kernel === kernel)
  if (index >= 0) resources.splice(index, 1)
  const restarted = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel: restarted })
  expect(restarted.permissionMode()).toBe('allow')
})
test('cancel settles an active stream and plugin unload removes registrations', async () => {
  const { kernel, session } = await fixture()
  const run = await kernel.submit(session.id, 'cancel', { text: '/slow', images: [] }, 'local-fixture')
  for (let i = 0; i < 100 && !kernel.streams.size; i++) await Bun.sleep(10)
  await kernel.cancel(run.id)
  await kernel.waitForIdle()
  expect((await kernel.storage.call('run', run.id)).status).toBe('cancelled')
  expect(kernel.streams.size).toBe(0)
  expect(kernel.tools.get('read_file')).toBeDefined()
  await kernel.changePlugin('tools.workspace', false)
  expect(kernel.tools.get('read_file')).toBeUndefined()
  await kernel.changePlugin('tools.workspace', true)
  expect(kernel.tools.get('read_file')).toBeDefined()
})
test('stream notifications carry bounded append deltas with independent offsets', async () => {
  const { kernel, session } = await fixture()
  const deltas: StreamDelta[] = []
  kernel.subscribe((event) => {
    if (event.method === 'stream.update') deltas.push(event.params)
  })
  const run = await kernel.submit(session.id, 'stream-deltas', { text: '/slow', images: [] }, 'local-fixture')
  for (let i = 0; i < 100 && deltas.length < 3; i++) await Bun.sleep(20)
  await kernel.cancel(run.id)
  await kernel.waitForIdle()
  expect(deltas.length).toBeGreaterThanOrEqual(3)
  let text = '',
    thinking = ''
  for (const delta of deltas) {
    expect(delta.operation).toBe('append')
    expect(delta.textOffset).toBe(text.length)
    expect(delta.thinkingOffset).toBe(thinking.length)
    expect(delta.text.length + delta.thinking.length).toBeLessThan(200)
    text += delta.text
    thinking += delta.thinking
  }
})
test('dependency checks reject missing providers, duplicates, cycles, and incompatible versions', () => {
  const base = (id: string): PluginManifest => ({
    id,
    name: id,
    version: '1.0.0',
    apiVersion: '^1.0.0',
    description: '',
    scope: 'host',
    permissions: [],
  })
  expect(() => dependencyOrder([{ ...base('a'), requires: { missing: '^1.0.0' } }])).toThrow('requires')
  expect(() =>
    dependencyOrder([
      { ...base('a'), provides: { x: '1.0.0' } },
      { ...base('b'), provides: { x: '1.0.0' } },
    ]),
  ).toThrow('Multiple')
  expect(() =>
    dependencyOrder([
      { ...base('a'), provides: { x: '1.0.0' }, requires: { y: '*' } },
      { ...base('b'), provides: { y: '1.0.0' }, requires: { x: '*' } },
    ]),
  ).toThrow(' -> ')
  expect(() =>
    dependencyOrder([
      { ...base('a'), provides: { x: '1.0.0' } },
      { ...base('b'), requires: { x: '^2.0.0' } },
    ]),
  ).toThrow('found 1.0.0')
})
