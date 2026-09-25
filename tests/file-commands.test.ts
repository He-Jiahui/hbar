import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  HbarClient,
  createAttachmentCommandClient,
  createAttachmentSourceDescriptor,
  createFileCommandClient,
} from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-file-commands-'))
  const kernel = await Kernel.create({
    home: join(root, '.hbar-data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  cleanups.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  await client.pair(host.pairing.code, 'file command test')
  return { root, kernel, workspace, client, commands: createFileCommandClient(client) }
}

test('file commands page, read, and compare-and-write within the workspace boundary', async () => {
  const { root, workspace, client, commands } = await fixture()
  await writeFile(join(root, 'alpha.txt'), 'alpha', 'utf8')
  await writeFile(join(root, 'beta.txt'), 'beta', 'utf8')

  const catalog = await client.call('command.catalog', { category: 'files.tools', limit: 40 })
  expect(catalog.items.map((item) => item.metadata.id)).toEqual([
    'attachment.query',
    'browser.click',
    'browser.close',
    'browser.evaluate',
    'browser.history',
    'browser.navigate',
    'browser.press',
    'browser.screenshot',
    'browser.snapshot',
    'browser.status',
    'browser.type',
    'computer.click',
    'computer.doubleClick',
    'computer.key',
    'computer.launch',
    'computer.move',
    'computer.screenshot',
    'computer.scroll',
    'computer.status',
    'computer.type',
    'computer.wait',
    'file.find',
    'file.list',
    'file.read',
    'file.write',
  ])
  const firstPage = await commands.execute('file.list', { workspaceId: workspace.id, path: '.', limit: 1 })
  expect(firstPage.items).toHaveLength(1)
  expect(firstPage.nextCursor).toBeString()
  const secondPage = await commands.execute('file.list', {
    workspaceId: workspace.id,
    path: '.',
    after: firstPage.nextCursor,
    limit: 10,
  })
  expect(secondPage.items.every((entry) => entry.path > firstPage.nextCursor!)).toBe(true)
  expect(await commands.execute('file.find', { workspaceId: workspace.id, query: 'ALPHA' })).toMatchObject({
    paths: ['alpha.txt'],
    truncated: false,
  })
  expect(await commands.execute('file.find', { workspaceId: workspace.id, query: '.txt', limit: 1 })).toMatchObject({
    paths: ['alpha.txt'],
    truncated: true,
  })
  await expect(
    commands.execute('file.find', { workspaceId: workspace.id, query: 'alpha', path: '..' }),
  ).rejects.toMatchObject({ code: 'PATH_DENIED' })

  const before = await commands.execute('file.read', { workspaceId: workspace.id, path: 'alpha.txt' })
  expect(before).toMatchObject({ text: 'alpha', size: 5 })
  const changed = await commands.execute('file.write', {
    workspaceId: workspace.id,
    path: 'alpha.txt',
    text: 'changed',
    expectedSha256: before.sha256,
  })
  expect(changed).toMatchObject({ created: false, beforeSha256: before.sha256, size: 7 })
  expect(
    await commands.execute('file.write', {
      workspaceId: workspace.id,
      path: 'alpha.txt',
      text: 'changed',
      expectedSha256: before.sha256,
    }),
  ).toEqual(changed)
  await expect(
    commands.execute('file.write', {
      workspaceId: workspace.id,
      path: 'alpha.txt',
      text: 'stale overwrite',
      expectedSha256: before.sha256,
    }),
  ).rejects.toMatchObject({ code: 'FILE_CONFLICT' })
  const concurrentBaseline = await commands.execute('file.read', { workspaceId: workspace.id, path: 'beta.txt' })
  const concurrent = await Promise.allSettled([
    commands.execute('file.write', {
      workspaceId: workspace.id,
      path: 'beta.txt',
      text: 'first writer',
      expectedSha256: concurrentBaseline.sha256,
    }),
    commands.execute('file.write', {
      workspaceId: workspace.id,
      path: 'beta.txt',
      text: 'second writer',
      expectedSha256: concurrentBaseline.sha256,
    }),
  ])
  expect(concurrent.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(concurrent.filter((result) => result.status === 'rejected')).toHaveLength(1)
  expect(concurrent.find((result) => result.status === 'rejected')).toMatchObject({
    reason: { code: 'FILE_CONFLICT' },
  })
  await expect(
    commands.execute('file.read', { workspaceId: workspace.id, path: '../outside.txt' }),
  ).rejects.toMatchObject({ code: 'PATH_DENIED' })
})

test('file path search is bounded, scoped, case-insensitive and read-only', async () => {
  const { root, workspace, commands } = await fixture()
  await mkdir(join(root, 'src'))
  await writeFile(join(root, 'src', 'Alpha.TS'), 'first', 'utf8')
  await writeFile(join(root, 'src', 'beta.ts'), 'second', 'utf8')
  await writeFile(join(root, 'outside.ts'), 'third', 'utf8')
  expect(await commands.execute('file.find', { workspaceId: workspace.id, path: 'src', query: 'ALPHA' })).toMatchObject(
    {
      paths: ['src/Alpha.TS'],
      truncated: false,
    },
  )
  expect(
    await commands.execute('file.find', { workspaceId: workspace.id, path: 'src', query: '.ts', limit: 1 }),
  ).toMatchObject({
    paths: ['src/Alpha.TS'],
    truncated: true,
  })
  expect(
    await commands.execute('file.find', { workspaceId: workspace.id, path: 'src', query: 'outside' }),
  ).toMatchObject({
    paths: [],
    truncated: false,
  })
})

test('attachment query resolves immutable artifact metadata by content id', async () => {
  const { kernel, commands } = await fixture()
  const artifact = await kernel.upload('notes.txt', 'text/plain', new TextEncoder().encode('notes'))
  expect(await commands.execute('attachment.query', { artifactId: artifact.id })).toEqual(artifact)
  await expect(commands.execute('attachment.query', { artifactId: '0'.repeat(64) })).rejects.toMatchObject({
    code: 'NOT_FOUND',
  })
})

test('attachment upload commands keep binary sources client-local and reconcile by content id', async () => {
  const { client, commands } = await fixture()
  const bytes = new TextEncoder().encode('client-local attachment')
  const file = new File([bytes], 'upload.txt', { type: 'text/plain' })
  const sourceId = 'selected-file'
  const input = await createAttachmentSourceDescriptor(sourceId, file)
  const uploads = createAttachmentCommandClient(client, {
    resolve(id) {
      if (id !== sourceId) throw new Error('source expired')
      return file
    },
  })
  try {
    const uploaded = await uploads.execute('attachment.upload', input)
    expect(uploaded).toMatchObject({ id: input.sha256, name: 'upload.txt', mime: 'text/plain', size: bytes.length })
    expect(await uploads.execute('attachment.upload', input)).toEqual(uploaded)
    expect(await commands.execute('attachment.query', { artifactId: input.sha256 })).toEqual(uploaded)
    await expect(uploads.execute('attachment.upload', { ...input, sha256: '0'.repeat(64) })).rejects.toMatchObject({
      code: 'SOURCE_CHANGED',
    })
    const controller = new AbortController()
    controller.abort()
    await expect(uploads.execute('attachment.upload', input, { signal: controller.signal })).rejects.toMatchObject({
      code: 'CANCELLED',
    })
  } finally {
    uploads.dispose()
  }

  let enteredUpload = (): void => {}
  let transportAborted = false
  const entered = new Promise<void>((resolve) => {
    enteredUpload = resolve
  })
  const cancellable = createAttachmentCommandClient(
    {
      upload(_file, signal) {
        enteredUpload()
        return new Promise((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => {
              transportAborted = true
              reject(signal.reason)
            },
            { once: true },
          )
        })
      },
    },
    { resolve: () => file },
  )
  try {
    const controller = new AbortController()
    const pending = cancellable.execute('attachment.upload', input, { signal: controller.signal })
    await entered
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    await Bun.sleep(0)
    expect(transportAborted).toBe(true)
  } finally {
    cancellable.dispose()
  }
})
