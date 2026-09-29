import { expect, test } from 'bun:test'
import { CommandError, type CommandExecutor, type ExecuteOptions } from '@hbar/commands'
import { createAppRuntime, type RunCommandPort } from '@hbar/app-runtime'
import { directoryCommands } from '@hbar/contracts/commands'
import { modelCommands, type ModelConfiguration, type ModelDescriptor, type ModelWriteResult } from '@hbar/contracts/commands/models'
import { runCommands, type RunAccepted } from '@hbar/contracts/commands/run'
import { configurationCommands } from '@hbar/contracts/commands/configuration'
import { settingsCommands, type SettingsReceipt, type SettingsSnapshot } from '@hbar/contracts/commands/settings'
import { workspaceSessionCommands } from '@hbar/contracts/commands/workspaces'
import type { Session, Workspace } from '@hbar/contracts/directory'
import { encodePath } from '@hbar/schema-core'

const model: ModelDescriptor = {
  id: 'provider/fixture',
  providerId: 'provider',
  providerName: 'Fixture provider',
  modelId: 'fixture',
  modelName: 'Fixture model',
  contextWindow: 32_000,
  maxOutput: 4_000,
  imageInput: true,
  reasoning: false,
  thinkingLevels: ['off'],
  defaultThinkingLevel: 'off',
  hasKey: true,
}

function workspace(id: string): Workspace {
  return { id, name: id, path: `D:/${id}`, createdAt: 1 }
}

function session(id: string, workspaceId: string): Session {
  return {
    id,
    workspaceId,
    title: id,
    archived: false,
    parentId: null,
    createdAt: 1,
    updatedAt: 1,
    seq: 0,
  }
}

function initialModel(sessionId: string): ModelConfiguration {
  return {
    sessionId,
    status: 'unset',
    modelId: null,
    model: null,
    thinkingLevel: null,
    revisions: { [`settings:session:${sessionId}`]: 0 },
    sources: { model: 'default', thinkingLevel: 'default' },
  }
}

const approvalPath = [{ kind: 'field' as const, name: 'session.approval' }]
const approvalField = encodePath(approvalPath)

function gate() {
  let open!: () => void
  let entered!: () => void
  const promise = new Promise<void>((resolve) => {
    open = resolve
  })
  const started = new Promise<void>((resolve) => {
    entered = resolve
  })
  return { promise, release: open, entered: started, markEntered: entered }
}

function fixture(options: { readonly sessionSettings?: boolean; readonly invalidateApprovalOnWrite?: boolean } = {}) {
  const workspaces = new Map([workspace('workspace-a'), workspace('workspace-b')].map((value) => [value.id, value]))
  const sessions = new Map<string, Session>()
  const models = new Map<string, ModelConfiguration>()
  const createdByKey = new Map<string, Session>()
  const modelReceipts = new Map<string, ModelWriteResult>()
  const runReceipts = new Map<string, RunAccepted>()
  const permissionChoices = new Map<string, 'ask' | 'deny' | 'allow'>()
  const permissionRevisions = new Map<string, number>()
  const permissionReceipts = new Map<string, SettingsReceipt>()
  const createCalls: { key: string; workspaceId: string }[] = []
  const permissionWrites: { key: string; sessionId: string; choice: 'ask' | 'deny' | 'allow' | 'inherit' }[] = []
  const runCalls: {
    sessionId: string
    key: string
    text: string
    approval: 'ask' | 'deny' | 'allow' | undefined
  }[] = []
  let createGate: ReturnType<typeof gate> | null = null
  let permissionWriteGate: ReturnType<typeof gate> | null = null
  let permissionReadGateAfterWrite: ReturnType<typeof gate> | null = null
  let blockNextPermissionRead = false
  let permissionInvalidationListener: (() => void) | null = null
  let loseNextCreateReply = false
  let loseNextPermissionWriteReply = false
  let failModelReads = false
  let unknownNextRun = false
  let nextSession = 0

  const directory: CommandExecutor = {
    async execute(name, raw) {
      if (name === 'workspace.get') {
        const input = directoryCommands['workspace.get'].input.parse(raw)
        return workspaces.get(input.workspaceId) ?? null
      }
      if (name === 'session.get') {
        const input = directoryCommands['session.get'].input.parse(raw)
        return sessions.get(input.sessionId) ?? null
      }
      if (name === 'workspace.list')
        return { items: [...workspaces.values()], nextCursor: null }
      if (name === 'session.list') {
        const input = directoryCommands['session.list'].input.parse(raw)
        return {
          items: [...sessions.values()].filter(
            (item) => item.workspaceId === input.workspaceId && (input.includeArchived || !item.archived),
          ),
          nextCursor: null,
        }
      }
      throw new Error(`Unexpected directory query: ${name}`)
    },
  }

  const workspaceCommands: CommandExecutor = {
    async execute(name, raw, options: ExecuteOptions = {}) {
      if (name !== 'session.create') throw new Error(`Unexpected Workspace command: ${name}`)
      const input = workspaceSessionCommands['session.create'].input.parse(raw)
      const key = options.idempotencyKey
      if (!key) throw new Error('Session create requires its stable idempotency key')
      createCalls.push({ key, workspaceId: input.workspaceId })
      let created = createdByKey.get(key)
      if (!created) {
        created = session(`session-${++nextSession}`, input.workspaceId)
        sessions.set(created.id, created)
        models.set(created.id, initialModel(created.id))
        createdByKey.set(key, created)
      }
      const held = createGate
      if (held) {
        createGate = null
        held.markEntered()
        await held.promise
      }
      if (loseNextCreateReply) {
        loseNextCreateReply = false
        throw new CommandError('RESULT_UNKNOWN', 'Session was created but its reply was lost')
      }
      return created
    },
  }

  const modelCommandsPort: CommandExecutor = {
    async execute(name, raw, options: ExecuteOptions = {}) {
      if (name === 'model.list') return [model]
      if (name === 'session.getModel') {
        const input = modelCommands[name].input.parse(raw)
        if (failModelReads) throw new CommandError('MODEL_NOT_READY', 'Fixture model read failed')
        const value = models.get(input.sessionId)
        if (!value) throw new CommandError('SESSION_NOT_FOUND', 'Fixture Session model is missing')
        return value
      }
      if (name === 'session.getModelReceipt') {
        const input = modelCommands[name].input.parse(raw)
        const receipt = modelReceipts.get(input.idempotencyKey)
        if (!receipt || receipt.sessionId !== input.sessionId) return null
        return {
          sessionId: receipt.sessionId,
          idempotencyKey: input.idempotencyKey,
          commitId: receipt.commitId,
          revision: receipt.revision,
          modelId: receipt.modelId,
          thinkingLevel: receipt.thinkingLevel,
          revisions: receipt.revisions,
        }
      }
      if (name !== 'session.setModel') throw new Error(`Unexpected model command: ${name}`)
      const input = modelCommands[name].input.parse(raw)
      const key = options.idempotencyKey
      if (!key) throw new Error('Session model write requires an idempotency key')
      const prior = modelReceipts.get(key)
      if (prior) return prior
      const current = models.get(input.sessionId)
      if (!current) throw new CommandError('SESSION_NOT_FOUND', 'Fixture Session model is missing')
      const layer = `settings:session:${input.sessionId}`
      if (input.baselineRevisions[layer] !== current.revisions[layer])
        throw new CommandError('VERSION_CONFLICT', 'Fixture model baseline changed')
      const revision = (current.revisions[layer] ?? 0) + 1
      const next: ModelConfiguration = {
        sessionId: input.sessionId,
        status: 'configured',
        modelId: input.modelId,
        model,
        thinkingLevel: model.defaultThinkingLevel,
        revisions: { ...current.revisions, [layer]: revision },
        sources: { model: 'session', thinkingLevel: 'session' },
      }
      models.set(input.sessionId, next)
      const result: ModelWriteResult = { ...next, commitId: key, revision }
      modelReceipts.set(key, result)
      return result
    },
  }

  const run: RunCommandPort = {
    async execute(name, raw, options: ExecuteOptions = {}) {
      if (name !== 'run.submit') throw new Error(`Unexpected Run command: ${name}`)
      const input = runCommands['run.submit'].input.parse(raw)
      const key = options.idempotencyKey
      if (!key) throw new Error('First Run requires its stable idempotency key')
      runCalls.push({ sessionId: input.sessionId, key, text: input.input.text, approval: input.input.approval })
      const accepted: RunAccepted = {
        status: 'accepted',
        commandId: 'run.submit',
        commandVersion: 1,
        requestId: crypto.randomUUID(),
        idempotencyKey: key,
        operationId: `operation-${runCalls.length}`,
        sessionId: input.sessionId,
        acceptedAt: 1,
      }
      runReceipts.set(`${input.sessionId}:${key}`, accepted)
      if (unknownNextRun) {
        unknownNextRun = false
        throw new CommandError('RESULT_UNKNOWN', 'Run was accepted but its reply was lost')
      }
      return accepted
    },
    async getReceipt(sessionId, key) {
      return runReceipts.get(`${sessionId}:${key}`) ?? null
    },
  }

  const permissionSnapshot = (sessionId: string): SettingsSnapshot => {
    const layerId = `settings:session:${sessionId}`
    const revision = permissionRevisions.get(sessionId) ?? 0
    const choice = permissionChoices.get(sessionId)
    const localPresence = choice !== undefined
    const sourceLayer = localPresence ? layerId : 'settings:global'
    const sourceRevision = localPresence ? revision : 0
    return settingsCommands['settings.get'].output.parse({
      schemaVersion: 1,
      scope: { kind: 'session', targetId: sessionId },
      revisions: { 'settings:global': 0, [layerId]: revision },
      resolution: {
        layers: [
          { id: 'settings:global', kind: 'global', revision: 0 },
          { id: layerId, kind: 'session', revision },
        ],
        reports: {
          [approvalField]: {
            path: approvalField,
            localPresence,
            ...(choice === undefined ? {} : { localValue: choice }),
            effectiveValue: choice ?? 'ask',
            sourceLayer,
            sourceRevision,
            inherited: !localPresence,
            validation: 'valid',
            applyMode: 'nextRun',
            applyState: 'applied',
            provenance: {
              'settings:global': { layerId: 'settings:global', layerKind: 'global', revision: 0 },
              [layerId]: { layerId, layerKind: 'session', revision },
            },
          },
        },
      },
    })
  }

  const sessionSettings: CommandExecutor = {
    async execute(name, raw, execution: ExecuteOptions = {}) {
      if (name === 'settings.get') {
        const input = settingsCommands[name].input.parse(raw)
        if (input.scope.kind !== 'session') throw new Error('Expected session-scoped settings read')
        if (blockNextPermissionRead) {
          blockNextPermissionRead = false
          const held = permissionReadGateAfterWrite
          permissionReadGateAfterWrite = null
          if (held) {
            held.markEntered()
            await held.promise
          }
        }
        return permissionSnapshot(input.scope.targetId)
      }
      if (name === 'settings.receipt') {
        const input = settingsCommands[name].input.parse(raw)
        return permissionReceipts.get(input.idempotencyKey) ?? null
      }
      if (name !== 'settings.set' && name !== 'settings.unset')
        throw new Error(`Unexpected settings command: ${name}`)
      let sessionId: string
      let baselineRevisions: Record<string, number>
      let choice: 'inherit' | 'ask' | 'deny' | 'allow'
      if (name === 'settings.set') {
        const input = settingsCommands['settings.set'].input.parse(raw)
        if (input.scope.kind !== 'session') throw new Error('Expected session-scoped settings write')
        const value = input.value
        if (value !== 'ask' && value !== 'deny' && value !== 'allow')
          throw new CommandError('INVALID_INPUT', 'Unsupported fixture approval choice')
        sessionId = input.scope.targetId
        baselineRevisions = input.baselineRevisions
        choice = value
      } else {
        const input = settingsCommands['settings.unset'].input.parse(raw)
        if (input.scope.kind !== 'session') throw new Error('Expected session-scoped settings write')
        sessionId = input.scope.targetId
        baselineRevisions = input.baselineRevisions
        choice = 'inherit'
      }
      const layerId = `settings:session:${sessionId}`
      const key = execution.idempotencyKey
      if (!key) throw new Error('Session approval writes require an idempotency key')
      const existing = permissionReceipts.get(key)
      if (existing) return existing
      if (baselineRevisions[layerId] !== (permissionRevisions.get(sessionId) ?? 0))
        throw new CommandError('VERSION_CONFLICT', 'Session approval baseline changed')
      if (choice === 'inherit') permissionChoices.delete(sessionId)
      else permissionChoices.set(sessionId, choice)
      const revision = (permissionRevisions.get(sessionId) ?? 0) + 1
      permissionRevisions.set(sessionId, revision)
      const snapshot = permissionSnapshot(sessionId)
      const receiptValue = {
        commitId: key,
        layerId,
        revision,
        schemaVersion: 1,
        values: choice === 'inherit' ? {} : { [approvalField]: choice },
        resolution: snapshot.resolution,
      }
      const receipt =
        name === 'settings.set'
          ? settingsCommands['settings.set'].output.parse(receiptValue)
          : settingsCommands['settings.unset'].output.parse(receiptValue)
      permissionReceipts.set(key, receipt)
      permissionWrites.push({ key, sessionId, choice })
      if (options.invalidateApprovalOnWrite) {
        blockNextPermissionRead = true
        permissionInvalidationListener?.()
      }
      const held = permissionWriteGate
      if (held) {
        permissionWriteGate = null
        held.markEntered()
        await held.promise
      }
      if (loseNextPermissionWriteReply) {
        loseNextPermissionWriteReply = false
        throw new CommandError('RESULT_UNKNOWN', 'Host approval was written but its reply was lost')
      }
      return receipt
    },
  }

  const configuration: CommandExecutor = {
    async execute(name, raw) {
      if (name !== 'permission.get') throw new Error(`Unexpected configuration command: ${name}`)
      configurationCommands[name].input.parse(raw)
      return { mode: 'ask' }
    },
  }

  const runtime = createAppRuntime({
    instanceId: crypto.randomUUID(),
    hostId: 'host',
    directory,
    workspaces: workspaceCommands,
    models: modelCommandsPort,
    run,
    ...(options.sessionSettings ? { settings: sessionSettings, configuration } : {}),
    ...(options.invalidateApprovalOnWrite
      ? {
          permissionEvents: {
            subscribe(listener: () => void) {
              permissionInvalidationListener = listener
              return () => {
                if (permissionInvalidationListener === listener) permissionInvalidationListener = null
              }
            },
          },
        }
      : {}),
  })
  return {
    runtime,
    createCalls,
    runCalls,
    permissionWrites,
    sessions,
    holdNextCreate() {
      const held = gate()
      createGate = held
      return held
    },
    loseCreateReply() {
      loseNextCreateReply = true
    },
    losePermissionWriteReply() {
      loseNextPermissionWriteReply = true
    },
    holdNextPermissionWrite() {
      const held = gate()
      permissionWriteGate = held
      return held
    },
    holdNextPermissionReadAfterWrite() {
      const held = gate()
      permissionReadGateAfterWrite = held
      return held
    },
    failModelReads(value: boolean) {
      failModelReads = value
    },
    unknownRun(value: boolean) {
      unknownNextRun = value
    },
  }
}

async function createDraft(
  runtime: ReturnType<typeof fixture>['runtime'],
  options: {
    readonly workspaceId: string | null
    readonly text: string
    readonly modelId?: string
    readonly approvalChoice?: 'inherit' | 'ask' | 'deny' | 'allow'
  },
) {
  const draftId = crypto.randomUUID()
  await runtime.view.commands.execute('preSessionDraft.open', { draftId, workspaceId: options.workspaceId })
  await runtime.view.commands.execute('preSessionDraft.setText', {
    draftId,
    text: options.text,
    expectedRevision: 0,
  })
  let revision = 1
  if (options.modelId) {
    await runtime.view.commands.execute('preSessionDraft.setModel', {
      draftId,
      modelId: options.modelId,
      expectedRevision: revision,
    })
    revision++
  }
  if (options.approvalChoice) {
    await runtime.view.commands.execute('preSessionDraft.setApprovalChoice', {
      draftId,
      choice: options.approvalChoice,
      ...(options.approvalChoice === 'allow' ? { confirmAllow: true as const } : {}),
      expectedRevision: revision,
    })
    revision++
  }
  return { draftId, revision }
}

test('pre-session drafts are local/idempotent and refuse a first send without a Workspace', async () => {
  const f = fixture()
  const draftId = crypto.randomUUID()
  try {
    const first = await f.runtime.view.commands.execute('preSessionDraft.open', { draftId, workspaceId: null })
    const repeated = await f.runtime.view.commands.execute('preSessionDraft.open', { draftId, workspaceId: 'workspace-a' })
    expect(repeated).toEqual(first)
    await f.runtime.view.commands.execute('preSessionDraft.setText', { draftId, text: 'keep this', expectedRevision: 0 })
    await expect(
      f.runtime.view.commands.execute('preSessionDraft.submit', { draftId, expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: 'WORKSPACE_REQUIRED' })
    expect(f.createCalls).toEqual([])
    expect(f.runtime.view.state.preSessionDrafts.getSnapshot()[draftId]).toMatchObject({
      workspaceId: null,
      text: 'keep this',
      sessionId: null,
      phase: 'idle',
    })
  } finally {
    f.runtime.dispose()
  }
})

test('approval choice is revisioned and auto-approval requires explicit confirmation', async () => {
  const f = fixture()
  const draftId = crypto.randomUUID()
  try {
    const opened = await f.runtime.view.commands.execute('preSessionDraft.open', { draftId, workspaceId: null })
    expect(opened.approvalChoice).toBe('inherit')
    await expect(
      f.runtime.view.commands.execute('preSessionDraft.setApprovalChoice', {
        draftId,
        choice: 'allow',
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' })
    const ask = await f.runtime.view.commands.execute('preSessionDraft.setApprovalChoice', {
      draftId,
      choice: 'ask',
      expectedRevision: 0,
    })
    expect(ask).toEqual({ draftId, revision: 1 })
    const allow = await f.runtime.view.commands.execute('preSessionDraft.setApprovalChoice', {
      draftId,
      choice: 'allow',
      confirmAllow: true,
      expectedRevision: 1,
    })
    expect(allow).toEqual({ draftId, revision: 2 })
    expect(f.runtime.view.state.preSessionDrafts.getSnapshot()[draftId]).toMatchObject({
      approvalChoice: 'allow',
      revision: 2,
    })
  } finally {
    f.runtime.dispose()
  }
})

test('an explicit approval choice fails before Host creation when session settings are unavailable', async () => {
  const f = fixture()
  try {
    const target = await createDraft(f.runtime, {
      workspaceId: 'workspace-a',
      text: 'keep this for a capable Host',
      modelId: model.id,
      approvalChoice: 'ask',
    })
    await expect(
      f.runtime.view.commands.execute('preSessionDraft.submit', {
        draftId: target.draftId,
        expectedRevision: target.revision,
      }),
    ).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' })
    expect(f.createCalls).toEqual([])
    expect(f.sessions.size).toBe(0)
    expect(f.runtime.view.state.preSessionDrafts.getSnapshot()[target.draftId]).toMatchObject({
      approvalChoice: 'ask',
      text: 'keep this for a capable Host',
      sessionId: null,
    })
  } finally {
    f.runtime.dispose()
  }
})

test('inherit leaves the new Session unoverridden and captures the Host default for the Run', async () => {
  const f = fixture({ sessionSettings: true })
  try {
    const target = await createDraft(f.runtime, {
      workspaceId: 'workspace-a',
      text: 'use the Host default approval',
      modelId: model.id,
    })
    const result = await f.runtime.view.commands.execute('preSessionDraft.submit', {
      draftId: target.draftId,
      expectedRevision: target.revision,
    })
    expect(f.permissionWrites).toEqual([])
    expect(f.runCalls).toHaveLength(1)
    expect(f.runCalls[0]?.approval).toBe('ask')
    expect(result.accepted.sessionId).toBe(result.sessionId)
  } finally {
    f.runtime.dispose()
  }
})

test('an explicit approval choice is Host-confirmed before the first Run', async () => {
  const f = fixture({ sessionSettings: true })
  try {
    const target = await createDraft(f.runtime, {
      workspaceId: 'workspace-a',
      text: 'use the session ask policy',
      modelId: model.id,
      approvalChoice: 'ask',
    })
    const result = await f.runtime.view.commands.execute('preSessionDraft.submit', {
      draftId: target.draftId,
      expectedRevision: target.revision,
    })
    expect(f.permissionWrites).toHaveLength(1)
    expect(f.permissionWrites[0]).toMatchObject({ sessionId: result.sessionId, choice: 'ask' })
    expect(f.runCalls).toHaveLength(1)
    expect(f.runCalls[0]?.approval).toBe('ask')
  } finally {
    f.runtime.dispose()
  }
})

test('a Host-invalidated permission read settles before the first Run', async () => {
  const f = fixture({ sessionSettings: true, invalidateApprovalOnWrite: true })
  const read = f.holdNextPermissionReadAfterWrite()
  try {
    const target = await createDraft(f.runtime, {
      workspaceId: 'workspace-a',
      text: 'wait for the Host approval projection',
      modelId: model.id,
      approvalChoice: 'deny',
    })
    const submit = f.runtime.view.commands.execute('preSessionDraft.submit', {
      draftId: target.draftId,
      expectedRevision: target.revision,
    })
    await read.entered
    expect(f.runtime.view.state.composerPermission.getSnapshot().entries['session-1']).toMatchObject({
      choice: 'deny',
      status: 'loading',
      writeUnknown: false,
    })
    expect(f.runCalls).toEqual([])
    read.release()
    const result = await submit
    expect(result.sessionId).toBe('session-1')
    expect(f.runCalls).toHaveLength(1)
    expect(f.runCalls[0]?.approval).toBe('deny')
  } finally {
    read.release()
    f.runtime.dispose()
  }
})

test('a confirmed auto-approval choice is Host-confirmed before the first Run', async () => {
  const f = fixture({ sessionSettings: true })
  try {
    const target = await createDraft(f.runtime, {
      workspaceId: 'workspace-a',
      text: 'use the confirmed auto-approval policy',
      modelId: model.id,
      approvalChoice: 'allow',
    })
    const result = await f.runtime.view.commands.execute('preSessionDraft.submit', {
      draftId: target.draftId,
      expectedRevision: target.revision,
    })
    expect(f.permissionWrites).toHaveLength(1)
    expect(f.permissionWrites[0]).toMatchObject({ sessionId: result.sessionId, choice: 'allow' })
    expect(f.runCalls).toHaveLength(1)
    expect(f.runCalls[0]?.approval).toBe('allow')
  } finally {
    f.runtime.dispose()
  }
})

test('unknown Host approval writes reconcile by the original receipt before one Run', async () => {
  const f = fixture({ sessionSettings: true })
  f.losePermissionWriteReply()
  try {
    const target = await createDraft(f.runtime, {
      workspaceId: 'workspace-a',
      text: 'recover the same approval and Run',
      modelId: model.id,
      approvalChoice: 'deny',
    })
    await expect(
      f.runtime.view.commands.execute('preSessionDraft.submit', {
        draftId: target.draftId,
        expectedRevision: target.revision,
      }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(f.runtime.view.state.preSessionDrafts.getSnapshot()[target.draftId]).toMatchObject({
      phase: 'unknown',
      unknownStage: 'approval',
      sessionId: 'session-1',
      approvalChoice: 'deny',
    })
    expect(f.permissionWrites).toHaveLength(1)
    expect(f.runCalls).toEqual([])

    await f.runtime.view.commands.execute('preSessionDraft.reconcile', { draftId: target.draftId })
    expect(f.permissionWrites).toHaveLength(1)
    expect(f.runCalls).toHaveLength(1)
    expect(f.runCalls[0]?.approval).toBe('deny')
    expect(f.runtime.view.state.preSessionDrafts.getSnapshot()[target.draftId]).toMatchObject({
      phase: 'accepted',
      text: '',
      approvalChoice: 'deny',
    })
  } finally {
    f.runtime.dispose()
  }
})

test('approval receipt survives a target switch without running or hijacking navigation', async () => {
  const f = fixture({ sessionSettings: true })
  const held = f.holdNextPermissionWrite()
  try {
    const target = await createDraft(f.runtime, {
      workspaceId: 'workspace-a',
      text: 'keep visible if navigation changes',
      modelId: model.id,
      approvalChoice: 'allow',
    })
    const submit = f.runtime.view.commands.execute('preSessionDraft.submit', {
      draftId: target.draftId,
      expectedRevision: target.revision,
    })
    await held.entered
    await f.runtime.view.commands.execute('app.setWorkspace', { workspaceId: 'workspace-b' })
    held.release()
    await expect(submit).rejects.toMatchObject({ code: 'STALE_TARGET' })
    const draft = f.runtime.view.state.preSessionDrafts.getSnapshot()[target.draftId]
    expect(draft).toMatchObject({
      phase: 'failed',
      error: 'STALE_TARGET',
      sessionId: 'session-1',
      approvalChoice: 'allow',
      text: 'keep visible if navigation changes',
    })
    expect(f.runtime.view.state.navigation.getSnapshot()).toMatchObject({ workspaceId: 'workspace-b', sessionId: null })
    expect(f.runtime.view.state.drafts.getSnapshot()['session-1']?.text).toBe('keep visible if navigation changes')
    expect(f.runtime.view.state.composerPermission.getSnapshot().entries['session-1']).toMatchObject({
      choice: 'allow',
      status: 'idle',
      writeUnknown: false,
    })
    expect(f.permissionWrites).toHaveLength(1)
    expect(f.runCalls).toEqual([])
  } finally {
    held.release()
    f.runtime.dispose()
  }
})

test('duplicate first-send requests share one pending creation and settle one Run', async () => {
  const f = fixture()
  const held = f.holdNextCreate()
  try {
    const target = await createDraft(f.runtime, {
      workspaceId: 'workspace-a',
      text: 'first message',
      modelId: model.id,
    })
    const submit = f.runtime.view.commands.execute('preSessionDraft.submit', {
      draftId: target.draftId,
      expectedRevision: target.revision,
    })
    await held.entered
    await expect(
      f.runtime.view.commands.execute('preSessionDraft.submit', {
        draftId: target.draftId,
        expectedRevision: target.revision,
      }),
    ).rejects.toMatchObject({ code: 'BUSY' })
    held.release()
    const result = await submit
    expect(f.createCalls).toHaveLength(1)
    expect(f.runCalls).toHaveLength(1)
    expect(result).toMatchObject({ draftId: target.draftId, accepted: { sessionId: result.sessionId } })
    expect(f.runtime.view.state.preSessionDrafts.getSnapshot()[target.draftId]).toMatchObject({
      phase: 'accepted',
      sessionId: result.sessionId,
      text: '',
      operationId: result.accepted.operationId,
    })
    expect(
      f.runtime.view.state.workspaceTabs.getSnapshot().items.some(
        (item) =>
          item.kind === 'session' && item.sessionId === result.sessionId && item.workspaceId === 'workspace-a',
      ),
    ).toBe(true)
  } finally {
    held.release()
    f.runtime.dispose()
  }
})

test('closing an in-flight landing draft preserves it until acceptance, then disposes it', async () => {
  const f = fixture()
  const held = f.holdNextCreate()
  try {
    const target = await createDraft(f.runtime, {
      workspaceId: 'workspace-a',
      text: 'first message from a closing landing view',
      modelId: model.id,
    })
    const submit = f.runtime.view.commands.execute('preSessionDraft.submit', {
      draftId: target.draftId,
      expectedRevision: target.revision,
    })
    await held.entered
    await expect(f.runtime.view.commands.execute('preSessionDraft.close', { draftId: target.draftId })).resolves.toEqual({
      draftId: target.draftId,
      closed: false,
    })
    held.release()
    await submit
    expect(f.runtime.view.state.preSessionDrafts.getSnapshot()[target.draftId]).toBeUndefined()
    expect(f.runtime.view.state.drafts.getSnapshot()['session-1']?.text).toBe('')
  } finally {
    held.release()
    f.runtime.dispose()
  }
})

test('a full tab strip refuses first-send before creating a Host Session', async () => {
  const f = fixture()
  try {
    for (let index = 0; index < 32; index++) {
      const existing = session(`existing-${index}`, 'workspace-a')
      f.sessions.set(existing.id, existing)
      await f.runtime.view.commands.execute('app.setSession', {
        sessionId: existing.id,
        workspaceId: existing.workspaceId,
      })
    }
    expect(f.runtime.view.state.workspaceTabs.getSnapshot().items).toHaveLength(32)

    const target = await createDraft(f.runtime, {
      workspaceId: 'workspace-a',
      text: 'do not orphan this first message',
      modelId: model.id,
    })
    await expect(
      f.runtime.view.commands.execute('preSessionDraft.submit', {
        draftId: target.draftId,
        expectedRevision: target.revision,
      }),
    ).rejects.toMatchObject({ code: 'TAB_LIMIT' })

    expect(f.createCalls).toEqual([])
    expect(f.sessions.size).toBe(32)
    expect(f.runtime.view.state.preSessionDrafts.getSnapshot()[target.draftId]).toMatchObject({
      phase: 'failed',
      error: 'TAB_LIMIT',
      sessionId: null,
      text: 'do not orphan this first message',
    })
  } finally {
    f.runtime.dispose()
  }
})

test('a target switch during creation keeps the captured Workspace and leaves the seeded Session draft visible', async () => {
  const f = fixture()
  const held = f.holdNextCreate()
  try {
    const target = await createDraft(f.runtime, {
      workspaceId: 'workspace-a',
      text: 'send to workspace A',
      modelId: model.id,
    })
    const submit = f.runtime.view.commands.execute('preSessionDraft.submit', {
      draftId: target.draftId,
      expectedRevision: target.revision,
    })
    await held.entered
    await f.runtime.view.commands.execute('app.setWorkspace', { workspaceId: 'workspace-b' })
    held.release()
    await expect(submit).rejects.toMatchObject({ code: 'STALE_TARGET' })

    const draft = f.runtime.view.state.preSessionDrafts.getSnapshot()[target.draftId]
    expect(f.createCalls).toHaveLength(1)
    expect(f.createCalls[0]).toMatchObject({ workspaceId: 'workspace-a' })
    expect(f.sessions.size).toBe(1)
    expect(f.runtime.view.state.navigation.getSnapshot()).toMatchObject({ workspaceId: 'workspace-b', sessionId: null })
    expect(draft).toMatchObject({
      phase: 'failed',
      error: 'STALE_TARGET',
      workspaceId: 'workspace-a',
      capturedWorkspaceId: 'workspace-a',
      sessionId: 'session-1',
      text: 'send to workspace A',
    })
    expect(f.runtime.view.state.drafts.getSnapshot()['session-1']?.text).toBe('send to workspace A')
    expect(f.runCalls).toEqual([])
  } finally {
    held.release()
    f.runtime.dispose()
  }
})

test('same-key creation reconciliation discovers the real Session without stealing a later selection', async () => {
  const f = fixture()
  try {
    f.loseCreateReply()
    const target = await createDraft(f.runtime, {
      workspaceId: 'workspace-a',
      text: 'recover this first message',
      modelId: model.id,
    })
    await expect(
      f.runtime.view.commands.execute('preSessionDraft.submit', {
        draftId: target.draftId,
        expectedRevision: target.revision,
      }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(f.runtime.view.state.preSessionDrafts.getSnapshot()[target.draftId]).toMatchObject({
      phase: 'unknown',
      unknownStage: 'create',
      sessionId: null,
    })

    await expect(
      f.runtime.view.commands.execute('preSessionDraft.close', { draftId: target.draftId }),
    ).resolves.toEqual({ draftId: target.draftId, closed: false })
    await f.runtime.view.commands.execute('app.setWorkspace', { workspaceId: 'workspace-b' })
    await expect(f.runtime.view.commands.execute('preSessionDraft.reconcile', { draftId: target.draftId })).rejects.toMatchObject({
      code: 'STALE_TARGET',
    })

    const draft = f.runtime.view.state.preSessionDrafts.getSnapshot()[target.draftId]
    expect(f.createCalls).toHaveLength(2)
    expect(f.createCalls[1]?.key).toBe(f.createCalls[0]?.key)
    expect(f.sessions.size).toBe(1)
    expect(f.runtime.view.state.navigation.getSnapshot()).toMatchObject({ workspaceId: 'workspace-b', sessionId: null })
    expect(draft).toMatchObject({
      phase: 'failed',
      error: 'STALE_TARGET',
      sessionId: 'session-1',
      capturedWorkspaceId: 'workspace-a',
      text: 'recover this first message',
    })
    expect(f.runtime.view.state.drafts.getSnapshot()['session-1']?.text).toBe('recover this first message')
    expect(f.runCalls).toEqual([])
  } finally {
    f.runtime.dispose()
  }
})

test('model initialization failure keeps the real Session and first message in the active composer', async () => {
  const f = fixture()
  f.failModelReads(true)
  try {
    const target = await createDraft(f.runtime, {
      workspaceId: 'workspace-a',
      text: 'retain this after model setup fails',
      modelId: model.id,
    })
    await expect(
      f.runtime.view.commands.execute('preSessionDraft.submit', {
        draftId: target.draftId,
        expectedRevision: target.revision,
      }),
    ).rejects.toMatchObject({ code: 'MODEL_NOT_READY' })
    const draft = f.runtime.view.state.preSessionDrafts.getSnapshot()[target.draftId]
    const sessionId = draft?.sessionId
    expect(sessionId).toBe('session-1')
    expect(f.runtime.view.state.navigation.getSnapshot()).toMatchObject({
      workspaceId: 'workspace-a',
      sessionId,
    })
    expect(f.runtime.view.state.drafts.getSnapshot()[sessionId!]?.text).toBe('retain this after model setup fails')
    expect(draft).toMatchObject({ phase: 'failed', error: 'MODEL_NOT_READY', text: 'retain this after model setup fails' })
    expect(f.runCalls).toEqual([])
  } finally {
    f.runtime.dispose()
  }
})

test('Run unknown is reconciled by its original key and the Session composer owns visible recovery text', async () => {
  const f = fixture()
  f.unknownRun(true)
  try {
    const target = await createDraft(f.runtime, {
      workspaceId: 'workspace-a',
      text: 'recover the accepted first Run',
      modelId: model.id,
    })
    await expect(
      f.runtime.view.commands.execute('preSessionDraft.submit', {
        draftId: target.draftId,
        expectedRevision: target.revision,
      }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    const before = f.runtime.view.state.preSessionDrafts.getSnapshot()[target.draftId]
    const sessionId = before?.sessionId
    expect(before).toMatchObject({ phase: 'unknown', unknownStage: 'run', sessionId })
    expect(f.runtime.view.state.drafts.getSnapshot()[sessionId!]).toMatchObject({
      text: 'recover the accepted first Run',
      status: 'unknown',
    })
    expect(f.runCalls).toHaveLength(1)

    const recovered = await f.runtime.view.commands.execute('preSessionDraft.reconcile', { draftId: target.draftId })
    expect(f.runCalls).toHaveLength(1)
    expect(recovered).toMatchObject({ phase: 'accepted', sessionId, accepted: { idempotencyKey: f.runCalls[0]?.key } })
    expect(f.runtime.view.state.drafts.getSnapshot()[sessionId!]).toMatchObject({ text: '', status: 'idle' })
  } finally {
    f.runtime.dispose()
  }
})
