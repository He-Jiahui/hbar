import { afterEach, expect, test } from 'bun:test'
import { lstat, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { contentBlockSchema, type ContentBlock, type ToolOutcome } from '@hbar/contracts'
import { createPathLayout, ensurePathLayout, Storage } from '@hbar/storage'

const prefix = 'hbar-tool-outcome-storage-'
const resources: { root: string; store: Storage }[] = []
async function assertRoot(root: string) {
  const actual = await realpath(root)
  if (
    actual !== resolve(root) ||
    dirname(actual) !== (await realpath(tmpdir())) ||
    !basename(actual).startsWith(prefix) ||
    (await lstat(actual)).isSymbolicLink()
  )
    throw new Error('Refusing a redirected or unowned test root')
}
afterEach(async () => {
  for (const resource of resources.splice(0)) {
    await resource.store.close()
    await assertRoot(resource.root)
    await rm(resource.root, { recursive: true })
  }
})

async function fixture() {
  const root = await realpath(await mkdtemp(join(await realpath(tmpdir()), prefix)))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'system', 'paths.json'))
  await ensurePathLayout(layout)
  const resource = { root, store: new Storage(layout.database, layout) }
  resources.push(resource)
  await resource.store.call('ready')
  const workspace = await resource.store.call('createWorkspace', root, 'tool-outcome fixture')
  const session = await resource.store.call('createSession', workspace.id, 'Original tool results')
  const run = await resource.store.call(
    'enqueue',
    session.id,
    'request',
    { text: 'synthetic storage history', images: [] },
    'fixture',
  )
  await resource.store.call('claim', session.id)
  const reopen = async (rebuild = false) => {
    await resource.store.close()
    await assertRoot(root)
    if (rebuild) {
      for (const path of [layout.database, `${layout.database}-wal`, `${layout.database}-shm`]) {
        if (dirname(path) !== layout.databases) throw new Error('Invalid exact database projection path')
        await rm(path, { force: true })
      }
    }
    resource.store = new Storage(layout.database, layout)
    await resource.store.call('ready')
  }
  const results = async () =>
    (await resource.store.call('snapshot', session.id)).messages.flatMap((message) =>
      message.content.flatMap((block) => (block.type === 'tool_result' ? [block] : [])),
    )
  return { resource, session, run, reopen, results }
}

for (const started of [false, true]) {
  test(`recovery persists ${started ? 'unknown recorded intent' : 'interrupted unstarted call'} without replay`, async () => {
    const f = await fixture()
    await f.resource.store.call('commit', f.session.id, f.run.id, 'assistant', [
      { type: 'tool_call', callId: 'original-call', name: 'write_file', args: { path: 'never-executed.txt' } },
    ])
    if (started)
      await f.resource.store.call('toolStart', f.session.id, f.run.id, 'original-call', 'write_file', {
        path: 'never-executed.txt',
      })
    await f.reopen()
    expect(await f.resource.store.call('recover')).toBe(1)
    expect(await f.results()).toHaveLength(1)
    expect((await f.results())[0]).toMatchObject({
      callId: 'original-call',
      name: 'write_file',
      isError: true,
      outcome: { kind: started ? 'unknown' : 'interrupted', executionStarted: started },
    })
    const events = await f.resource.store.call('events', f.session.id, 0)
    expect(events.filter((event) => event.type === 'tool.started')).toHaveLength(started ? 1 : 0)
    expect(events.filter((event) => event.type === 'tool.unknown')).toHaveLength(started ? 1 : 0)
    expect(await f.resource.store.call('recover')).toBe(0)
    const before = await f.results()
    await f.reopen(true)
    expect(await f.results()).toEqual(before)
    expect(await f.resource.store.call('recover')).toBe(0)
  })
}

test('known settlements survive recovery, restart and JSONL projection rebuild without being relabelled', async () => {
  const f = await fixture()
  const outcomes: readonly ToolOutcome[] = [
    { kind: 'succeeded', executionStarted: true },
    { kind: 'failed', executionStarted: true },
    { kind: 'denied', executionStarted: false },
    { kind: 'cancelled', executionStarted: false },
    { kind: 'interrupted', executionStarted: true },
    { kind: 'unknown', executionStarted: true },
  ]
  const blocks: Extract<ContentBlock, { type: 'tool_result' }>[] = outcomes.map((outcome, index) => ({
    type: 'tool_result',
    callId: `call-${index}`,
    name: 'fixture',
    text: `Original output ${index}`,
    isError: outcome.kind !== 'succeeded',
    outcome,
  }))
  blocks.push({
    type: 'tool_result',
    callId: 'legacy',
    name: 'legacy',
    text: 'Legacy error is not reinterpreted from words like cancelled or denied',
    isError: true,
  })
  await f.resource.store.call('toolStart', f.session.id, f.run.id, 'call-0', 'fixture', {})
  await f.resource.store.call('commit', f.session.id, f.run.id, 'tool', blocks)
  expect(await f.resource.store.call('recover')).toBe(1)
  expect(await f.results()).toEqual(blocks)
  expect(
    (await f.resource.store.call('events', f.session.id, 0)).filter((event) => event.type === 'tool.unknown'),
  ).toEqual([])
  await f.reopen()
  expect(await f.results()).toEqual(blocks)
  await f.reopen(true)
  expect(await f.results()).toEqual(blocks)
  expect((await f.results()).find((result) => result.callId === 'legacy')?.outcome).toBeUndefined()
})

test('nested sequence recovery retains the exact parent and does not inject child output into model messages', async () => {
  const f = await fixture()
  await f.resource.store.call(
    'append',
    f.session.id,
    'tool.sequence_call',
    {
      parentCallId: 'parent-call',
      callId: 'child-call',
      name: 'fixture',
      args: {},
    },
    f.run.id,
  )
  await f.resource.store.call('toolStart', f.session.id, f.run.id, 'child-call', 'fixture', {})
  expect(await f.resource.store.call('recover')).toBe(1)
  const sequence = (await f.resource.store.call('events', f.session.id, 0)).filter(
    (event) => event.type === 'tool.sequence_result',
  )
  expect(sequence).toHaveLength(1)
  const result = z.object({ parentCallId: z.string(), content: z.array(contentBlockSchema) }).parse(sequence[0]?.data)
  expect(result).toMatchObject({
    parentCallId: 'parent-call',
    content: [
      {
        type: 'tool_result',
        callId: 'child-call',
        name: 'fixture',
        isError: true,
        outcome: { kind: 'unknown', executionStarted: true },
      },
    ],
  })
  expect(await f.results()).toEqual([])
  await f.reopen(true)
  const recovered = (await f.resource.store.call('events', f.session.id, 0)).filter(
    (event) => event.type === 'tool.sequence_result',
  )
  expect(recovered).toEqual(sequence)
  expect(await f.resource.store.call('recover')).toBe(0)
})
