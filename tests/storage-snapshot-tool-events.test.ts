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
      !basename(target).startsWith('hbar-snapshot-tool-events-')
    )
      throw new Error(`Refusing to clean an unowned snapshot-tool-events fixture: ${target}`)
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-snapshot-tool-events-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'paths.json'))
  await ensurePathLayout(layout)
  const storage = new Storage(layout.database, layout)
  fixtures.push({ root, storage })
  await storage.call('ready')
  return { root, storage }
}

test('snapshot keeps the newest event per run, type, and tool identity', async () => {
  const { root, storage } = await fixture()
  const workspace = await storage.call('createWorkspace', root, 'workspace')
  const session = await storage.call('createSession', workspace.id, 'tool events')
  const runA = await storage.call('enqueue', session.id, 'tool-event-run-a', { text: 'a', images: [] }, 'fixture')
  const runB = await storage.call('enqueue', session.id, 'tool-event-run-b', { text: 'b', images: [] }, 'fixture')
  const superseded = 'x'.repeat(32_000)

  await storage.call(
    'append',
    session.id,
    'tool.execution',
    { callId: 'call-a', payload: superseded, revision: 'old' },
    runA.id,
  )
  await storage.call('append', session.id, 'tool.execution', { callId: 'call-a', payload: 'winner-a' }, runA.id)
  await storage.call(
    'append',
    session.id,
    'tool.sequence_progress',
    { parentCallId: 'sequence-a', payload: superseded },
    runA.id,
  )
  await storage.call(
    'append',
    session.id,
    'tool.sequence_progress',
    { parentCallId: 'sequence-a', payload: 'winner-sequence' },
    runA.id,
  )
  await storage.call(
    'append',
    session.id,
    'tool.execution',
    { payload: superseded, revision: 'old-null-group' },
    runA.id,
  )
  await storage.call('append', session.id, 'tool.execution', { payload: 'winner-null-group' }, runA.id)
  await storage.call('append', session.id, 'tool.execution', { callId: 'call-a', payload: 'winner-other-run' }, runB.id)

  const snapshot = await storage.call('snapshot', session.id, undefined, 60)
  const toolEvents = snapshot.toolEvents ?? []

  expect(toolEvents).toHaveLength(4)
  expect(toolEvents.map(({ data }) => data)).toEqual([
    { callId: 'call-a', payload: 'winner-a' },
    { parentCallId: 'sequence-a', payload: 'winner-sequence' },
    { payload: 'winner-null-group' },
    { callId: 'call-a', payload: 'winner-other-run' },
  ])
  expect(toolEvents.map(({ type }) => type)).toEqual([
    'tool.execution',
    'tool.sequence_progress',
    'tool.execution',
    'tool.execution',
  ])
  expect(toolEvents.map(({ seq }) => seq)).toEqual([...toolEvents.map(({ seq }) => seq)].sort((a, b) => a - b))
})

test('snapshot applies the 1000-event limit after grouping tool identities', async () => {
  const { root, storage } = await fixture()
  const workspace = await storage.call('createWorkspace', root, 'workspace')
  const session = await storage.call('createSession', workspace.id, 'tool event cap')
  const run = await storage.call('enqueue', session.id, 'tool-event-cap-run', { text: 'cap', images: [] }, 'fixture')
  const payload = 'p'.repeat(2_048)

  for (let index = 0; index < 1_001; index++) {
    const callId = `call-${index.toString().padStart(4, '0')}`
    await storage.call('append', session.id, 'tool.execution', { callId, payload, revision: 'old' }, run.id)
    await storage.call('append', session.id, 'tool.execution', { callId, payload: `winner-${index}` }, run.id)
  }

  const snapshot = await storage.call('snapshot', session.id, undefined, 60)
  const toolEvents = snapshot.toolEvents ?? []

  expect(toolEvents).toHaveLength(1_000)
  expect(toolEvents[0]?.data).toEqual({ callId: 'call-0001', payload: 'winner-1' })
  expect(toolEvents.at(-1)?.data).toEqual({ callId: 'call-1000', payload: 'winner-1000' })
  expect(
    toolEvents.every(({ data }) => typeof data === 'object' && data !== null && 'revision' in data === false),
  ).toBe(true)
})
