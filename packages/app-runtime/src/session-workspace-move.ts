import {
  CommandError,
  defineCommand,
  type CommandExecutor,
  type CommandRegistry,
  type ExecuteOptions,
} from '@hbar/commands'
import { idSchema } from '@hbar/contracts'
import type { PromptAttachment, PromptMention, PromptWorkspaceContext } from '@hbar/contracts/commands/draft'
import { fileCommands, workspaceFilePageSchema } from '@hbar/contracts/commands/files'
import { sessionSchema, workspaceSchema } from '@hbar/contracts/directory'
import type { SessionSnapshot } from '@hbar/contracts'
import { z } from 'zod'
import type { DirectoryQueries } from './directory'
import type { ComposerIntentState, ComposerIntent } from './composer-intent'
import type { ComposerPermissionState, ComposerPermissionChoice } from './composer-permission'
import type { ComposerPlanModeState } from './composer-plan-mode'
import { createState, type StateReader } from './state'
import { workspaceContextSemanticKey } from './composer-workspace-contexts'
import type { WorkspaceTabCloseTarget } from './workspace-tab-close'
import type { DraftsState, NavigationState, SessionControlsState, SessionTimelineState } from './types'

const MAX_OPERATIONS = 32
const MAX_FILE_PAGES = 8
const READ_TIMEOUT_MS = 15_000
const id = idSchema

const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.app-runtime',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  scope: 'session' as const,
  category: 'workspace.session',
  visibility: 'internal' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as ('api' | 'palette' | 'cli' | 'tui')[],
  cancelMode: 'cooperative' as const,
  maxConcurrent: 8,
})

const moveInput = z.strictObject({
  sessionId: id,
  workspaceId: id,
  targetWorkspaceId: id,
  expectedDraftRevision: z.number().int().nonnegative(),
  confirmAllow: z.literal(true).optional(),
  confirmUnresolvedMentions: z.literal(true).optional(),
})
const sessionInput = z.strictObject({ sessionId: id })
const output = z.strictObject({
  sourceSessionId: id,
  targetSessionId: id.nullable(),
  status: z.enum(['busy', 'failed', 'unknown', 'paused', 'succeeded', 'cancelled']),
})

export const sessionWorkspaceMoveCommands = {
  'sessionWorkspaceMove.move': defineCommand(metadata('sessionWorkspaceMove.move'), moveInput, output),
  'sessionWorkspaceMove.continue': defineCommand(metadata('sessionWorkspaceMove.continue'), sessionInput, output),
  'sessionWorkspaceMove.cancel': defineCommand(metadata('sessionWorkspaceMove.cancel'), sessionInput, output),
}

export type SessionWorkspaceMovePhase =
  | 'preflight'
  | 'create'
  | 'seed-draft'
  | 'select-target'
  | 'settings'
  | 'replace-tab'
  | 'archive-source'
  | 'complete'
  | 'cancelled'

export interface SessionWorkspaceMoveEntry {
  readonly sourceSessionId: string
  readonly sourceWorkspaceId: string
  readonly targetWorkspaceId: string
  readonly targetSessionId: string | null
  readonly status: 'busy' | 'failed' | 'unknown' | 'paused' | 'succeeded' | 'cancelled'
  readonly phase: SessionWorkspaceMovePhase
  readonly error: string | null
  readonly unresolvedMentionCount: number
}

export interface SessionWorkspaceMoveState {
  readonly available: boolean
  readonly entries: Readonly<Record<string, Readonly<SessionWorkspaceMoveEntry>>>
}

interface CapturedDraft {
  readonly revision: number
  readonly text: string
  readonly mentions: readonly PromptMention[]
  readonly workspaceContexts: readonly PromptWorkspaceContext[]
  readonly attachments: readonly PromptAttachment[]
}

interface CapturedModel {
  readonly modelId: string | null
  readonly thinkingLevel: string | null
}

interface Operation {
  readonly sourceSessionId: string
  readonly sourceWorkspaceId: string
  readonly targetWorkspaceId: string
  readonly expectedDraftRevision: number
  readonly confirmAllow: boolean
  readonly confirmUnresolvedMentions: boolean
  readonly createKey: string
  readonly archiveKey: string
  navigationFence: NavigationState
  readonly sourceTab: WorkspaceTabCloseTarget
  readonly sourceDraft: CapturedDraft
  sourceSessionSeq: number | null
  targetMentions: readonly PromptMention[] | null
  unresolvedMentionCount: number
  sourceModel: CapturedModel | null
  sourcePermission: ComposerPermissionChoice | null
  sourcePlanMode: 'default' | 'plan' | null
  sourceIntent: ComposerIntent | null
  targetSessionId: string | null
  createAttempted: boolean
  archiveAttempted: boolean
  archiveConfirmed: boolean
  tabReplaced: boolean
  readonly steps: Set<'model' | 'thinking' | 'permission' | 'planMode' | 'intent'>
  writeInFlight: 'model' | 'thinking' | 'permission' | 'planMode' | 'intent' | null
  running: boolean
  cancelRequested: boolean
  controller: AbortController | null
  entry: SessionWorkspaceMoveEntry
}

export interface SessionWorkspaceMoveOptions {
  readonly available: boolean
  readonly directoryQueries: DirectoryQueries
  readonly createSession: (
    workspaceId: string,
    title: string | undefined,
    execution: ExecuteOptions,
  ) => Promise<z.output<typeof sessionSchema>>
  readonly archiveSession: (
    sessionId: string,
    archived: boolean,
    execution: ExecuteOptions,
  ) => Promise<z.output<typeof sessionSchema>>
  readonly navigation: StateReader<NavigationState>
  readonly drafts: StateReader<DraftsState>
  readonly controls: StateReader<SessionControlsState>
  readonly composerIntent: StateReader<ComposerIntentState>
  readonly permissions: StateReader<ComposerPermissionState>
  readonly planModes: StateReader<ComposerPlanModeState>
  readonly timeline: StateReader<SessionTimelineState>
  readonly snapshot: (sessionId: string) => Promise<SessionSnapshot>
  readonly filesQuery?: CommandExecutor | undefined
  readonly tabs: {
    capture(ids: readonly string[]): readonly WorkspaceTabCloseTarget[]
    finishReplacement(source: WorkspaceTabCloseTarget, targetSessionId: string): void
  }
  /** Host-owned launch preparation and other Runtime-specific eligibility checks. */
  readonly assertEligible?: (input: {
    readonly sourceSessionId: string
    readonly sourceWorkspaceId: string
    readonly targetWorkspaceId: string
  }) => void | Promise<void>
  readonly hasChildSessions: (sourceSessionId: string, signal: AbortSignal) => Promise<boolean>
  /** Release only client launch-choice owners after source archival is confirmed. */
  readonly releaseSourceChoices?: (sourceSessionId: string, signal: AbortSignal) => Promise<void>
  readonly onSubscriberError: (error: unknown) => void
  readonly isDisposed?: () => boolean
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'EXECUTION_FAILED'
}

function commandResult(entry: SessionWorkspaceMoveEntry) {
  return { sourceSessionId: entry.sourceSessionId, targetSessionId: entry.targetSessionId, status: entry.status }
}

function captureDraft(drafts: StateReader<DraftsState>, sessionId: string): CapturedDraft {
  const draft = drafts.getSnapshot()[sessionId]
  return {
    revision: draft?.revision ?? 0,
    text: draft?.text ?? '',
    mentions: (draft?.mentions ?? []).map((item) => ({ ...item })),
    workspaceContexts: (draft?.workspaceContexts ?? []).map((item) => ({ ...item })),
    attachments: (draft?.attachments ?? []).map((item) => ({ ...item, artifact: { ...item.artifact } })),
  }
}

function sameDraft(left: CapturedDraft, right: CapturedDraft): boolean {
  return (
    left.revision === right.revision &&
    left.text === right.text &&
    JSON.stringify(left.mentions) === JSON.stringify(right.mentions) &&
    sameWorkspaceContexts(left.workspaceContexts, right.workspaceContexts) &&
    JSON.stringify(left.attachments) === JSON.stringify(right.attachments)
  )
}

function sameWorkspaceContexts(
  left: readonly PromptWorkspaceContext[],
  right: readonly PromptWorkspaceContext[],
): boolean {
  return (
    left.length === right.length &&
    left.every((context, index) => {
      const candidate = right[index]
      return (
        candidate?.id === context.id && workspaceContextSemanticKey(candidate) === workspaceContextSemanticKey(context)
      )
    })
  )
}

function parentPath(path: string): string {
  const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return separator < 0 ? '.' : separator === 0 ? path.slice(0, 1) : path.slice(0, separator)
}

function terminalModelState(state: SessionControlsState, sessionId: string): boolean {
  return state.sessionId === sessionId && (state.model !== null || state.errors.model !== null)
}

function waitFor<Value>(
  reader: StateReader<unknown>,
  read: () => Value | undefined,
  done: (value: Value) => boolean,
  signal: AbortSignal,
  label: string,
): Promise<Value> {
  const current = read()
  if (current !== undefined && done(current)) return Promise.resolve(current)
  if (signal.aborted) return Promise.reject(new CommandError('CANCELLED', `${label} wait cancelled`))
  return new Promise<Value>((resolve, reject) => {
    let complete = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    let unsubscribe: () => void = () => undefined
    const finish = (settle: () => void) => {
      if (complete) return
      complete = true
      if (timeout !== undefined) clearTimeout(timeout)
      unsubscribe()
      signal.removeEventListener('abort', abort)
      settle()
    }
    const check = () => {
      const value = read()
      if (value !== undefined && done(value)) finish(() => resolve(value))
    }
    const abort = () => finish(() => reject(new CommandError('CANCELLED', `${label} wait cancelled`)))
    unsubscribe = reader.subscribe(check)
    signal.addEventListener('abort', abort, { once: true })
    timeout = setTimeout(
      () => finish(() => reject(new CommandError('TIMEOUT', `${label} did not become ready`))),
      READ_TIMEOUT_MS,
    )
    check()
  })
}

function bounded<Value>(promise: Promise<Value>, signal: AbortSignal, label: string): Promise<Value> {
  if (signal.aborted) return Promise.reject(new CommandError('CANCELLED', `${label} read cancelled`))
  return new Promise<Value>((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | undefined
    const finish = (settle: () => void) => {
      if (timeout !== undefined) clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      settle()
    }
    const abort = () => finish(() => reject(new CommandError('CANCELLED', `${label} read cancelled`)))
    signal.addEventListener('abort', abort, { once: true })
    timeout = setTimeout(
      () => finish(() => reject(new CommandError('TIMEOUT', `${label} read timed out`))),
      READ_TIMEOUT_MS,
    )
    promise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    )
  })
}

/** Coordinates one empty Session's workspace move without owning draft or Host facts. */
export function createSessionWorkspaceMove(local: CommandRegistry, options: SessionWorkspaceMoveOptions) {
  const state = createState<SessionWorkspaceMoveState>(
    { available: options.available, entries: {} },
    options.onSubscriberError,
  )
  const operations = new Map<string, Operation>()
  let disposed = false

  const isDisposed = () => disposed || options.isDisposed?.() === true
  const publish = (
    operation: Operation,
    status: SessionWorkspaceMoveEntry['status'],
    phase: SessionWorkspaceMovePhase,
    error: string | null = null,
  ) => {
    operation.entry = {
      sourceSessionId: operation.sourceSessionId,
      sourceWorkspaceId: operation.sourceWorkspaceId,
      targetWorkspaceId: operation.targetWorkspaceId,
      targetSessionId: operation.targetSessionId,
      status,
      phase,
      error,
      unresolvedMentionCount: operation.unresolvedMentionCount,
    }
    if (isDisposed()) return
    const current = state.reader.getSnapshot()
    state.replace({ ...current, entries: { ...current.entries, [operation.sourceSessionId]: operation.entry } })
  }
  const requireCurrent = (operation: Operation, signal: AbortSignal, selection: 'source' | 'target' = 'source') => {
    if (isDisposed()) throw new CommandError('DISPOSED', 'Workspace move Runtime is disposed')
    if (signal.aborted || operation.cancelRequested) throw new CommandError('CANCELLED', 'Workspace move was cancelled')
    const current = options.navigation.getSnapshot()
    if (current !== operation.navigationFence)
      throw new CommandError('STALE_TARGET', 'Navigation changed; continue the move explicitly')
    const wantedSession = selection === 'source' ? operation.sourceSessionId : operation.targetSessionId
    const wantedWorkspace = selection === 'source' ? operation.sourceWorkspaceId : operation.targetWorkspaceId
    if (
      current.status !== 'idle' ||
      !wantedSession ||
      current.sessionId !== wantedSession ||
      current.workspaceId !== wantedWorkspace
    )
      throw new CommandError('STALE_TARGET', 'The selected Session changed during the workspace move')
    const latestDraft = captureDraft(options.drafts, operation.sourceSessionId)
    if (!sameDraft(operation.sourceDraft, latestDraft))
      throw new CommandError('VERSION_CONFLICT', 'The source draft changed; reopen the move with its current revision')
    const sourceDraft = options.drafts.getSnapshot()[operation.sourceSessionId]
    if (
      sourceDraft?.status === 'submitting' ||
      sourceDraft?.status === 'unknown' ||
      sourceDraft?.attachmentTransfers.length ||
      sourceDraft?.uploading
    )
      throw new CommandError('BUSY', 'Wait for or resolve the pending Run or attachment transfer first')
  }
  const command = async (name: string, input: unknown, operation: Operation, signal: AbortSignal) => {
    const value = await local.execute(name, input, { signal })
    if (name === 'app.setSession') {
      const current = options.navigation.getSnapshot()
      if (
        current.status !== 'idle' ||
        current.sessionId !== operation.targetSessionId ||
        current.workspaceId !== operation.targetWorkspaceId
      )
        throw new CommandError('STALE_TARGET', 'Target Session selection was superseded')
      operation.navigationFence = current
      if (isDisposed() || signal.aborted) throw new CommandError('CANCELLED', 'Workspace move was cancelled')
      return value
    }
    requireCurrent(operation, signal, 'target')
    return value
  }

  async function assertSourceEligibility(operation: Operation, signal: AbortSignal): Promise<void> {
    requireCurrent(operation, signal)
    if (!options.available)
      throw new CommandError('CAPABILITY_UNAVAILABLE', 'Workspace move is unavailable in this Runtime')
    if (operation.sourceWorkspaceId === operation.targetWorkspaceId)
      throw new CommandError('INVALID_INPUT', 'Choose a different target Workspace')
    if (operation.sourceDraft.revision !== operation.expectedDraftRevision)
      throw new CommandError('VERSION_CONFLICT', 'The source draft changed before the move started')
    const draft = options.drafts.getSnapshot()[operation.sourceSessionId]
    if (
      draft?.status === 'submitting' ||
      draft?.status === 'unknown' ||
      draft?.attachmentTransfers.length ||
      draft?.uploading
    )
      throw new CommandError('BUSY', 'Wait for or resolve the pending Run or attachment transfer first')

    const source = sessionSchema
      .nullable()
      .parse(
        await options.directoryQueries.execute('session.get', { sessionId: operation.sourceSessionId }, { signal }),
      )
    requireCurrent(operation, signal)
    if (!source || source.id !== operation.sourceSessionId || source.workspaceId !== operation.sourceWorkspaceId)
      throw new CommandError('STALE_TARGET', 'The source Session no longer matches this move')
    if (source.archived || source.parentId !== null)
      throw new CommandError('INVALID_STATE', 'Only a live, top-level Session can move Workspaces')
    operation.sourceSessionSeq = source.seq

    const workspace = workspaceSchema
      .nullable()
      .parse(
        await options.directoryQueries.execute(
          'workspace.get',
          { workspaceId: operation.targetWorkspaceId },
          { signal },
        ),
      )
    requireCurrent(operation, signal)
    if (!workspace || workspace.id !== operation.targetWorkspaceId)
      throw new CommandError('WORKSPACE_NOT_FOUND', 'The target Workspace is unavailable')

    const timeline = await bounded(options.snapshot(operation.sourceSessionId), signal, 'Source timeline')
    requireCurrent(operation, signal)
    if (
      timeline.session.id !== operation.sourceSessionId ||
      timeline.session.workspaceId !== operation.sourceWorkspaceId ||
      timeline.session.seq !== operation.sourceSessionSeq ||
      timeline.hasOlder ||
      timeline.messages.length ||
      timeline.runs.length ||
      timeline.approvals.length ||
      timeline.userInputs.length ||
      timeline.streams.length
    )
      throw new CommandError('INVALID_STATE', 'Only a completely empty Session timeline can move')
    const projection = options.timeline.getSnapshot()
    if (
      projection.sessionId === operation.sourceSessionId &&
      (projection.messages.length ||
        projection.runs.length ||
        projection.approvals.length ||
        projection.userInputs.length ||
        Object.keys(projection.streams).length)
    )
      throw new CommandError('INVALID_STATE', 'The Session timeline has local activity that must be resolved first')

    const sourceIntentState = options.composerIntent.getSnapshot()
    const intentEntry = sourceIntentState.entries[operation.sourceSessionId]
    if (
      intentEntry &&
      (intentEntry.submission.status !== 'idle' ||
        intentEntry.submission.preparedGoalId !== null ||
        intentEntry.goalAction.status !== 'idle')
    )
      throw new CommandError('BUSY', 'Resolve the pending or prepared Goal action before moving this Session')
    const facts = await waitFor(
      options.composerIntent,
      () => {
        const current = options.composerIntent.getSnapshot().facts
        return current.sessionId === operation.sourceSessionId ? current : undefined
      },
      (value) => value.status === 'ready' || value.status === 'error',
      signal,
      'Source Host Goal state',
    )
    requireCurrent(operation, signal)
    if (facts.status !== 'ready' || !facts.snapshot)
      throw new CommandError(facts.error ?? 'RESULT_UNKNOWN', 'Confirm the Host Goal state before moving this Session')
    if (facts.snapshot.goal !== null)
      throw new CommandError('INVALID_STATE', 'Resolve the existing Host Goal before moving this Session')

    const modelReader = options.controls
    const sourceControls = await waitFor(
      modelReader,
      () => {
        const value = modelReader.getSnapshot()
        return terminalModelState(value, operation.sourceSessionId) ? value : undefined
      },
      (value) => value.sessionId === operation.sourceSessionId && terminalModelState(value, operation.sourceSessionId),
      signal,
      'Source model settings',
    )
    requireCurrent(operation, signal)
    if (!sourceControls.model)
      throw new CommandError(
        sourceControls.errors.model ?? 'CAPABILITY_UNAVAILABLE',
        'Confirm source model settings first',
      )
    if (sourceControls.model.status === 'unavailable')
      throw new CommandError('MODEL_NOT_FOUND', 'Resolve the unavailable source model before moving this Session')
    const hasSessionModel = ['session', `settings:session:${operation.sourceSessionId}`].includes(
      sourceControls.model.sources.model,
    )
    const hasSessionThinking = ['session', `settings:session:${operation.sourceSessionId}`].includes(
      sourceControls.model.sources.thinkingLevel,
    )
    operation.sourceModel = {
      modelId: hasSessionModel && sourceControls.model.status === 'configured' ? sourceControls.model.modelId : null,
      thinkingLevel:
        (hasSessionModel || hasSessionThinking) && sourceControls.model.status === 'configured'
          ? sourceControls.model.thinkingLevel
          : null,
    }

    const permission = options.permissions.getSnapshot()
    if (permission.available) {
      const entry = await waitFor(
        options.permissions,
        () => options.permissions.getSnapshot().entries[operation.sourceSessionId],
        (value) => value.status === 'idle' || value.status === 'unknown' || value.status === 'failed',
        signal,
        'Source permission settings',
      )
      requireCurrent(operation, signal)
      if (entry.status === 'unknown' || entry.writeUnknown)
        throw new CommandError('RESULT_UNKNOWN', 'Reconcile the original source permission write before moving')
      if (entry.status !== 'idle' || entry.locked)
        throw new CommandError(entry.error ?? 'BUSY', 'Resolve the source permission state before moving')
      operation.sourcePermission = entry.choice
    } else {
      const entry = permission.entries[operation.sourceSessionId]
      if (!entry)
        throw new CommandError('CAPABILITY_UNAVAILABLE', 'Source permission settings cannot be read by this Runtime')
      if (entry.status === 'unknown' || entry.writeUnknown)
        throw new CommandError('RESULT_UNKNOWN', 'Reconcile the original source permission write before moving')
      if (entry.status !== 'idle' || entry.locked)
        throw new CommandError(entry.error ?? 'BUSY', 'Resolve the source permission state before moving')
      operation.sourcePermission = entry.choice
    }
    if (operation.sourcePermission === 'allow' && !operation.confirmAllow)
      throw new CommandError('CONFIRMATION_REQUIRED', 'Confirm the source Session auto-approval setting before moving')

    const planModes = options.planModes.getSnapshot()
    if (planModes.available) {
      const entry = await waitFor(
        options.planModes,
        () => options.planModes.getSnapshot().entries[operation.sourceSessionId],
        (value) => value.status === 'ready' || value.status === 'unknown' || value.status === 'failed',
        signal,
        'Source Host Plan mode',
      )
      requireCurrent(operation, signal)
      if (entry.status === 'unknown')
        throw new CommandError('RESULT_UNKNOWN', 'Reconcile the original source Host Plan write before moving')
      if (entry.status !== 'ready' || entry.mode === null)
        throw new CommandError(entry.error ?? 'BUSY', 'Confirm the source Host Plan mode before moving')
      operation.sourcePlanMode = entry.mode
    } else operation.sourcePlanMode = 'default'

    const intent = intentEntry?.intent ?? 'default'
    if (intent === 'plan' && operation.sourcePlanMode !== 'plan')
      throw new CommandError('INVALID_STATE', 'The source Plan choice has no confirmed Host Plan mode')
    if (intent === 'goal' && operation.sourcePlanMode === 'plan')
      throw new CommandError('INVALID_STATE', 'Exit Host Plan mode before moving a local Goal intent')
    operation.sourceIntent = intent === 'plan' ? 'default' : intent

    const hasChildren = await options.hasChildSessions(operation.sourceSessionId, signal)
    requireCurrent(operation, signal)
    if (hasChildren) throw new CommandError('INVALID_STATE', 'Resolve child agent Sessions before moving this Session')

    const remapped = await remapMentions(operation, options.filesQuery, signal, requireCurrent)
    operation.targetMentions = remapped.mentions
    operation.unresolvedMentionCount = remapped.unresolved
    if (remapped.unresolved && !operation.confirmUnresolvedMentions)
      throw new CommandError(
        'UNRESOLVED_MENTIONS_CONFIRMATION_REQUIRED',
        `${remapped.unresolved} file mention(s) are unavailable in the target Workspace; confirm to keep their visible text without those pills`,
      )
    await options.assertEligible?.({
      sourceSessionId: operation.sourceSessionId,
      sourceWorkspaceId: operation.sourceWorkspaceId,
      targetWorkspaceId: operation.targetWorkspaceId,
    })
    requireCurrent(operation, signal)
    const latest = sessionSchema
      .nullable()
      .parse(
        await options.directoryQueries.execute('session.get', { sessionId: operation.sourceSessionId }, { signal }),
      )
    requireCurrent(operation, signal)
    if (!latest || latest.archived || latest.seq !== operation.sourceSessionSeq)
      throw new CommandError('VERSION_CONFLICT', 'The source Session changed during preflight; review it before moving')
  }

  async function remapMentions(
    operation: Operation,
    filesQuery: CommandExecutor | undefined,
    signal: AbortSignal,
    guard: (operation: Operation, signal: AbortSignal, selection?: 'source' | 'target') => void,
  ): Promise<{ mentions: readonly PromptMention[]; unresolved: number }> {
    if (!operation.sourceDraft.mentions.length) return { mentions: [], unresolved: 0 }
    if (!filesQuery) throw new CommandError('CAPABILITY_UNAVAILABLE', 'File lookup is required to move file mentions')
    const resolved: PromptMention[] = []
    let unresolved = 0
    for (const mention of operation.sourceDraft.mentions) {
      guard(operation, signal)
      if (mention.workspaceId !== operation.sourceWorkspaceId)
        throw new CommandError('INVALID_STATE', 'A source file mention belongs to a different Workspace')
      const path = parentPath(mention.path)
      let after: string | undefined
      let found = false
      let pageCount = 0
      const cursors = new Set<string>()
      while (!found && pageCount < MAX_FILE_PAGES) {
        const raw = await filesQuery.execute(
          'file.list',
          { workspaceId: operation.targetWorkspaceId, path, limit: 200, ...(after ? { after } : {}) },
          { signal },
        )
        guard(operation, signal)
        const page = workspaceFilePageSchema.parse(fileCommands['file.list'].output.parse(raw))
        const matches = page.items.filter((item) => item.path === mention.path && item.directory === mention.directory)
        if (matches.length > 1)
          throw new CommandError('INVALID_OUTPUT', 'Target file listing contains a duplicate mention path')
        found = matches.length === 1
        pageCount++
        if (!found && page.nextCursor) {
          if (cursors.has(page.nextCursor))
            throw new CommandError('INVALID_OUTPUT', 'Target file listing cursor repeated')
          cursors.add(page.nextCursor)
          after = page.nextCursor
        } else break
      }
      if (found) resolved.push({ ...mention, workspaceId: operation.targetWorkspaceId })
      else unresolved++
    }
    return { mentions: resolved, unresolved }
  }

  async function seedDraft(operation: Operation, signal: AbortSignal, selection: 'source' | 'target'): Promise<void> {
    const targetSessionId = operation.targetSessionId
    if (!targetSessionId) throw new CommandError('INVALID_STATE', 'The target Session has not been created')
    requireCurrent(operation, signal, selection)
    const current = options.drafts.getSnapshot()[targetSessionId]
    const mentions = operation.targetMentions ?? operation.sourceDraft.mentions
    const targetText = current?.text ?? ''
    const targetMentions = current?.mentions ?? []
    const contentMatches =
      targetText === operation.sourceDraft.text && JSON.stringify(targetMentions) === JSON.stringify(mentions)
    if (!contentMatches) {
      if (targetText || targetMentions.length)
        throw new CommandError('VERSION_CONFLICT', 'The target draft changed before its source content was copied')
      await local.execute(
        'draft.setContent',
        {
          sessionId: targetSessionId,
          text: operation.sourceDraft.text,
          mentions,
          expectedRevision: current?.revision ?? 0,
        },
        { signal },
      )
      requireCurrent(operation, signal, selection)
      const seeded = options.drafts.getSnapshot()[targetSessionId]
      if (
        !seeded ||
        seeded.text !== operation.sourceDraft.text ||
        JSON.stringify(seeded.mentions) !== JSON.stringify(mentions)
      )
        throw new CommandError('INVALID_OUTPUT', 'The target draft content was not confirmed')
    }

    const latest = options.drafts.getSnapshot()[targetSessionId]
    const attachments = operation.sourceDraft.attachments
    if (JSON.stringify(latest?.attachments ?? []) !== JSON.stringify(attachments)) {
      if ((latest?.attachments.length ?? 0) > 0)
        throw new CommandError(
          'VERSION_CONFLICT',
          'The target attachments changed before the source attachments were copied',
        )
      if (attachments.length) {
        await local.execute(
          'draft.setAttachments',
          {
            sessionId: targetSessionId,
            attachments,
            expectedRevision: latest?.revision ?? 0,
          },
          { signal },
        )
        requireCurrent(operation, signal, selection)
        const seeded = options.drafts.getSnapshot()[targetSessionId]
        if (!seeded || JSON.stringify(seeded.attachments) !== JSON.stringify(attachments))
          throw new CommandError('INVALID_OUTPUT', 'The target attachments were not confirmed')
      }
    }

    const finalDraft = options.drafts.getSnapshot()[targetSessionId]
    const workspaceContexts = operation.sourceDraft.workspaceContexts
    if (!sameWorkspaceContexts(finalDraft?.workspaceContexts ?? [], workspaceContexts)) {
      if (finalDraft?.workspaceContexts?.length)
        throw new CommandError(
          'VERSION_CONFLICT',
          'The target workspace contexts changed before source contexts were copied',
        )
      if (workspaceContexts.length) {
        await local.execute(
          'draft.setWorkspaceContexts',
          {
            sessionId: targetSessionId,
            workspaceContexts,
            expectedRevision: finalDraft?.revision ?? 0,
          },
          { signal },
        )
        requireCurrent(operation, signal, selection)
        const seeded = options.drafts.getSnapshot()[targetSessionId]
        if (!sameWorkspaceContexts(seeded?.workspaceContexts ?? [], workspaceContexts))
          throw new CommandError('INVALID_OUTPUT', 'The original workspace contexts were not confirmed')
      }
    }
  }

  async function reconcileModelWrite(
    operation: Operation,
    step: 'model' | 'thinking',
    signal: AbortSignal,
  ): Promise<void> {
    const target = operation.targetSessionId
    if (!target) throw new CommandError('INVALID_STATE', 'Target Session is missing')
    try {
      await local.execute('composerModel.reconcile', { sessionId: target }, { signal })
    } catch (error) {
      if (errorCode(error) !== 'INVALID_INPUT') throw error
    }
    requireCurrent(operation, signal, 'target')
    await local.execute('composerModel.refresh', { sessionId: target }, { signal })
    requireCurrent(operation, signal, 'target')
    const current = await waitFor(
      options.controls,
      () => {
        const value = options.controls.getSnapshot()
        return terminalModelState(value, target) ? value : undefined
      },
      (value) => value.model !== null,
      signal,
      'Reconciled target model settings',
    )
    requireCurrent(operation, signal, 'target')
    if (!current.model || current.model.status !== 'configured')
      throw new CommandError('RESULT_UNKNOWN', 'The original model write could not be confirmed')
    if (
      (operation.sourceModel?.modelId !== null && current.model.modelId !== operation.sourceModel?.modelId) ||
      (step === 'thinking' && current.model.thinkingLevel !== operation.sourceModel?.thinkingLevel)
    )
      throw new CommandError('VERSION_CONFLICT', 'The original model receipt does not match the captured settings')
    operation.steps.add(step)
    operation.writeInFlight = null
  }

  async function applyModel(operation: Operation, signal: AbortSignal): Promise<void> {
    const target = operation.targetSessionId
    const desired = operation.sourceModel
    if (!target || !desired) throw new CommandError('INVALID_STATE', 'Model settings were not captured')
    if (desired.modelId === null && desired.thinkingLevel === null) return
    requireCurrent(operation, signal, 'target')
    if (operation.writeInFlight === 'model' || operation.writeInFlight === 'thinking') {
      await reconcileModelWrite(operation, operation.writeInFlight, signal)
    }
    if (!operation.steps.has('model') && !operation.steps.has('thinking')) {
      await local.execute('composerModel.refresh', { sessionId: target }, { signal })
      requireCurrent(operation, signal, 'target')
    }
    await waitFor(
      options.controls,
      () => {
        const value = options.controls.getSnapshot()
        return terminalModelState(value, target) ? value : undefined
      },
      (value) => value.model !== null || value.errors.model !== null,
      signal,
      'Target model settings',
    )
    requireCurrent(operation, signal, 'target')
    let configuration = options.controls.getSnapshot().model
    if (!configuration || configuration.status === 'unavailable')
      throw new CommandError('MODEL_NOT_READY', 'The target model settings could not be confirmed')
    const currentBeforeModel = options.controls.getSnapshot().model
    if (!currentBeforeModel) throw new CommandError('MODEL_NOT_READY', 'Target model settings are unavailable')
    if (desired.modelId !== null && currentBeforeModel.modelId !== desired.modelId) {
      if (operation.steps.has('model'))
        throw new CommandError('VERSION_CONFLICT', 'The confirmed target model changed during this move')
      operation.writeInFlight = 'model'
      await local.execute('composerModel.selectModel', { sessionId: target, modelId: desired.modelId }, { signal })
      requireCurrent(operation, signal, 'target')
      await waitFor(
        options.controls,
        () => {
          const value = options.controls.getSnapshot()
          return value.model?.sessionId === target ? value.model : undefined
        },
        (value) => value.status === 'configured' && value.modelId === desired.modelId,
        signal,
        'Target model selection',
      )
      requireCurrent(operation, signal, 'target')
      operation.steps.add('model')
      operation.writeInFlight = null
      configuration = options.controls.getSnapshot().model
      if (!configuration) throw new CommandError('MODEL_NOT_READY', 'The target model selection was not confirmed')
    }
    if (desired.modelId === null || configuration.modelId === desired.modelId) operation.steps.add('model')
    if (desired.thinkingLevel !== null && configuration.thinkingLevel !== desired.thinkingLevel) {
      if (operation.steps.has('thinking'))
        throw new CommandError('VERSION_CONFLICT', 'The confirmed target thinking setting changed during this move')
      operation.writeInFlight = 'thinking'
      await local.execute(
        'composerModel.selectThinking',
        { sessionId: target, thinkingLevel: desired.thinkingLevel },
        { signal },
      )
      requireCurrent(operation, signal, 'target')
      await waitFor(
        options.controls,
        () => options.controls.getSnapshot().model,
        (value) => value?.sessionId === target && value.thinkingLevel === desired.thinkingLevel,
        signal,
        'Target thinking setting',
      )
      requireCurrent(operation, signal, 'target')
      operation.steps.add('thinking')
      operation.writeInFlight = null
    }
    if (configuration.thinkingLevel === desired.thinkingLevel) operation.steps.add('thinking')
  }

  async function applyPermission(operation: Operation, signal: AbortSignal): Promise<void> {
    const target = operation.targetSessionId
    const choice = operation.sourcePermission
    if (!target || choice === null) throw new CommandError('INVALID_STATE', 'Permission settings were not captured')
    requireCurrent(operation, signal, 'target')
    const entry = await waitFor(
      options.permissions,
      () => options.permissions.getSnapshot().entries[target],
      (value) => value.status === 'idle' || value.status === 'unknown' || value.status === 'failed',
      signal,
      'Target permission settings',
    )
    requireCurrent(operation, signal, 'target')
    if (entry.status === 'unknown' || entry.writeUnknown) {
      await local.execute('composerPermission.reconcile', { sessionId: target }, { signal })
      requireCurrent(operation, signal, 'target')
      const reconciled = options.permissions.getSnapshot().entries[target]
      if (!reconciled || reconciled.status !== 'idle')
        throw new CommandError('RESULT_UNKNOWN', 'Reconcile the original target permission write before continuing')
      if (operation.writeInFlight === 'permission' && reconciled.choice !== choice)
        throw new CommandError(
          'VERSION_CONFLICT',
          'The original target permission receipt does not match the captured choice',
        )
    }
    const current = options.permissions.getSnapshot().entries[target]
    if (!current || current.status !== 'idle' || current.locked)
      throw new CommandError(current?.error ?? 'BUSY', 'Target permission settings are not ready')
    if (current.choice === choice) {
      operation.steps.add('permission')
      operation.writeInFlight = null
      return
    }
    if (!options.permissions.getSnapshot().available)
      throw new CommandError('CAPABILITY_UNAVAILABLE', 'Target permission settings are unavailable')
    if (operation.writeInFlight === 'permission')
      throw new CommandError('RESULT_UNKNOWN', 'Reconcile the original target permission write before continuing')
    operation.writeInFlight = 'permission'
    await local.execute(
      'composerPermission.setChoice',
      {
        sessionId: target,
        choice,
        expectedRevision: current.revision,
        ...(choice === 'allow' ? { confirmAllow: true } : {}),
      },
      { signal },
    )
    requireCurrent(operation, signal, 'target')
    const confirmed = await waitFor(
      options.permissions,
      () => options.permissions.getSnapshot().entries[target],
      (value) => value.status === 'idle' || value.status === 'unknown' || value.status === 'failed',
      signal,
      'Target permission confirmation',
    )
    requireCurrent(operation, signal, 'target')
    if (confirmed.status !== 'idle' || confirmed.choice !== choice)
      throw new CommandError(confirmed.error ?? 'RESULT_UNKNOWN', 'The target permission choice was not confirmed')
    operation.steps.add('permission')
    operation.writeInFlight = null
  }

  async function applyPlanMode(operation: Operation, signal: AbortSignal): Promise<void> {
    const target = operation.targetSessionId
    const mode = operation.sourcePlanMode
    if (!target || mode === null) throw new CommandError('INVALID_STATE', 'Host Plan mode was not captured')
    if (!options.planModes.getSnapshot().available) {
      if (mode === 'plan') throw new CommandError('CAPABILITY_UNAVAILABLE', 'Target Host Plan mode is unavailable')
      return
    }
    requireCurrent(operation, signal, 'target')
    const entry = await waitFor(
      options.planModes,
      () => options.planModes.getSnapshot().entries[target],
      (value) => value.status === 'ready' || value.status === 'unknown' || value.status === 'failed',
      signal,
      'Target Host Plan mode',
    )
    requireCurrent(operation, signal, 'target')
    if (entry.status === 'unknown') {
      await local.execute('composerPlanMode.reconcile', { sessionId: target }, { signal })
      requireCurrent(operation, signal, 'target')
      const reconciled = options.planModes.getSnapshot().entries[target]
      if (!reconciled || reconciled.status !== 'ready')
        throw new CommandError('RESULT_UNKNOWN', 'Reconcile the original target Host Plan write before continuing')
      if (operation.writeInFlight === 'planMode' && reconciled.mode !== mode)
        throw new CommandError('VERSION_CONFLICT', 'The original Host Plan receipt does not match the captured mode')
    }
    const current = options.planModes.getSnapshot().entries[target]
    if (!current || current.status !== 'ready' || current.mode === null)
      throw new CommandError(current?.error ?? 'BUSY', 'Target Host Plan mode is not ready')
    if (current.mode === mode) {
      operation.steps.add('planMode')
      operation.writeInFlight = null
      return
    }
    if (operation.writeInFlight === 'planMode')
      throw new CommandError('RESULT_UNKNOWN', 'Reconcile the original Host Plan write before continuing')
    operation.writeInFlight = 'planMode'
    await local.execute(
      'composerPlanMode.setMode',
      { sessionId: target, mode, expectedRevision: current.revision },
      { signal },
    )
    requireCurrent(operation, signal, 'target')
    const confirmed = await waitFor(
      options.planModes,
      () => options.planModes.getSnapshot().entries[target],
      (value) => value.status === 'ready' || value.status === 'unknown' || value.status === 'failed',
      signal,
      'Target Host Plan confirmation',
    )
    requireCurrent(operation, signal, 'target')
    if (confirmed.status !== 'ready' || confirmed.mode !== mode)
      throw new CommandError(confirmed.error ?? 'RESULT_UNKNOWN', 'The target Host Plan mode was not confirmed')
    operation.steps.add('planMode')
    operation.writeInFlight = null
  }

  async function applyIntent(operation: Operation, signal: AbortSignal): Promise<void> {
    const target = operation.targetSessionId
    const intent = operation.sourceIntent
    if (!target || intent === null) throw new CommandError('INVALID_STATE', 'Composer intent was not captured')
    if (intent === 'goal' && operation.sourcePlanMode === 'plan')
      throw new CommandError('INVALID_STATE', 'Host Plan and local Goal intent cannot be active together')
    requireCurrent(operation, signal, 'target')
    const current = options.composerIntent.getSnapshot().entries[target]
    if (current?.intent === intent) {
      operation.steps.add('intent')
      operation.writeInFlight = null
      return
    }
    if (operation.writeInFlight === 'intent')
      throw new CommandError('VERSION_CONFLICT', 'Target composer intent changed before confirmation')
    operation.writeInFlight = 'intent'
    await local.execute(
      'composerIntent.setIntent',
      { sessionId: target, intent, expectedRevision: current?.revision ?? 0 },
      { signal },
    )
    requireCurrent(operation, signal, 'target')
    if (options.composerIntent.getSnapshot().entries[target]?.intent !== intent)
      throw new CommandError('INVALID_OUTPUT', 'The target composer intent was not confirmed')
    operation.steps.add('intent')
    operation.writeInFlight = null
  }

  async function assertNewSession(operation: Operation, signal: AbortSignal): Promise<void> {
    const targetSessionId = operation.targetSessionId
    if (!targetSessionId) return
    const result = sessionSchema
      .nullable()
      .parse(await options.directoryQueries.execute('session.get', { sessionId: targetSessionId }, { signal }))
    requireCurrent(operation, signal, operation.navigationFence.sessionId === targetSessionId ? 'target' : 'source')
    if (
      !result ||
      result.id !== targetSessionId ||
      result.workspaceId !== operation.targetWorkspaceId ||
      result.archived
    )
      throw new CommandError('STALE_TARGET', 'The created target Session changed before its move completed')
  }

  async function advance(operation: Operation, signal: AbortSignal): Promise<void> {
    publish(operation, 'busy', operation.targetSessionId ? operation.entry.phase : 'preflight')
    await assertNewSession(operation, signal)
    if (!operation.targetSessionId) {
      await assertSourceEligibility(operation, signal)
      requireCurrent(operation, signal)
      operation.createAttempted = true
      publish(operation, 'busy', 'create')
      const created = sessionSchema.parse(
        await options.createSession(operation.targetWorkspaceId, undefined, {
          idempotencyKey: operation.createKey,
          signal,
        }),
      )
      if (created.workspaceId !== operation.targetWorkspaceId || created.archived)
        throw new CommandError('INVALID_OUTPUT', 'Created Session does not match the target Workspace')
      operation.targetSessionId = created.id
      if (options.navigation.getSnapshot() !== operation.navigationFence)
        throw new CommandError('STALE_TARGET', 'Navigation changed while creating the target Session')
      publish(operation, 'busy', 'seed-draft')
    }

    requireCurrent(
      operation,
      signal,
      operation.navigationFence.sessionId === operation.sourceSessionId ? 'source' : 'target',
    )
    if (operation.navigationFence.sessionId === operation.sourceSessionId) await seedDraft(operation, signal, 'source')
    if (operation.navigationFence.sessionId === operation.sourceSessionId) {
      requireCurrent(operation, signal)
      publish(operation, 'busy', 'select-target')
      await command(
        'app.setSession',
        { sessionId: operation.targetSessionId, workspaceId: operation.targetWorkspaceId },
        operation,
        signal,
      )
    }

    requireCurrent(operation, signal, 'target')
    await seedDraft(operation, signal, 'target')
    publish(operation, 'busy', 'settings')
    await applyModel(operation, signal)
    await applyPermission(operation, signal)
    await applyPlanMode(operation, signal)
    await applyIntent(operation, signal)
    requireCurrent(operation, signal, 'target')

    if (!operation.tabReplaced) {
      publish(operation, 'busy', 'replace-tab')
      if (!operation.targetSessionId) throw new CommandError('INVALID_STATE', 'Target Session is missing')
      options.tabs.finishReplacement(operation.sourceTab, operation.targetSessionId)
      operation.tabReplaced = true
    }
    requireCurrent(operation, signal, 'target')
    publish(operation, 'busy', 'archive-source')
    const source = sessionSchema
      .nullable()
      .parse(
        await options.directoryQueries.execute('session.get', { sessionId: operation.sourceSessionId }, { signal }),
      )
    requireCurrent(operation, signal, 'target')
    if (!source || source.id !== operation.sourceSessionId || source.workspaceId !== operation.sourceWorkspaceId)
      throw new CommandError('STALE_TARGET', 'The source Session changed before it could be archived')
    if (source.archived) operation.archiveConfirmed = true
    if (!operation.archiveConfirmed) {
      operation.archiveAttempted = true
      const archived = sessionSchema.parse(
        await options.archiveSession(operation.sourceSessionId, true, {
          idempotencyKey: operation.archiveKey,
          signal,
        }),
      )
      if (
        archived.id !== operation.sourceSessionId ||
        archived.workspaceId !== operation.sourceWorkspaceId ||
        !archived.archived
      )
        throw new CommandError('INVALID_OUTPUT', 'The source Session archive was not confirmed')
      operation.archiveConfirmed = true
    }
    if (options.navigation.getSnapshot() !== operation.navigationFence)
      throw new CommandError('STALE_TARGET', 'Navigation changed while archiving the source Session')
    requireCurrent(operation, signal, 'target')
    await options.releaseSourceChoices?.(operation.sourceSessionId, signal)
    requireCurrent(operation, signal, 'target')
    publish(operation, 'succeeded', 'complete')
  }

  async function run(operation: Operation, executionSignal: AbortSignal): Promise<SessionWorkspaceMoveEntry> {
    if (operation.running) throw new CommandError('BUSY', 'This Session workspace move is already in progress')
    const navigation = options.navigation.getSnapshot()
    if (
      navigation.status !== 'idle' ||
      !(
        (navigation.sessionId === operation.sourceSessionId &&
          navigation.workspaceId === operation.sourceWorkspaceId) ||
        (operation.targetSessionId !== null &&
          navigation.sessionId === operation.targetSessionId &&
          navigation.workspaceId === operation.targetWorkspaceId)
      )
    )
      throw new CommandError('STALE_TARGET', 'Select the source or target Session before continuing')
    operation.navigationFence = navigation
    operation.cancelRequested = false
    operation.running = true
    const controller = new AbortController()
    operation.controller = controller
    const cancel = () => controller.abort()
    executionSignal.addEventListener('abort', cancel, { once: true })
    if (executionSignal.aborted) cancel()
    try {
      await advance(operation, controller.signal)
    } catch (error) {
      const code = errorCode(error)
      const cancelled = operation.cancelRequested || code === 'CANCELLED' || controller.signal.aborted
      const paused = code === 'STALE_TARGET' || code === 'NAVIGATION_SUPERSEDED'
      const uncertain =
        !cancelled &&
        !paused &&
        [
          'RESULT_UNKNOWN',
          'DISCONNECTED',
          'CONNECTION_CLOSED',
          'TIMEOUT',
          'TIMED_OUT',
          'INVALID_OUTPUT',
          'EXECUTION_FAILED',
        ].includes(code) &&
        ((operation.createAttempted && !operation.targetSessionId) ||
          (operation.archiveAttempted && !operation.archiveConfirmed) ||
          operation.writeInFlight !== null)
      publish(
        operation,
        cancelled ? 'cancelled' : paused ? 'paused' : uncertain ? 'unknown' : 'failed',
        cancelled ? 'cancelled' : operation.entry.phase,
        code,
      )
    } finally {
      operation.running = false
      operation.controller = null
      executionSignal.removeEventListener('abort', cancel)
    }
    return operation.entry
  }

  local.register(sessionWorkspaceMoveCommands['sessionWorkspaceMove.move'], async (input, context) => {
    if (!options.available)
      throw new CommandError('CAPABILITY_UNAVAILABLE', 'Workspace move is unavailable in this Runtime')
    const existing = operations.get(input.sessionId)
    if (existing) {
      if (
        existing.running ||
        existing.targetSessionId !== null ||
        existing.createAttempted ||
        !['failed', 'cancelled'].includes(existing.entry.status)
      )
        throw new CommandError('BUSY', 'Continue or cancel the existing workspace move first')
      operations.delete(input.sessionId)
    }
    if (operations.size >= MAX_OPERATIONS) {
      const finished = [...operations.values()].find(
        (item) =>
          item.entry.status === 'succeeded' ||
          (!item.targetSessionId && !item.createAttempted && ['failed', 'cancelled'].includes(item.entry.status)),
      )
      if (!finished) throw new CommandError('BUSY', 'Too many pending workspace moves')
      operations.delete(finished.sourceSessionId)
      const entries = { ...state.reader.getSnapshot().entries }
      delete entries[finished.sourceSessionId]
      state.replace({ ...state.reader.getSnapshot(), entries })
    }
    const currentNavigation = options.navigation.getSnapshot()
    if (
      currentNavigation.status !== 'idle' ||
      currentNavigation.sessionId !== input.sessionId ||
      currentNavigation.workspaceId !== input.workspaceId
    )
      throw new CommandError('STALE_TARGET', 'The move must start from its selected source Session')
    const sourceDraft = captureDraft(options.drafts, input.sessionId)
    const capturedTabs = options.tabs.capture([input.sessionId])
    if (capturedTabs.length !== 1 || capturedTabs[0]?.sessionId !== input.sessionId)
      throw new CommandError('STALE_TARGET', 'The source Session tab is no longer open')
    const operation: Operation = {
      sourceSessionId: input.sessionId,
      sourceWorkspaceId: input.workspaceId,
      targetWorkspaceId: input.targetWorkspaceId,
      expectedDraftRevision: input.expectedDraftRevision,
      confirmAllow: input.confirmAllow === true,
      confirmUnresolvedMentions: input.confirmUnresolvedMentions === true,
      createKey: crypto.randomUUID(),
      archiveKey: crypto.randomUUID(),
      navigationFence: currentNavigation,
      sourceTab: capturedTabs[0],
      sourceDraft,
      sourceSessionSeq: null,
      targetMentions: null,
      unresolvedMentionCount: 0,
      sourceModel: null,
      sourcePermission: null,
      sourcePlanMode: null,
      sourceIntent: null,
      targetSessionId: null,
      createAttempted: false,
      archiveAttempted: false,
      archiveConfirmed: false,
      tabReplaced: false,
      steps: new Set(),
      writeInFlight: null,
      running: false,
      cancelRequested: false,
      controller: null,
      entry: {
        sourceSessionId: input.sessionId,
        sourceWorkspaceId: input.workspaceId,
        targetWorkspaceId: input.targetWorkspaceId,
        targetSessionId: null,
        status: 'busy',
        phase: 'preflight',
        error: null,
        unresolvedMentionCount: 0,
      },
    }
    operations.set(operation.sourceSessionId, operation)
    return commandResult(await run(operation, context.signal))
  })
  local.register(sessionWorkspaceMoveCommands['sessionWorkspaceMove.continue'], async ({ sessionId }, context) => {
    const operation = operations.get(sessionId)
    if (!operation) throw new CommandError('INVALID_INPUT', 'There is no workspace move to continue')
    if (operation.entry.status === 'succeeded') return commandResult(operation.entry)
    return commandResult(await run(operation, context.signal))
  })
  local.register(sessionWorkspaceMoveCommands['sessionWorkspaceMove.cancel'], ({ sessionId }) => {
    const operation = operations.get(sessionId)
    if (!operation) throw new CommandError('INVALID_INPUT', 'There is no workspace move to cancel')
    if (operation.entry.status === 'succeeded')
      throw new CommandError('INVALID_STATE', 'The workspace move already completed')
    operation.cancelRequested = true
    operation.controller?.abort()
    publish(operation, 'cancelled', 'cancelled', 'CANCELLED')
    return commandResult(operation.entry)
  })

  return {
    reader: state.reader,
    dispose() {
      if (disposed) return
      disposed = true
      for (const operation of operations.values()) operation.controller?.abort()
      operations.clear()
      state.dispose()
    },
  }
}
