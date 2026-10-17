import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { GoalService } from '@hbar/plugin-sdk'
import { HbarClient, createInteractionCommandClient } from '@hbar/client'
import { startServer } from '../apps/host/src/server'
import { removeOwnedTestDirectory } from './owned-temp-directory'

async function failure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Expected a decision error')
}
async function until<Value>(read: () => Promise<Value | undefined>): Promise<Value> {
  const deadline = Date.now() + 5_000
  for (;;) {
    const result = await read()
    if (result !== undefined) return result
    if (Date.now() > deadline) throw new Error('Decision did not become visible')
    await Bun.sleep(5)
  }
}

test('authenticated decision APIs list and resolve original questions and approvals while preserving scope, versions and idempotency', async () => {
  const prefix = 'hbar-decision-commands-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(kernel, { port: 0 })
  const device = await host.auth.createDevice('Decision operator')
  const url = `http://127.0.0.1:${host.server.port}`
  const client = new HbarClient(url, device.token)
  const observer = new HbarClient(url, (await host.auth.createDevice('Decision observer', { role: 'observer' })).token)
  const outsider = new HbarClient(
    url,
    (await host.auth.createDevice('Scoped outsider', { role: 'operator', workspaceIds: [] })).token,
  )
  try {
    await Promise.all([client.connect(), observer.connect(), outsider.connect()])
    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('Missing decision workspace')
    const session = await kernel.createSession(workspace.id)
    const other = await kernel.createSession(workspace.id)
    const commands = createInteractionCommandClient(client)
    const readOnly = createInteractionCommandClient(observer)
    await kernel.submit(
      session.id,
      'question',
      {
        text: '/tool request_user_input {"questions":[{"id":"scope","header":"Scope","question":"Which scope?","purpose":"fact","options":[{"label":"App","description":"Application"},{"label":"API","description":"Service"}]}]}',
        images: [],
        mode: 'plan',
      },
      'local-fixture',
    )
    const request = await until(async () => (await kernel.snapshot(session.id)).userInputs[0])
    const target = { sessionId: session.id, kind: 'questionnaire' as const, id: request.requestId }
    const page = await readOnly.execute('decision.list', { sessionId: session.id, kind: 'questionnaire' })
    expect(page.items).toMatchObject([
      { id: request.requestId, revision: 1, status: 'pending', sourceRunStatus: 'running' },
    ])
    expect(page.items.some((item) => 'state' in item)).toBe(false)
    expect(await commands.execute('decision.get', target)).toMatchObject({
      ...target,
      state: {
        request: {
          requestId: request.requestId,
          sessionId: request.sessionId,
          runId: request.runId,
          callId: request.callId,
          questions: request.questions,
        },
        settlement: null,
      },
    })
    expect(await failure(commands.execute('decision.get', { ...target, sessionId: other.id }))).toMatchObject({
      code: 'COMMAND_NOT_FOUND',
    })
    expect(await failure(createInteractionCommandClient(outsider).execute('decision.get', target))).toMatchObject({
      code: 'FORBIDDEN',
    })
    const input = {
      sessionId: target.sessionId,
      id: target.id,
      expectedRevision: 1,
      resolution: { kind: 'questionnaire' as const, response: { answers: { scope: { answers: ['App'] } } } },
    }
    expect(
      await failure(readOnly.execute('decision.resolve', input, { idempotencyKey: 'observer-answer' })),
    ).toMatchObject({ code: 'FORBIDDEN' })
    const answer = await commands.execute('decision.resolve', input, { idempotencyKey: 'answer-once' })
    expect(answer).toMatchObject({ accepted: true, decision: { status: 'answered', revision: 2 } })
    expect(await commands.execute('decision.resolve', input, { idempotencyKey: 'answer-once' })).toEqual(answer)
    expect(
      await failure(commands.execute('decision.resolve', input, { idempotencyKey: 'stale-answer' })),
    ).toMatchObject({ code: 'DECISION_CONFLICT' })
    await kernel.waitForIdle()
    expect(
      (await commands.execute('decision.list', { sessionId: session.id, kind: 'questionnaire' })).items,
    ).toHaveLength(0)
    expect((await commands.execute('decision.get', target)).sourceRunStatus).toBe('completed')
    expect(
      (await commands.execute('decision.list', { sessionId: session.id, kind: 'questionnaire', status: 'all' })).items,
    ).toHaveLength(1)
    await kernel.submit(
      session.id,
      'write',
      {
        text: '/tool write_file {"path":"blocked.txt","text":"must be approved"}',
        images: [],
        approval: 'ask',
        mode: 'default',
      },
      'local-fixture',
    )
    const approval = await until(async () =>
      (await kernel.snapshot(session.id)).approvals.find((item) => item.status === 'pending'),
    )
    const approvalTarget = { sessionId: session.id, kind: 'approval' as const, id: approval.id }
    expect(
      (await commands.execute('decision.list', { sessionId: session.id, kind: 'approval' })).items.map(
        (item) => item.id,
      ),
    ).toContain(approval.id)
    expect(await failure(commands.execute('decision.get', { ...approvalTarget, kind: 'plan_exit' }))).toMatchObject({
      code: 'COMMAND_NOT_FOUND',
    })
    expect(
      await commands.execute(
        'decision.resolve',
        {
          sessionId: approvalTarget.sessionId,
          id: approvalTarget.id,
          expectedRevision: 1,
          resolution: { kind: 'approval', decision: 'denied' },
        },
        { idempotencyKey: 'deny-write' },
      ),
    ).toMatchObject({ accepted: true, decision: { status: 'denied', revision: 2 } })
    await kernel.waitForIdle()
    expect(await Bun.file(join(root, 'blocked.txt')).exists()).toBe(false)
    expect((await kernel.plugins.get<GoalService>('goal').get(session.id)).goal).toBeNull()
  } finally {
    client.disconnect()
    observer.disconnect()
    outsider.disconnect()
    await host.close()
    await kernel.close()
    await removeOwnedTestDirectory(root, prefix)
  }
})
