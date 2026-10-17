import { expect, test } from 'bun:test'
import { z } from 'zod'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { RunCommandRecord } from '@hbar/contracts/commands/run'
import { removeOwnedTestDirectory } from './owned-temp-directory'

function barrier() {
  let open: () => void = () => {
    throw new Error('Barrier has not initialized')
  }
  const wait = new Promise<void>((resolve) => {
    open = resolve
  })
  return { open, wait }
}
const command = (actorId: string, requestId: string): RunCommandRecord => ({
  actorId,
  requestId,
  idempotencyKey: requestId,
  inputHash: 'a'.repeat(64),
})

test('a running parent creates its child under its own principal even when another operator has queued a later task', async () => {
  const prefix = 'hbar-principal-kernel-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const started = barrier(),
    release = barrier()
  let childId: string | undefined
  try {
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Principal fixture has no workspace')
    const session = await kernel.storage.call('createSessionCommand', {
      workspaceId: workspace.id,
      actorId: 'operator-a',
      idempotencyKey: 'create',
    })
    kernel.tools.register({
      name: 'principal_child_fixture',
      description: 'Create a child after another operator queues a task',
      effect: 'read',
      workspaceAccess: { kind: 'none' },
      inputSchema: z.strictObject({}),
      async execute(_args, context) {
        started.open()
        await release.wait
        context.signal.throwIfAborted()
        const child = await kernel.createSession(workspace.id, 'child', context.session.id)
        childId = child.id
        return { text: child.id }
      },
    })
    const first = await kernel.submit(
      session.id,
      'parent-a',
      { text: '/tool principal_child_fixture {}', images: [], approval: 'allow' },
      'local-fixture',
      command('operator-a', 'parent-a'),
    )
    await started.wait
    const second = await kernel.submit(
      session.id,
      'queued-b',
      { text: 'Later task', images: [], approval: 'allow' },
      'local-fixture',
      command('operator-b', 'queued-b'),
    )
    release.open()
    await kernel.waitForIdle()
    if (!childId) throw new Error('Parent did not create its child')
    expect((await kernel.storage.call('run', first.id)).status).toBe('completed')
    expect((await kernel.storage.call('runExecutionPrincipal', second.id))?.actorId).toBe('operator-b')
    expect(await kernel.storage.call('sessionExecutionPrincipal', childId)).toEqual(
      await kernel.storage.call('runExecutionPrincipal', first.id),
    )
    const child = await kernel.submit(
      childId,
      'child-first',
      { text: 'Child task', images: [], approval: 'allow' },
      'local-fixture',
    )
    await kernel.waitForIdle()
    expect(await kernel.storage.call('runExecutionPrincipal', child.id)).toEqual(
      await kernel.storage.call('runExecutionPrincipal', first.id),
    )
  } finally {
    release.open()
    await kernel.close()
    await removeOwnedTestDirectory(root, prefix)
  }
}, 20_000)
