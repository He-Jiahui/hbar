import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { acquireHostProcessLock } from '../apps/host/src/process-lock'

test('a root has one live process owner and cleanup cannot erase a replacement record', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-owner-'))
  const path = join(root, 'host.lock')
  let release: (() => Promise<void>) | undefined
  try {
    release = await acquireHostProcessLock(path)
    await expect(acquireHostProcessLock(path)).rejects.toBeInstanceOf(Error)
    await writeFile(path, JSON.stringify({ pid: process.pid, lease: 'replacement' }))
    await release()
    release = undefined
    expect(await readFile(path, 'utf8')).toContain('replacement')
  } finally {
    await release?.()
    await rm(root, { recursive: true, force: true })
  }
})

test('an unverifiable record does not get deleted to manufacture availability', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-invalid-owner-'))
  const path = join(root, 'host.lock')
  try {
    await writeFile(path, '{invalid')
    await expect(acquireHostProcessLock(path)).rejects.toThrow('Cannot verify')
    expect(await readFile(path, 'utf8')).toBe('{invalid')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a confirmed dead owner can be replaced after its OS lifetime lock is released', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-stale-owner-'))
  const path = join(root, 'host.lock')
  const processRef = Bun.spawn([process.execPath, '-e', 'process.exit(0)'], { stdout: 'ignore', stderr: 'ignore' })
  await processRef.exited
  let release: (() => Promise<void>) | undefined
  try {
    await writeFile(path, JSON.stringify({ pid: processRef.pid }))
    release = await acquireHostProcessLock(path)
    expect(await readFile(path, 'utf8')).toContain(String(process.pid))
    await release()
    release = undefined
    expect(await Bun.file(path).exists()).toBe(false)
  } finally {
    await release?.()
    await rm(root, { recursive: true, force: true })
  }
})
