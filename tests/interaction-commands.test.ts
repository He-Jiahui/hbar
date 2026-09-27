import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createInteractionCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { Approval } from '@hbar/contracts'
import type { ModeService } from '@hbar/plugin-sdk'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-interaction-commands-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id, 'interaction commands')
  const other = await kernel.createSession(workspace.id, 'other session')
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  cleanups.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  await client.pair(host.pairing.code, 'interaction command test')
  return { root, kernel, client, session, other }
}

async function waitFor<Value>(read: () => Promise<Value | undefined>): Promise<Value> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const value = await read()
    if (value !== undefined) return value
    await Bun.sleep(5)
  }
  throw new Error('Timed out waiting for interaction')
}

test('approval and questionnaire commands validate session targets and converge on one resolution', async () => {
  const { root, kernel, client, session, other } = await fixture()
  const commands = createInteractionCommandClient(client)
  const catalog = await client.call('command.catalog', { category: 'run.approval', limit: 20 })
  expect(catalog.items.map((item) => item.metadata.id)).toEqual([
    'approval.resolve',
    'context.compact',
    'operation.cancel',
    'operation.get',
    'permission.get',
    'permission.set',
    'planExit.get',
    'planExit.resolve',
    'questionnaire.answer',
    'queuedRun.remove',
    'run.retry',
    'run.submit',
    'session.activeOperations',
    'session.queuedUserRuns',
  ])

  await kernel.submit(
    session.id,
    'approval-command',
    { text: '/tool write_file {"path":"denied.txt","text":"blocked"}', images: [], approval: 'ask' },
    'local-fixture',
  )
  const approval = await waitFor<Approval>(async () => (await kernel.snapshot(session.id)).approvals[0])
  await Bun.sleep(0)
  await expect(
    commands.execute('approval.resolve', {
      sessionId: other.id,
      approvalId: approval.id,
      decision: 'allowed',
    }),
  ).rejects.toMatchObject({ code: 'COMMAND_NOT_FOUND' })
  expect(
    await commands.execute('approval.resolve', {
      sessionId: session.id,
      approvalId: approval.id,
      decision: 'denied',
    }),
  ).toEqual({ sessionId: session.id, approvalId: approval.id, status: 'denied' })
  expect(
    await commands.execute('approval.resolve', {
      sessionId: session.id,
      approvalId: approval.id,
      decision: 'allowed',
    }),
  ).toEqual({ sessionId: session.id, approvalId: approval.id, status: 'denied' })
  await kernel.waitForIdle()
  expect(await Bun.file(join(root, 'denied.txt')).exists()).toBeFalse()

  await kernel.setPermissionMode('allow')
  await kernel.plugins.get<ModeService>('mode').set(session.id, 'plan')
  await kernel.submit(
    session.id,
    'questionnaire-command',
    {
      mode: 'plan',
      text: '/tool request_user_input {"questions":[{"id":"scope","header":"Scope","question":"Choose a scope","options":[{"label":"App","description":"Application"},{"label":"API","description":"Protocol"}]}]}',
      images: [],
    },
    'local-fixture',
  )
  const request = await waitFor(async () => (await kernel.snapshot(session.id)).userInputs[0])
  const answers = { scope: { answers: ['App'] } }
  expect(
    await commands.execute('questionnaire.answer', {
      sessionId: other.id,
      requestId: request.requestId,
      answers,
    }),
  ).toEqual({ sessionId: other.id, requestId: request.requestId, accepted: false })
  expect(
    await commands.execute('questionnaire.answer', {
      sessionId: session.id,
      requestId: request.requestId,
      answers,
    }),
  ).toEqual({ sessionId: session.id, requestId: request.requestId, accepted: true })
  expect(
    await commands.execute('questionnaire.answer', {
      sessionId: session.id,
      requestId: request.requestId,
      answers,
    }),
  ).toEqual({ sessionId: session.id, requestId: request.requestId, accepted: false })
  await kernel.waitForIdle()
  const snapshot = await kernel.snapshot(session.id)
  expect(snapshot.userInputs).toHaveLength(0)
  expect(
    snapshot.messages
      .flatMap((message) => message.content)
      .some(
        (block) => block.type === 'tool_result' && block.name === 'request_user_input' && block.text.includes('App'),
      ),
  ).toBeTrue()
})
