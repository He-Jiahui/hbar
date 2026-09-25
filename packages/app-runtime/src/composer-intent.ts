import { z } from 'zod'
import {
  CommandError,
  createCommandClient,
  defineCommand,
  type CommandRegistry,
  type ExecuteOptions,
} from '@hbar/commands'
import { idSchema, MAX_GOAL_OBJECTIVE_LENGTH } from '@hbar/contracts'
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

export type ComposerIntent = 'default' | 'goal' | 'plan'
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
  readonly navigation: StateReader<NavigationState>
  /** Delegate to the existing draft module so its draft revision and receipt rules remain authoritative. */
  readonly executeRun: (name: string, input: unknown, options?: ExecuteOptions) => Promise<unknown>
  readonly serializeDraft?: (sessionId: string, revision: number, workspaceId: string, displayText: string) => string
  readonly reconcileRun: (sessionId: string) => Promise<RunAccepted | null>
  readonly getSettledReceipt?: (sessionId: string, key: string) => RunAccepted | null
  readonly permissions?: Pick<
    ReturnType<typeof createComposerPermission>,
    'prepareComposerSubmission' | 'settleSubmission'
  >
  readonly captureMode?: (sessionId: string) => 'default' | 'plan'
  readonly refreshMode?: (sessionId: string) => Promise<'default' | 'plan'>
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
})
const controlInput = sessionInput.extend({
  expectedGoalId: idSchema,
  action: z.enum(['pause', 'resume', 'clear']),
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
}

type Submission = {
  readonly key: string
  readonly revision: number
  readonly intent: ComposerIntent
  readonly fingerprint: string
  readonly request: SubmitRunInput
  readonly tokenBudget: number | undefined
  permission: ComposerPermissionSubmission | null
  baselineGoalId: string | null
  baselineGoalSeq: number
  preparedGoalId: string | null
  phase: 'goal' | 'run'
  status: 'submitting' | 'failed' | 'partial' | 'unknown'
}
type GoalControl = z.output<typeof controlInput>
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
  const reads = new Map<string, Promise<GoalPlanSnapshot>>()
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
  const snapshot = async (sessionId: string): Promise<GoalPlanSnapshot> => {
    const read = reads.get(sessionId)
    if (read) return read
    const request = (async () => {
      const value = goalPlanSnapshotSchema.parse(
        options.goals?.snapshot
          ? await options.goals.snapshot(sessionId)
          : await requireGoals().execute('goal.snapshot', { sessionId }),
      )
      if (
        value.sessionId !== sessionId ||
        (value.goal && value.goal.threadId !== sessionId) ||
        (value.plan && value.plan.sessionId !== sessionId)
      )
        throw new CommandError('INVALID_OUTPUT', 'Goal snapshot target mismatch')
      return value
    })()
    reads.set(sessionId, request)
    try {
      return await request
    } finally {
      if (reads.get(sessionId) === request) reads.delete(sessionId)
    }
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
    reads.delete(sessionId)
    if (options.navigation.getSnapshot().sessionId === sessionId) void refresh(sessionId).catch(() => {})
  }
  let selectedSessionId: string | null = null
  const select = () => {
    const sessionId = options.navigation.getSnapshot().sessionId
    if (sessionId === selectedSessionId) return
    if (selectedSessionId) feed.close(selectedSessionId)
    selectedSessionId = sessionId
    generation += 1
    state.replace({ ...state.reader.getSnapshot(), facts: { sessionId, status: 'idle', snapshot: null, error: null } })
    if (sessionId) refreshSelected(sessionId)
  }
  const offNavigation = options.navigation.subscribe(select)
  select()

  const settle = (sessionId: string, pending: Submission) => {
    if (disposed || submissions.get(sessionId) !== pending) return
    const current = entry(sessionId)
    submissions.delete(sessionId)
    if (pending.permission) options.permissions?.settleSubmission(pending.permission, 'accepted')
    replace({
      ...current,
      ...(current.revision === pending.revision ? { intent: 'default' as const, revision: current.revision + 1 } : {}),
      submission: initial(sessionId).submission,
    })
  }
  const assertFree = (sessionId: string) => {
    const current = entry(sessionId)
    if (
      preparations.has(sessionId) ||
      controls.has(sessionId) ||
      ['submitting', 'unknown'].includes(current.submission.status)
    )
      throw new CommandError('BUSY', 'Reconcile the pending composer operation first')
  }

  local.register(composerIntentCommands['composerIntent.setIntent'], ({ sessionId, intent, expectedRevision }) => {
    assertFree(sessionId)
    if (intent === 'plan' && options.captureMode)
      throw new CommandError('INVALID_INPUT', 'Plan is a durable Host session mode, not a one-send intent')
    if (intent === 'goal' && options.captureMode?.(sessionId) === 'plan')
      throw new CommandError('BUSY', 'Exit Host Plan mode before preparing a Goal')
    const current = entry(sessionId)
    if (expectedRevision !== undefined && current.revision !== expectedRevision)
      throw new CommandError('VERSION_CONFLICT', 'Composer intent changed')
    // Dismissing a prepared Goal chip abandons only the draft operation, never the persisted Goal.
    submissions.delete(sessionId)
    replace({ ...current, intent, revision: current.revision + 1, submission: initial(sessionId).submission })
    return { sessionId }
  })

  local.register(composerIntentCommands['composerIntent.submit'], async (input, execution) => {
    const { sessionId } = input
    assertFree(sessionId)
    const navigation = options.navigation.getSnapshot()
    if (input.expectedDraftRevision !== undefined) {
      if (navigation.sessionId !== sessionId || !navigation.workspaceId || !options.serializeDraft)
        throw new CommandError('VERSION_CONFLICT', 'Composer draft target changed')
    }
    const submittedText =
      input.expectedDraftRevision === undefined
        ? input.input.text
        : options.serializeDraft!(sessionId, input.expectedDraftRevision, navigation.workspaceId!, input.input.text)
    const current = entry(sessionId)
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
    try {
      capturedMode = options.refreshMode
        ? await options.refreshMode(sessionId)
        : (options.captureMode?.(sessionId) ?? (current.intent === 'plan' ? 'plan' : 'default'))
      if (options.navigation.getSnapshot().sessionId !== sessionId && options.refreshMode)
        throw new CommandError('STALE_TARGET', 'Composer session changed during mode verification')
      if (current.intent === 'goal' && capturedMode === 'plan')
        throw new CommandError('BUSY', 'Exit Host Plan mode before submitting a Goal')
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
    }
    if (
      current.intent === 'goal' &&
      (!request.input.text.trim() || request.input.text.trim().length > MAX_GOAL_OBJECTIVE_LENGTH)
    )
      throw new CommandError('GOAL_INVALID', 'A Goal requires a bounded non-empty objective')
    // Capture policy before Goal reads/creation and reserve this composer while the default read is pending.
    preparations.add(sessionId)
    let permission: ComposerPermissionSubmission | null = null
    try {
      if (input.expectedPermissionRevision !== undefined && !options.permissions)
        throw new CommandError('CAPABILITY_UNAVAILABLE', 'Composer approval choices are unavailable')
      permission =
        (await options.permissions?.prepareComposerSubmission(
          sessionId,
          input.expectedPermissionRevision,
          execution.signal,
        )) ?? null
      if (disposed || execution.signal.aborted)
        throw new CommandError('CANCELLED', 'Composer preparation was cancelled')
      if (entry(sessionId).revision !== current.revision)
        throw new CommandError('VERSION_CONFLICT', 'Composer intent changed during permission preparation')
      if (options.captureMode && options.captureMode(sessionId) !== capturedMode)
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
    const fingerprint = JSON.stringify([request, input.goalTokenBudget ?? null])
    let pending = submissions.get(sessionId)
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
        key: crypto.randomUUID(),
        revision: current.revision,
        intent: current.intent,
        fingerprint,
        request,
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
        if (pending.preparedGoalId) {
          if (before.goal?.goalId !== pending.preparedGoalId || before.goal.status !== 'active')
            throw new CommandError('GOAL_CONFLICT', 'The prepared Goal changed before its Run was submitted')
        } else {
          if (before.goal && before.goal.status !== 'complete')
            throw new CommandError('GOAL_EXISTS', 'An unfinished Goal already exists')
          pending.baselineGoalId = before.goal?.goalId ?? null
          pending.baselineGoalSeq = before.goalSeq
          writeStarted = true
          const created = await requireGoals().execute('goal.create', {
            sessionId,
            objective: request.input.text.trim(),
            ...(pending.tokenBudget === undefined ? {} : { tokenBudget: pending.tokenBudget }),
          })
          if (
            !created.goal?.goalId ||
            created.goal.threadId !== sessionId ||
            created.goal.objective !== request.input.text.trim() ||
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
      if (disposed || execution.signal.aborted) throw new CommandError('CANCELLED', 'Composer submission was cancelled')
      pending.phase = 'run'
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
  local.register(composerIntentCommands['composerIntent.controlGoal'], async (input) => {
    const { sessionId } = input
    assertFree(sessionId)
    controls.set(sessionId, input)
    replace({ ...entry(sessionId), goalAction: { status: 'submitting', error: null } })
    try {
      const client = requireGoals()
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
      const unknown = UNKNOWN_CODES.has(code(error))
      if (!unknown) controls.delete(sessionId)
      replace({ ...entry(sessionId), goalAction: { status: unknown ? 'unknown' : 'failed', error: code(error) } })
      throw error
    }
    return { sessionId }
  })

  local.register(composerIntentCommands['composerIntent.reconcile'], async ({ sessionId }) => {
    const control = controls.get(sessionId)
    const pending = submissions.get(sessionId)
    if (control) {
      if (entry(sessionId).goalAction.status !== 'unknown') throw new CommandError('BUSY', 'Goal control is pending')
      const value = await refresh(sessionId)
      if (value.goal && value.goal.goalId !== control.expectedGoalId) {
        controls.delete(sessionId)
        replace({ ...entry(sessionId), goalAction: { status: 'failed', error: 'GOAL_CONFLICT' } })
        throw new CommandError('GOAL_CONFLICT', 'The original Goal was replaced during reconciliation')
      }
      const confirmed =
        control.action === 'clear'
          ? value.goal === null
          : value.goal?.goalId === control.expectedGoalId &&
            value.goal.status === (control.action === 'pause' ? 'paused' : 'active')
      if (!confirmed) throw new CommandError('RESULT_UNKNOWN', 'Goal control has not been confirmed')
      controls.delete(sessionId)
      replace({ ...entry(sessionId), goalAction: { status: 'succeeded', error: null } })
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
          value.goal.objective === pending.request.input.text.trim() &&
          value.goal.status === 'active' &&
          (pending.tokenBudget === undefined || value.goal.tokenBudget === pending.tokenBudget)
        ) {
          pending.preparedGoalId = value.goal.goalId
          pending.phase = 'run'
          pending.status = 'partial'
          // Goal acceptance is now known but no Run was sent. The next explicit retry may choose a new policy.
          if (pending.permission) options.permissions?.settleSubmission(pending.permission, 'failed')
          pending.permission = null
          // Do not automatically send after an uncertain write. The user explicitly retries the prepared draft.
          setSubmission(sessionId, pending)
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
      feed.dispose()
      reads.clear()
      submissions.clear()
      preparations.clear()
      controls.clear()
      state.dispose()
    },
  }
}
