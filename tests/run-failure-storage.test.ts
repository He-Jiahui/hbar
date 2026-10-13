import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '@hbar/storage'
import type { RunFailure } from '@hbar/contracts'

const resources: { root: string; store: Storage }[] = []
afterEach(async () => {
  for (const { root, store } of resources.splice(0)) {
    await store.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-failure-storage-'))
  const path = join(root, 'test.sqlite')
  const resource = { root, store: new Storage(path) }
  resources.push(resource)
  await resource.store.call('ready')
  const workspace = await resource.store.call('createWorkspace', root, 'fixture')
  const session = await resource.store.call('createSession', workspace.id)
  const run = await resource.store.call(
    'enqueue',
    session.id,
    'original',
    { text: 'legacy run', images: [] },
    'fixture',
  )
  return { resource, path, session, run }
}

test('schema-v4 run rows migrate additively and retain legacy error text', async () => {
  const { resource, path, run } = await fixture()
  await resource.store.call('setRun', run.id, 'failed', 'legacy failure text')
  await resource.store.close()
  const legacy = new Database(path)
  legacy.exec(
    'DROP INDEX IF EXISTS node_run_workspace_mounts_session; DROP TABLE IF EXISTS node_run_workspace_mounts; DROP INDEX node_run_worktrees_session; DROP TABLE node_run_worktrees; DROP INDEX node_execution_intents_run_call; DROP TABLE node_execution_intents; ALTER TABLE approvals DROP COLUMN executionTarget; ALTER TABLE runs DROP COLUMN failure; ALTER TABLE approvals DROP COLUMN feedback; ALTER TABLE approvals DROP COLUMN decidedBy; PRAGMA user_version=4;',
  )
  legacy.close()
  resource.store = new Storage(path)
  await resource.store.call('ready')
  expect(await resource.store.call('run', run.id)).toMatchObject({ status: 'failed', error: 'legacy failure text' })
  expect((await resource.store.call('run', run.id)).failure).toBeUndefined()
  const reason: RunFailure = { code: 'RESULT_UNKNOWN', category: 'result_unknown', retryable: false }
  await resource.store.call('setRun', run.id, 'failed', 'updated classification', reason)
  expect((await resource.store.call('run', run.id)).failure).toEqual(reason)
})

test('canonical JSONL restores structured failure after the disposable SQLite projection is removed', async () => {
  const { resource, path, run } = await fixture()
  const reason: RunFailure = { code: 'BUDGET_EXHAUSTED', category: 'budget', retryable: false, budgetSource: 'session' }
  await resource.store.call('setRun', run.id, 'failed', 'Token budget exhausted', reason)
  await resource.store.close()
  await rm(path, { force: true })
  await rm(`${path}-wal`, { force: true })
  await rm(`${path}-shm`, { force: true })
  resource.store = new Storage(path)
  await resource.store.call('ready')
  expect(await resource.store.call('run', run.id)).toMatchObject({ error: 'Token budget exhausted', failure: reason })
})

test('recovery differentiates unacknowledged tool effects from known settled results', async () => {
  const { resource, session, run } = await fixture()
  await resource.store.call('claim', session.id)
  await resource.store.call('toolStart', session.id, run.id, 'write-once', 'write_file', { path: 'output.txt' })
  await resource.store.call('commit', session.id, run.id, 'tool', [
    { type: 'tool_result', callId: 'write-once', name: 'write_file', text: 'written', isError: false },
  ])
  await resource.store.call('recover')
  expect((await resource.store.call('run', run.id)).failure).toEqual({
    code: 'HOST_INTERRUPTED',
    category: 'interrupted',
    retryable: false,
  })
  expect((await resource.store.call('events', session.id, 0)).some((event) => event.type === 'tool.unknown')).toBe(
    false,
  )
})
