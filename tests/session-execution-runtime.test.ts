import { expect, test } from 'bun:test'
import { createAppRuntime, type RunCommandPort } from '@hbar/app-runtime'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { directoryCommands } from '@hbar/contracts/commands'
import { workspaceSessionCommands } from '@hbar/contracts/commands/workspaces'
import type { Session } from '@hbar/contracts/directory'
import { runCommands, type RunAccepted } from '@hbar/contracts/commands/run'
import { goalPlanCommands } from '@hbar/contracts/commands/goals'

const descriptor = { sourceId: 'source', sha256: 'a'.repeat(64), name: 'draft.txt', mime: 'text/plain', size: 4 }
const artifact = { id: descriptor.sha256, name: descriptor.name, mime: descriptor.mime, size: descriptor.size }
const reservationFile = { name: descriptor.name, mime: descriptor.mime, size: descriptor.size }
const session = (id: string): Session => ({
  id,
  workspaceId: `w-${id}`,
  title: id,
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  seq: 1,
})

function fixture() {
  const sessions = new Map([
    ['a', session('a')],
    ['b', session('b')],
  ])
  const calls: { name: string; sessionId?: string; key?: string }[] = []
  const receiptReads: string[] = []
  const receipts = new Map<string, RunAccepted>()
  let unknownRun = false
  let malformedRun = false
  let unknownUpload = false
  let receiptVisible = true
  let holdRead: { id: string; entered: () => void; gate: Promise<void> } | null = null
  let holdWrite: { entered: () => void; gate: Promise<void> } | null = null
  let holdReceipt: { entered: () => void; gate: Promise<void> } | null = null
  const directory: CommandExecutor = {
    async execute(name, input) {
      if (name === 'session.get') {
        const { sessionId } = directoryCommands['session.get'].input.parse(input)
        const captured = sessions.get(sessionId) ?? null
        const held = holdRead
        if (held?.id === sessionId) {
          holdRead = null
          held.entered()
          await held.gate
        }
        return captured
      }
      if (name === 'session.list') {
        const query = directoryCommands['session.list'].input.parse(input)
        return {
          items: [...sessions.values()].filter(
            (item) => item.workspaceId === query.workspaceId && (query.includeArchived || !item.archived),
          ),
          nextCursor: null,
        }
      }
      if (name === 'workspace.get') {
        const { workspaceId } = directoryCommands['workspace.get'].input.parse(input)
        return { id: workspaceId, name: workspaceId, path: `D:/${workspaceId}`, createdAt: 1 }
      }
      if (name === 'workspace.list') return { items: [], nextCursor: null }
      throw new Error(`Unexpected directory read: ${name}`)
    },
  }
  const run: RunCommandPort = {
    async execute(name, input, execution) {
      if (name === 'operation.cancel') {
        const { operationId } = runCommands['operation.cancel'].input.parse(input)
        calls.push({ name })
        return { operationId, status: 'cancelRequested' }
      }
      const { sessionId } =
        name === 'run.submit'
          ? runCommands['run.submit'].input.parse(input)
          : runCommands['run.retry'].input.parse(input)
      const key = execution?.idempotencyKey ?? ''
      calls.push({ name, sessionId, key })
      const held = holdWrite
      if (held) {
        holdWrite = null
        held.entered()
        await held.gate
      }
      const receipt: RunAccepted = {
        status: 'accepted',
        commandId: 'run.submit',
        commandVersion: 1,
        sessionId,
        operationId: `operation-${calls.length}`,
        requestId: 'request',
        idempotencyKey: key,
        acceptedAt: 1,
      }
      receipts.set(`${sessionId}:${key}`, receipt)
      if (unknownRun) throw new CommandError('RESULT_UNKNOWN', 'Committed fixture reply was lost')
      if (malformedRun) return { accepted: true }
      return receipt
    },
    async getReceipt(sessionId, key, commandId) {
      receiptReads.push(commandId ?? 'run.submit')
      const held = holdReceipt
      if (held) {
        holdReceipt = null
        held.entered()
        await held.gate
      }
      return receiptVisible ? (receipts.get(`${sessionId}:${key}`) ?? null) : null
    },
  }
  const runtime = createAppRuntime({
    instanceId: crypto.randomUUID(),
    hostId: 'host',
    directory,
    run,
    attachments: {
      async execute(name) {
        calls.push({ name })
        if (unknownUpload) throw new CommandError('RESULT_UNKNOWN', 'Fixture upload reply lost')
        return artifact
      },
    },
    files: {
      execute(name) {
        calls.push({ name })
        return Promise.resolve(artifact)
      },
    },
    workspaces: {
      execute(name, input) {
        if (name !== 'session.archive') throw new Error(name)
        const target = workspaceSessionCommands['session.archive'].input.parse(input)
        const prior = sessions.get(target.sessionId)
        if (!prior) throw new Error('Missing fixture target')
        const next = { ...prior, archived: target.archived, seq: prior.seq + 1, updatedAt: prior.updatedAt + 1 }
        sessions.set(target.sessionId, next)
        calls.push({ name, sessionId: target.sessionId })
        return Promise.resolve(next)
      },
    },
    goals: {
      execute(name, input) {
        if (name === 'goal.get') return Promise.resolve({ goal: null, remainingTokens: null })
        if (name === 'plan.get') return Promise.resolve(null)
        if (name === 'goal.clear') {
          calls.push({ name, sessionId: goalPlanCommands['goal.clear'].input.parse(input).sessionId })
          return Promise.resolve({ cleared: false })
        }
        throw new Error(`Unexpected Goal write ${name}`)
      },
    },
    surfaces: { canRender: (id) => ['goals', 'files'].includes(id) },
  })
  return {
    runtime,
    calls,
    receiptReads,
    setUnknownRun: (value: boolean) => {
      unknownRun = value
    },
    setMalformedRun: () => {
      malformedRun = true
    },
    setUnknownUpload: (value: boolean) => {
      unknownUpload = value
    },
    showReceipt: (value: boolean) => {
      receiptVisible = value
    },
    async observe(archived: boolean, id = 'a') {
      const prior = sessions.get(id)
      if (!prior) throw new Error('Missing fixture target')
      sessions.set(id, { ...prior, archived, seq: prior.seq + 1, updatedAt: prior.updatedAt + 1 })
      await runtime.view.commands.execute('session.list', { workspaceId: prior.workspaceId, includeArchived: true })
    },
    pauseRead(id: string) {
      const gate = Promise.withResolvers<void>(),
        entered = Promise.withResolvers<void>()
      holdRead = { id, gate: gate.promise, entered: () => entered.resolve() }
      return { entered: entered.promise, release: () => gate.resolve() }
    },
    pauseWrite() {
      const gate = Promise.withResolvers<void>(),
        entered = Promise.withResolvers<void>()
      holdWrite = { gate: gate.promise, entered: () => entered.resolve() }
      return { entered: entered.promise, release: () => gate.resolve() }
    },
    pauseReceipt() {
      const gate = Promise.withResolvers<void>(),
        entered = Promise.withResolvers<void>()
      holdReceipt = { gate: gate.promise, entered: () => entered.resolve() }
      return { entered: entered.promise, release: () => gate.resolve() }
    },
  }
}
const submit = (sessionId = 'a', text = 'original') => ({
  sessionId,
  modelId: 'model',
  input: { text, images: [], files: [] },
})

test('accepted archive blocks new Run/retry/upload preparation while preserving navigation, local scratch and old attachments', async () => {
  const f = fixture(),
    api = f.runtime.view.commands
  try {
    await api.execute('app.setSession', { sessionId: 'a' })
    await api.execute('draft.setText', { sessionId: 'a', text: 'original' })
    await api.execute('draft.setAttachments', { sessionId: 'a', attachments: [{ kind: 'file', artifact }] })
    await f.observe(true)
    expect(f.runtime.view.state.sessionExecutionAccess.getSnapshot()).toMatchObject({
      kind: 'archived',
      target: { sessionId: 'a', workspaceId: 'w-a' },
    })
    expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('a')
    await expect(api.execute('run.submit', submit())).rejects.toMatchObject({ code: 'ARCHIVED' })
    await expect(api.execute('run.retry', { sessionId: 'a', operationId: 'old-operation' })).rejects.toMatchObject({
      code: 'ARCHIVED',
    })
    await expect(
      api.execute('draft.reserveAttachments', { sessionId: 'a', expectedRevision: 2, files: [reservationFile] }),
    ).rejects.toMatchObject({ code: 'ARCHIVED' })
    expect(f.calls).toEqual([])
    expect(f.runtime.view.state.drafts.getSnapshot().a).toMatchObject({
      text: 'original',
      attachments: [{ kind: 'file', artifact }],
    })
    await api.execute('draft.setText', { sessionId: 'a', text: 'local scratch survives' })
    const revision = f.runtime.view.state.drafts.getSnapshot().a!.revision
    await api.execute('draft.removeAttachment', {
      sessionId: 'a',
      expectedRevision: revision,
      kind: 'file',
      artifactId: artifact.id,
    })
    expect(f.runtime.view.state.drafts.getSnapshot().a?.attachments).toEqual([])
    await api.execute('app.setSession', { sessionId: 'b', workspaceId: 'w-b' })
    await api.execute('run.submit', submit('b'))
    expect(f.calls).toMatchObject([{ name: 'run.submit', sessionId: 'b' }])
  } finally {
    f.runtime.dispose()
  }
})

test('an unopened target is verified once; a missing target fails unverified without a dispatch', async () => {
  const f = fixture()
  try {
    await f.runtime.view.commands.execute('run.submit', submit())
    expect(f.runtime.view.getSessionExecutionAccess({ sessionId: 'a', workspaceId: 'w-a' }).kind).toBe('ready')
    await expect(f.runtime.view.commands.execute('run.submit', submit('missing'))).rejects.toMatchObject({
      code: 'SESSION_UNVERIFIED',
    })
    expect(f.calls).toHaveLength(1)
    expect(f.runtime.view.state.drafts.getSnapshot().missing?.status).toBe('failed')
  } finally {
    f.runtime.dispose()
  }
})

test('late pre-dispatch verification cannot unlock a newer archive or clear the observed view', async () => {
  const f = fixture(),
    held = f.pauseRead('a')
  try {
    await f.runtime.view.commands.execute('draft.setText', { sessionId: 'a', text: 'original' })
    const request = f.runtime.view.commands.execute('run.submit', submit())
    const result = request.catch((error: unknown) => error)
    await held.entered
    await f.observe(true)
    held.release()
    expect(await result).toMatchObject({ code: 'ARCHIVED' })
    expect(f.calls).toEqual([])
    expect(f.runtime.view.state.drafts.getSnapshot().a).toMatchObject({
      text: 'original',
      status: 'failed',
      error: 'ARCHIVED',
    })
  } finally {
    held.release()
    f.runtime.dispose()
  }
})

test('restore precheck is observational: the same selected view and draft survive confirmed restore without reopening its retired tab', async () => {
  const f = fixture(),
    api = f.runtime.view.commands
  try {
    await api.execute('app.setSession', { sessionId: 'a' })
    await api.execute('draft.setText', { sessionId: 'a', text: 'original' })
    const files = await api.execute('app.openPanel', { panelId: 'files' })
    await f.observe(true)
    expect(f.runtime.view.state.workspaceTabs.getSnapshot().items).toEqual([])
    await api.execute('sessionArchive.restore', { sessionId: 'a', workspaceId: 'w-a' })
    expect(f.runtime.view.state.navigation.getSnapshot().sessionId).toBe('a')
    expect(f.runtime.view.state.presentation.getSnapshot().toolInstanceId).toBe(files.instanceId)
    expect(f.runtime.view.state.workspaceTabs.getSnapshot().items).toEqual([])
    expect(f.runtime.view.state.drafts.getSnapshot().a?.text).toBe('original')
    expect(f.runtime.view.state.sessionExecutionAccess.getSnapshot().kind).toBe('ready')
    await api.execute('run.submit', submit())
    expect(f.calls.map((item) => item.name)).toEqual(['session.archive', 'run.submit'])
  } finally {
    f.runtime.dispose()
  }
})

test('dispatched submit is still unknown after archive and only the original receipt settles it; newer text survives', async () => {
  const f = fixture(),
    held = f.pauseWrite(),
    api = f.runtime.view.commands
  f.setUnknownRun(true)
  try {
    await api.execute('app.setSession', { sessionId: 'a' })
    await api.execute('draft.setText', { sessionId: 'a', text: 'original' })
    const request = api.execute('run.submit', submit())
    const result = request.catch((error: unknown) => error)
    await held.entered
    await f.observe(true)
    await api.execute('draft.setText', { sessionId: 'a', text: 'new local text' })
    held.release()
    expect(await result).toMatchObject({ code: 'RESULT_UNKNOWN' })
    f.showReceipt(false)
    expect(await api.execute('draft.reconcileSubmission', { sessionId: 'a' })).toBeNull()
    expect(f.runtime.view.state.drafts.getSnapshot().a?.status).toBe('unknown')
    f.showReceipt(true)
    expect((await api.execute('draft.reconcileSubmission', { sessionId: 'a' }))?.sessionId).toBe('a')
    expect(f.calls).toHaveLength(1)
    expect(f.runtime.view.state.drafts.getSnapshot().a).toMatchObject({ text: 'new local text', status: 'idle' })
  } finally {
    held.release()
    f.runtime.dispose()
  }
})

test('unknown retry after archive uses only its receipt and Stop remains an existing-operation action', async () => {
  const f = fixture(),
    api = f.runtime.view.commands
  f.setUnknownRun(true)
  try {
    await api.execute('app.setSession', { sessionId: 'a' })
    const input = { sessionId: 'a', operationId: 'old-operation' }
    await expect(api.execute('run.retry', input)).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    await f.observe(true)
    await expect(api.execute('run.retry', { ...input, sessionId: 'b' })).rejects.toMatchObject({ code: 'STALE_TARGET' })
    expect(f.receiptReads).toEqual([])
    f.showReceipt(false)
    await expect(api.execute('run.retry', input)).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    f.showReceipt(true)
    const receipt = await api.execute('run.retry', input)
    expect(receipt.sessionId).toBe('a')
    expect(f.calls).toHaveLength(1)
    expect(f.receiptReads).toEqual(['run.retry', 'run.retry'])
    await api.execute('operation.cancel', { operationId: receipt.operationId })
    expect(f.calls.at(-1)?.name).toBe('operation.cancel')
  } finally {
    f.runtime.dispose()
  }
})

test('malformed retry ACK remains unknown; its read recovery locks duplicate clicks and keeps the original retry identity', async () => {
  const f = fixture(),
    api = f.runtime.view.commands,
    held = f.pauseReceipt()
  const input = { sessionId: 'a', operationId: 'old-operation' }
  try {
    f.setMalformedRun()
    await expect(api.execute('run.retry', input)).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(f.runtime.view.state.runActions.getSnapshot()['old-operation']).toMatchObject({
      commandId: 'run.retry',
      status: 'unknown',
    })
    await f.observe(true)
    const reading = api.execute('run.retry', input)
    await held.entered
    expect(f.runtime.view.state.runActions.getSnapshot()['old-operation']?.status).toBe('submitting')
    expect(f.runtime.view.state.runActions.getSnapshot()['old-operation']?.phase).toBe('receipt')
    await expect(api.execute('run.retry', input)).rejects.toMatchObject({ code: 'BUSY' })
    held.release()
    expect((await reading).sessionId).toBe('a')
    expect(f.calls).toHaveLength(1)
    expect(f.receiptReads).toEqual(['run.retry'])
    expect(f.runtime.view.state.runActions.getSnapshot()['old-operation']).toMatchObject({
      commandId: 'run.retry',
      status: 'succeeded',
    })
    await api.execute('operation.cancel', { operationId: 'another-operation' })
    expect(f.runtime.view.state.runActions.getSnapshot()['another-operation']?.commandId).toBe('operation.cancel')
  } finally {
    held.release()
    f.runtime.dispose()
  }
})

test('reserved attachment blocked before upload dispatch becomes failed, while unknown dispatched upload remains read-reconcilable', async () => {
  for (const dispatched of [false, true]) {
    const f = fixture(),
      api = f.runtime.view.commands
    try {
      await api.execute('app.setSession', { sessionId: 'a' })
      const reserved = await api.execute('draft.reserveAttachments', {
        sessionId: 'a',
        expectedRevision: 0,
        files: [reservationFile],
      })
      const item = reserved.reservations[0]!
      const target = { sessionId: 'a', reservationId: item.reservationId, ownerRevision: item.ownerRevision }
      if (!dispatched) await f.observe(true)
      f.setUnknownUpload(dispatched)
      await expect(
        api.execute('draft.uploadAttachment', { ...target, kind: 'file', upload: descriptor }),
      ).rejects.toMatchObject({ code: dispatched ? 'RESULT_UNKNOWN' : 'ARCHIVED' })
      if (dispatched) {
        await f.observe(true)
        await api.execute('draft.reconcileAttachment', target)
        expect(f.calls.map((item) => item.name)).toEqual(['attachment.upload', 'attachment.query'])
        expect(f.runtime.view.state.drafts.getSnapshot().a?.attachments).toEqual([{ kind: 'file', artifact }])
      } else {
        expect(f.calls).toEqual([])
        expect(f.runtime.view.state.drafts.getSnapshot().a?.attachmentTransfers[0]).toMatchObject({
          status: 'failed',
          error: 'ARCHIVED',
        })
      }
    } finally {
      f.runtime.dispose()
    }
  }
})

test('pinned A Goal/Plan saves stay blocked when selected B is ready, while original Goal clear is available', async () => {
  const f = fixture(),
    api = f.runtime.view.commands
  try {
    await api.execute('app.setSession', { sessionId: 'a' })
    const panel = await api.execute('app.openPanel', {
      panelId: 'goals',
      binding: 'pinned',
      sessionId: 'a',
      workspaceId: 'w-a',
    })
    await api.execute('goalPlanWorkspace.refresh', { instanceId: panel.instanceId })
    await api.execute('goalPlanWorkspace.showGoalEditor', { instanceId: panel.instanceId })
    await api.execute('goalPlanWorkspace.setGoalField', {
      instanceId: panel.instanceId,
      field: 'objective',
      value: 'retained Goal draft',
    })
    await f.observe(true)
    await api.execute('app.setSession', { sessionId: 'b', workspaceId: 'w-b' })
    expect(f.runtime.view.state.sessionExecutionAccess.getSnapshot().kind).toBe('ready')
    await expect(api.execute('goalPlanWorkspace.saveGoal', { instanceId: panel.instanceId })).rejects.toMatchObject({
      code: 'ARCHIVED',
    })
    expect(f.runtime.view.state.goals.getSnapshot().entries[panel.instanceId]?.goalDraft.objective).toBe(
      'retained Goal draft',
    )
    await api.execute('goalPlanWorkspace.showPlanEditor', { instanceId: panel.instanceId })
    await api.execute('goalPlanWorkspace.setNewStep', { instanceId: panel.instanceId, value: 'preserve plan' })
    await api.execute('goalPlanWorkspace.addStep', { instanceId: panel.instanceId })
    await expect(api.execute('goalPlanWorkspace.savePlan', { instanceId: panel.instanceId })).rejects.toMatchObject({
      code: 'ARCHIVED',
    })
    await api.execute('goalPlanWorkspace.clearGoal', { instanceId: panel.instanceId })
    expect(f.calls).toEqual([{ name: 'goal.clear', sessionId: 'a' }])
  } finally {
    f.runtime.dispose()
  }
})
