import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError, providerSchema } from '@hbar/contracts'
import type { Run, Session } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { GoalService } from '@hbar/plugin-sdk'
import { createRunCommands } from '../packages/kernel/src/run-commands'
import type { PeerMessageSendInput, QueuedRunGuideReceipt, RunCommandRecord } from '@hbar/contracts/commands/run'
type RunCommandKernelPort = Parameters<typeof createRunCommands>[0]

const workspaceId = 'workspace-a'
const senderId = 'session-sender'
const targetId = 'session-target'
const otherTargetId = 'session-other-target'
const foreignWorkspaceId = 'workspace-b'
const actorId = 'actor-peer-test'

interface PeerFixture {
  readonly commands: ReturnType<typeof createRunCommands>
  readonly runs: Map<string, Run>
  readonly guideCalls: Array<{ operationId: string; activeRunId: string; key: string }>
  readonly submissions: Array<{ sessionId: string; input: Run['input']; command: RunCommandRecord }>
  setRunning(sessionId: string, operationId: string): void
  setGuideFailure(enabled: boolean): void
  setGuideAckLoss(enabled: boolean): void
  finishActiveOnSubmit(enabled: boolean): void
  setArchived(sessionId: string, archived: boolean): void
  send(input?: Partial<PeerMessageSendInput>, key?: string): Promise<unknown>
}

function fixture(): PeerFixture {
  const sessions = new Map<string, Session>([
    [
      senderId,
      {
        id: senderId,
        workspaceId,
        title: 'sender',
        archived: false,
        parentId: null,
        createdAt: 1,
        updatedAt: 1,
        seq: 0,
      },
    ],
    [
      targetId,
      {
        id: targetId,
        workspaceId,
        title: 'target',
        archived: false,
        parentId: null,
        createdAt: 1,
        updatedAt: 1,
        seq: 0,
      },
    ],
    [
      otherTargetId,
      {
        id: otherTargetId,
        workspaceId,
        title: 'other target',
        archived: false,
        parentId: null,
        createdAt: 1,
        updatedAt: 1,
        seq: 0,
      },
    ],
    [
      'foreign-session',
      {
        id: 'foreign-session',
        workspaceId: foreignWorkspaceId,
        title: 'foreign',
        archived: false,
        parentId: null,
        createdAt: 1,
        updatedAt: 1,
        seq: 0,
      },
    ],
  ])
  const runs = new Map<string, Run>()
  const commands = new Map<string, RunCommandRecord>()
  const guideReceipts = new Map<string, QueuedRunGuideReceipt>()
  const activeBySession = new Map<string, { operationId: string; status: 'running' | 'waiting_approval' }>()
  const guideCalls: PeerFixture['guideCalls'][number][] = []
  const submissions: PeerFixture['submissions'][number][] = []
  let guideFailure = false
  let guideAckLoss = false
  let finishActiveDuringSubmit = false
  let created = 0
  const storage = {
    async call(method: string, ...args: unknown[]): Promise<unknown> {
      if (method === 'session') {
        const session = sessions.get(String(args[0]))
        if (!session) throw new HbarError('NOT_FOUND', 'Session not found')
        return session
      }
      if (method === 'runByRequestInWorkspace') {
        const [requestWorkspace, requestId] = args.map(String)
        for (const run of runs.values()) {
          if (run.requestId !== requestId || sessions.get(run.sessionId)?.workspaceId !== requestWorkspace) continue
          return { run, command: commands.get(run.id) ?? null }
        }
        return null
      }
      if (method === 'activeOperations') {
        const sessionId = String((args[0] as { sessionId: string }).sessionId)
        const current = activeBySession.get(sessionId)
        return {
          sessionId,
          sessionSeq: sessions.get(sessionId)?.seq ?? 0,
          totalActive: current ? 1 : 0,
          items: current ? [{ ...current, createdAt: 1, startedAt: 1, intentPreview: null }] : [],
          nextCursor: null,
        }
      }
      if (method === 'queuedUserRuns') {
        const sessionId = String((args[0] as { sessionId: string }).sessionId)
        const items = [...runs.values()]
          .filter((run) => run.sessionId === sessionId && run.status === 'queued')
          .map((run) => ({
            operationId: run.id,
            revision: 1,
            createdAt: run.createdAt,
            textPreview: run.input.text,
            truncated: false,
            attachmentCount: 0,
          }))
        return {
          sessionId,
          sessionSeq: sessions.get(sessionId)?.seq ?? 0,
          totalQueued: items.length,
          items,
          nextCursor: null,
        }
      }
      if (method === 'queuedRunGuideReceipt') return guideReceipts.get(String(args[1])) ?? null
      throw new Error(`Unexpected storage call ${method}`)
    },
  }
  const port = {
    storage,
    async submit(
      sessionId: string,
      requestId: string,
      input: Run['input'],
      modelId: string,
      command: RunCommandRecord,
    ) {
      created++
      const run: Run = {
        id: `peer-run-${created}`,
        sessionId,
        requestId,
        input,
        modelId,
        status: finishActiveDuringSubmit ? 'running' : 'queued',
        createdAt: created,
        startedAt: null,
        endedAt: null,
        error: null,
      }
      runs.set(run.id, run)
      commands.set(run.id, command)
      submissions.push({ sessionId, input, command })
      if (finishActiveDuringSubmit) activeBySession.delete(sessionId)
      return run
    },
    async guideQueuedRun({
      actorId: _actor,
      idempotencyKey,
      request,
    }: {
      actorId: string
      idempotencyKey: string
      request: { sessionId: string; operationId: string; activeRunId: string; expectedRevision: number }
    }) {
      guideCalls.push({ operationId: request.operationId, activeRunId: request.activeRunId, key: idempotencyKey })
      if (guideFailure) throw new HbarError('COMMAND_CONFLICT', 'No longer accepting guidance')
      const operation = runs.get(request.operationId)
      if (operation) runs.set(operation.id, { ...operation, status: 'guided' })
      const receipt: QueuedRunGuideReceipt = {
        commandId: 'queuedRun.guide' as const,
        commandVersion: 1 as const,
        sessionId: request.sessionId,
        operationId: request.operationId,
        activeRunId: request.activeRunId,
        idempotencyKey,
        status: 'accepted' as const,
        operationStatus: 'guided' as const,
        messageId: `message-${request.operationId}`,
        eventId: `event-${request.operationId}`,
        revision: 2,
        sessionSeq: 2,
        queueRevision: request.expectedRevision,
        guidedAt: 2,
      }
      guideReceipts.set(idempotencyKey, receipt)
      if (guideAckLoss) throw new HbarError('STORAGE_UNAVAILABLE', 'Acknowledgement lost after persistence')
      return receipt
    },
    setRunning(sessionId: string, operationId: string) {
      activeBySession.set(sessionId, { operationId, status: 'running' })
    },
    setGuideFailure(enabled: boolean) {
      guideFailure = enabled
    },
    setGuideAckLoss(enabled: boolean) {
      guideAckLoss = enabled
    },
    finishActiveOnSubmit(enabled: boolean) {
      finishActiveDuringSubmit = enabled
    },
    setArchived(sessionId: string, archived: boolean) {
      const session = sessions.get(sessionId)
      if (session) sessions.set(sessionId, { ...session, archived })
    },
  }
  const typedPort = port as unknown as RunCommandKernelPort
  const commandApi = createRunCommands(typedPort)
  const baseInput: PeerMessageSendInput = {
    senderSessionId: senderId,
    targetSessionId: targetId,
    workspaceId,
    modelId: 'mock/model',
    text: 'hello from peer',
  }
  return {
    commands: commandApi,
    runs,
    guideCalls,
    submissions,
    setRunning: port.setRunning,
    setGuideFailure: port.setGuideFailure,
    setGuideAckLoss: port.setGuideAckLoss,
    finishActiveOnSubmit: port.finishActiveOnSubmit,
    setArchived: port.setArchived,
    send(input = {}, key = 'peer-key') {
      return commandApi.execute('session.message.send', { ...baseInput, ...input }, { actorId, idempotencyKey: key })
    },
  }
}

async function expectCode(operation: Promise<unknown>, code: string) {
  try {
    await operation
    throw new Error(`Expected ${code}`)
  } catch (error) {
    expect(error).toMatchObject({ code })
  }
}

test('peer send admits one ordinary user Run without requesting automatic Goal continuation', async () => {
  const state = fixture()
  const first = (await state.send()) as { operationId: string; status: string; delivery: string }
  expect(first).toMatchObject({ status: 'accepted', delivery: 'new_run' })
  const replay = (await state.send()) as { operationId: string }
  expect(replay.operationId).toBe(first.operationId)
  expect(state.submissions).toHaveLength(1)
  expect(state.submissions[0]?.input).toMatchObject({
    source: 'user',
    text: 'hello from peer',
    peerMessage: { senderSessionId: senderId, targetSessionId: targetId, workspaceId },
  })
  expect(state.submissions[0]?.input).not.toHaveProperty('continuation')
})

test('peer send creates only a user Run and leaves a paused Goal paused in the real Kernel', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-peer-paused-goal-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    lifecycle: 'managed',
    demo: true,
    secrets: new MemorySecrets(),
  })
  try {
    await kernel.storage.call(
      'saveProvider',
      providerSchema.parse({
        id: 'peer-fixture',
        name: 'Peer fixture',
        protocol: 'mock',
        model: 'fixture',
        baseUrl: 'http://127.0.0.1',
      }),
    )
    const workspace = await kernel.storage.call('createWorkspace', root, 'peer fixture')
    const sender = await kernel.createSession(workspace.id)
    const target = await kernel.createSession(workspace.id)
    const goals = kernel.plugins.get<GoalService>('goal')
    const originalGoal = await goals.create(target.id, 'Keep this Goal paused during peer messaging')
    if (!originalGoal.goal) throw new Error('Fixture Goal was not created')
    await goals.set(target.id, { status: 'paused', expectedGoalId: originalGoal.goal.goalId })
    const pausedGoal = await goals.get(target.id)
    if (!pausedGoal.goal) throw new Error('Fixture Goal disappeared')
    const commands = createRunCommands(kernel)
    const receipt = await commands.execute(
      'session.message.send',
      {
        senderSessionId: sender.id,
        targetSessionId: target.id,
        workspaceId: workspace.id,
        modelId: 'peer-fixture',
        text: 'Please inspect the existing task',
      },
      { actorId: 'peer-goal-test', idempotencyKey: 'paused-goal-key' },
    )
    await kernel.activate()
    await kernel.waitForIdle()
    if (!receipt.targetRunId) throw new Error('Peer message receipt did not identify its target Run')
    const targetRun = await kernel.storage.call('run', receipt.targetRunId)
    expect(targetRun.input).toMatchObject({ source: 'user', text: 'Please inspect the existing task' })
    expect(targetRun.status).toBe('completed')
    expect(targetRun.input).not.toHaveProperty('continuation')
    const context = await kernel.storage.call('context', target.id)
    const peerMessage = context.messages.find((message) => message.runId === targetRun.id && message.role === 'user')
    expect(peerMessage?.content).toEqual([{ type: 'text', text: 'Please inspect the existing task' }])
    expect(peerMessage?.providerData).toMatchObject({
      senderSessionId: sender.id,
      targetSessionId: target.id,
      workspaceId: workspace.id,
    })
    expect(context.messages.some((message) => message.runId === targetRun.id && message.role === 'assistant')).toBe(true)
    expect((await goals.get(target.id)).goal).toMatchObject({ goalId: pausedGoal.goal.goalId, status: 'paused' })
  } finally {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('peer send rejects self, missing, archived and cross-workspace sessions before admission', async () => {
  const state = fixture()
  await expectCode(state.send({ targetSessionId: senderId }, 'self'), 'INVALID_INPUT')
  await expectCode(state.send({ senderSessionId: 'missing' }, 'missing'), 'NOT_FOUND')
  await expectCode(state.send({ targetSessionId: 'foreign-session' }, 'foreign'), 'FORBIDDEN')
  await expectCode(state.send({ workspaceId: foreignWorkspaceId }, 'wrong-workspace'), 'FORBIDDEN')
  state.setArchived(targetId, true)
  await expectCode(state.send({}, 'archived'), 'ARCHIVED')
  expect(state.submissions).toHaveLength(0)
})

test('same peer key conflicts when payload, model or recipient changes', async () => {
  const state = fixture()
  await state.send()
  await expectCode(state.send({ text: 'changed text' }), 'IDEMPOTENCY_CONFLICT')
  await expectCode(state.send({ modelId: 'mock/other' }), 'IDEMPOTENCY_CONFLICT')
  await expectCode(state.send({ targetSessionId: otherTargetId }), 'IDEMPOTENCY_CONFLICT')
  expect(state.submissions).toHaveLength(1)
})

test('a running recipient guides the same queued Run once and replay reads its durable guide', async () => {
  const state = fixture()
  state.setRunning(targetId, 'active-target-run')
  const first = (await state.send()) as {
    operationId: string
    targetRunId: string
    delivery: string
    deliveredAt: number | null
  }
  expect(first).toMatchObject({
    operationId: 'peer-run-1',
    targetRunId: 'active-target-run',
    delivery: 'steered',
    deliveredAt: 2,
  })
  const replay = (await state.send()) as { operationId: string; delivery: string }
  expect(replay).toMatchObject({ operationId: first.operationId, delivery: 'steered' })
  expect(state.guideCalls).toHaveLength(1)
  expect(state.guideCalls[0]).toMatchObject({ operationId: first.operationId, activeRunId: 'active-target-run' })
  expect(state.submissions).toHaveLength(1)
})

test('a post-commit guide acknowledgement loss reconciles to the active target Run', async () => {
  const state = fixture()
  state.setRunning(targetId, 'active-target-run')
  state.setGuideAckLoss(true)
  const receipt = (await state.send()) as { operationId: string; targetRunId: string; delivery: string }
  expect(receipt).toMatchObject({
    operationId: 'peer-run-1',
    targetRunId: 'active-target-run',
    delivery: 'steered',
  })
  expect(state.guideCalls).toHaveLength(1)
  expect(state.submissions).toHaveLength(1)
})

test('delivery is reconciled when the active target ends between read and admission', async () => {
  const state = fixture()
  state.setRunning(targetId, 'active-target-run')
  state.finishActiveOnSubmit(true)
  const receipt = (await state.send()) as { operationId: string; targetRunId: string; delivery: string }
  expect(receipt).toMatchObject({ operationId: 'peer-run-1', targetRunId: 'peer-run-1', delivery: 'new_run' })
  expect(state.guideCalls).toHaveLength(0)
  expect(state.runs.get(receipt.operationId)?.status).toBe('running')
})

test('failed guidance leaves one queued Run and replay never admits a duplicate', async () => {
  const state = fixture()
  state.setRunning(targetId, 'active-target-run')
  state.setGuideFailure(true)
  const first = (await state.send()) as { operationId: string; delivery: string }
  expect(first.delivery).toBe('queued')
  const replay = (await state.send()) as { operationId: string; delivery: string }
  expect(replay.operationId).toBe(first.operationId)
  expect(state.submissions).toHaveLength(1)
  expect(state.runs.size).toBe(1)
  expect(state.guideCalls.length).toBeGreaterThan(0)
  expect(new Set(state.guideCalls.map((call) => call.key)).size).toBe(1)
})
