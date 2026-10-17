import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, open, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { RuntimeArtifactStore, type RuntimeArtifact } from '@hbar/runtime'

test('public artifact verification retains exact digest, truncation, growth, size and failed-registration boundaries', async () => {
  const parent = await realpath(tmpdir()),
    root = await mkdtemp(join(parent, 'hbar-artifact-chunks-'))
  const owned = await realpath(root)
  if (dirname(owned) !== parent || !basename(owned).startsWith('hbar-artifact-chunks-'))
    throw new Error('Unowned fixture')
  let primary: { error: unknown } | undefined
  try {
    const id = 'c'.repeat(64),
      directory = join(root, id)
    await mkdir(directory)
    const data = Buffer.alloc(262144 + 37, 65),
      resource = Buffer.alloc(0)
    const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
    const artifact: RuntimeArtifact = {
      id,
      unitId: 'fixture',
      entry: 'entry.js',
      descriptor: {
        id: 'fixture',
        kind: 'plugin',
        isolation: 'process',
        dependencies: [],
        required: true,
        reloadable: true,
        contractFingerprint: 'b'.repeat(64),
        storageSchema: 23,
      },
      files: [{ name: 'entry.js', sha256: digest(data) }],
      inputs: [],
      resources: [],
      resourceFiles: [{ sourcePath: 'empty.bin', name: 'empty.bin', sha256: digest(resource) }],
    }
    const path = join(directory, 'entry.js')
    await writeFile(path, data)
    await writeFile(join(directory, 'empty.bin'), resource)
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(artifact))
    const store = new RuntimeArtifactStore(root, root)
    expect(await store.acceptBuild(artifact)).toEqual(artifact)
    expect(await store.get(id)).toEqual(artifact)
    for (const bytes of [
      data.subarray(0, data.length - 1),
      Buffer.concat([data, Buffer.from([66])]),
      Buffer.alloc(data.length, 66),
    ]) {
      await writeFile(path, bytes)
      let failure: unknown
      try {
        await store.get(id)
      } catch (error) {
        failure = error
      }
      expect(failure).toMatchObject({ code: 'RUNTIME_ARTIFACT_CHANGED' })
    }
    await writeFile(path, data)
    await writeFile(join(directory, 'empty.bin'), 'not empty')
    let resourceFailure: unknown
    try {
      await store.get(id)
    } catch (error) {
      resourceFailure = error
    }
    expect(resourceFailure).toMatchObject({ code: 'RUNTIME_ARTIFACT_CHANGED' })
    await writeFile(join(directory, 'empty.bin'), resource)
    const file = await open(path, 'r+')
    try {
      await file.truncate(128 * 1024 * 1024 + 1)
    } finally {
      await file.close()
    }
    let limitFailure: unknown
    try {
      await store.get(id)
    } catch (error) {
      limitFailure = error
    }
    expect(limitFailure).toMatchObject({ code: 'RUNTIME_ARTIFACT_LIMIT' })
    const fresh = new RuntimeArtifactStore(root, root)
    let rejected: unknown
    try {
      await fresh.acceptBuild(artifact)
    } catch (error) {
      rejected = error
    }
    expect(rejected).toMatchObject({ code: 'RUNTIME_ARTIFACT_LIMIT' })
    let unregistered: unknown
    try {
      await fresh.get(id)
    } catch (error) {
      unregistered = error
    }
    expect(unregistered).toMatchObject({ code: 'RUNTIME_ARTIFACT_UNREGISTERED' })
    await writeFile(path, data)
    expect(await fresh.acceptBuild(artifact)).toEqual(artifact)
  } catch (error) {
    primary = { error }
  }
  try {
    if ((await realpath(root)) !== owned || dirname(owned) !== parent) throw new Error('Fixture root changed')
    await rm(root, { recursive: true, force: true })
  } catch (error) {
    if (primary) throw new AggregateError([primary.error, error], 'Artifact fixture cleanup failed', { cause: error })
    throw error
  }
  if (primary) throw primary.error
}, 20_000)

test('actual 96MiB acceptBuild and repeated get stay below a 32MiB self RSS working-set delta', async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      '--smol',
      fileURLToPath(new URL('./fixtures/runtime-artifact-verification-memory.ts', import.meta.url)),
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', windowsHide: true },
  )
  const output = new Response(child.stdout).text(),
    errors = new Response(child.stderr).text()
  let deadline: ReturnType<typeof setTimeout> | undefined, primary: { error: unknown } | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    deadline = setTimeout(() => {
      child.kill()
      reject(new Error('Owned artifact memory CLI deadline'))
    }, 15000)
  })
  try {
    const [exitCode, stdout, stderr] = await Promise.race([Promise.all([child.exited, output, errors]), timeout])
    try {
      expect(exitCode).toBe(0)
      expect(stderr).toBe('')
    } catch (error) {
      throw new Error(
        `Owned artifact memory CLI failed: ${JSON.stringify({
          exitCode,
          stdout: stdout.slice(0, 8192),
          stderr: stderr.slice(0, 8192),
          stdoutTruncated: stdout.length > 8192,
          stderrTruncated: stderr.length > 8192,
        })}`,
        { cause: error },
      )
    }
    const receipt = z
      .strictObject({
        schema: z.literal('hbar.artifact-verification-rss.v1'),
        size: z.literal(96 * 1024 * 1024),
        beforeWitnessRss: z.number().nonnegative(),
        witnessRss: z.number().nonnegative(),
        samples: z.number().int().gt(2),
        baselineRss: z.number().nonnegative(),
        peakRss: z.number().nonnegative(),
        delta: z
          .number()
          .nonnegative()
          .lt(32 * 1024 * 1024),
        bound: z.literal(32 * 1024 * 1024),
      })
      .parse(JSON.parse(stdout))
    expect(receipt.peakRss - receipt.baselineRss).toBe(receipt.delta)
    console.info(JSON.stringify(receipt))
    expect(receipt.witnessRss - receipt.beforeWitnessRss).toBeGreaterThanOrEqual(4 * 1024 * 1024)
    expect(receipt.baselineRss).toBe(receipt.witnessRss)
  } catch (error) {
    primary = { error }
  }
  if (deadline !== undefined) clearTimeout(deadline)
  if (child.exitCode === null) child.kill()
  await child.exited
  await Promise.allSettled([output, errors])
  if (primary) throw primary.error
}, 20_000)
