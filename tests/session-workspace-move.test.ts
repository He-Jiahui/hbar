import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry, createCommandClient, type CommandExecutor } from '@hbar/commands'
import { directoryCommands, navigationCommands } from '@hbar/contracts/commands'
import { draftCommands, type PromptAttachment, type PromptMention } from '@hbar/contracts/commands/draft'
import type { Session, SessionSnapshot, ThinkingLevel, Workspace } from '@hbar/contracts'
import { createState } from '../packages/app-runtime/src/state'
import { composerIntentCommands } from '../packages/app-runtime/src/composer-intent'
import { composerModelCommands } from '../packages/app-runtime/src/composer-model'
import { composerPermissionCommands } from '../packages/app-runtime/src/composer-permission'
import { composerPlanModeCommands } from '../packages/app-runtime/src/composer-plan-mode'
import type { ComposerIntentState } from '../packages/app-runtime/src/composer-intent'
import type { ComposerPermissionState } from '../packages/app-runtime/src/composer-permission'
import type { ComposerPlanModeState } from '../packages/app-runtime/src/composer-plan-mode'
import type {
  DraftsState,
  NavigationState,
  SessionControlsState,
  SessionTimelineState,
} from '../packages/app-runtime/src/types'
import {
  createSessionWorkspaceMove,
  sessionWorkspaceMoveCommands,
} from '../packages/app-runtime/src/session-workspace-move'

const sourceWorkspace: Workspace = { id: 'source-ws', path: 'C:/source', name: 'Source', createdAt: 1 }
const targetWorkspace: Workspace = { id: 'target-ws', path: 'C:/target', name: 'Target', createdAt: 1 }
const sourceSession: Session = {
  id: 'source-session',
  workspaceId: sourceWorkspace.id,
  title: 'Empty source',
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  seq: 1,
}
const sourceModel = {
  id: 'source-model',
  providerId: 'provider',
  providerName: 'Provider',
  modelId: 'source-model',
  modelName: 'Source model',
  contextWindow: 32_000,
  maxOutput: 4_000,
  imageInput: true,
  reasoning: true,
  thinkingLevels: ['low', 'medium', 'high'] as ThinkingLevel[],
  defaultThinkingLevel: 'medium' as ThinkingLevel,
  hasKey: true,
}
const sourceArtifact = {
  id: 'a'.repeat(64),
  name: 'guide.txt',
  mime: 'text/plain',
  size: 12,
}
const mention: PromptMention = {
  start: 4,
  end: 13,
  label: 'guide.txt',
  path: 'docs/guide.txt',
  workspaceId: sourceWorkspace.id,
  directory: false,
}
const attachment: PromptAttachment = { kind: 'file', artifact: sourceArtifact }

function emptySnapshot(session: Session): SessionSnapshot {
  return {
    session,
    messages: [],
    runs: [],
    approvals: [],
    userInputs: [],
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    cursor: session.seq,
    hasOlder: false,
    streams: [],
  }
}

function modelConfiguration(
  sessionId: string,
  options: {
    id?: string | null
    thinking?: ThinkingLevel | null
    modelSource?: string
    thinkingSource?: string
  } = {},
) {
  const modelId = options.id === undefined ? sourceModel.id : options.id
  const configured = modelId !== null
  const model = modelId === null ? null : { ...sourceModel, id: modelId, modelId }
  return {
    sessionId,
    status: configured ? ('configured' as const) : ('unset' as const),
    modelId,
    model,
    thinkingLevel: configured ? (options.thinking ?? 'medium') : null,
    revisions: { [`settings:session:${sessionId}`]: 1 },
    sources: { model: options.modelSource ?? 'session', thinkingLevel: options.thinkingSource ?? 'session' },
  }
}

function intentEntry(sessionId: string, intent: ComposerIntentState['entries'][string]['intent'] = 'default') {
  return {
    sessionId,
    intent,
    revision: 0,
    submission: { status: 'idle' as const, phase: null, error: null, preparedGoalId: null },
    goalAction: { status: 'idle' as const, error: null },
  }
}

function fixture(
  input: {
    readonly sourceIntent?: ComposerIntentState['entries'][string]['intent']
    readonly sourceMode?: 'default' | 'plan'
    readonly sourcePermission?: 'inherit' | 'ask' | 'deny' | 'allow'
    readonly mentionExists?: boolean
    readonly pendingTransfer?: boolean
    readonly createUnknownOnce?: boolean
    readonly permissionUnknownOnce?: boolean
    readonly targetModel?: ReturnType<typeof modelConfiguration>
  } = {},
) {
  const sourceDraft = {
    sessionId: sourceSession.id,
    text: 'Use @guide.txt',
    mentions: [mention],
    attachments: [attachment],
    attachmentTransfers: input.pendingTransfer
      ? [
          {
            id: 'transfer',
            ownerRevision: 0,
            originalOperationId: null,
            name: 'upload.txt',
            mime: 'text/plain',
            size: 2,
            status: 'uploading' as const,
            kind: 'file' as const,
            upload: null,
            confirmed: null,
            error: null,
          },
        ]
      : [],
    uploading: input.pendingTransfer ? 1 : 0,
    uploadError: null,
    revision: 4,
    status: 'idle' as const,
    error: null,
    lastOperationId: null,
  }
  const drafts = createState<DraftsState>({ [sourceSession.id]: sourceDraft }, () => {})
  const navigation = createState<NavigationState>(
    { workspaceId: sourceWorkspace.id, sessionId: sourceSession.id, status: 'idle', error: null },
    () => {},
  )
  const controls = createState<SessionControlsState>(
    {
      sessionId: sourceSession.id,
      status: 'ready',
      model: modelConfiguration(sourceSession.id, { thinking: 'high' }),
      usage: null,
      budget: null,
      errors: { model: null, usage: null, budget: null },
    },
    () => {},
  )
  const composerIntent = createState<ComposerIntentState>(
    {
      entries: { [sourceSession.id]: intentEntry(sourceSession.id, input.sourceIntent ?? 'default') },
      facts: {
        sessionId: sourceSession.id,
        status: 'ready',
        snapshot: {
          sessionId: sourceSession.id,
          goal: null,
          remainingTokens: null,
          goalSeq: 0,
          planSeq: 0,
          plan: null,
        },
        error: null,
      },
    },
    () => {},
  )
  const permissions = createState<ComposerPermissionState>(
    {
      available: true,
      hostDefault: { status: 'ready', mode: 'ask', error: null },
      entries: {
        [sourceSession.id]: {
          sessionId: sourceSession.id,
          choice: input.sourcePermission ?? 'allow',
          revision: 1,
          status: 'idle',
          locked: false,
          error: null,
        },
      },
    },
    () => {},
  )
  const planModes = createState<ComposerPlanModeState>(
    {
      available: true,
      entries: {
        [sourceSession.id]: {
          sessionId: sourceSession.id,
          mode: input.sourceMode ?? 'plan',
          status: 'ready',
          error: null,
          revision: 1,
        },
      },
    },
    () => {},
  )
  const timeline = createState<SessionTimelineState>(
    {
      sessionId: sourceSession.id,
      status: 'ready',
      olderStatus: 'idle',
      olderError: null,
      messages: [],
      runs: [],
      approvals: [],
      userInputs: [],
      plan: null,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
      streams: {},
      events: [],
      cursor: 1,
      hasOlder: false,
      error: null,
    },
    () => {},
  )
  const sessions = new Map([[sourceSession.id, sourceSession]])
  const createdByKey = new Map<string, Session>()
  const createKeys: string[] = []
  const events: string[] = []
  const modelWrites: string[] = []
  const permissionWrites: string[] = []
  const hostQueries: string[] = []
  let createAttempts = 0
  let createCount = 0
  let loseCreateReply = input.createUnknownOnce ?? false
  let losePermissionReply = input.permissionUnknownOnce ?? false
  const directoryHost: CommandExecutor = {
    async execute(name, raw) {
      const args = raw as { sessionId?: string; workspaceId?: string }
      hostQueries.push(name)
      if (name === 'session.get') return sessions.get(args.sessionId ?? '') ?? null
      if (name === 'workspace.get')
        return args.workspaceId === sourceWorkspace.id
          ? sourceWorkspace
          : args.workspaceId === targetWorkspace.id
            ? targetWorkspace
            : null
      throw new Error(`Unexpected directory query: ${name}`)
    },
  }
  const directoryQueries = createCommandClient(directoryCommands, directoryHost)
  const fileQuery: CommandExecutor = {
    async execute(name) {
      if (name !== 'file.list') throw new Error(`Unexpected file query: ${name}`)
      return {
        items: input.mentionExists === false ? [] : [{ name: 'guide.txt', path: mention.path, directory: false }],
      }
    },
  }
  const local = new CommandRegistry({ execution: 'client' })
  const select = (sessionId: string, workspaceId: string) => {
    navigation.replace({ workspaceId, sessionId, status: 'idle', error: null })
    controls.replace({
      ...controls.reader.getSnapshot(),
      sessionId,
      status: 'ready',
      model: input.targetModel ?? modelConfiguration(sessionId, { id: null }),
      errors: { model: null, usage: null, budget: null },
    })
    const currentPermission = permissions.reader.getSnapshot()
    permissions.replace({
      ...currentPermission,
      entries: {
        ...currentPermission.entries,
        [sessionId]: { sessionId, choice: 'inherit', revision: 0, status: 'idle', locked: false, error: null },
      },
    })
    const currentModes = planModes.reader.getSnapshot()
    planModes.replace({
      ...currentModes,
      entries: {
        ...currentModes.entries,
        [sessionId]: { sessionId, mode: 'default', status: 'ready', error: null, revision: 0 },
      },
    })
    const currentIntent = composerIntent.reader.getSnapshot()
    composerIntent.replace({
      ...currentIntent,
      entries: { ...currentIntent.entries, [sessionId]: intentEntry(sessionId) },
      facts: {
        sessionId,
        status: 'ready',
        snapshot: { sessionId, goal: null, remainingTokens: null, goalSeq: 0, planSeq: 0, plan: null },
        error: null,
      },
    })
  }
  local.register(navigationCommands['app.setSession'], ({ sessionId, workspaceId }) => {
    const session = sessions.get(sessionId ?? '')
    const target = sessionId === undefined ? null : session
    if (!target) throw new CommandError('SESSION_NOT_FOUND', 'Target Session not found')
    events.push('select')
    select(target.id, workspaceId ?? target.workspaceId)
    return { workspaceId: target.workspaceId, sessionId: target.id }
  })
  local.register(draftCommands['draft.setContent'], ({ sessionId, text, mentions, expectedRevision }) => {
    const current = drafts.reader.getSnapshot()[sessionId]
    if ((current?.revision ?? 0) !== expectedRevision)
      throw new CommandError('VERSION_CONFLICT', 'Draft revision changed')
    drafts.replace({
      ...drafts.reader.getSnapshot(),
      [sessionId]: {
        sessionId,
        text,
        mentions,
        attachments: current?.attachments ?? [],
        attachmentTransfers: [],
        uploading: 0,
        uploadError: null,
        revision: expectedRevision + 1,
        status: 'idle',
        error: null,
        lastOperationId: null,
      },
    })
    return { sessionId, revision: expectedRevision + 1 }
  })
  local.register(draftCommands['draft.setAttachments'], ({ sessionId, attachments, expectedRevision }) => {
    const current = drafts.reader.getSnapshot()[sessionId]
    const revision = current?.revision ?? 0
    if (expectedRevision !== undefined && expectedRevision !== revision)
      throw new CommandError('VERSION_CONFLICT', 'Draft revision changed')
    if (!current) throw new CommandError('INVALID_STATE', 'The target draft was not initialized')
    drafts.replace({ ...drafts.reader.getSnapshot(), [sessionId]: { ...current, attachments, revision: revision + 1 } })
    return { sessionId, revision: revision + 1 }
  })
  local.register(composerModelCommands['composerModel.refresh'], ({ sessionId }) => ({ sessionId }))
  local.register(composerModelCommands['composerModel.selectModel'], ({ sessionId, modelId }) => {
    modelWrites.push('model')
    const current = controls.reader.getSnapshot().model
    controls.replace({
      ...controls.reader.getSnapshot(),
      model: {
        ...modelConfiguration(sessionId, { id: modelId, thinking: 'medium' }),
        revisions: {
          ...(current?.revisions ?? {}),
          [`settings:session:${sessionId}`]: (current?.revisions[`settings:session:${sessionId}`] ?? 0) + 1,
        },
      },
    })
    return { sessionId }
  })
  local.register(composerModelCommands['composerModel.selectThinking'], ({ sessionId, thinkingLevel }) => {
    modelWrites.push('thinking')
    const current = controls.reader.getSnapshot().model
    if (!current) throw new CommandError('MODEL_NOT_READY', 'No target model')
    controls.replace({
      ...controls.reader.getSnapshot(),
      model: {
        ...current,
        thinkingLevel,
        revisions: {
          ...current.revisions,
          [`settings:session:${sessionId}`]: (current.revisions[`settings:session:${sessionId}`] ?? 0) + 1,
        },
      },
    })
    return { sessionId }
  })
  local.register(composerModelCommands['composerModel.reconcile'], ({ sessionId }) => ({ sessionId }))
  local.register(composerPermissionCommands['composerPermission.setChoice'], ({ sessionId, choice }) => {
    permissionWrites.push(choice)
    const current = permissions.reader.getSnapshot()
    const before = current.entries[sessionId]
    permissions.replace({
      ...current,
      entries: {
        ...current.entries,
        [sessionId]: {
          sessionId,
          choice,
          revision: (before?.revision ?? 0) + 1,
          status: losePermissionReply ? 'unknown' : 'idle',
          locked: losePermissionReply,
          error: losePermissionReply ? 'RESULT_UNKNOWN' : null,
          ...(losePermissionReply ? { writeUnknown: true } : {}),
        },
      },
    })
    if (losePermissionReply) {
      losePermissionReply = false
      throw new CommandError('RESULT_UNKNOWN', 'Permission response lost')
    }
    return { sessionId, revision: (before?.revision ?? 0) + 1 }
  })
  local.register(composerPermissionCommands['composerPermission.reconcile'], ({ sessionId }) => {
    const current = permissions.reader.getSnapshot()
    const value = current.entries[sessionId]
    if (!value) throw new CommandError('INVALID_INPUT', 'No permission')
    permissions.replace({
      ...current,
      entries: {
        ...current.entries,
        [sessionId]: { ...value, status: 'idle', locked: false, writeUnknown: false, error: null },
      },
    })
    return { sessionId, revision: value.revision }
  })
  local.register(composerPlanModeCommands['composerPlanMode.setMode'], ({ sessionId, mode }) => {
    const current = planModes.reader.getSnapshot()
    const before = current.entries[sessionId]
    planModes.replace({
      ...current,
      entries: {
        ...current.entries,
        [sessionId]: { sessionId, mode, status: 'ready', error: null, revision: (before?.revision ?? 0) + 1 },
      },
    })
    return { sessionId, mode }
  })
  local.register(composerPlanModeCommands['composerPlanMode.reconcile'], ({ sessionId }) => {
    const entry = planModes.reader.getSnapshot().entries[sessionId]
    if (!entry) throw new CommandError('INVALID_INPUT', 'No plan mode')
    return { sessionId, mode: entry.mode }
  })
  local.register(composerIntentCommands['composerIntent.setIntent'], ({ sessionId, intent, expectedRevision }) => {
    const current = composerIntent.reader.getSnapshot()
    const before = current.entries[sessionId] ?? intentEntry(sessionId)
    if (expectedRevision !== before.revision) throw new CommandError('VERSION_CONFLICT', 'Intent revision changed')
    composerIntent.replace({
      ...current,
      entries: { ...current.entries, [sessionId]: { ...before, intent, revision: before.revision + 1 } },
    })
    return { sessionId }
  })

  const runtime = createSessionWorkspaceMove(local, {
    available: true,
    directoryQueries,
    async createSession(workspaceId, _title, execution) {
      createAttempts++
      createKeys.push(execution.idempotencyKey ?? '')
      let created = createdByKey.get(execution.idempotencyKey ?? '')
      if (!created) {
        created = { ...sourceSession, id: 'target-session', workspaceId, title: 'Moved draft', seq: 1 }
        createdByKey.set(execution.idempotencyKey ?? '', created)
        sessions.set(created.id, created)
        createCount++
      }
      if (loseCreateReply) {
        loseCreateReply = false
        throw new CommandError('TIMEOUT', 'Session created but response lost')
      }
      return created
    },
    async archiveSession(sessionId, archived, execution) {
      events.push('archive')
      const current = sessions.get(sessionId)
      if (!current) throw new CommandError('SESSION_NOT_FOUND', 'Source Session missing')
      const value = { ...current, archived }
      sessions.set(sessionId, value)
      void execution
      return value
    },
    navigation: navigation.reader,
    drafts: drafts.reader,
    controls: controls.reader,
    composerIntent: composerIntent.reader,
    permissions: permissions.reader,
    planModes: planModes.reader,
    timeline: timeline.reader,
    async snapshot(sessionId) {
      return emptySnapshot(sessions.get(sessionId) ?? sourceSession)
    },
    filesQuery: fileQuery,
    hasChildSessions: async () => false,
    async releaseSourceChoices(sessionId) {
      expect(sessionId).toBe(sourceSession.id)
      expect(sessions.get(sessionId)?.archived).toBe(true)
      events.push('release-source-choices')
    },
    tabs: {
      capture: (ids) =>
        ids.includes(sourceSession.id)
          ? [{ id: sourceSession.id, instanceKey: 'source-tab', sessionId: sourceSession.id }]
          : [],
      finishReplacement(source, targetSessionId) {
        expect(source.sessionId).toBe(sourceSession.id)
        expect(navigation.reader.getSnapshot().sessionId).toBe(targetSessionId)
        events.push('replace-tab')
      },
    },
    onSubscriberError: () => {},
  })
  return {
    client: createCommandClient(sessionWorkspaceMoveCommands, local),
    runtime,
    states: { drafts, navigation, controls, composerIntent, permissions, planModes, timeline },
    sourceDraft,
    sessions,
    events,
    modelWrites,
    permissionWrites,
    hostQueries,
    createAttempts: () => createAttempts,
    createCount: () => createCount,
    createKeys,
  }
}

test('moves the canonical draft and confirmed settings, then replaces its tab before archiving', async () => {
  const f = fixture({ sourceIntent: 'default', sourceMode: 'plan' })
  const result = await f.client.execute('sessionWorkspaceMove.move', {
    sessionId: sourceSession.id,
    workspaceId: sourceWorkspace.id,
    targetWorkspaceId: targetWorkspace.id,
    expectedDraftRevision: 4,
    confirmAllow: true,
  })
  expect(result.status).toBe('succeeded')
  const entry = f.runtime.reader.getSnapshot().entries[sourceSession.id]
  expect(entry).toMatchObject({ targetSessionId: 'target-session', phase: 'complete', unresolvedMentionCount: 0 })
  const targetDraft = f.states.drafts.reader.getSnapshot()['target-session']
  expect(targetDraft).toMatchObject({
    text: f.sourceDraft.text,
    mentions: [{ ...mention, workspaceId: targetWorkspace.id }],
    attachments: [attachment],
  })
  expect(targetDraft?.attachments[0]?.artifact.id).toBe(sourceArtifact.id)
  expect(f.states.drafts.reader.getSnapshot()[sourceSession.id]?.revision).toBe(4)
  expect(f.modelWrites).toEqual(['model', 'thinking'])
  expect(f.permissionWrites).toEqual(['allow'])
  expect(f.states.planModes.reader.getSnapshot().entries['target-session']?.mode).toBe('plan')
  expect(f.states.composerIntent.reader.getSnapshot().entries['target-session']?.intent).toBe('default')
  expect(f.events.indexOf('replace-tab')).toBeLessThan(f.events.indexOf('archive'))
  expect(f.events.indexOf('archive')).toBeLessThan(f.events.indexOf('release-source-choices'))
  expect(f.sessions.get(sourceSession.id)?.archived).toBe(true)
  f.runtime.dispose()
})

test('a missing mention fails before creation, and explicit confirmation keeps visible text without its pill', async () => {
  const f = fixture({ mentionExists: false, sourceIntent: 'goal', sourceMode: 'default', sourcePermission: 'inherit' })
  const first = await f.client.execute('sessionWorkspaceMove.move', {
    sessionId: sourceSession.id,
    workspaceId: sourceWorkspace.id,
    targetWorkspaceId: targetWorkspace.id,
    expectedDraftRevision: 4,
  })
  expect(first.status).toBe('failed')
  expect(f.runtime.reader.getSnapshot().entries[sourceSession.id]).toMatchObject({
    error: 'UNRESOLVED_MENTIONS_CONFIRMATION_REQUIRED',
    unresolvedMentionCount: 1,
  })
  expect(f.createCount()).toBe(0)

  const confirmed = await f.client.execute('sessionWorkspaceMove.move', {
    sessionId: sourceSession.id,
    workspaceId: sourceWorkspace.id,
    targetWorkspaceId: targetWorkspace.id,
    expectedDraftRevision: 4,
    confirmUnresolvedMentions: true,
  })
  expect(confirmed.status).toBe('succeeded')
  expect(f.states.drafts.reader.getSnapshot()['target-session']).toMatchObject({
    text: f.sourceDraft.text,
    mentions: [],
    attachments: [attachment],
  })
  expect(f.states.composerIntent.reader.getSnapshot().entries['target-session']?.intent).toBe('goal')
  f.runtime.dispose()
})

test('pending attachment transfers stop before Session creation', async () => {
  const f = fixture({
    pendingTransfer: true,
    sourceIntent: 'default',
    sourceMode: 'default',
    sourcePermission: 'inherit',
  })
  const result = await f.client.execute('sessionWorkspaceMove.move', {
    sessionId: sourceSession.id,
    workspaceId: sourceWorkspace.id,
    targetWorkspaceId: targetWorkspace.id,
    expectedDraftRevision: 4,
  })
  expect(result.status).toBe('failed')
  expect(f.runtime.reader.getSnapshot().entries[sourceSession.id]?.error).toBe('BUSY')
  expect(f.createCount()).toBe(0)
  expect(f.states.drafts.reader.getSnapshot()[sourceSession.id]?.attachmentTransfers).toHaveLength(1)
  expect(f.events).not.toContain('release-source-choices')
  f.runtime.dispose()
})

test('unknown Session creation continues with the original idempotency key', async () => {
  const f = fixture({
    createUnknownOnce: true,
    sourceIntent: 'default',
    sourceMode: 'default',
    sourcePermission: 'inherit',
  })
  const first = await f.client.execute('sessionWorkspaceMove.move', {
    sessionId: sourceSession.id,
    workspaceId: sourceWorkspace.id,
    targetWorkspaceId: targetWorkspace.id,
    expectedDraftRevision: 4,
  })
  expect(first.status).toBe('unknown')
  expect(f.runtime.reader.getSnapshot().entries[sourceSession.id]?.targetSessionId).toBeNull()
  const resumed = await f.client.execute('sessionWorkspaceMove.continue', { sessionId: sourceSession.id })
  expect(resumed.status).toBe('succeeded')
  expect(f.createAttempts()).toBe(2)
  expect(f.createCount()).toBe(1)
  expect(f.createKeys[0]).toBeTruthy()
  expect(f.createKeys[1]).toBe(f.createKeys[0])
  f.runtime.dispose()
})

test('unknown permission writes reconcile before moving on without a second write', async () => {
  const f = fixture({ permissionUnknownOnce: true, sourceIntent: 'default', sourceMode: 'default' })
  const first = await f.client.execute('sessionWorkspaceMove.move', {
    sessionId: sourceSession.id,
    workspaceId: sourceWorkspace.id,
    targetWorkspaceId: targetWorkspace.id,
    expectedDraftRevision: 4,
    confirmAllow: true,
  })
  expect(first.status).toBe('unknown')
  const resumed = await f.client.execute('sessionWorkspaceMove.continue', { sessionId: sourceSession.id })
  expect(resumed.status).toBe('succeeded')
  expect(f.permissionWrites).toEqual(['allow'])
  expect(f.sessions.get(sourceSession.id)?.archived).toBe(true)
  f.runtime.dispose()
})
