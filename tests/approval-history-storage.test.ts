import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import type { Approval } from '@hbar/contracts'
import { Storage } from '@hbar/storage'

const resources: { root: string; store: Storage }[] = []
afterEach(async () => {
  for (const { root, store } of resources.splice(0)) {
    await store.close()
    const target = resolve(root)
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-approval-history-'))
      throw new Error('Refusing cleanup outside the owned approval history fixture')
    await rm(target, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-approval-history-'))
  const store = new Storage(join(root, 'test.sqlite'))
  resources.push({ root, store })
  await store.call('ready')
  const workspace = await store.call('createWorkspace', root, 'Approval history fixture')
  const session = await store.call('createSession', workspace.id)
  const run = await store.call('enqueue', session.id, 'approval-history', { text: 'Review', images: [] }, 'fixture')
  const approval: Approval = {
    id: 'approval-allowed',
    sessionId: session.id,
    runId: run.id,
    callId: 'call-allowed',
    tool: 'edit_file',
    args: { path: 'draft.md', oldText: 'before', newText: 'after' },
    status: 'pending',
    createdAt: 1,
  }
  return { store, workspace, session, run, approval }
}

test('ordinary allowed, denied and cancelled approvals restore from exact current-page calls', async () => {
  const f = await fixture()
  for (const [index, status] of ['allowed', 'denied', 'cancelled'].entries()) {
    if (status !== 'allowed' && status !== 'denied' && status !== 'cancelled') throw new Error('Invalid fixture status')
    const approval: Approval = { ...f.approval, id: `approval-${status}`, callId: `call-${status}`, createdAt: index }
    await f.store.call('commit', f.session.id, f.run.id, 'assistant', [
      { type: 'tool_call', name: approval.tool, callId: approval.callId, args: approval.args },
    ])
    await f.store.call('createApproval', approval)
    await f.store.call('resolveApproval', approval.id, status)
  }
  const current = await f.store.call('snapshot', f.session.id)
  expect(current.approvals.map((approval) => approval.status).sort()).toEqual(['allowed', 'cancelled', 'denied'])
  expect(current.approvals.every((approval) => approval.tool === 'edit_file')).toBe(true)
  expect(current.approvals.every((approval) => JSON.stringify(approval.args) === JSON.stringify(f.approval.args))).toBe(
    true,
  )
  expect((await f.store.call('snapshot', f.session.id)).approvals).toEqual(current.approvals)
  expect(
    (await f.store.call('events', f.session.id, 0)).filter((event) => event.type === 'approval.resolved'),
  ).toHaveLength(3)
})

test('ordinary approval history is page-owned and never joins a foreign session, Run, call or tool', async () => {
  const f = await fixture()
  const original = await f.store.call('commit', f.session.id, f.run.id, 'assistant', [
    { type: 'tool_call', name: f.approval.tool, callId: f.approval.callId, args: f.approval.args },
  ])
  await f.store.call('createApproval', f.approval)
  await f.store.call('resolveApproval', f.approval.id, 'allowed')
  const other = await f.store.call('createSession', f.workspace.id)
  for (const [index, identity] of [
    { sessionId: other.id },
    { runId: 'other-run' },
    { callId: 'other-call' },
    { tool: 'write_file' },
  ].entries()) {
    const unrelated = { ...f.approval, ...identity, id: `unrelated-${index}` }
    await f.store.call('createApproval', unrelated)
    await f.store.call('resolveApproval', unrelated.id, 'denied')
  }
  const newer = await f.store.call('commit', f.session.id, f.run.id, 'assistant', [{ type: 'text', text: 'New page' }])
  expect((await f.store.call('snapshot', f.session.id, undefined, 1)).approvals).toEqual([])
  const older = await f.store.call('snapshot', f.session.id, newer.message.seq, 1)
  expect(older.messages[0]?.id).toBe(original.message.id)
  expect(older.approvals).toMatchObject([{ id: f.approval.id, status: 'allowed' }])
  expect((await f.store.call('snapshot', other.id)).approvals).toEqual([])

  await f.store.call('commit', f.session.id, f.run.id, 'tool', [
    { type: 'tool_result', name: f.approval.tool, callId: f.approval.callId, text: 'Updated', isError: false },
  ])
  expect((await f.store.call('snapshot', f.session.id, undefined, 1)).approvals).toMatchObject([
    { id: f.approval.id, status: 'allowed' },
  ])
})

test('pending approval priority and the 80-record bound apply to ordinary completed history', async () => {
  const f = await fixture()
  await f.store.call('commit', f.session.id, f.run.id, 'assistant', [
    { type: 'tool_call', name: f.approval.tool, callId: f.approval.callId, args: f.approval.args },
  ])
  await f.store.call('createApproval', f.approval)
  await f.store.call('resolveApproval', f.approval.id, 'allowed')
  for (let index = 0; index < 79; index++)
    await f.store.call('createApproval', { ...f.approval, id: `pending-${index}`, callId: `pending-call-${index}` })
  const full = await f.store.call('snapshot', f.session.id)
  expect(full.approvals).toHaveLength(80)
  expect(full.approvals.filter((approval) => approval.status === 'pending')).toHaveLength(79)
  expect(full.approvals.at(-1)).toMatchObject({ id: f.approval.id, status: 'allowed' })
  await f.store.call('createApproval', { ...f.approval, id: 'pending-80', callId: 'pending-call-80' })
  const pendingOnly = await f.store.call('snapshot', f.session.id)
  expect(pendingOnly.approvals).toHaveLength(80)
  expect(pendingOnly.approvals.every((approval) => approval.status === 'pending')).toBe(true)
})
