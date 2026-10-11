import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createHostRuntimeDependencyPublisher } from '../scripts/host-runtime-dependencies'

function filesystemError(code: string): Error & { code: string } {
  return Object.assign(new Error(`Injected filesystem failure: ${code}`), { code })
}

async function fixture(existing: boolean, run: (output: string, target: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'hbar-runtime-publisher-'))
  if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith('hbar-runtime-publisher-'))
    throw new Error('Runtime publisher cleanup is outside its owned fixture directory')
  const output = join(root, 'output')
  const target = join(output, 'node_modules')
  try {
    await mkdir(output)
    if (existing) {
      await mkdir(target)
      await writeFile(join(target, 'previous.txt'), 'previous runtime must survive')
    }
    await run(output, target)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

for (const code of ['EPERM', 'EBUSY', 'EACCES']) {
  test(`runtime publication survives two transient ${code} failures and publishes complete assets`, async () => {
    await fixture(false, async (output, target) => {
      const waits: number[] = []
      let attempts = 0
      const publish = createHostRuntimeDependencyPublisher({
        renameDirectory: async (source, destination) => {
          attempts += 1
          if (attempts < 3) throw filesystemError(code)
          await rename(source, destination)
        },
        wait: async (milliseconds) => {
          waits.push(milliseconds)
        },
      })
      const dependencies = await publish(resolve('.'), output)
      expect(dependencies.map(({ name }) => name)).toEqual(['playwright', 'playwright-core'])
      expect(dependencies[0]?.version).toMatch(/^\d+\.\d+\.\d+/)
      expect(dependencies[0]?.version).toBe(dependencies[1]?.version)
      expect(attempts).toBe(3)
      expect(waits).toEqual([100, 250])
      expect(await Bun.file(join(target, 'playwright-core', 'browsers.json')).exists()).toBe(true)
      expect((await readdir(output)).sort()).toEqual(['node_modules'])
    })
  })
}

test('publication retries preservation and rollback but surfaces the exhausted publish error', async () => {
  await fixture(true, async (output, target) => {
    const waits: number[] = []
    const attempts = { preserve: 0, publish: 0, restore: 0 }
    const failure = filesystemError('EBUSY')
    const publish = createHostRuntimeDependencyPublisher({
      renameDirectory: async (source, destination) => {
        if (source === target) {
          attempts.preserve += 1
          if (attempts.preserve < 3) throw filesystemError('EPERM')
        } else if (basename(source) === 'next') {
          attempts.publish += 1
          throw failure
        } else {
          attempts.restore += 1
          if (attempts.restore < 3) throw filesystemError('EACCES')
        }
        await rename(source, destination)
      },
      wait: async (milliseconds) => {
        waits.push(milliseconds)
      },
    })
    await expect(publish(resolve('.'), output)).rejects.toBe(failure)
    expect(attempts).toEqual({ preserve: 3, publish: 4, restore: 3 })
    expect(waits).toEqual([100, 250, 100, 250, 500, 100, 250])
    expect(await readFile(join(target, 'previous.txt'), 'utf8')).toBe('previous runtime must survive')
    expect((await readdir(output)).sort()).toEqual(['node_modules'])
  })
})

test('failed publish and rollback retain both complete directory trees and both errors', async () => {
  await fixture(true, async (output, target) => {
    const publishError = filesystemError('EBUSY')
    const restoreError = filesystemError('EACCES')
    const attempts = { publish: 0, restore: 0 }
    const waits: number[] = []
    const publish = createHostRuntimeDependencyPublisher({
      renameDirectory: async (source, destination) => {
        if (source === target) return rename(source, destination)
        if (basename(source) === 'next') {
          attempts.publish += 1
          throw publishError
        }
        attempts.restore += 1
        throw restoreError
      },
      wait: async (milliseconds) => {
        waits.push(milliseconds)
      },
    })
    try {
      await publish(resolve('.'), output)
      throw new Error('The failed publication unexpectedly succeeded')
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError)
      if (!(error instanceof AggregateError)) throw error
      expect(error.errors).toEqual([publishError, restoreError])
      expect(error.cause).toBe(restoreError)
      expect(error.message).toContain('Runtime publish/restore failed')
    }
    expect(attempts).toEqual({ publish: 4, restore: 4 })
    expect(waits).toEqual([100, 250, 500, 100, 250, 500])
    const entries = await readdir(output)
    expect(entries).toHaveLength(1)
    const stagingName = entries[0]
    if (!stagingName?.startsWith('.runtime-dependencies-')) throw new Error('Failed staging was not retained')
    const staging = join(output, stagingName)
    expect(await readFile(join(staging, 'previous', 'previous.txt'), 'utf8')).toBe('previous runtime must survive')
    expect(await Bun.file(join(staging, 'next', 'playwright-core', 'browsers.json')).exists()).toBe(true)
    expect(await Bun.file(target).exists()).toBe(false)
  })
})

test('non-transient publish errors are not retried and the previous runtime is restored', async () => {
  await fixture(true, async (output, target) => {
    const failure = filesystemError('ENOENT')
    let attempts = 0
    const waits: number[] = []
    const publish = createHostRuntimeDependencyPublisher({
      renameDirectory: async (source, destination) => {
        if (basename(source) === 'next') {
          attempts += 1
          throw failure
        }
        await rename(source, destination)
      },
      wait: async (milliseconds) => {
        waits.push(milliseconds)
      },
    })
    await expect(publish(resolve('.'), output)).rejects.toBe(failure)
    expect(attempts).toBe(1)
    expect(waits).toEqual([])
    expect(await readFile(join(target, 'previous.txt'), 'utf8')).toBe('previous runtime must survive')
    expect((await readdir(output)).sort()).toEqual(['node_modules'])
  })
})

test('a retry revalidates its source directory and preserves the previous runtime', async () => {
  await fixture(true, async (output, target) => {
    let attempts = 0
    const waits: number[] = []
    const publish = createHostRuntimeDependencyPublisher({
      renameDirectory: async (source, destination) => {
        if (basename(source) === 'next') {
          attempts += 1
          await rm(source, { recursive: true })
          await writeFile(source, 'source became a file')
          throw filesystemError('EPERM')
        }
        await rename(source, destination)
      },
      wait: async (milliseconds) => {
        waits.push(milliseconds)
      },
    })
    await expect(publish(resolve('.'), output)).rejects.toThrow('Runtime dependency output is not plain')
    expect(attempts).toBe(1)
    expect(waits).toEqual([100])
    expect(await readFile(join(target, 'previous.txt'), 'utf8')).toBe('previous runtime must survive')
    expect((await readdir(output)).sort()).toEqual(['node_modules'])
  })
})

test('a retry never overwrites a destination that appeared during its delay', async () => {
  await fixture(false, async (output, target) => {
    let attempts = 0
    const waits: number[] = []
    const publish = createHostRuntimeDependencyPublisher({
      renameDirectory: async () => {
        attempts += 1
        throw filesystemError('EPERM')
      },
      wait: async (milliseconds) => {
        waits.push(milliseconds)
        await mkdir(target)
        await writeFile(join(target, 'unexpected.txt'), 'unexpected runtime must survive')
      },
    })
    await expect(publish(resolve('.'), output)).rejects.toThrow('Runtime dependency rename destination already exists')
    expect(attempts).toBe(1)
    expect(waits).toEqual([100])
    expect(await readFile(join(target, 'unexpected.txt'), 'utf8')).toBe('unexpected runtime must survive')
    expect((await readdir(output)).sort()).toEqual(['node_modules'])
  })
})

test('exhausted preservation retries leave the previous runtime intact', async () => {
  await fixture(true, async (output, target) => {
    const failure = filesystemError('EACCES')
    let attempts = 0
    const waits: number[] = []
    const publish = createHostRuntimeDependencyPublisher({
      renameDirectory: async () => {
        attempts += 1
        throw failure
      },
      wait: async (milliseconds) => {
        waits.push(milliseconds)
      },
    })
    await expect(publish(resolve('.'), output)).rejects.toBe(failure)
    expect(attempts).toBe(4)
    expect(waits).toEqual([100, 250, 500])
    expect(await readFile(join(target, 'previous.txt'), 'utf8')).toBe('previous runtime must survive')
    expect((await readdir(output)).sort()).toEqual(['node_modules'])
  })
})
