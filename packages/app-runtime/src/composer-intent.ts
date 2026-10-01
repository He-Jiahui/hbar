import { z } from 'zod'
import {
  CommandError,
  createCommandClient,
  defineCommand,
  type CommandRegistry,
  type ExecuteOptions,
} from '@hbar/commands'
import { idSchema, MAX_GOAL_OBJECTIVE_LENGTH, thinkingLevelSchema } from '@hbar/contracts'
import { goalPlanCommands, goalPlanSnapshotSchema, type GoalPlanSnapshot } from '@hbar/contracts/commands/goals'
import {
  runAcceptedSchema,
  submitRunInputSchema,
  type RunAccepted,
  type SubmitRunInput,
} from '@hbar/contracts/commands/run'
import { GoalPlanFeed } from './goal-plan-feed'
import { createState, type StateReader } from './state'
import type { GoalPlanWorkspacePort, NavigationState } from './types'
import type { ComposerPermissionSubmission, createComposerPermission } from './composer-permission'
import type { SessionExecutionPreparationPort } from './session-execution-preparation'
import type { SessionExecutionTarget } from './session-execution-access'

export type ComposerIntent = 'default' | 'goal' | 'plan'
export interface ComposerGoalReconciliation {
  readonly status: 'checking' | 'unconfirmed' | 'failed'
  readonly error: string | null
  /** Logical cancellation/timeout does not release a physical snapshot request. */
  readonly requestInFlight: boolean
  readonly operation: {
    readonly sessionId: string
    readonly expectedGoalId?: string | undefined
    readonly action: 'pause' | 'resume' | 'clear' | 'set'
    readonly objective?: string | undefined
  }
}
export interface ComposerIntentEntry {
  readonly sessionId: string
  readonly intent: ComposerIntent
  readonly revision: number
  readonly submission: {
    readonly status: 'idle' | 'submitting' | 'failed' | 'partial' | 'unknown'
    readonly phase: 'goal' | 'run' | null
    readonly error: string | null
    readonly preparedGoalId: string | null
  }
  readonly goalAction: {
    readonly status: 'idle' | 'submitting' | 'succeeded' | 'failed' | 'unknown'
    readonly error: string | null
    /** Only a current snapshot comparison, never an exact persisted mutation receipt. */
    readonly reconciliation?: ComposerGoalReconciliation
  }
}
export interface ComposerIntentState {
  readonly entries: Readonly<Record<string, ComposerIntentEntry>>
  /** The same sequenced Host facts used by GoalPlanWorkspace; never inferred from messages. */
  readonly facts: {
    readonly sessionId: string | null
    readonly status: 'idle' | 'loading' | 'ready' | 'error'
    readonly snapshot: GoalPlanSnapshot | null
    readonly error: string | null
  }
}
export interface ComposerIntentOptions {
  readonly goals?: GoalPlanWorkspacePort | undefined
  readonly preparation?: SessionExecutionPreparationPort | undefined
  readonly navigation: StateReader<NavigationState>
  readonly events?: {
    onConnection(listener: (connected: boolean) => void): () => void
  }
  /** Delegate to the existing draft module so its draft revision and receipt rules remain authoritative. */
  readonly executeRun: (name: string, input: unknown, options?: ExecuteOptions) => Promise<unknown>
  readonly serializeDraft?: (sessionId: string, revision: number, workspaceId: string, displayText: string) => string
  /** Goal objectives contain the user's text and file mentions, never appended workspace quote snapshots. */
  readonly serializeGoalObjective?: (
    sessionId: string,
    revision: number,
    workspaceId: string,
    displayText: string,
  ) => string
  readonly reconcileRun: (sessionId: string) => Promise<RunAccepted | null>
  readonly getSettledReceipt?: (sessionId: string, key: string) => RunAccepted | null
  readonly permissions?: Pick<
    ReturnType<typeof createComposerPermission>,
    'prepareComposerSubmission' | 'settleSubmission'
  > &
    Partial<Pick<ReturnType<typeof createComposerPermission>, 'refreshSession'>>
  readonly captureMode?: (sessionId: string) => 'default' | 'plan'
  readonly refreshMode?: (sessionId: string) => Promise<'default' | 'plan'>
  readonly isRunActive?: (sessionId: string) => boolean
  readonly consumeGoalSlashDraft?: (sessionId: string, revision: number, text: string) => void
  readonly onSubscriberError: (error: unknown) => void
}

const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.app-runtime',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  scope: 'session' as const,
  category: 'run.draft',
  visibility: 'internal' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as ('api' | 'palette' | 'cli' | 'tui')[],
})
const sessionInput = z.strictObject({ sessionId: idSchema })
const result = z.strictObject({ sessionId: idSchema })
const submitInput = submitRunInputSchema.extend({
  expectedDraftRevision: z.number().int().nonnegative().optional(),
  expectedIntentRevision: z.number().int().nonnegative().optional(),
  expectedPermissionRevision: z.number().int().nonnegative().optional(),
  goalTokenBudget: z.number().int().positive().optional(),
  /** Internal workflows can require the originally selected Session to remain selected until its first Run starts. */
  requireSelectedSession: z.boolean().optional(),
})
const controlInput = sessionInput.extend({
  expectedGoalId: idSchema,
  action: z.enum(['pause', 'resume', 'clear']),
})
const goalCommandInput = sessionInput.extend({
  action: z.enum(['set', 'clear']),
  objective: z.string().trim().min(1).max(MAX_GOAL_OBJECTIVE_LENGTH).optional(),
  expectedGoalId: idSchema.optional(),
})
const goalCommandResult = result.extend({ goalId: idSchema.optional() })
const goalRunInput = sessionInput.extend({
  objective: z.string().trim().min(1).max(MAX_GOAL_OBJECTIVE_LENGTH),
  expectedGoalId: idSchema,
  modelId: idSchema,
  expectedLaunchTargetRevision: z.number().int().nonnegative().safe().optional(),
  thinking: thinkingLevelSchema.optional(),
  expectedPermissionRevision: z.number().int().nonnegative().optional(),
  expectedDraftRevision: z.number().int().nonnegative(),
  draftText: z.string().min(1).max(200_000),
})
export const composerIntentCommands = {
  'composerIntent.setIntent': defineCommand(
    metadata('composerIntent.setIntent'),
    sessionInput.extend({
      intent: z.enum(['default', 'goal', 'plan']),
      expectedRevision: z.number().int().nonnegative().optional(),
    }),
    result,
  ),
  'composerIntent.submit': defineCommand(metadata('composerIntent.submit'), submitInput, runAcceptedSchema),
  'composerIntent.reconcile': defineCommand(metadata('composerIntent.reconcile'), sessionInput, result),
  'composerIntent.refresh': defineCommand(metadata('composerIntent.refresh'), sessionInput, result),
  'composerIntent.controlGoal': defineCommand(metadata('composerIntent.controlGoal'), controlInput, result),
  'composerIntent.commandGoal': defineCommand(
    metadata('composerIntent.commandGoal'),
    goalCommandInput,
    goalCommandResult,
  ),
  'composerIntent.startGoalRun': defineCommand(
    metadata('composerIntent.startGoalRun'),
    goalRunInput,
    runAcceptedSchema,
  ),
}

type Submission = {
  readonly key: string
  readonly revision: number
  readonly intent: ComposerIntent | 'goalSlash'
  readonly fingerprint: string
  readonly request: SubmitRunInput
  readonly goalObjective: string | null
  readonly tokenBudget: number | undefined
  permission: ComposerPermissionSubmission | null
  baselineGoalId: string | null
  baselineGoalSeq: number
  preparedGoalId: string | null
  phase: 'goal' | 'run'
  status: 'submitting' | 'failed' | 'partial' | 'unknown'
  readonly slashDraft?: { readonly revision: number; readonly text: string }
}
type GoalControl = z.output<typeof controlInput> | (z.output<typeof goalCommandInput> & { baselineGoalSeq: number })
const UNKNOWN_CODES = new Set([
  'RESULT_UNKNOWN',
  'TIMEOUT',
  'TIMED_OUT',
  'DISCONNECTED',
  'CONNECTION_CLOSED',
  'CANCELLED',
  'INVALID_OUTPUT',
  'EXECUTION_FAILED',
])
const MAX_ENTRIES = 100
const MAX_SNAPSHOT_READS = 32
const SNAPSHOT_READ_TIMEOUT_MS = 30_000

type SnapshotRead = {
  readonly promise: Promise<GoalPlanSnapshot>
  readonly controller: AbortController
  readonly reject: (error: unknown) => void
  readonly clearDeadline: () => void
  invalidated: boolean
  refreshAfter: boolean
}

const RECONCILIATION_CODES = new Set([
  'RESULT_UNKNOWN',
  'TIMEOUT',
  'TIMED_OUT',
  'DISCONNECTED',
  'CONNECTION_CLOSED',
  'CANCELLED',
  'INVALID_OUTPUT',
  'CAPABILITY_UNAVAILABLE',
  'STALE_TARGET',
  'BUSY',
  'GOAL_CONFLICT',
])
function reconciliationCode(error: unknown): string {
  const value = code(error)
  return RECONCILIATION_CODES.has(value) ? value : 'READ_FAILED'
}

function code(error: unknown): string {
  if (error instanceof z.ZodError) return 'INVALID_OUTPUT'
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'EXECUTION_FAILED'
}
function initial(sessionId: string): ComposerIntentEntry {
  return {
    sessionId,
    intent: 'default',
    revision: 0,
    submission: { status: 'idle', phase: null, error: null, preparedGoalId: null },
    goalAction: { status: 'idle', error: null },
  }
}

function goalDraftFingerprint(request: SubmitRunInput, tokenBudget: number | undefined): string {
  return JSON.stringify([request.input.text, request.input.images, request.input.files ?? [], tokenBudget ?? null])
}

/** A recoverable two-stage operation, not a claim that Goal creation and Run acceptance are atomic. */
export function createComposerIntent(local: CommandRegistry, options: ComposerIntentOptions) {
  let disposed = false
  let generation = 0
  let selectionGeneration = 0
  let connectionGeneration = 0
  let connected = true
  const state = createState<ComposerIntentState>(
    {
      entries: {},
      facts: { sessionId: null, status: 'idle', snapshot: null, error: null },
    },
    options.onSubscriberError,
  )
  const goals = options.goals ? createCommandClient(goalPlanCommands, options.goals) : null
  const submissions = new Map<string, Submission>()
  const preparations = new Set<string>()
  const controls = new Map<string, GoalControl>()
  const reads = new Map<string, SnapshotRead>()
  const reconciliations = new Map<string, { readonly control: GoalControl; readonly promise: Promise<void> }>()
  const entry = (sessionId: string) => state.reader.getSnapshot().entries[sessionId] ?? initial(sessionId)
  const replace = (next: ComposerIntentEntry) => {
    if (disposed) return
    const current = state.reader.getSnapshot()
    if (!current.entries[next.sessionId] && Object.keys(current.entries).length >= MAX_ENTRIES)
      throw new CommandError('BUSY', 'Too many composer drafts are open')
    state.replace({ ...current, entries: { ...current.entries, [next.sessionId]: next } })
  }
  const setSubmission = (sessionId: string, pending: Submission, error: string | null = null) =>
    replace({
      ...entry(sessionId),
      submission: {
        status: pending.status,
        phase: pending.phase,
        error,
        preparedGoalId: pending.preparedGoalId,
      },
    })
  const requireGoals = () => {
    if (!goals) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Goal commands are unavailable')
    return goals
  }
  const publishReconciliation = (
    control: GoalControl,
    status: ComposerGoalReconciliation['status'],
    error: string | null,
  ) => {
    const current = entry(control.sessionId)
    if (disposed || controls.get(control.sessionId) !== control || current.goalAction.status !== 'unknown') return
    replace({
      ...current,
      goalAction: {
        ...current.goalAction,
        reconciliation: { status, error, requestInFlight: reads.has(control.sessionId), operation: control },
      },
    })
  }
  const invalidateRead = (sessionId: string, reason = 'STALE_TARGET') => {
    const read = reads.get(sessionId)
    if (!read || read.invalidated) return
    read.invalidated = true
    read.clearDeadline()
    read.reject(new CommandError(reason, 'Goal snapshot scope changed'))
    read.controller.abort()
  }
  const snapshot = async (sessionId: string): Promise<GoalPlanSnapshot> => {
    if (disposed) throw new CommandError('DISPOSED', 'Composer intent is disposed')
    if (!connected) throw new CommandError('DISCONNECTED', 'Goal snapshot is unavailable while disconnected')
    const read = reads.get(sessionId)
    if (read) {
      if (read.invalidated) throw new CommandError('BUSY', 'The original Goal snapshot is still in flight')
      return read.promise
    }
    if (reads.size >= MAX_SNAPSHOT_READS) throw new CommandError('BUSY', 'Goal snapshot read capacity reached')
    const result = Promise.withResolvers<GoalPlanSnapshot>()
    const controller = new AbortController()
    const timer = setTimeout(() => invalidateRead(sessionId, 'TIMEOUT'), SNAPSHOT_READ_TIMEOUT_MS)
    const task: SnapshotRead = {
      promise: result.promise,
      controller,
      reject: result.reject,
      clearDeadline: () => clearTimeout(timer),
      invalidated: false,
      refreshAfter: false,
    }
    reads.set(sessionId, task)
    const physical = (async () => {
      const value = goalPlanSnapshotSchema.parse(
        options.goals?.snapshot
          ? await options.goals.snapshot(sessionId, { signal: controller.signal })
          : await requireGoals().execute('goal.snapshot', { sessionId }, { signal: controller.signal }),
      )
      if (
        value.sessionId !== sessionId ||
        (value.goal && value.goal.threadId !== sessionId) ||
        (value.plan && value.plan.sessionId !== sessionId)
      )
        throw new CommandError('INVALID_OUTPUT', 'Goal snapshot target mismatch')
      return value
    })()
    const finish = () => {
      task.clearDeadline()
      if (reads.get(sessionId) !== task) return
      reads.delete(sessionId)
      const current = entry(sessionId).goalAction.reconciliation
      const control = controls.get(sessionId)
      if (control && current) publishReconciliation(control, current.status, current.error)
      if (task.refreshAfter && !disposed && connected && options.navigation.getSnapshot().sessionId === sessionId)
        void refresh(sessionId).catch(() => {})
    }
    void physical.then(
      (value) => {
        finish()
        if (!task.invalidated) result.resolve(value)
      },
      (error: unknown) => {
        finish()
        if (!task.invalidated) result.reject(error)
      },
    )
    return result.promise
  }
  const feed = new GoalPlanFeed(
    options.goals,
    (sessionId, change) => {
      const current = state.reader.getSnapshot()
      const facts = current.facts
      if (disposed || facts.sessionId !== sessionId || !facts.snapshot) return
      const next =
        change.kind === 'goal'
          ? {
              ...facts.snapshot,
              goal: change.goal,
              goalSeq: change.seq,
              remainingTokens:
                change.goal?.tokenBudget == null ? null : Math.max(0, change.goal.tokenBudget - change.goal.tokensUsed),
            }
          : { ...facts.snapshot, plan: change.plan, planSeq: change.seq }
      state.replace({ ...current, facts: { ...facts, snapshot: next } })
    },
    (sessionId) => {
      void refresh(sessionId).catch(() => {})
    },
  )

  async function refresh(sessionId: string) {
    if (disposed) throw new CommandError('DISPOSED', 'Composer intent is disposed')
    if (options.navigation.getSnapshot().sessionId !== sessionId) return snapshot(sessionId)
    const intent = ++generation
    const current = state.reader.getSnapshot()
    state.replace({
      ...current,
      facts: {
        sessionId,
        status: 'loading',
        snapshot: current.facts.sessionId === sessionId ? current.facts.snapshot : null,
        error: null,
      },
    })
    feed.open(sessionId, sessionId)
    try {
      const value = await snapshot(sessionId)
      if (!disposed && intent === generation && options.navigation.getSnapshot().sessionId === sessionId) {
        state.replace({
          ...state.reader.getSnapshot(),
          facts: { sessionId, status: 'ready', snapshot: value, error: null },
        })
        feed.finish(sessionId, value)
      }
      return value
    } catch (error) {
      if (!disposed && intent === generation) {
        const latest = state.reader.getSnapshot()
        state.replace({ ...latest, facts: { ...latest.facts, status: 'error', error: code(error) } })
      }
      throw error
    }
  }
  const refreshSelected = (sessionId: string) => {
    invalidateRead(sessionId)
    if (options.navigation.getSnapshot().sessionId !== sessionId || !connected || disposed) return
    const active = reads.get(sessionId)
    if (active) {
      active.refreshAfter = true
      const current = state.reader.getSnapshot()
      state.replace({ ...current, facts: { sessionId, status: 'loading', snapshot: null, error: null } })
      return
    }
    void refresh(sessionId).catch(() => {})
  }
  let selectedSessionId: string | null = null
  const select = () => {
    const sessionId = options.navigation.getSnapshot().sessionId
    if (sessionId === selectedSessionId) return
    if (selectedSessionId) {
      feed.close(selectedSessionId)
      invalidateRead(selectedSessionId)
    }
    selectedSessionId = sessionId
    generation += 1
    selectionGeneration += 1
    for (const { control } of reconciliations.values()) publishReconciliation(control, 'unconfirmed', 'STALE_TARGET')
    state.replace({ ...state.reader.getSnapshot(), facts: { sessionId, status: 'idle', snapshot: null, error: null } })
    if (sessionId) refreshSelected(sessionId)
  }
  const setConnected = (value: boolean) => {
    if (disposed || connected === value) return
    connected = value
    connectionGeneration += 1
    generation += 1
    for (const sessionId of reads.keys()) invalidateRead(sessionId, 'DISCONNECTED')
    for (const { control } of reconciliations.values()) publishReconciliation(control, 'failed', 'DISCONNECTED')
    if (selectedSessionId) {
      feed.close(selectedSessionId)
      const current = state.reader.getSnapshot()
      state.replace({
        ...current,
        facts: {
          sessionId: selectedSessionId,
          status: value ? 'idle' : 'error',
          snapshot: null,
          error: value ? null : 'DISCONNECTED',
        },
      })
      if (value) refreshSelected(selectedSessionId)
    }
  }
  const offNavigation = options.navigation.subscribe(select)
  const offConnection = options.events?.onConnection(setConnected)
  select()

  const settle = (sessionId: string, pending: Submission) => {
    if (disposed || submissions.get(sessionId) !== pending) return
    const current = entry(sessionId)
    submissions.delete(sessionId)
    if (pending.permission) options.permissions?.settleSubmission(pending.permission, 'accepted')
    if (pending.intent === 'goalSlash' && pending.slashDraft)
      options.consumeGoalSlashDraft?.(sessionId, pending.slashDraft.revision, pending.slashDraft.text)
    replace({
      ...current,
      ...(pending.intent !== 'goalSlash' && current.revision === pending.revision
        ? { intent: 'default' as const, revision: current.revision + 1 }
        : {}),
      submission: initial(sessionId).submission,
    })
  }
  const abandonReplacedGoalSlash = (sessionId: string, goalId: string | undefined) => {
    const pending = submissions.get(sessionId)
    if (pending?.intent !== 'goalSlash' || pending.status !== 'partial' || pending.preparedGoalId === goalId) return
    submissions.delete(sessionId)
    replace({ ...entry(sessionId), submission: initial(sessionId).submission })
  }
  const assertFree = (sessionId: string) => {
    const current = entry(sessionId)
    const entries = state.reader.getSnapshot().entries
    if (!entries[sessionId] && Object.keys(entries).length >= MAX_ENTRIES)
      throw new CommandError('BUSY', 'Too many composer drafts are open')
    if (
      preparations.has(sessionId) ||
      controls.has(sessionId) ||
      ['submitting', 'unknown'].includes(current.submission.status)
    )
      throw new CommandError('BUSY', 'Reconcile the pending composer operation first')
  }

  local.register(
    composerIntentCommands['composerIntent.setIntent'],
    async ({ sessionId, intent, expectedRevision }, execution) => {
      assertFree(sessionId)
      if (intent === 'plan' && options.captureMode)
        throw new CommandError('INVALID_INPUT', 'Plan is a durable Host session mode, not a one-send intent')
      const current = entry(sessionId)
      if (expectedRevision !== undefined && current.revision !== expectedRevision)
        throw new CommandError('VERSION_CONFLICT', 'Composer intent changed')
      if (intent !== 'default' && options.preparation) {
        preparations.add(sessionId)
        try {
          const target = await options.preparation.capture(sessionId, execution.signal)
          options.preparation.assertCanPrepare(target)
          if (disposed || execution.signal.aborted)
            throw new CommandError('CANCELLED', 'Composer preparation was cancelled')
          if (entry(sessionId).revision !== current.revision)
            throw new CommandError('VERSION_CONFLICT', 'Composer intent changed during preparation')
        } finally {
          preparations.delete(sessionId)
        }
      }
      // Dismissing a prepared Goal chip abandons only the draft operation, never the persisted Goal.
      submissions.delete(sessionId)
      replace({ ...current, intent, revision: current.revision + 1, submission: initial(sessionId).submission })
      return { sessionId }
    },
  )

  local.register(composerIntentCommands['composerIntent.submit'], async (input, execution) => {
    const { sessionId } = input
    assertFree(sessionId)
    const priorSubmission = submissions.get(sessionId)
    if (
      priorSubmission?.status === 'partial' &&
      priorSubmission.preparedGoalId &&
      priorSubmission.intent === entry(sessionId).intent &&
      input.expectedLaunchTargetRevision !== undefined &&
      input.expectedLaunchTargetRevision !== priorSubmission.request.expectedLaunchTargetRevision
    )
      throw new CommandError('GOAL_SUBMISSION_CHANGED', 'The prepared Goal belongs to the captured launch target')
    const navigation = options.navigation.getSnapshot()
    const assertSelectedNavigation = () => {
      if (!input.requireSelectedSession) return
      const current = options.navigation.getSnapshot()
      if (current !== navigation || current.status !== 'idle' || current.sessionId !== sessionId)
        throw new CommandError('STALE_TARGET', 'The selected Session changed during Goal preparation')
    }
    if (input.requireSelectedSession && (navigation.sessionId !== sessionId || navigation.status !== 'idle'))
      throw new CommandError('STALE_TARGET', 'The Goal submission must target the selected Session')
    if (input.expectedDraftRevision !== undefined) {
      if (navigation.sessionId !== sessionId || !navigation.workspaceId || !options.serializeDraft)
        throw new CommandError('VERSION_CONFLICT', 'Composer draft target changed')
    }
    const submittedText =
      input.expectedDraftRevision === undefined
        ? input.input.text
        : options.serializeDraft!(sessionId, input.expectedDraftRevision, navigation.workspaceId!, input.input.text)
    const current = entry(sessionId)
    const submittedGoalObjective =
      current.intent !== 'goal'
        ? null
        : input.expectedDraftRevision === undefined
          ? input.input.text
          : (options.serializeGoalObjective ?? options.serializeDraft)!(
              sessionId,
              input.expectedDraftRevision,
              navigation.workspaceId!,
              input.input.text,
            )
    if (
      !state.reader.getSnapshot().entries[sessionId] &&
      Object.keys(state.reader.getSnapshot().entries).length >= MAX_ENTRIES
    )
      throw new CommandError('BUSY', 'Too many composer drafts are open')
    if (input.expectedIntentRevision !== undefined && input.expectedIntentRevision !== current.revision)
      throw new CommandError('VERSION_CONFLICT', 'Composer intent changed before submission')
    if (input.input.continuation || (input.input.source && input.input.source !== 'user'))
      throw new CommandError('INVALID_INPUT', 'Composer submissions must be direct user turns')
    preparations.add(sessionId)
    let capturedMode: 'default' | 'plan'
    let target: SessionExecutionTarget | undefined
    try {
      target = options.preparation ? await options.preparation.capture(sessionId, execution.signal) : undefined
      if (target) options.preparation?.assertCanPrepare(target)
      capturedMode = options.refreshMode
        ? await options.refreshMode(sessionId)
        : (options.captureMode?.(sessionId) ?? (current.intent === 'plan' ? 'plan' : 'default'))
      if (target) options.preparation?.assertCanPrepare(target)
      if (options.navigation.getSnapshot().sessionId !== sessionId && options.refreshMode)
        throw new CommandError('STALE_TARGET', 'Composer session changed during mode verification')
    } finally {
      preparations.delete(sessionId)
    }
    let request: SubmitRunInput = {
      sessionId,
      modelId: input.modelId,
      input: {
        ...input.input,
        text: submittedText,
        mode: capturedMode,
        source: 'user',
      },
      ...(input.expectedLaunchTargetRevision === undefined
        ? {}
        : { expectedLaunchTargetRevision: input.expectedLaunchTargetRevision }),
    }
    if (
      current.intent === 'goal' &&
      (!submittedGoalObjective?.trim() || submittedGoalObjective.trim().length > MAX_GOAL_OBJECTIVE_LENGTH)
    )
      throw new CommandError('GOAL_INVALID', 'A Goal requires a bounded non-empty objective')
    // Capture policy before Goal reads/creation and reserve this composer while the default read is pending.
    preparations.add(sessionId)
    let permission: ComposerPermissionSubmission | null = null
    try {
      if (target) options.preparation?.assertCanPrepare(target)
      if (input.expectedPermissionRevision !== undefined && !options.permissions)
        throw new CommandError('CAPABILITY_UNAVAILABLE', 'Composer approval choices are unavailable')
      permission =
        (await options.permissions?.prepareComposerSubmission(
          sessionId,
          input.expectedPermissionRevision,
          execution.signal,
        )) ?? null
      if (target) options.preparation?.assertCanPrepare(target)
      if (disposed || execution.signal.aborted)
        throw new CommandError('CANCELLED', 'Composer preparation was cancelled')
      assertSelectedNavigation()
      if (entry(sessionId).revision !== current.revision)
        throw new CommandError('VERSION_CONFLICT', 'Composer intent changed during permission preparation')
      const confirmedMode = options.refreshMode
        ? await options.refreshMode(sessionId)
        : options.captureMode?.(sessionId)
      if (target) options.preparation?.assertCanPrepare(target)
      assertSelectedNavigation()
      if (disposed || execution.signal.aborted)
        throw new CommandError('CANCELLED', 'Composer preparation was cancelled')
      if (entry(sessionId).revision !== current.revision)
        throw new CommandError('VERSION_CONFLICT', 'Composer intent changed during mode verification')
      if (confirmedMode !== undefined && confirmedMode !== capturedMode)
        throw new CommandError('VERSION_CONFLICT', 'Host session mode changed during submission preparation')
      if (permission) {
        if (request.input.approval !== undefined && request.input.approval !== permission.approval)
          throw new CommandError('INVALID_INPUT', 'Run approval conflicts with the captured composer choice')
        request = { ...request, input: { ...request.input, approval: permission.approval } }
      }
    } catch (error) {
      if (permission) options.permissions?.settleSubmission(permission, 'failed', code(error))
      throw error
    } finally {
      preparations.delete(sessionId)
    }
    let pending = submissions.get(sessionId)
    if (
      pending?.status === 'partial' &&
      pending.preparedGoalId &&
      pending.intent === current.intent &&
      pending.request.expectedLaunchTargetRevision !== undefined &&
      request.expectedLaunchTargetRevision === undefined
    )
      request = { ...request, expectedLaunchTargetRevision: pending.request.expectedLaunchTargetRevision }
    const fingerprint = JSON.stringify([request, input.goalTokenBudget ?? null])
    if (pending && (pending.fingerprint !== fingerprint || pending.intent !== current.intent)) {
      if (
        pending.status === 'partial' &&
        pending.preparedGoalId &&
        pending.intent === current.intent &&
        goalDraftFingerprint(pending.request, pending.tokenBudget) ===
          goalDraftFingerprint(request, input.goalTokenBudget)
      ) {
        // A confirmed Run rejection may be repaired by choosing a working model
        // or effort. Changed Run input needs a fresh key, but never another Goal.
        pending = { ...pending, key: crypto.randomUUID(), fingerprint, request }
        submissions.set(sessionId, pending)
      } else {
        if (permission) options.permissions?.settleSubmission(permission, 'failed', 'GOAL_SUBMISSION_CHANGED')
        throw new CommandError(
          'GOAL_SUBMISSION_CHANGED',
          'The prepared Goal belongs to the original draft; cancel its draft intent before changing it',
        )
      }
    }
    if (!pending) {
      pending = {
        key: execution.idempotencyKey ?? crypto.randomUUID(),
        revision: current.revision,
        intent: current.intent,
        fingerprint,
        request,
        goalObjective: submittedGoalObjective?.trim() ?? null,
        tokenBudget: input.goalTokenBudget,
        permission,
        baselineGoalId: null,
        baselineGoalSeq: -1,
        preparedGoalId: null,
        phase: current.intent === 'goal' ? 'goal' : 'run',
        status: 'submitting',
      }
      submissions.set(sessionId, pending)
    }
    pending.permission = permission
    pending.status = 'submitting'
    setSubmission(sessionId, pending)
    let writeStarted = false
    try {
      if (pending.intent === 'goal') {
        const before = await snapshot(sessionId)
        assertSelectedNavigation()
        if (target) options.preparation?.assertCanPrepare(target)
        if (pending.preparedGoalId) {
          if (before.goal?.goalId !== pending.preparedGoalId || before.goal.status !== 'active')
            throw new CommandError('GOAL_CONFLICT', 'The prepared Goal changed before its Run was submitted')
        } else {
          if (before.goal && before.goal.status !== 'complete')
            throw new CommandError('GOAL_EXISTS', 'An unfinished Goal already exists')
          pending.baselineGoalId = before.goal?.goalId ?? null
          pending.baselineGoalSeq = before.goalSeq
          if (target) options.preparation?.assertCanPrepare(target)
          writeStarted = true
          const created = await requireGoals().execute('goal.create', {
            sessionId,
            objective: pending.goalObjective ?? request.input.text.trim(),
            ...(pending.tokenBudget === undefined ? {} : { tokenBudget: pending.tokenBudget }),
          })
          if (
            !created.goal?.goalId ||
            created.goal.threadId !== sessionId ||
            created.goal.objective !== (pending.goalObjective ?? request.input.text.trim()) ||
            created.goal.status !== 'active'
          )
            throw new CommandError('INVALID_OUTPUT', 'Created Goal has no matching identity')
          pending.preparedGoalId = created.goal.goalId
          pending.phase = 'run'
          writeStarted = false
          setSubmission(sessionId, pending)
          refreshSelected(sessionId)
        }
      }
      assertSelectedNavigation()
      if (disposed || execution.signal.aborted) throw new CommandError('CANCELLED', 'Composer submission was cancelled')
      pending.phase = 'run'
      if (target) options.preparation?.assertCanPrepare(target)
      writeStarted = true
      const accepted = runAcceptedSchema.parse(
        await options.executeRun('run.submit', pending.request, { ...execution, idempotencyKey: pending.key }),
      )
      if (accepted.sessionId !== sessionId || accepted.idempotencyKey !== pending.key)
        throw new CommandError('INVALID_OUTPUT', 'Run receipt target mismatch')
      settle(sessionId, pending)
      return accepted
    } catch (error) {
      // executeRun delegates to Drafts, whose transport contract represents uncertain
      // Run acceptance as RESULT_UNKNOWN. Do not invent a second receipt owner.
      const unknown =
        writeStarted &&
        (pending.phase === 'goal'
          ? UNKNOWN_CODES.has(code(error))
          : code(error) === 'RESULT_UNKNOWN' || code(error) === 'INVALID_OUTPUT')
      pending.status = unknown ? 'unknown' : pending.preparedGoalId ? 'partial' : 'failed'
      if (pending.permission)
        options.permissions?.settleSubmission(pending.permission, unknown ? 'unknown' : 'failed', code(error))
      setSubmission(sessionId, pending, code(error))
      if (!unknown && !pending.preparedGoalId) submissions.delete(sessionId)
      throw error
    }
  })

  local.register(composerIntentCommands['composerIntent.refresh'], async ({ sessionId }) => {
    await refresh(sessionId)
    return { sessionId }
  })
  local.register(composerIntentCommands['composerIntent.controlGoal'], async (input, execution) => {
    const { sessionId } = input
    if (disposed) throw new CommandError('DISPOSED', 'Composer intent is disposed')
    if (!connected) throw new CommandError('DISCONNECTED', 'Goal control is unavailable while disconnected')
    assertFree(sessionId)
    controls.set(sessionId, input)
    replace({ ...entry(sessionId), goalAction: { status: 'submitting', error: null } })
    let dispatched = false
    try {
      const client = requireGoals()
      if (input.action === 'resume' && options.preparation) {
        const target = await options.preparation.capture(sessionId, execution.signal)
        options.preparation.assertCanPrepare(target)
        if (disposed || execution.signal.aborted) throw new CommandError('CANCELLED', 'Goal preparation was cancelled')
      }
      invalidateRead(sessionId)
      dispatched = true
      if (input.action === 'clear')
        await client.execute('goal.clear', { sessionId, expectedGoalId: input.expectedGoalId })
      else
        await client.execute('goal.set', {
          sessionId,
          expectedGoalId: input.expectedGoalId,
          status: input.action === 'pause' ? 'paused' : 'active',
        })
      controls.delete(sessionId)
      replace({ ...entry(sessionId), goalAction: { status: 'succeeded', error: null } })
      refreshSelected(sessionId)
    } catch (error) {
      const unknown = dispatched && UNKNOWN_CODES.has(code(error))
      if (!unknown) controls.delete(sessionId)
      replace({ ...entry(sessionId), goalAction: { status: unknown ? 'unknown' : 'failed', error: code(error) } })
      throw error
    }
    return { sessionId }
  })

  local.register(composerIntentCommands['composerIntent.commandGoal'], async (input, execution) => {
    const { sessionId } = input
    if (disposed) throw new CommandError('DISPOSED', 'Composer intent is disposed')
    if (!connected) throw new CommandError('DISCONNECTED', 'Goal command is unavailable while disconnected')
    if (options.navigation.getSnapshot().sessionId !== sessionId)
      throw new CommandError('STALE_TARGET', 'Goal command target changed')
    const capturedNavigation = options.navigation.getSnapshot()
    const capturedSelection = selectionGeneration
    if (input.action === 'set' && !input.objective)
      throw new CommandError('GOAL_INVALID', 'A Goal requires a bounded non-empty objective')
    if (input.action === 'clear' && input.objective !== undefined)
      throw new CommandError('INVALID_INPUT', 'Clear does not accept an objective')
    assertFree(sessionId)
    if (submissions.get(sessionId)?.status === 'partial' && submissions.get(sessionId)?.intent !== 'goalSlash')
      throw new CommandError('GOAL_SUBMISSION_CHANGED', 'Resolve the prepared Goal draft before using a slash command')
    const control: GoalControl = { ...input, baselineGoalSeq: -1 }
    controls.set(sessionId, control)
    replace({ ...entry(sessionId), goalAction: { status: 'submitting', error: null } })
    let dispatched = false
    try {
      const target = await options.preparation?.capture(sessionId, execution.signal)
      if (target) options.preparation?.assertCanPrepare(target)
      // Plan permits Goal lifecycle changes, but unknown execution mode still fences writes.
      if (options.refreshMode) await options.refreshMode(sessionId)
      if (target) options.preparation?.assertCanPrepare(target)
      const before = await snapshot(sessionId)
      const selected = options.navigation.getSnapshot()
      if (
        disposed ||
        execution.signal.aborted ||
        capturedSelection !== selectionGeneration ||
        selected.sessionId !== sessionId ||
        selected.workspaceId !== capturedNavigation.workspaceId
      )
        throw new CommandError('STALE_TARGET', 'Goal command target changed before dispatch')
      if (options.isRunActive?.(sessionId))
        throw new CommandError('RUN_ACTIVE', 'Wait for the current Run before changing its Goal')
      if (before.goal && before.goal.status !== 'complete' && before.goal.goalId !== input.expectedGoalId)
        throw new CommandError('GOAL_CONFLICT', 'Confirm the current Goal before changing it')
      if (input.expectedGoalId && before.goal?.goalId !== input.expectedGoalId)
        throw new CommandError('GOAL_CONFLICT', 'The confirmed Goal changed')
      control.baselineGoalSeq = before.goalSeq
      if (input.action === 'set' && before.goal?.status === 'active' && before.goal.objective === input.objective) {
        controls.delete(sessionId)
        replace({ ...entry(sessionId), goalAction: { status: 'succeeded', error: null } })
        return { sessionId, goalId: before.goal.goalId }
      }
      if (input.action === 'clear' && !before.goal) {
        controls.delete(sessionId)
        abandonReplacedGoalSlash(sessionId, undefined)
        replace({ ...entry(sessionId), goalAction: { status: 'succeeded', error: null } })
        return { sessionId }
      }
      invalidateRead(sessionId)
      dispatched = true
      let goalId: string | undefined
      if (input.action === 'clear') {
        const cleared = await requireGoals().execute('goal.clear', { sessionId, expectedGoalId: input.expectedGoalId })
        if (!cleared.cleared) throw new CommandError('INVALID_OUTPUT', 'Goal clear was not confirmed')
      } else if (before.goal && before.goal.status !== 'complete') {
        const changed = await requireGoals().execute('goal.set', {
          sessionId,
          objective: input.objective,
          expectedGoalId: before.goal.goalId,
          status: 'active',
        })
        const replacing = before.goal.objective !== input.objective
        if (
          changed.goal?.threadId !== sessionId ||
          changed.goal.objective !== input.objective ||
          changed.goal.status !== 'active' ||
          (replacing ? changed.goal.goalId === before.goal.goalId : changed.goal.goalId !== before.goal.goalId)
        )
          throw new CommandError('INVALID_OUTPUT', 'Goal update response did not match the request')
        goalId = changed.goal.goalId
      } else {
        const created = await requireGoals().execute('goal.create', { sessionId, objective: input.objective! })
        if (
          created.goal?.threadId !== sessionId ||
          created.goal.objective !== input.objective ||
          created.goal.status !== 'active' ||
          created.goal.goalId === before.goal?.goalId
        )
          throw new CommandError('INVALID_OUTPUT', 'Goal creation response did not match the request')
        goalId = created.goal.goalId
      }
      controls.delete(sessionId)
      abandonReplacedGoalSlash(sessionId, goalId)
      replace({ ...entry(sessionId), goalAction: { status: 'succeeded', error: null } })
      refreshSelected(sessionId)
      return { sessionId, ...(goalId ? { goalId } : {}) }
    } catch (error) {
      const unknown = dispatched && UNKNOWN_CODES.has(code(error))
      if (!unknown) controls.delete(sessionId)
      replace({ ...entry(sessionId), goalAction: { status: unknown ? 'unknown' : 'failed', error: code(error) } })
      throw error
    }
  })

  local.register(composerIntentCommands['composerIntent.startGoalRun'], async (input, execution) => {
    const { sessionId } = input
    if (disposed) throw new CommandError('DISPOSED', 'Composer intent is disposed')
    if (!connected) throw new CommandError('DISCONNECTED', 'Goal execution is unavailable while disconnected')
    assertFree(sessionId)
    const selected = options.navigation.getSnapshot()
    if (selected.sessionId !== sessionId || !selected.workspaceId || !options.serializeDraft)
      throw new CommandError('STALE_TARGET', 'Goal command draft target changed')
    if (
      options.serializeDraft(sessionId, input.expectedDraftRevision, selected.workspaceId, input.draftText) !==
      input.draftText
    )
      throw new CommandError('VERSION_CONFLICT', 'Goal command draft changed')
    const previous = submissions.get(sessionId)
    if (previous?.status === 'partial' && previous.intent !== 'goalSlash')
      throw new CommandError('GOAL_SUBMISSION_CHANGED', 'Resolve the prepared Goal draft before starting another Run')
    if (
      previous?.intent === 'goalSlash' &&
      (previous.preparedGoalId !== input.expectedGoalId ||
        previous.slashDraft?.revision !== input.expectedDraftRevision ||
        previous.slashDraft.text !== input.draftText ||
        (input.expectedLaunchTargetRevision !== undefined &&
          previous.request.expectedLaunchTargetRevision !== input.expectedLaunchTargetRevision))
    )
      throw new CommandError('GOAL_SUBMISSION_CHANGED', 'Repair the original Goal command before starting another')
    preparations.add(sessionId)
    let permission: ComposerPermissionSubmission | null = null
    let pending: Submission | null = null
    let dispatched = false
    try {
      const target = await options.preparation?.capture(sessionId, execution.signal)
      if (target) options.preparation?.assertCanPrepare(target)
      const mode = options.refreshMode
        ? await options.refreshMode(sessionId)
        : (options.captureMode?.(sessionId) ?? 'default')
      if (input.expectedPermissionRevision !== undefined && !options.permissions)
        throw new CommandError('CAPABILITY_UNAVAILABLE', 'Composer approval choices are unavailable')
      permission =
        (await options.permissions?.prepareComposerSubmission(
          sessionId,
          input.expectedPermissionRevision,
          execution.signal,
        )) ?? null
      if (target) options.preparation?.assertCanPrepare(target)
      if (
        disposed ||
        execution.signal.aborted ||
        options.navigation.getSnapshot().sessionId !== sessionId ||
        options.navigation.getSnapshot().workspaceId !== selected.workspaceId
      )
        throw new CommandError('STALE_TARGET', 'Goal execution target changed during preparation')
      if (options.isRunActive?.(sessionId)) throw new CommandError('RUN_ACTIVE', 'Wait for the current Run')
      const facts = await snapshot(sessionId)
      if (
        facts.goal?.goalId !== input.expectedGoalId ||
        facts.goal.objective !== input.objective ||
        facts.goal.status !== 'active'
      )
        throw new CommandError('GOAL_CONFLICT', 'The confirmed Goal changed before execution')
      if (target) options.preparation?.assertCanPrepare(target)
      const expectedLaunchTargetRevision =
        previous?.status === 'partial' && previous.intent === 'goalSlash'
          ? previous.request.expectedLaunchTargetRevision
          : input.expectedLaunchTargetRevision
      const confirmedMode = options.refreshMode
        ? await options.refreshMode(sessionId)
        : (options.captureMode?.(sessionId) ?? mode)
      if (confirmedMode !== mode) throw new CommandError('VERSION_CONFLICT', 'Host mode changed before Goal execution')
      if (target) options.preparation?.assertCanPrepare(target)
      if (
        disposed ||
        execution.signal.aborted ||
        options.navigation.getSnapshot().sessionId !== sessionId ||
        options.navigation.getSnapshot().workspaceId !== selected.workspaceId
      )
        throw new CommandError('STALE_TARGET', 'Goal execution target changed during mode verification')
      const request: SubmitRunInput = {
        sessionId,
        modelId: input.modelId,
        input: {
          text: input.objective,
          images: [],
          files: [],
          source: 'user',
          mode,
          ...(input.thinking ? { thinking: input.thinking } : {}),
          ...(permission ? { approval: permission.approval } : {}),
        },
        ...(expectedLaunchTargetRevision === undefined ? {} : { expectedLaunchTargetRevision }),
      }
      pending = {
        key: crypto.randomUUID(),
        revision: entry(sessionId).revision,
        intent: 'goalSlash',
        fingerprint: JSON.stringify([
          input.expectedGoalId,
          input.objective,
          input.draftText,
          expectedLaunchTargetRevision ?? null,
        ]),
        request,
        tokenBudget: undefined,
        permission,
        baselineGoalId: input.expectedGoalId,
        baselineGoalSeq: facts.goalSeq,
        preparedGoalId: input.expectedGoalId,
        phase: 'run',
        status: 'submitting',
        goalObjective: null,
        slashDraft: { revision: input.expectedDraftRevision, text: input.draftText },
      }
      submissions.set(sessionId, pending)
      setSubmission(sessionId, pending)
      dispatched = true
      const accepted = runAcceptedSchema.parse(
        await options.executeRun('run.submit', request, { ...execution, idempotencyKey: pending.key }),
      )
      if (accepted.sessionId !== sessionId || accepted.idempotencyKey !== pending.key)
        throw new CommandError('RESULT_UNKNOWN', 'Goal Run receipt target mismatch')
      settle(sessionId, pending)
      return accepted
    } catch (error) {
      if (pending) {
        const unknown = dispatched && (code(error) === 'RESULT_UNKNOWN' || code(error) === 'INVALID_OUTPUT')
        pending.status = unknown ? 'unknown' : 'partial'
        setSubmission(sessionId, pending, code(error))
        if (pending.permission)
          options.permissions?.settleSubmission(pending.permission, unknown ? 'unknown' : 'failed', code(error))
      } else if (permission) options.permissions?.settleSubmission(permission, 'failed', code(error))
      throw error
    } finally {
      preparations.delete(sessionId)
    }
  })

  const reconcileControl = (control: GoalControl): Promise<void> => {
    const { sessionId } = control
    const currentTask = reconciliations.get(sessionId)
    if (currentTask?.control === control) return currentTask.promise
    if (disposed) return Promise.reject(new CommandError('DISPOSED', 'Composer intent is disposed'))
    if (entry(sessionId).goalAction.status !== 'unknown')
      return Promise.reject(new CommandError('BUSY', 'Goal control is pending'))
    const selection = selectionGeneration
    const connection = connectionGeneration
    const result = Promise.withResolvers<void>()
    const task = { control, promise: result.promise }
    reconciliations.set(sessionId, task)
    const run = async () => {
      try {
        if (!connected) throw new CommandError('DISCONNECTED', 'Goal reconciliation requires a connection')
        const read = refresh(sessionId)
        publishReconciliation(control, 'checking', null)
        const value = await read
        if (
          disposed ||
          !connected ||
          connection !== connectionGeneration ||
          selection !== selectionGeneration ||
          controls.get(sessionId) !== control
        )
          throw new CommandError('STALE_TARGET', 'The original Goal reconciliation scope changed')
        if (control.action !== 'set' && value.goal && value.goal.goalId !== control.expectedGoalId) {
          controls.delete(sessionId)
          replace({ ...entry(sessionId), goalAction: { status: 'failed', error: 'GOAL_CONFLICT' } })
          throw new CommandError('GOAL_CONFLICT', 'The original Goal was replaced during reconciliation')
        }
        if (
          control.action === 'set' &&
          value.goalSeq > control.baselineGoalSeq &&
          value.goal?.objective !== control.objective
        ) {
          controls.delete(sessionId)
          replace({ ...entry(sessionId), goalAction: { status: 'failed', error: 'GOAL_CONFLICT' } })
          throw new CommandError('GOAL_CONFLICT', 'A different Goal replaced the uncertain command')
        }
        const confirmed =
          control.action === 'set'
            ? value.goal !== null &&
              value.goal.objective === control.objective &&
              value.goal.goalId !== control.expectedGoalId &&
              value.goalSeq > control.baselineGoalSeq
            : control.action === 'clear'
              ? value.goal === null && (!('baselineGoalSeq' in control) || value.goalSeq > control.baselineGoalSeq)
              : value.goal !== null &&
                value.goal.goalId === control.expectedGoalId &&
                value.goal.status === (control.action === 'pause' ? 'paused' : 'active')
        if (!confirmed) throw new CommandError('RESULT_UNKNOWN', 'Goal control has not been confirmed')
        controls.delete(sessionId)
        abandonReplacedGoalSlash(sessionId, value.goal?.goalId)
        replace({ ...entry(sessionId), goalAction: { status: 'succeeded', error: null } })
      } catch (error) {
        const errorCode = reconciliationCode(error)
        publishReconciliation(
          control,
          ['RESULT_UNKNOWN', 'STALE_TARGET', 'CANCELLED'].includes(errorCode) ? 'unconfirmed' : 'failed',
          errorCode,
        )
        throw error
      } finally {
        if (reconciliations.get(sessionId) === task) reconciliations.delete(sessionId)
      }
    }
    void run().then(result.resolve, result.reject)
    return result.promise
  }

  local.register(composerIntentCommands['composerIntent.reconcile'], async ({ sessionId }) => {
    const control = controls.get(sessionId)
    const pending = submissions.get(sessionId)
    if (control) {
      await reconcileControl(control)
    } else if (pending?.status === 'unknown') {
      if (pending.phase === 'run') {
        let accepted = options.getSettledReceipt?.(sessionId, pending.key) ?? null
        if (!accepted) {
          try {
            accepted = await options.reconcileRun(sessionId)
          } catch (error) {
            accepted = options.getSettledReceipt?.(sessionId, pending.key) ?? null
            if (!accepted) throw error
          }
        }
        if (accepted) {
          if (accepted.sessionId !== sessionId || accepted.idempotencyKey !== pending.key)
            throw new CommandError('INVALID_OUTPUT', 'Reconciled Run receipt mismatch')
          settle(sessionId, pending)
        }
      } else {
        const value = await refresh(sessionId)
        if (
          value.goal?.goalId &&
          value.goal.goalId !== pending.baselineGoalId &&
          value.goalSeq > pending.baselineGoalSeq &&
          value.goal.objective === (pending.goalObjective ?? pending.request.input.text.trim()) &&
          value.goal.status === 'active' &&
          (pending.tokenBudget === undefined || value.goal.tokenBudget === pending.tokenBudget)
        ) {
          pending.preparedGoalId = value.goal.goalId
          pending.phase = 'run'
          pending.status = 'partial'
          // Goal acceptance is now known but no Run was sent. The next explicit retry may choose a new policy.
          const refreshPermission = pending.permission !== null
          if (pending.permission) options.permissions?.settleSubmission(pending.permission, 'failed')
          pending.permission = null
          // Do not automatically send after an uncertain write. The user explicitly retries the prepared draft.
          setSubmission(sessionId, pending)
          if (refreshPermission) await options.permissions?.refreshSession?.(sessionId)
        } else throw new CommandError('RESULT_UNKNOWN', 'Goal creation has not been confirmed')
      }
    } else throw new CommandError('INVALID_INPUT', 'No uncertain composer operation to reconcile')
    return { sessionId }
  })

  return {
    reader: state.reader,
    isSubmissionPending(sessionId: string): boolean {
      return preparations.has(sessionId) || ['submitting', 'unknown'].includes(entry(sessionId).submission.status)
    },
    /** A generic draft receipt must settle the exact owning composer, never an unrelated current session. */
    acceptRunReceipt(accepted: RunAccepted): boolean {
      const pending = submissions.get(accepted.sessionId)
      if (!pending || pending.phase !== 'run' || pending.key !== accepted.idempotencyKey) return false
      settle(accepted.sessionId, pending)
      return true
    },
    dispose() {
      disposed = true
      generation += 1
      offNavigation()
      offConnection?.()
      feed.dispose()
      for (const sessionId of reads.keys()) invalidateRead(sessionId, 'DISPOSED')
      reads.clear()
      reconciliations.clear()
      submissions.clear()
      preparations.clear()
      controls.clear()
      state.dispose()
    },
  }
}
