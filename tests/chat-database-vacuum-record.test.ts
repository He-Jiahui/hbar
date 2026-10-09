import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { renameSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  createChatDatabaseVacuumRecords,
  type ChatDatabaseVacuumRecord,
} from '../packages/storage/src/chat-database-vacuum-record'

test('Windows receipt sharing failures preserve the prior receipt and publish the verified replacement after retry', () => {
  if (process.platform !== 'win32') return
  return fixture(async (root, initial) => {
    const original = createChatDatabaseVacuumRecords(root)
    original.write(initial)
    let attempts = 0
    const retrying = createChatDatabaseVacuumRecords(root, {
      rename(source, target) {
        if (++attempts < 3) throw Object.assign(new Error('receipt reader still open'), { code: 'EPERM' })
        renameSync(source, target)
      },
    })
    retrying.write({ ...initial, stage: 'finished', status: 'completed', integrityVerified: true, didVacuum: true })
    expect(original.read(initial.operationId)).toMatchObject({
      status: 'completed',
      integrityVerified: true,
      didVacuum: true,
    })
    const blocked = createChatDatabaseVacuumRecords(root, {
      rename() {
        throw Object.assign(new Error('persistent sharing denial'), { code: 'EPERM' })
      },
    })
    expect(() => blocked.write(initial)).toThrow('persistent sharing denial')
    expect(original.read(initial.operationId)?.status).toBe('completed')
  })
})

async function fixture(run: (root: string, initial: ChatDatabaseVacuumRecord) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-vacuum-record-'))
  try {
    await run(root, {
      schemaVersion: 1,
      operationId: 'publication-race',
      stage: 'checkpoint',
      status: 'running',
      beforeBytes: 100,
      afterBytes: null,
      reclaimedBytes: 0,
      schemaRevision: 23,
      didVacuum: false,
      integrityVerified: false,
      cancellationRequested: false,
      updatedAt: Date.now(),
      error: null,
    })
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}
