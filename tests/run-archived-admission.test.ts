import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { Kernel, MemorySecrets, createRunCommands } from '@hbar/kernel'

async function removeOwnedAdmissionFixture(root: string): Promise<void> {
  const owned = await realpath(root)
  if (
    owned !== resolve(root) ||
    dirname(owned) !== (await realpath(tmpdir())) ||
    !basename(owned).startsWith('hbar-archived-admission-')
  )
    throw new Error('Unexpected owned archived-admission fixture root')
  await rm(owned, { recursive: true, force: true })
}

test('archived Run admission stays a known refusal and the restored session can use the unaccepted key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-archived-admission-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const commands = createRunCommands(kernel)
  try {
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Owned fixture workspace is missing')
    const session = await kernel.createSession(workspace.id)
    await kernel.updateSession(session.id, { archived: true })
    const domainRefusal = await kernel
      .submit(session.id, 'owned-domain-refusal', { text: 'Owned boundary check', images: [] }, 'local-fixture')
      .then(
        () => null,
        (reason: unknown) => reason,
      )
    expect(domainRefusal).toMatchObject({ code: 'SESSION_ARCHIVED' })
    const input = {
      sessionId: session.id,
      modelId: 'local-fixture',
      input: { text: 'Original owned request', images: [] },
    }
    const options = {
      actorId: 'owned-archived-admission',
      idempotencyKey: 'original-unaccepted-key',
      requestId: 'original-request',
    }
    const rejected = await commands.execute('run.submit', input, options).then(
      () => null,
      (reason: unknown) => reason,
    )
    expect(rejected).toMatchObject({ code: 'ARCHIVED' })
    expect((await kernel.storage.call('events', session.id, 0)).filter((event) => event.type === 'run.queued')).toEqual(
      [],
    )
    await kernel.updateSession(session.id, { archived: false })
    const accepted = await commands.execute('run.submit', input, options)
    expect(accepted).toMatchObject({
      status: 'accepted',
      sessionId: session.id,
      idempotencyKey: options.idempotencyKey,
    })
    await kernel.waitForIdle()
    expect(
      (await kernel.storage.call('events', session.id, 0)).filter((event) => event.type === 'run.queued'),
    ).toHaveLength(1)
  } finally {
    commands.dispose()
    await kernel.close()
    await removeOwnedAdmissionFixture(root)
  }
})
