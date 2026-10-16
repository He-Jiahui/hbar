import { test, expect } from 'bun:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { LocalExecution } from '../plugins/local-tools/src'
import { localReadBoundary } from '../plugins/local-tools/src/read-errors'

test('actual missing file and invalid directory reads have safe domain errors, valid and scoped reads remain intact', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-read-errors-'))
  const execution = new LocalExecution()
  try {
    await writeFile(join(root, 'file.txt'), 'valid')
    for (const operation of [
      () => execution.readBytes(root, 'missing.txt'),
      () => execution.list(root, 'missing'),
      () => execution.list(root, 'file.txt'),
      () => execution.readBytes(root, 'file.txt/child'),
    ]) {
      const error: unknown = await operation().catch((reason: unknown) => reason)
      expect(error).toMatchObject({ name: 'HbarError', code: 'NOT_FOUND' })
      if (!(error instanceof Error)) throw new Error('Expected read error')
      expect(error.message).not.toContain(root)
    }
    expect(await execution.read(root, 'file.txt')).toBe('valid')
    await expect(execution.read(root, '../outside')).rejects.toMatchObject({ code: 'PATH_DENIED' })
  } finally {
    await execution.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('permission and busy mapping is allowlisted; domain/cancel/timeout/unknown identity is retained', async () => {
  for (const [code, expected] of [
    ['EACCES', 'PATH_DENIED'],
    ['EPERM', 'PATH_DENIED'],
    ['EBUSY', 'BUSY'],
  ]) {
    const native = Object.assign(new Error('PRIVATE_CANARY'), { code })
    const mapped: unknown = await localReadBoundary(async () => {
      throw native
    }).catch((error: unknown) => error)
    expect(mapped).toMatchObject({ code: expected, cause: native })
    if (!(mapped instanceof Error)) throw new Error('Expected mapped error')
    expect(mapped.message).not.toContain('PRIVATE_CANARY')
  }
  for (const original of [
    new HbarError('PATH_DENIED', 'scope'),
    new HbarError('IPC_TIMEOUT', 'deadline'),
    new DOMException('cancelled', 'AbortError'),
    Object.assign(new Error('PRIVATE_CANARY'), { code: 'EUNKNOWN' }),
  ])
    expect(
      await localReadBoundary(async () => {
        throw original
      }).catch((error: unknown) => error),
    ).toBe(original)
})
