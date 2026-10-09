import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseResourceReference } from '@hbar/contracts/resources'
import { HbarClient, createResourceCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server'
import { resourceMediaMime } from '../packages/kernel/src/resource-commands'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const action of cleanup.splice(0).reverse()) await action()
})
test('resource parser retains paths, spaces and locations without treating URL ports or symbols as files', () => {
  expect(parseResourceReference('C:\\My Project\\a.ts:12:3', true)).toEqual({
    kind: 'file',
    path: 'C:/My Project/a.ts',
    line: 12,
    column: 3,
  })
  expect(parseResourceReference('file:///C:/My%20Project/a.png', true)).toEqual({
    kind: 'file',
    path: 'C:/My Project/a.png',
  })
  expect(parseResourceReference('file://server/share/a.md', true)).toEqual({
    kind: 'file',
    path: '//server/share/a.md',
  })
  expect(parseResourceReference('/tmp/测试.png', true)).toEqual({ kind: 'file', path: '/tmp/测试.png' })
  expect(parseResourceReference('src/main.ts:2')).toEqual({ kind: 'file', path: 'src/main.ts', line: 2 })
  expect(parseResourceReference('https://example.com:8080/image.png?q=1')).toEqual({
    kind: 'web',
    url: 'https://example.com:8080/image.png?q=1',
    image: true,
  })
  for (const value of [
    'HbarPromptComposer',
    'console.log',
    'npm install',
    '../secrets.txt',
    'javascript:alert(1)',
    'https://user:pass@example.com',
  ])
    expect(parseResourceReference(value, true)).toBeNull()
})
test('media signatures accept passive SVG and reject active or mislabeled content', () => {
  expect(
    resourceMediaMime(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"></svg>')),
  ).toBe('image/svg+xml')
  for (const source of [
    '<svg><script>alert(1)</script></svg>',
    '<svg><image href="https://example.com/a.png" /></svg>',
    '<!DOCTYPE svg><svg/>',
    '<html>not an image</html>',
  ])
    expect(() => resourceMediaMime(new TextEncoder().encode(source))).toThrow()
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-resource-'))
  const workspaceRoot = join(root, 'workspace')
  await mkdir(workspaceRoot)
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: workspaceRoot,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  cleanup.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  await client.pair(host.pairing.code, 'resource test')
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id, 'resource test')
  const target = await kernel.storage.call('sessionLaunchTarget', session.id)
  return {
    root,
    workspaceRoot,
    kernel,
    client,
    input: { workspaceId: workspace.id, sessionTarget: { sessionId: session.id, expectedRevision: target.revision } },
    commands: createResourceCommandClient(client),
  }
}
test('authenticated resources resolve exact files, ambiguous basenames, external text and stale targets', async () => {
  const f = await fixture()
  await mkdir(join(f.workspaceRoot, 'a'))
  await mkdir(join(f.workspaceRoot, 'b'))
  await writeFile(join(f.workspaceRoot, 'a', 'same.ts'), 'first')
  await writeFile(join(f.workspaceRoot, 'b', 'same.ts'), 'second')
  const result = await f.commands.execute('resource.resolve', {
    ...f.input,
    reference: { kind: 'file', path: 'same.ts', line: 3 },
  })
  expect(result.candidates.map((item) => item.workspacePath).sort()).toEqual(['a/same.ts', 'b/same.ts'])
  expect(result.truncated).toBe(false)
  const exact = await f.commands.execute('resource.resolve', {
    ...f.input,
    reference: { kind: 'file', path: 'a/same.ts' },
  })
  expect(exact.candidates).toHaveLength(1)
  await writeFile(join(f.root, 'outside.txt'), 'external read-only')
  const reference = { kind: 'file' as const, path: join(f.root, 'outside.txt') }
  const outside = await f.commands.execute('resource.resolve', { ...f.input, reference })
  expect(outside.candidates[0]?.workspacePath).toBeNull()
  const candidateId = outside.candidates[0]!.id
  expect((await f.commands.execute('resource.text', { ...f.input, reference, candidateId })).text).toBe(
    'external read-only',
  )
  await expect(
    f.commands.execute('resource.resolve', {
      ...f.input,
      sessionTarget: { ...f.input.sessionTarget, expectedRevision: f.input.sessionTarget.expectedRevision + 1 },
      reference,
    }),
  ).rejects.toMatchObject({ code: 'COMMAND_CONFLICT' })
  await expect(
    f.commands.execute('resource.text', { ...f.input, reference, candidateId: '0'.repeat(64) }),
  ).rejects.toMatchObject({ code: 'STALE_TARGET' })
  await expect(
    f.commands.execute('resource.resolve', {
      ...f.input,
      reference: { kind: 'file', path: f.kernel.options.layout.connectionFile },
    }),
  ).rejects.toMatchObject({ code: 'PATH_DENIED' })
  const imagePath = join(f.root, 'small.svg')
  await writeFile(imagePath, '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"></svg>')
  const imageReference = { kind: 'file' as const, path: imagePath }
  const image = await f.commands.execute('resource.resolve', { ...f.input, reference: imageReference })
  const media = await f.client.readResourceMedia(
    { ...f.input, reference: imageReference, candidateId: image.candidates[0]!.id },
    new AbortController().signal,
  )
  expect(media.type).toBe('image/svg+xml')
  expect(await media.text()).toContain('<svg')
})
