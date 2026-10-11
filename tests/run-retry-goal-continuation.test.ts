import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { HbarClient, createRunCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server.ts'

async function closeFixture(root: string, kernel: Kernel, host?: Awaited<ReturnType<typeof startServer>>) {
  const failures: unknown[] = []
  try {
    await host?.close()
  } catch (error) {
    failures.push(error)
  }
  try {
    await kernel.close()
  } catch (error) {
    failures.push(error)
  }
  if (failures.length) throw new AggregateError(failures, 'Retry fixture did not close; preserving its data')
  const actual = await realpath(root)
  if (dirname(actual) !== (await realpath(tmpdir())) || !basename(actual).startsWith('hbar-run-retry-goal-'))
    throw new Error('Refusing to clean an unowned retry fixture')
  await rm(actual, { recursive: true, force: true })
}

test('manual retry normalizes an automatic Goal continuation into one user turn', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-run-retry-goal-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  try {
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Expected the retry fixture workspace')
    const session = await kernel.createSession(workspace.id)
    const original = await kernel.submit(
      session.id,
      'goal-run',
      {
        text: 'retry the current Goal step',
        images: [],
        source: 'goal',
        continuation: { goalId: crypto.randomUUID(), intentId: crypto.randomUUID() },
      },
      'local-fixture',
    )
    await kernel.waitForIdle()
    const failedOriginal = (await kernel.snapshot(session.id)).runs.find((run) => run.id === original.id)
    expect(failedOriginal).toMatchObject({
      status: 'failed',
      failure: { code: 'CONTINUATION_STALE', category: 'execution', retryable: false },
    })
    host = await startServer(kernel, { port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    await client.pair(host.pairing.code, 'manual Goal retry')
    const commands = createRunCommandClient(client)
    const [retried, repeated] = await Promise.all([
      commands.execute(
        'run.retry',
        { sessionId: session.id, operationId: original.id },
        { idempotencyKey: 'goal-retry' },
      ),
      commands.execute(
        'run.retry',
        { sessionId: session.id, operationId: original.id },
        { idempotencyKey: 'goal-retry' },
      ),
    ])
    expect(repeated).toEqual(retried)
    await kernel.waitForIdle()
    const snapshot = await kernel.snapshot(session.id)
    const replay = snapshot.runs.find((run) => run.id === retried.operationId)
    expect(replay).toMatchObject({
      input: { text: 'retry the current Goal step', source: 'user' },
      status: 'completed',
    })
    expect(replay?.input.continuation).toBeUndefined()
    expect(snapshot.runs).toHaveLength(2)
  } finally {
    client?.disconnect()
    await closeFixture(root, kernel, host)
  }
})
