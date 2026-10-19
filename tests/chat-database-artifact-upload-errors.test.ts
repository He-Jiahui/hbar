import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { diagnosticEventSchema, HbarError, type DiagnosticEvent, type DiagnosticSink } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { StorageMethods } from '@hbar/storage'

const resources: { root: string; kernel: Kernel }[] = []
const errorOf = (value: Promise<unknown>) =>
  value.then(
    () => ({ rejected: false as const }),
    (reason: unknown) => ({ rejected: true as const, reason }),
  )
// Real unknown-outcome test retains the existing fixture's matcher shape.
const unknownErrorOf = (value: Promise<unknown>) =>
  value.then(
    () => null,
    (reason: unknown) => reason,
  )
afterEach(async () => {
  for (const resource of resources.splice(0)) {
    await resource.kernel.close()
    const target = resolve(resource.root)
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-upload-errors-'))
      throw new Error('Refusing fixture cleanup outside its temporary root')
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
async function fixture(diagnostics?: DiagnosticSink) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-upload-errors-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    ...(diagnostics ? { diagnostics } : {}),
  })
  const resource = { root, kernel }
  resources.push(resource)
  return {
    ...resource,
    replaceKernel: (next: Kernel) => {
      resource.kernel = next
    },
  }
}
test('unknown upload outcome survives secondary closed cleanup with one warning and fatal', async () => {
  const events: DiagnosticEvent[] = []
  const f = await fixture({ emit: (event) => events.push(event) })
  const layout = f.kernel.options.layout
  const bytes = new TextEncoder().encode('metadata projection failure')
  const id = createHash('sha256').update(bytes).digest('hex')
  const fatalCodes: string[] = []
  const removeFatal = f.kernel.storage.onFatal?.((event) => fatalCodes.push(event.code))
  const injection = new Database(layout.database)
  try {
    injection.exec(
      "CREATE TRIGGER fail_artifact_projection BEFORE INSERT ON artifacts BEGIN SELECT RAISE(ABORT,'fixture metadata projection failure'); END",
    )
  } finally {
    injection.close()
  }
  expect(await unknownErrorOf(f.kernel.upload('recovered.txt', 'text/plain', bytes))).toMatchObject({
    code: 'STORAGE_RESULT_UNKNOWN',
  })
  expect(await unknownErrorOf(f.kernel.storage.call('chatDatabaseDraftBackfill', 100))).toMatchObject({
    code: 'STORAGE_CLOSED',
  })
  expect(
    await unknownErrorOf(f.kernel.storage.call('chatDatabaseArtifactClaim', id, 'cleanup', Date.now())),
  ).toMatchObject({
    code: 'STORAGE_CLOSED',
  })
  const warnings = events.filter((event) => event.event === 'artifact.upload_cleanup_failed')
  expect(warnings).toHaveLength(1)
  expect(warnings[0]).toMatchObject({
    errorCode: 'STORAGE_CLOSED',
    phase: 'secondary_cleanup',
    outcome: 'failure',
    level: 'warn',
  })
  expect(diagnosticEventSchema.safeParse(warnings[0]).success).toBe(true)
  expect(JSON.stringify(warnings)).not.toContain('metadata projection failure')
  await f.kernel.close()
  expect(fatalCodes).toEqual(['STORAGE_RESULT_UNKNOWN'])
  removeFatal?.()
  const inspection = new Database(layout.database, { readonly: true })
  try {
    expect(
      inspection.query('SELECT draftJournalComplete FROM chat_database_reference_health WHERE id=1').get(),
    ).toEqual({
      draftJournalComplete: 0,
    })
    expect(inspection.query('SELECT id FROM artifacts WHERE id=?').get(id)).toBeNull()
  } finally {
    inspection.close()
  }
  const published = new Uint8Array(await readFile(join(layout.artifacts, id)))
  expect(published).toEqual(bytes)
  expect(createHash('sha256').update(published).digest('hex')).toBe(id)
  const cleanup = new Database(layout.database)
  try {
    cleanup.exec('DROP TRIGGER fail_artifact_projection')
  } finally {
    cleanup.close()
  }
  const current = await Kernel.create({
    home: join(f.root, 'data'),
    workspace: f.root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  f.replaceKernel(current)
  while (!(await current.storage.call('chatDatabaseDraftBackfill', 100)).done) {
    /* canonical completion replay */
  }
  expect(await current.storage.call('artifact', id)).toEqual({
    id,
    name: 'recovered.txt',
    mime: 'text/plain',
    size: bytes.length,
  })
  const recovered = new Uint8Array(await readFile(join(current.options.layout.artifacts, id)))
  expect(recovered).toEqual(bytes)
  expect(createHash('sha256').update(recovered).digest('hex')).toBe(id)
})

test('cleanup failure alone rejects the identical cleanup error and releases upload admission', async () => {
  const events: DiagnosticEvent[] = []
  const f = await fixture({ emit: (event) => events.push(event) })
  const original = f.kernel.storage.call.bind(f.kernel.storage)
  const cleanupError = new HbarError('UPLOAD_CLEANUP_TEST', 'fixture cleanup rejection')
  f.kernel.storage.call = async <K extends keyof StorageMethods>(
    method: K,
    ...args: Parameters<StorageMethods[K]>
  ): Promise<ReturnType<StorageMethods[K]>> => {
    if (method === 'chatDatabaseArtifactEndUpload') throw cleanupError
    return original(method, ...args)
  }
  try {
    const result = await errorOf(
      f.kernel.upload('cleanup.txt', 'text/plain', new TextEncoder().encode('cleanup bytes')),
    )
    expect(result.rejected).toBe(true)
    if (!result.rejected) throw new Error('Expected upload rejection')
    expect(result.reason).toBe(cleanupError)
    expect(events.filter((event) => event.event === 'artifact.upload_cleanup_failed')).toHaveLength(0)
    f.kernel.assertIdle()
  } finally {
    f.kernel.storage.call = original
  }
})

for (const primary of [undefined, null, false, 0, new HbarError('UPLOAD_PRIMARY_TEST', 'fixture primary rejection')]) {
  test(`primary ${String(primary)} survives cleanup failure and a throwing diagnostic observer`, async () => {
    let cleanupWarnings = 0
    const f = await fixture({
      emit: (event) => {
        if (event.event === 'artifact.upload_cleanup_failed') {
          cleanupWarnings++
          throw new Error('observer fixture rejection')
        }
      },
    })
    const original = f.kernel.storage.call.bind(f.kernel.storage)
    f.kernel.storage.call = async <K extends keyof StorageMethods>(
      method: K,
      ...args: Parameters<StorageMethods[K]>
    ): Promise<ReturnType<StorageMethods[K]>> => {
      if (method === 'chatDatabaseArtifactFinishUpload') throw primary
      if (method === 'chatDatabaseArtifactEndUpload') throw new HbarError('STORAGE_CLOSED', 'fixture closed cleanup')
      return original(method, ...args)
    }
    try {
      const result = await errorOf(
        f.kernel.upload('primary.txt', 'text/plain', new TextEncoder().encode('primary bytes')),
      )
      expect(result.rejected).toBe(true)
      if (!result.rejected) throw new Error('Expected upload rejection')
      expect(result.reason).toBe(primary)
      expect(cleanupWarnings).toBe(1)
      f.kernel.assertIdle()
    } finally {
      f.kernel.storage.call = original
    }
  })
}
