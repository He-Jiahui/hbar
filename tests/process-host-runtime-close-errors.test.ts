import { expect, spyOn, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { HbarError } from '@hbar/contracts'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'

for (const mode of ['none', 'storage', 'reference-storage']) {
  const referencedOwner = mode === 'reference-storage'
  test(`close completes all managed shutdown phases with ${mode} failure injection`, async () => {
    const prefix = 'hbar-process-close-failure-'
    const root = await mkdtemp(join(tmpdir(), prefix))
    let runtime: ProcessHostRuntime | undefined
    const restores: Array<() => void> = []
    const expectedFailures = new Set<unknown>()
    let failed = false
    let primary: unknown
    try {
      runtime = await ProcessHostRuntime.create({
        layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
        sourceRoot: process.cwd(),
        demo: true,
        workspace: root,
        secrets: new MemorySecrets(),
      })
      await runtime.waitForIdle()
      const owner = runtime.manager.defaultOwner('kernel')
      const referenceError = new HbarError('RUNTIME_OWNER_REFERENCED', 'Injected owner retirement failure')
      const storageError = new Error('Injected storage cleanup failure after confirmed writer exit')
      if (referencedOwner) {
        const ownerExited = runtime.coordinator.ownerExited.bind(runtime.coordinator)
        const ownerDisposal = spyOn(runtime.coordinator, 'ownerExited').mockImplementation((value) => {
          const released = ownerExited(value)
          if (value.incarnation === owner.incarnation) throw referenceError
          return released
        })
        restores.push(() => ownerDisposal.mockRestore())
      }
      if (mode !== 'none') {
        const storageClose = runtime.storage.close.bind(runtime.storage)
        const storageDisposal = spyOn(runtime.storage, 'close').mockImplementation(async () => {
          await storageClose()
          throw storageError
        })
        restores.push(() => storageDisposal.mockRestore())
      }
      if (mode !== 'none') {
        const managerClose = runtime.manager.close.bind(runtime.manager)
        const managerDisposal = spyOn(runtime.manager, 'close').mockImplementation(async () => {
          try {
            await managerClose()
          } catch (error) {
            expectedFailures.add(error)
            throw error
          }
        })
        restores.push(() => managerDisposal.mockRestore())
      }
      runtime.facade.streams.set('shutdown-stream', {
        id: 'shutdown-stream',
        sessionId: 'shutdown-session',
        runId: 'shutdown-run',
        text: 'retained projection',
        thinking: '',
        offset: 19,
        version: 1,
      })
      const closing = runtime.close()
      expect(runtime.close()).toBe(closing)
      let rejected = false
      let outcome: unknown
      try {
        await closing
      } catch (error) {
        rejected = true
        outcome = error
        expectedFailures.add(error)
      }
      expect(rejected).toBe(mode !== 'none')
      if (referencedOwner) {
        expect(outcome).toBeInstanceOf(AggregateError)
        expect(outcome).toHaveProperty('cause', referenceError)
        expect(outcome).toHaveProperty('errors', expect.arrayContaining([referenceError, storageError]))
        // The injected retirement rejection must not silently forget the fenced owner.
        expect(runtime.coordinator.role(owner)).toBe('fenced')
      } else if (mode === 'storage') {
        expect(outcome).toBe(storageError)
      } else {
        expect(outcome).toBeUndefined()
      }
      expect(runtime.storage.snapshot().phase).toBe('closed')
      const generations = runtime.manager.snapshot().units.flatMap((unit) => unit.generations)
      expect(generations.length).toBeGreaterThan(1)
      expect(generations.every((generation) => generation.pid === null)).toBe(true)
      expect(runtime.facade.streams.size).toBe(0)
      expect(runtime.close()).toBe(closing)
    } catch (error) {
      failed = true
      primary = error
    }
    const cleanupErrors: unknown[] = []
    for (const restore of restores) {
      try {
        restore()
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    if (runtime) {
      try {
        await runtime.close()
      } catch (error) {
        if (!expectedFailures.has(error)) cleanupErrors.push(error)
      }
      try {
        await runtime.storage.close()
      } catch (error) {
        cleanupErrors.push(error)
      }
      try {
        await runtime.manager.close()
      } catch (error) {
        if (!expectedFailures.has(error)) cleanupErrors.push(error)
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
        throw new Error('Refusing to remove an unowned runtime close fixture')
      if (
        runtime?.manager.snapshot().units.some((unit) => unit.generations.some((generation) => generation.pid !== null))
      )
        throw new Error('Retaining runtime fixture because a managed PID is still observed')
      await rm(absolute, { recursive: true, force: true })
    } catch (error) {
      cleanupErrors.push(error)
    }
    if (failed) throw primary
    if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Runtime close fixture cleanup failed')
  }, 120_000)
}
