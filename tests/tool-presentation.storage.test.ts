import { afterEach, expect, test } from 'bun:test'
import { lstat, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { contentBlockSchema, type ContentBlock, type ToolCallPresentation } from '@hbar/contracts'
import { createPathLayout, ensurePathLayout, Storage } from '@hbar/storage'

const prefix = 'hbar-tool-presentation-storage-'
const resources: { root: string; store: Storage }[] = []
async function assertRoot(root: string) {
  const actual = await realpath(root)
  if (
    actual !== resolve(root) ||
    dirname(actual) !== (await realpath(tmpdir())) ||
    !basename(actual).startsWith(prefix) ||
    (await lstat(actual)).isSymbolicLink()
  )
    throw new Error('Refusing a redirected or unowned presentation test root')
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
  const workspace = await resource.store.call('createWorkspace', root, 'presentation storage fixture')
  const session = await resource.store.call('createSession', workspace.id, 'Stored requested-input declarations')
  const run = await resource.store.call(
    'enqueue',
    session.id,
    'request',
    { text: 'synthetic storage history; no tool execution', images: [] },
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
  return { resource, session, run, reopen }
}

const declarations: readonly ToolCallPresentation[] = [
  { version: 1, kind: 'file-read', pathField: 'path' },
  { version: 1, kind: 'file-write', pathField: 'target' },
  { version: 1, kind: 'file-edit', pathField: 'file' },
  { version: 1, kind: 'directory-list', pathField: 'path' },
  { version: 1, kind: 'command', commandField: 'command', descriptionField: 'description' },
  { version: 1, kind: 'text-search', patternField: 'pattern', pathField: 'path' },
  { version: 1, kind: 'file-search', queryField: 'nameQuery', includeField: 'include', pathField: 'path' },
]

test('all tool declarations and exact requested args survive events, paging, context, restart and JSONL rebuild', async () => {
  const f = await fixture()
  const args = {
    path: 'C:\\项目\\目录\\same-name.tsx',
    target: '/project/other/same-name.tsx',
    file: 'same-name.tsx',
    command: 'synthetic command text, never executed',
    description: 'A description, not execution evidence',
    pattern: 'identity-needle',
    nameQuery: 'same-name',
    include: ['**/*.tsx', '**/*.ts'],
    text: 'body must remain only in original args\n'.repeat(500),
    startLine: 2,
    lineCount: 5,
  }
  const blocks: ContentBlock[] = declarations.map((presentation, index) => ({
    type: 'tool_call',
    callId: `call-${index}`,
    name: `fixture_${index}`,
    args,
    presentation,
  }))
  blocks.push({ type: 'tool_call', callId: 'legacy', name: 'read_file', args: { path: 'legacy.txt' } })
  const committed = await f.resource.store.call('commit', f.session.id, f.run.id, 'assistant', blocks)
  const verify = async () => {
    const snapshot = await f.resource.store.call('snapshot', f.session.id, undefined, 1)
    expect(snapshot.messages).toHaveLength(1)
    expect(snapshot.messages[0]?.content).toEqual(blocks)
    expect((await f.resource.store.call('context', f.session.id)).messages[0]?.content).toEqual(blocks)
    const events = await f.resource.store.call('events', f.session.id, 0)
    const event = events.find((item) => item.eventId === committed.event.eventId)
    expect(event).toEqual(committed.event)
    const message = z.object({ content: z.array(contentBlockSchema) }).parse(snapshot.messages[0])
    expect(message.content).toEqual(blocks)
    const legacy = message.content.at(-1)
    expect(legacy?.type === 'tool_call' && legacy.presentation).toBeUndefined()
  }
  await verify()
  await f.reopen()
  await verify()
  await f.reopen(true)
  await verify()
})

test('recovery does not rewrite a stored call declaration or promote a legacy same-name call', async () => {
  const f = await fixture()
  const blocks: ContentBlock[] = [
    {
      type: 'tool_call',
      callId: 'captured',
      name: 'read_file',
      args: { path: 'request.txt' },
      presentation: { version: 1, kind: 'file-write', pathField: 'path' },
    },
    { type: 'tool_call', callId: 'legacy', name: 'read_file', args: { path: 'legacy.txt' } },
  ]
  await f.resource.store.call('commit', f.session.id, f.run.id, 'assistant', blocks)
  await f.reopen()
  expect(await f.resource.store.call('recover')).toBe(1)
  const snapshot = await f.resource.store.call('snapshot', f.session.id)
  expect(snapshot.messages.find((message) => message.role === 'assistant')?.content).toEqual(blocks)
  const results = snapshot.messages
    .flatMap((message) => message.content)
    .filter((block) => block.type === 'tool_result')
  expect(results).toHaveLength(2)
  expect(results.map((result) => result.callId).sort()).toEqual(['captured', 'legacy'])
  for (const result of results) expect(result.outcome).toEqual({ kind: 'interrupted', executionStarted: false })
  await f.reopen(true)
  expect((await f.resource.store.call('snapshot', f.session.id)).messages).toEqual(snapshot.messages)
  expect(await f.resource.store.call('recover')).toBe(0)
})

test('message forks preserve declarations and legacy omissions without creating new tool runs', async () => {
  const f = await fixture()
  await f.resource.store.call('commit', f.session.id, f.run.id, 'user', [{ type: 'text', text: 'Synthetic request' }])
  const calls: Extract<ContentBlock, { type: 'tool_call' }>[] = [
    {
      type: 'tool_call',
      callId: 'stored',
      name: 'read_file',
      args: { path: 'asked.txt' },
      presentation: { version: 1, kind: 'file-read', pathField: 'path' },
    },
    { type: 'tool_call', callId: 'legacy', name: 'read_file', args: { path: 'old.txt' } },
  ]
  await f.resource.store.call('commit', f.session.id, f.run.id, 'assistant', calls)
  await f.resource.store.call(
    'commit',
    f.session.id,
    f.run.id,
    'tool',
    calls.map((call) => {
      if (call.type !== 'tool_call') throw new Error('Expected a fixture tool call')
      return {
        type: 'tool_result',
        callId: call.callId,
        name: call.name,
        text: 'Synthetic stored result',
        isError: false,
      }
    }),
  )
  const final = await f.resource.store.call('commit', f.session.id, f.run.id, 'assistant', [
    { type: 'text', text: 'Done' },
  ])
  await f.resource.store.call('setRun', f.run.id, 'completed')
  const child = await f.resource.store.call('forkFromMessageCommand', {
    actorId: 'fixture',
    idempotencyKey: 'presentation-fork',
    sessionId: f.session.id,
    messageId: final.message.id,
  })
  const verify = async () => {
    const childSnapshot = await f.resource.store.call('snapshot', child.id)
    expect(childSnapshot.runs).toEqual([])
    expect(
      childSnapshot.messages.flatMap((message) => message.content).filter((block) => block.type === 'tool_call'),
    ).toEqual(calls)
    expect((await f.resource.store.call('snapshot', f.session.id)).messages).toHaveLength(4)
  }
  await verify()
  await f.reopen()
  await verify()
  await f.reopen(true)
  await verify()
})
