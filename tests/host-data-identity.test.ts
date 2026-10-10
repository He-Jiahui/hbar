import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureHostDataRootId } from '../apps/host/src/host-data-identity.ts'

test('Host data-root identity is stable within a settings root and isolated across roots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-host-identity-'))
  const first = join(root, 'first')
  const second = join(root, 'second')
  try {
    const initial = await ensureHostDataRootId(first)
    expect(await ensureHostDataRootId(first)).toBe(initial)
    expect(await ensureHostDataRootId(second)).not.toBe(initial)
    expect(await readFile(join(first, 'host-identity'), 'utf8')).toBe(`${initial}\n`)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
