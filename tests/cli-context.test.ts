import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NamedContextStore } from '../apps/cli/src/context.ts'

test('named context CAS admits one concurrent revision and leaves a complete selection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-context-'))
  try {
    const store = new NamedContextStore(root)
    expect(await store.set('并发审查', { workspaceId: 'w1', sessionId: 's1' }, null)).toMatchObject({ revision: 1 })
    const attempts = await Promise.allSettled([
      store.set('并发审查', { workspaceId: 'w1', sessionId: 's2' }, 1),
      store.set('并发审查', { workspaceId: 'w1', sessionId: 's3' }, 1),
    ])
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1)
    const current = await store.get('并发审查')
    if (!current) throw new Error('Expected committed context')
    expect(current).toMatchObject({ revision: 2, workspaceId: 'w1' })
    expect(['s2', 's3']).toContain(current.sessionId)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
