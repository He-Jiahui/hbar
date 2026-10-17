import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, open, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { RuntimeArtifactStore, type RuntimeArtifact } from '@hbar/runtime'

const parent = await realpath(tmpdir())
const root = await mkdtemp(join(parent, 'hbar-artifact-memory-'))
const owned = await realpath(root)
assert.equal(dirname(owned), parent)
assert(basename(owned).startsWith('hbar-artifact-memory-'))
let failure: { error: unknown } | undefined
try {
  const id = 'a'.repeat(64),
    directory = join(root, id)
  await mkdir(directory)
  const file = await open(join(directory, 'entry.js'), 'wx')
  const chunk = Buffer.alloc(262144, 97),
    hash = createHash('sha256')
  const size = 96 * 1024 * 1024
  try {
    for (let offset = 0; offset < size;) {
      const { bytesWritten } = await file.write(chunk, 0, Math.min(chunk.length, size - offset), offset)
      assert(bytesWritten > 0)
      hash.update(chunk.subarray(0, bytesWritten))
      offset += bytesWritten
    }
  } finally {
    await file.close()
  }
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
    files: [{ name: 'entry.js', sha256: hash.digest('hex') }],
    inputs: [],
    resources: [],
    resourceFiles: [],
  }
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(artifact))
  const store = new RuntimeArtifactStore(root, root)
  const beforeWitness = process.memoryUsage().rss
  const witness = new Uint8Array(8 * 1024 * 1024)
  witness.fill(11)
  const witnessRss = process.memoryUsage().rss
  assert(
    witnessRss - beforeWitness >= 4 * 1024 * 1024,
    'Actual touched 8MiB witness must positively increase self RSS by at least 4MiB',
  )
  const baseline = witnessRss
  let peak = baseline,
    samples = 0
  const sample = () => {
    samples++
    peak = Math.max(peak, process.memoryUsage().rss)
  }
  const timer = setInterval(sample, 1)
  try {
    assert.deepEqual(await store.acceptBuild(artifact), artifact)
    assert.deepEqual(await store.get(id), artifact)
    sample()
  } finally {
    clearInterval(timer)
  }
  assert(samples > 2, 'Actual asynchronous verification must have positive memory samples')
  const delta = peak - baseline
  assert.equal(witness[0], 11)
  assert(delta < 32 * 1024 * 1024, `Verification exceeded self RSS working-set delta: ${delta}`)
  process.stdout.write(
    JSON.stringify({
      schema: 'hbar.artifact-verification-rss.v1',
      size,
      samples,
      beforeWitnessRss: beforeWitness,
      witnessRss,
      baselineRss: baseline,
      peakRss: peak,
      delta,
      bound: 32 * 1024 * 1024,
    }) + '\n',
  )
} catch (error) {
  failure = { error }
}
try {
  assert.equal(await realpath(root), owned)
  assert.equal(dirname(owned), parent)
  await rm(root, { recursive: true, force: true })
} catch (error) {
  if (failure)
    throw new AggregateError([failure.error, error], 'Artifact memory fixture cleanup failed', { cause: error })
  throw error
}
if (failure) throw failure.error
