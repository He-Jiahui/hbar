import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  closeSync,
  copyFileSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { Database } from 'bun:sqlite'
import { openReadonlySqliteScan, readonlySqliteExtensionPath } from '@hbar/runtime-native/readonly-sqlite'
import { z } from 'zod'

const input = z
  .object({ root: z.string(), report: z.string(), nativeDirectory: z.string(), workerEntry: z.string() })
  .parse(JSON.parse(readFileSync(Bun.argv.at(-1) ?? '', 'utf8')) as unknown)
const checks: string[] = []
const path = join(input.root, 'strict # 空格.sqlite')
const business = new Database(path, { create: true, strict: true })
const observer = new Database(':memory:', { strict: true })
const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex')
const count = (key: string) =>
  z
    .object({ value: z.number().int().nonnegative() })
    .parse(observer.query('SELECT hbar_readonly_stat(?) AS value').get(key)).value
try {
  business.exec(
    'CREATE TABLE sample(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO sample VALUES(1, hex(zeroblob(200000)))',
  )
  observer.loadExtension(readonlySqliteExtensionPath(input.nativeDirectory), 'sqlite3_hbarreadonly_init')
  const baseline = { owners: count('globalOwners'), registered: count('globalRegistered'), files: count('globalFiles') }
  assert.deepEqual(baseline, { owners: 1, registered: 1, files: 0 })
  const assertBaseline = () => {
    assert.deepEqual(
      { owners: count('globalOwners'), registered: count('globalRegistered'), files: count('globalFiles') },
      baseline,
    )
    assert.equal(count('defaultUnchanged'), 1)
  }
  const before = hash(path)
  const scan = openReadonlySqliteScan(path, input.nativeDirectory)
  try {
    assert.deepEqual(Object.keys(scan).sort(), ['close', 'quickCheck', 'readSequentially', 'statistics'])
    assert.equal(scan.readSequentially(), statSync(path).size)
    assert.equal(scan.quickCheck(), true)
    const stats = scan.statistics()
    assert.equal(stats.activeFiles, 1)
    assert.equal(stats.activeDirectHandles, 1)
    assert.equal(stats.activeDirectBuffers, 1)
    assert.equal(stats.sequentialScans, 1)
    assert.equal(stats.sequentialBytes, statSync(path).size)
    assert.ok(stats.directReads > 0)
    assert.ok(stats.directIoPriorityHints >= 2)
    assert.equal(stats.globalOwners, 2)
    assert.equal(stats.globalRegistered, 2)
    checks.push('fixed-api-complete-direct-scan-original-size-quick-check-and-priority-confirmed')
    assert.throws(() => business.query('SELECT $value AS value').get({ wrong: 'missing' }))
    assert.deepEqual(business.query('SELECT $value AS value').get({ value: 'strict retained' }), {
      value: 'strict retained',
    })
    checks.push('separate-business-connection-preserves-strict-binding')
  } finally {
    scan.close()
  }
  scan.close()
  assert.throws(() => scan.quickCheck(), /closed/)
  assert.throws(() => scan.readSequentially(), /closed/)
  assert.throws(() => scan.statistics(), /closed/)
  assert.equal(hash(path), before)
  assertBaseline()
  checks.push('close-idempotent-use-after-close-rejected-all-owner-resources-released-content-unchanged')

  for (let cycle = 0; cycle < 3; cycle++) {
    const resumed = openReadonlySqliteScan(path, input.nativeDirectory)
    try {
      assert.equal(resumed.readSequentially(), statSync(path).size)
      assert.equal(resumed.quickCheck(), true)
    } finally {
      resumed.close()
    }
    assertBaseline()
  }
  checks.push('three-restarts-return-owner-registration-and-file-counts-to-baseline')
  const missing = join(input.root, 'missing.sqlite')
  assert.throws(() => openReadonlySqliteScan(missing, input.nativeDirectory), /could not open/)
  assertBaseline()
  assert.throws(() => statSync(missing), /ENOENT/)
  checks.push('initialization-failure-releases-owner-and-does-not-create-missing-file')

  const corrupt = join(input.root, 'late-corrupt.sqlite')
  copyFileSync(path, corrupt)
  const descriptor = openSync(corrupt, 'r+')
  try {
    assert.equal(writeSync(descriptor, Buffer.alloc(64, 255), 0, 64, statSync(corrupt).size - 4096), 64)
  } finally {
    closeSync(descriptor)
  }
  const broken = openReadonlySqliteScan(corrupt, input.nativeDirectory)
  try {
    assert.equal(broken.readSequentially(), statSync(corrupt).size)
    let rejected = false
    try {
      rejected = !broken.quickCheck()
    } catch {
      rejected = true
    }
    assert.equal(rejected, true)
  } finally {
    broken.close()
  }
  assertBaseline()
  checks.push('complete-check-detects-late-page-corruption-after-full-byte-scan')

  business.exec('PRAGMA journal_mode=WAL; UPDATE sample SET value=hex(zeroblob(210000)) WHERE id=1')
  const walScan = openReadonlySqliteScan(path, input.nativeDirectory)
  try {
    assert.equal(walScan.readSequentially(), statSync(path).size)
    assert.equal(walScan.quickCheck(), true)
  } finally {
    walScan.close()
  }
  assertBaseline()
  checks.push('default-writer-uncheckpointed-wal-remains-compatible-with-full-readonly-check')
  business.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  const parallelDirectory = join(input.nativeDirectory, 'parallel')
  const workerResult = z.object({ bytes: z.number().int().positive(), nativePath: z.string() })
  const workers = await Promise.allSettled(
    Array.from(
      { length: 8 },
      () =>
        new Promise<z.infer<typeof workerResult>>((resolve, reject) => {
          const worker = new Worker(input.workerEntry, {
            workerData: { database: path, nativeDirectory: parallelDirectory },
          })
          let response: z.infer<typeof workerResult> | undefined
          let failure: unknown
          worker.on('message', (value: unknown) => {
            const parsed = workerResult.safeParse(value)
            if (parsed.success) response = parsed.data
            else failure = parsed.error
          })
          worker.once('error', (error) => {
            failure = error
          })
          worker.once('exit', (exit) => {
            if (exit !== 0 || failure || !response)
              reject(new Error('Readonly Worker did not finish with a close result', { cause: failure }))
            else resolve(response)
          })
        }),
    ),
  )
  assert.equal(workers.filter((worker) => worker.status === 'fulfilled').length, 8)
  for (const worker of workers) {
    if (worker.status === 'rejected') throw worker.reason
    assert.equal(worker.value.bytes, statSync(path).size)
    assert.equal(worker.value.nativePath, readonlySqliteExtensionPath(parallelDirectory))
  }
  assert.deepEqual(readdirSync(parallelDirectory), ['hbar_readonly.dll'])
  assertBaseline()
  checks.push('eight-workers-atomically-publish-one-shared-native-resource-and-naturally-close')
  const invalidDirectory = join(input.nativeDirectory, 'invalid')
  mkdirSync(invalidDirectory)
  const invalidResource = join(invalidDirectory, 'hbar_readonly.dll')
  writeFileSync(invalidResource, 'different runtime package', { flag: 'wx' })
  assert.throws(() => openReadonlySqliteScan(path, invalidDirectory), /could not open/)
  assert.equal(readFileSync(invalidResource, 'utf8'), 'different runtime package')
  assertBaseline()
  checks.push('different-native-resource-rejected-without-overwrite-or-owner-leak')
  assert.deepEqual(readdirSync(input.nativeDirectory).sort(), ['hbar_readonly.dll', 'invalid', 'parallel'])
  writeFileSync(
    input.report,
    JSON.stringify({
      pass: true,
      checks,
      baseline,
      asset: readonlySqliteExtensionPath(input.nativeDirectory),
      assetSHA256: hash(readonlySqliteExtensionPath(input.nativeDirectory)),
      externalModelRequests: 0,
      productionDataAccessed: false,
    }) + '\n',
    { flag: 'wx' },
  )
} finally {
  observer.close(true)
  business.close(true)
}
