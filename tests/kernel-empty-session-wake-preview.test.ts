import { expect, spyOn, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { kernelPluginQuiescenceSchema } from '@hbar/kernel/runtime-idle'

test('empty wake preview avoids Goal demand only with complete empty parent authority', async () => {
  const temporaryParent = await realpath(tmpdir())
  const root = await realpath(await mkdtemp(join(temporaryParent, 'hbar-empty-wake-preview-')))
  if (dirname(root) !== temporaryParent || !basename(root).startsWith('hbar-empty-wake-preview-'))
    throw new Error('Unowned empty wake preview fixture root')
  let kernel: Kernel | undefined
  let primary: { error: unknown } | undefined
  let restoreCoverage: (() => void) | undefined
  try {
    kernel = await Kernel.create({ home: join(root, 'data'), demo: true, secrets: new MemorySecrets() })
    // create() opens scheduling; it does not join Main's asynchronous backend discovery.
    console.info(
      JSON.stringify({
        type: 'empty-preview-settlement',
        phase: 'before.wait',
        observedAtUtc: new Date().toISOString(),
        counts: kernel.runtimeIdleCheckpoint({ queuedRuns: false }).counts,
      }),
    )
    await kernel.waitForIdle()
    console.info(
      JSON.stringify({
        type: 'empty-preview-settlement',
        phase: 'after.wait',
        observedAtUtc: new Date().toISOString(),
        counts: kernel.runtimeIdleCheckpoint({ queuedRuns: false }).counts,
      }),
    )
    const owner = { unitId: 'kernel', generation: 1, incarnation: 'empty-preview' }
    const coverage = spyOn(kernel, 'sessionWakesCoverage').mockRejectedValue(new Error('Goal demand attempted'))
    restoreCoverage = () => coverage.mockRestore()
    const empty = kernelPluginQuiescenceSchema.parse({
      coverage: 'complete',
      queuedRuns: false,
      owners: [{ owner: { ...owner, unitId: 'plugin.goal' }, eligible: true, requests: 0, runs: 0, resources: 0 }],
    })
    const preview = await kernel.sessionWakesPreview(owner, { queuedRuns: false, pluginQuiescence: empty })
    expect(preview.entries).toEqual([])
    expect(coverage).not.toHaveBeenCalled()
    await expect(kernel.sessionWakesPreview(owner, { queuedRuns: false })).rejects.toThrow('Goal demand attempted')
    for (const pluginQuiescence of [
      { ...empty, coverage: 'unsupported' as const },
      { ...empty, queuedRuns: null },
      ...['requests', 'runs', 'resources'].map((field) => ({
        ...empty,
        owners: empty.owners.map((entry) => ({ ...entry, [field]: 1 })),
      })),
      { ...empty, owners: empty.owners.map((entry) => ({ ...entry, eligible: false })) },
    ]) {
      await expect(kernel.sessionWakesPreview(owner, { queuedRuns: false, pluginQuiescence })).rejects.toThrow(
        'Goal demand attempted',
      )
    }
    await expect(
      kernel.sessionWakesPreview(owner, { queuedRuns: true, pluginQuiescence: empty }),
    ).rejects.toMatchObject({
      code: 'BUSY',
    })
  } catch (error) {
    primary = { error }
  } finally {
    restoreCoverage?.()
  }
  const cleanupErrors: unknown[] = []
  try {
    await kernel?.close()
  } catch (error) {
    cleanupErrors.push(error)
  }
  if (!primary && cleanupErrors.length === 0 && kernel) {
    try {
      const currentRoot = await realpath(root)
      if (
        currentRoot !== root ||
        dirname(currentRoot) !== temporaryParent ||
        !basename(currentRoot).startsWith('hbar-empty-wake-preview-')
      )
        throw new Error('Empty wake preview fixture root identity changed before cleanup')
      await rm(currentRoot, { recursive: true, force: true })
    } catch (error) {
      cleanupErrors.push(error)
    }
  }
  if (cleanupErrors.length) {
    const errors = primary ? [primary.error, ...cleanupErrors] : cleanupErrors
    throw new AggregateError(errors, 'Empty wake preview fixture cleanup failed', { cause: errors[0] })
  }
  if (primary) throw primary.error
})
