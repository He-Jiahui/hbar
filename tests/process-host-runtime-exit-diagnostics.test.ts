import { expect, spyOn, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { HbarError, type DiagnosticEvent } from '@hbar/contracts'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'

test('retried owner exit reconciliation retains its failure while reporting each physical exit only once', async () => {
  const prefix = 'hbar-exit-report-retry-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const events: DiagnosticEvent[] = []
  let runtime: ProcessHostRuntime | undefined
  let restore = () => {}
  let failed = false
  let primary: unknown
  try {
    runtime = await ProcessHostRuntime.create({
      layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
      sourceRoot: process.cwd(),
      demo: true,
      workspace: root,
      secrets: new MemorySecrets(),
      diagnostics: {
        emit(event) {
          if (event.event === 'host.runtime_process_exit') events.push(event)
        },
      },
    })
    await runtime.waitForIdle()
    const owner = runtime.manager.defaultOwner('kernel')
    const ownerExited = runtime.coordinator.ownerExited.bind(runtime.coordinator)
    let attempts = 0
    const disposal = spyOn(runtime.coordinator, 'ownerExited').mockImplementation((value) => {
      const released = ownerExited(value)
      if (value.incarnation === owner.incarnation && ++attempts === 1)
        throw new HbarError('RUNTIME_OWNER_REFERENCED', 'Injected retriable ownership retirement failure')
      return released
    })
    restore = () => disposal.mockRestore()
    await runtime.close()
    expect(attempts).toBe(2)
    const kernel = runtime.manager.snapshot().units.find((unit) => unit.descriptor.id === 'kernel')
    expect(kernel?.generations[0]).toMatchObject({
      phase: 'disposed',
      pid: null,
      reasonCode: 'RUNTIME_OWNER_REFERENCED',
    })
    const exits = events.filter((event) => event.contextId === 'kernel' && event.requestId === owner.incarnation)
    expect(exits).toHaveLength(1)
    expect(exits[0]).toMatchObject({ exitCode: 0, restartExpected: false })
    const identities = events.map((event) => `${event.contextId}:${event.requestId}:${event.childPid}`)
    expect(new Set(identities).size).toBe(identities.length)
    expect(runtime.storage.snapshot().phase).toBe('closed')
    expect(
      runtime.manager.snapshot().units.every((unit) => unit.generations.every((generation) => generation.pid === null)),
    ).toBe(true)
  } catch (error) {
    failed = true
    primary = error
  }
  const cleanupErrors: unknown[] = []
  try {
    restore()
  } catch (error) {
    cleanupErrors.push(error)
  }
  if (runtime) {
    try {
      await runtime.close()
    } catch (error) {
      cleanupErrors.push(error)
    }
    try {
      await runtime.storage.close()
    } catch (error) {
      cleanupErrors.push(error)
    }
    try {
      await runtime.manager.close()
    } catch (error) {
      cleanupErrors.push(error)
    }
    try {
      runtime.facade.dispose()
    } catch (error) {
      cleanupErrors.push(error)
    }
  }
  try {
    const absolute = resolve(root)
    if (dirname(absolute) !== resolve(tmpdir()) || !basename(absolute).startsWith(prefix))
      throw new Error('Refusing to remove an unowned exit report fixture')
    if (
      runtime?.manager.snapshot().units.some((unit) => unit.generations.some((generation) => generation.pid !== null))
    )
      throw new Error('Retaining fixture while managed PID remains observed')
    await rm(absolute, { recursive: true, force: true })
  } catch (error) {
    cleanupErrors.push(error)
  }
  if (failed) throw primary
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Exit report fixture cleanup failed')
}, 120_000)
