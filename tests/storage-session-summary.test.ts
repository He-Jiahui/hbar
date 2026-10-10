import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { Storage, createPathLayout, ensurePathLayout } from '@hbar/storage'

const fixtures: Array<{ root: string; storage: Storage }> = []

afterEach(async () => {
  for (const fixture of fixtures.splice(0).reverse()) {
    await fixture.storage.close()
    const target = await realpath(fixture.root)
    const temporary = await realpath(tmpdir())
    if (
      dirname(target).toLowerCase() !== temporary.toLowerCase() ||
      !basename(target).startsWith('hbar-session-summary-')
    )
      throw new Error(`Refusing to clean an unowned session-summary fixture: ${target}`)
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-session-summary-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'paths.json'))
  await ensurePathLayout(layout)
  const storage = new Storage(layout.database, layout)
  fixtures.push({ root, storage })
  await storage.call('ready')
  return { root, storage }
}

test('sessionSummary projects activity fields without returning event payloads', async () => {
  const { root, storage } = await fixture()
  const workspace = await storage.call('createWorkspace', root, 'workspace')
  const session = await storage.call('createSession', workspace.id, 'summary')
  const run = await storage.call('enqueue', session.id, 'summary-run', { text: 'run', images: [] }, 'fixture')
  await storage.call('claim', session.id)
  await storage.call('append', session.id, 'tool.started', { name: 'file.read', payload: 'x'.repeat(100_000) }, run.id)
  await storage.call('commit', session.id, run.id, 'assistant', [{ type: 'text', text: 'done' }])

  expect(await storage.call('sessionSummary', session.id)).toMatchObject({
    sessionId: session.id,
    activeRunId: run.id,
    activity: 'output',
  })
})

test('sessionSummary remains bounded with a large event history', async () => {
  const { root, storage } = await fixture()
  const workspace = await storage.call('createWorkspace', root, 'workspace')
  const session = await storage.call('createSession', workspace.id, 'summary')
  const run = await storage.call('enqueue', session.id, 'summary-heavy', { text: 'run', images: [] }, 'fixture')
  await storage.call('claim', session.id)
  const payload = 'x'.repeat(100_000)
  for (let index = 0; index < 80; index++)
    await storage.call(
      'append',
      session.id,
      index === 79 ? 'tool.started' : 'tool.progress',
      {
        name: 'file.read',
        payload,
      },
      run.id,
    )

  const started = performance.now()
  const summary = await storage.call('sessionSummary', session.id)
  expect(performance.now() - started).toBeLessThan(5_000)
  expect(summary.activity).toBe('reading')
})
