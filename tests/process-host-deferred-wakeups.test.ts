import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'

async function until(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 30_000
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error('Durable deferred Runs were not resumed')
    await Bun.sleep(10)
  }
}

test('owned Host retains ten new-session queued Runs across temporary dependency admission denial without replacing their identities', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-host-deferred-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  const runtime = await ProcessHostRuntime.create({
    layout,
    sourceRoot: process.cwd(),
    demo: true,
    workspace: root,
    secrets: new MemorySecrets(),
  })
  const originalGate = runtime.maintenance.isWriting
  let denied = true
  let rejectedChecks = 0
  // Test-only dependency boundary exercises real Host admission, coordinator IPC,
  // Kernel drain and Storage. No production bypass or explicit recovery wake.
  runtime.maintenance.isWriting = () => {
    if (denied) rejectedChecks++
    return denied || originalGate.call(runtime.maintenance)
  }
  try {
    const kernelBefore = runtime.snapshot().units.find((unit) => unit.descriptor.id === 'kernel')
      ?.generations[0]?.incarnation
    expect(kernelBefore).toBeDefined()
    const workspace = (await runtime.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Expected fixture workspace')
    const queued: Array<{ sessionId: string; run: Awaited<ReturnType<typeof runtime.kernel.submit>> }> = []
    for (let index = 0; index < 10; index++) {
      const session = await runtime.storage.call('createSession', workspace.id)
      const run = await runtime.kernel.submit(
        session.id,
        `deferred-${index}`,
        { text: 'Return a short fixture response', images: [] },
        'local-fixture',
      )
      queued.push({ sessionId: session.id, run })
    }
    await until(async () => rejectedChecks >= 20)
    for (const { run } of queued) {
      expect((await runtime.storage.call('run', run.id)).status).toBe('queued')
      expect(await runtime.storage.call('runtimeExecutionRead', run.id)).toBeNull()
    }
    // Only restore dependency readiness; no submit/reload/wake/session scan.
    denied = false
    await until(async () => {
      const runs = await Promise.all(queued.map(({ run }) => runtime.storage.call('run', run.id)))
      const receipts = await Promise.all(queued.map(({ run }) => runtime.storage.call('runtimeExecutionRead', run.id)))
      return (
        runs.every((run) => run.status === 'completed') && receipts.every((receipt) => receipt?.state === 'released')
      )
    })
    for (const { sessionId, run } of queued) {
      const snapshot = await runtime.storage.call('snapshot', sessionId)
      expect(snapshot.runs.map((value) => value.id)).toEqual([run.id])
      expect((await runtime.storage.call('runByRequest', sessionId, run.requestId))?.run.id).toBe(run.id)
      expect((await runtime.storage.call('runtimeExecutionRead', run.id))?.state).toBe('released')
      expect(snapshot.messages.filter((message) => message.role === 'user')).toHaveLength(1)
    }
    expect(runtime.snapshot().units.find((unit) => unit.descriptor.id === 'kernel')?.generations[0]?.incarnation).toBe(
      kernelBefore,
    )
  } finally {
    runtime.maintenance.isWriting = originalGate
    await runtime.close()
    await rm(root, { recursive: true, force: true })
  }
}, 120_000)
