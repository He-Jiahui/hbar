import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'

const resources: { root: string; kernel: Kernel }[] = []

afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('file attachments persist as message blocks and reach the fixture model as bounded text', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-file-attachment-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id)
  const artifact = await kernel.upload('notes.txt', 'text/plain', new TextEncoder().encode('line one\nline two'))

  const run = await kernel.submit(
    session.id,
    'file-attachment',
    { text: 'Inspect this attachment', images: [], files: [artifact] },
    'local-fixture',
  )
  await kernel.waitForIdle()

  const snapshot = await kernel.snapshot(session.id)
  const userMessage = snapshot.messages.find((message) => message.runId === run.id && message.role === 'user')
  expect(run.id).toBeString()
  expect(userMessage?.content).toContainEqual({ type: 'file', artifact })
  expect(snapshot.runs[0]?.status).toBe('completed')
  const responseText = snapshot.messages
    .at(-1)
    ?.content.filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
  expect(responseText).toContain('line one\nline two')
})

test('generic files are accepted while malformed image signatures remain rejected', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-file-validation-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel })

  const artifact = await kernel.upload('payload.bin', 'application/octet-stream', Uint8Array.from([0, 1, 2, 3]))
  expect(artifact.mime).toBe('application/octet-stream')
  await expect(kernel.upload('bad.png', 'image/png', Uint8Array.from([1, 2, 3]))).rejects.toThrow(
    'Image data does not match its declared type',
  )
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id)
  let submitError: unknown
  try {
    await kernel.submit(session.id, 'forged-image', { text: 'wrong channel', images: [artifact] }, 'local-fixture')
  } catch (error) {
    submitError = error
  }
  expect(submitError).toBeInstanceOf(HbarError)
  expect((submitError as HbarError).code).toBe('UNSUPPORTED_IMAGE')
  expect((submitError as HbarError).message).toBe('Image attachments must reference validated image artifacts')
})
