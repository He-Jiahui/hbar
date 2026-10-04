import { z } from 'zod'
import { CommandError, defineCommand, type CommandRegistry, type ExecuteOptions } from '@hbar/commands'
import { idSchema } from '@hbar/contracts'
import { runAcceptedSchema, type RunAccepted, type SubmitRunInput } from '@hbar/contracts/commands/run'
import { createState, type StateReader } from './state'
import type { SessionControlsState, SessionTimelineState } from './types'
import { parseProposedPlan, proposedPlanFingerprint } from './proposed-plan'
import type { SessionExecutionPreparationPort } from './session-execution-preparation'

const targetSchema = z.strictObject({
  sessionId: idSchema,
  messageId: idSchema,
  sourceRunId: idSchema,
  sourceSeq: z.number().int().positive(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
})
const submitSchema = targetSchema.extend({
  action: z.enum(['implement', 'continue']),
  feedback: z.string().max(4_000).optional(),
})
export type PlanProposalTarget = z.output<typeof targetSchema>
export type PlanProposalSubmit = z.output<typeof submitSchema>
export type PlanProposalRequestText = (input: {
  readonly action: PlanProposalSubmit['action']
  readonly markdown: string
  readonly feedback: string
  readonly target: PlanProposalTarget
}) => string

const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.app-runtime',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  scope: 'session' as const,
  category: 'run.plan',
  visibility: 'internal' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as ('api' | 'palette' | 'cli' | 'tui')[],
})
export const planProposalCommands = {
  'proposedPlan.submit': defineCommand(metadata('proposedPlan.submit'), submitSchema, runAcceptedSchema),
  'proposedPlan.reconcile': defineCommand(
    metadata('proposedPlan.reconcile'),
    targetSchema,
    runAcceptedSchema.nullable(),
  ),
}

export interface PlanProposalDocument {
  readonly target: PlanProposalTarget
  readonly before: string
  readonly markdown: string
  readonly after: string
}
export interface PlanProposalActionState {
  readonly target: PlanProposalTarget
  readonly action: PlanProposalSubmit['action']
  readonly phase: 'mode' | 'run'
  readonly status: 'submitting' | 'unknown' | 'failed' | 'accepted'
  readonly reconciling: boolean
  readonly error: string | null
  readonly operationId: string | null
}
export interface PlanProposalState {
  readonly sessionId: string | null
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly proposal: PlanProposalDocument | null
  readonly error: string | null
  readonly availability: 'none' | 'ready' | 'busy' | 'incomplete' | 'model_unavailable' | 'capability_unavailable'
  readonly actions: Readonly<Record<string, PlanProposalActionState>>
}
export interface PlanProposalOptions {
  readonly preparation?: SessionExecutionPreparationPort
  readonly timeline: StateReader<SessionTimelineState>
  readonly controls: StateReader<SessionControlsState>
  readonly executeDetachedRun: (input: SubmitRunInput, options?: ExecuteOptions) => Promise<RunAccepted>
  readonly reconcileRun: (sessionId: string) => Promise<RunAccepted | null>
  readonly getSettledReceipt: (sessionId: string, key: string) => RunAccepted | null
  readonly mode?: {
    /** Read the current Host session mode, not a cached composer projection. */
    read(sessionId: string): Promise<'default' | 'plan'>
    setDefault(sessionId: string): Promise<'default'>
    reconcile(sessionId: string): Promise<'default' | 'plan'>
    isUnknown(sessionId: string): boolean
  }
  readonly onSubscriberError: (error: unknown) => void
  /** Host-owned user-visible request text; no demo prose in runtime or component. */
  readonly requestText?: PlanProposalRequestText
}

function code(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'EXECUTION_FAILED'
}
export function planProposalActionKey(
  target: Pick<PlanProposalTarget, 'sessionId' | 'messageId' | 'fingerprint'>,
): string {
  return JSON.stringify([target.sessionId, target.messageId, target.fingerprint])
}
type ProposalMessage = SessionTimelineState['messages'][number]
interface ParsedMessage {
  readonly content: ProposalMessage['content']
  readonly proposal: {
    readonly source: string
    readonly parsed: Extract<ReturnType<typeof parseProposedPlan>, { kind: 'complete' }>
  } | null
}

function latestCandidate(timeline: SessionTimelineState, parsedMessages: WeakMap<ProposalMessage, ParsedMessage>) {
  let latest: {
    message: SessionTimelineState['messages'][number]
    source: string
    parsed: Extract<ReturnType<typeof parseProposedPlan>, { kind: 'complete' }>
  } | null = null
  for (const message of timeline.messages) {
    if (message.sessionId !== timeline.sessionId || message.role !== 'assistant') continue
    let cached = parsedMessages.get(message)
    if (!cached || cached.content !== message.content) {
      const source = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n\n')
      const parsed = parseProposedPlan(source)
      cached = { content: message.content, proposal: parsed.kind === 'complete' ? { source, parsed } : null }
      parsedMessages.set(message, cached)
    }
    if (cached.proposal && (!latest || message.seq > latest.message.seq)) latest = { message, ...cached.proposal }
  }
  return latest
}
function active(timeline: SessionTimelineState): boolean {
  return (
    Object.keys(timeline.streams).length > 0 ||
    timeline.runs.some(
      (run) => run.sessionId === timeline.sessionId && ['queued', 'running', 'waiting_approval'].includes(run.status),
    )
  )
}

function availability(
  timeline: SessionTimelineState,
  controls: SessionControlsState,
  candidate: ReturnType<typeof latestCandidate>,
  supported: boolean,
): PlanProposalState['availability'] {
  if (!candidate) return 'none'
  if (!supported) return 'capability_unavailable'
  if (active(timeline)) return 'busy'
  if (
    timeline.status !== 'ready' ||
    timeline.runs.find((run) => run.sessionId === timeline.sessionId && run.id === candidate.message.runId)?.status !==
      'completed'
  )
    return 'incomplete'
  if (
    controls.sessionId !== timeline.sessionId ||
    controls.model?.sessionId !== timeline.sessionId ||
    controls.model?.status !== 'configured' ||
    !controls.model.modelId ||
    controls.errors.model
  )
    return 'model_unavailable'
  return 'ready'
}

/** One explicit per-run request; implementing exits an active Host Plan mode before admission. */
export function createPlanProposalActions(local: CommandRegistry, options: PlanProposalOptions) {
  let disposed = false
  let generation = 0
  let lastSource: string | null = null
  // Timeline messages are immutable; stream/control updates retain their references.
  // Weak keys release paged-out history and never confuse a replacement sharing the same id.
  const parsedMessages = new WeakMap<ProposalMessage, ParsedMessage>()
  const state = createState<PlanProposalState>(
    { sessionId: null, status: 'idle', proposal: null, error: null, availability: 'none', actions: {} },
    options.onSubscriberError,
  )
  type PendingRequest = {
    readonly target: PlanProposalTarget
    readonly action: PlanProposalSubmit['action']
    readonly key: string
    phase: 'preparing' | 'mode' | 'run'
    runInput: SubmitRunInput | null
  }
  const pending = new Map<string, PendingRequest>()
  const reconciling = new Set<string>()
  const setAction = (value: PlanProposalActionState) => {
    if (disposed) return
    const current = state.reader.getSnapshot()
    const actions = { ...current.actions }
    const key = planProposalActionKey(value.target)
    if (!actions[key] && Object.keys(actions).length >= 100) {
      const removable = Object.entries(actions).find(
        ([, action]) => action.status === 'failed' || action.status === 'accepted',
      )
      if (!removable) throw new CommandError('BUSY', 'Too many proposal requests are pending')
      delete actions[removable[0]]
    }
    actions[key] = value
    state.replace({ ...current, actions })
  }
  const refresh = () => {
    const timeline = options.timeline.getSnapshot()
    const candidate = latestCandidate(timeline, parsedMessages)
    const available = availability(timeline, options.controls.getSnapshot(), candidate, Boolean(options.requestText))
    const identity = JSON.stringify([
      timeline.sessionId,
      candidate?.message.id,
      candidate?.message.runId,
      candidate?.message.seq,
      candidate?.source,
    ])
    if (identity === lastSource) {
      const current = state.reader.getSnapshot()
      if (current.availability !== available) state.replace({ ...current, availability: available })
      return
    }
    lastSource = identity
    const intent = ++generation
    state.replace({
      ...state.reader.getSnapshot(),
      sessionId: timeline.sessionId,
      status: candidate ? 'loading' : 'idle',
      proposal: null,
      error: null,
      availability: available,
    })
    if (!candidate || !timeline.sessionId) return
    const { message, source, parsed } = candidate
    void proposedPlanFingerprint(source)
      .then((fingerprint) => {
        if (disposed || intent !== generation) return
        state.replace({
          ...state.reader.getSnapshot(),
          status: 'ready',
          proposal: {
            target: {
              sessionId: message.sessionId,
              messageId: message.id,
              sourceRunId: message.runId,
              sourceSeq: message.seq,
              fingerprint,
            },
            before: parsed.before,
            markdown: parsed.markdown,
            after: parsed.after,
          },
        })
      })
      .catch((error: unknown) => {
        if (!disposed && intent === generation)
          state.replace({ ...state.reader.getSnapshot(), status: 'error', error: code(error) })
      })
  }
  const offTimeline = options.timeline.subscribe(refresh)
  const offControls = options.controls.subscribe(refresh)
  refresh()

  const validate = async (target: PlanProposalTarget) => {
    const timeline = options.timeline.getSnapshot()
    if (timeline.sessionId !== target.sessionId || timeline.status !== 'ready')
      throw new CommandError('STALE_TARGET', 'The proposal session is no longer selected and ready')
    if (active(timeline)) throw new CommandError('BUSY', 'Wait for the active turn before using a proposal')
    const candidate = latestCandidate(timeline, parsedMessages)
    if (
      !candidate ||
      candidate.message.id !== target.messageId ||
      candidate.message.runId !== target.sourceRunId ||
      candidate.message.seq !== target.sourceSeq
    )
      throw new CommandError('STALE_PROPOSAL', 'A newer or different proposal replaced this message')
    const run = timeline.runs.find((item) => item.id === target.sourceRunId && item.sessionId === target.sessionId)
    if (run?.status !== 'completed')
      throw new CommandError('PLAN_NOT_COMPLETE', 'The source planning turn has not completed')
    if ((await proposedPlanFingerprint(candidate.source)) !== target.fingerprint)
      throw new CommandError('STALE_PROPOSAL', 'The proposal content changed')
    if (disposed || options.timeline.getSnapshot() !== timeline)
      throw new CommandError('STALE_TARGET', 'The timeline changed before proposal submission')
    const controls = options.controls.getSnapshot()
    if (
      controls.sessionId !== target.sessionId ||
      controls.model?.sessionId !== target.sessionId ||
      !controls.model ||
      controls.model.status !== 'configured' ||
      !controls.model.modelId ||
      controls.errors.model
    )
      throw new CommandError('MODEL_UNAVAILABLE', 'The proposal session has no confirmed model')
    return { candidate, modelId: controls.model.modelId, thinkingLevel: controls.model.thinkingLevel }
  }
  const submitRun = async (request: PendingRequest, execution?: ExecuteOptions): Promise<RunAccepted> => {
    if (!request.runInput) throw new CommandError('INVALID_STATE', 'The proposal Run was not prepared')
    request.phase = 'run'
    setAction({
      target: request.target,
      action: request.action,
      phase: 'run',
      status: 'submitting',
      reconciling: false,
      error: null,
      operationId: null,
    })
    try {
      const accepted = await options.executeDetachedRun(request.runInput, {
        ...execution,
        idempotencyKey: request.key,
      })
      pending.delete(request.target.sessionId)
      setAction({
        target: request.target,
        action: request.action,
        phase: 'run',
        status: 'accepted',
        reconciling: false,
        error: null,
        operationId: accepted.operationId,
      })
      return accepted
    } catch (error) {
      const unknown = code(error) === 'RESULT_UNKNOWN'
      if (!unknown) pending.delete(request.target.sessionId)
      setAction({
        target: request.target,
        action: request.action,
        phase: 'run',
        status: unknown ? 'unknown' : 'failed',
        reconciling: false,
        error: code(error),
        operationId: null,
      })
      throw error
    }
  }
  local.register(planProposalCommands['proposedPlan.submit'], async (input, execution) => {
    if (disposed) throw new CommandError('CANCELLED', 'Proposal actions have been disposed')
    const requestText = options.requestText
    if (!requestText)
      throw new CommandError('CAPABILITY_UNAVAILABLE', 'The host does not provide proposal request text')
    if (pending.has(input.sessionId)) throw new CommandError('BUSY', 'Reconcile the pending proposal request first')
    if (pending.size >= 100) throw new CommandError('BUSY', 'Too many proposal requests are pending')
    const existing = state.reader.getSnapshot().actions[planProposalActionKey(input)]
    if (existing?.status === 'accepted')
      throw new CommandError('ALREADY_SUBMITTED', 'This proposal action has already been accepted')
    const { sessionId, messageId, sourceRunId, sourceSeq, fingerprint } = input
    const request: PendingRequest = {
      target: { sessionId, messageId, sourceRunId, sourceSeq, fingerprint },
      action: input.action,
      key: crypto.randomUUID(),
      phase: 'preparing',
      runInput: null,
    }
    pending.set(input.sessionId, request)
    try {
      const executionTarget = await options.preparation?.capture(input.sessionId, execution.signal)
      const { candidate, modelId, thinkingLevel } = await validate(request.target)
      if (execution.signal.aborted) throw new CommandError('CANCELLED', 'Proposal submission was cancelled')
      const text = requestText({
        action: input.action,
        markdown: candidate.parsed.markdown,
        feedback: input.action === 'continue' ? (input.feedback?.trim() ?? '') : '',
        target: request.target,
      })
      if (!text.trim() || text.length > 200_000)
        throw new CommandError('INVALID_INPUT', 'Proposal request text must be non-empty and bounded')
      if (executionTarget) options.preparation?.assertCanPrepare(executionTarget)
      setAction({
        target: request.target,
        action: input.action,
        phase: 'run',
        status: 'submitting',
        reconciling: false,
        error: null,
        operationId: null,
      })
      request.runInput = {
        sessionId: input.sessionId,
        modelId,
        input: {
          text,
          images: [],
          files: [],
          mode: input.action === 'implement' ? 'default' : 'plan',
          source: 'user',
          ...(thinkingLevel ? { thinking: thinkingLevel } : {}),
        },
      }
      if (input.action === 'implement' && options.mode) {
        const mode = await options.mode.read(input.sessionId)
        if (mode === 'plan') {
          request.phase = 'mode'
          setAction({
            target: request.target,
            action: input.action,
            phase: 'mode',
            status: 'submitting',
            reconciling: false,
            error: null,
            operationId: null,
          })
          await options.mode.setDefault(input.sessionId)
        }
        if (executionTarget) options.preparation?.assertCanPrepare(executionTarget)
      }
      return await submitRun(request, execution)
    } catch (error) {
      if (request.phase === 'run') throw error
      const unknown = request.phase === 'mode' && Boolean(options.mode?.isUnknown(input.sessionId))
      if (!unknown) pending.delete(input.sessionId)
      setAction({
        target: request.target,
        action: input.action,
        phase: request.phase === 'mode' ? 'mode' : 'run',
        status: unknown ? 'unknown' : 'failed',
        reconciling: false,
        error: unknown ? null : code(error),
        operationId: null,
      })
      throw error
    }
  })
  local.register(planProposalCommands['proposedPlan.reconcile'], async (target) => {
    if (disposed) throw new CommandError('CANCELLED', 'Proposal actions have been disposed')
    if (reconciling.has(target.sessionId)) throw new CommandError('BUSY', 'Proposal reconciliation is already pending')
    const request = pending.get(target.sessionId)
    if (
      !request ||
      planProposalActionKey(request.target) !== planProposalActionKey(target) ||
      request.target.sourceRunId !== target.sourceRunId ||
      request.target.sourceSeq !== target.sourceSeq
    )
      throw new CommandError('STALE_TARGET', 'The pending proposal belongs to another message')
    const actionKey = planProposalActionKey(request.target)
    const original = state.reader.getSnapshot().actions[actionKey]
    if (original?.status !== 'unknown')
      throw new CommandError('BUSY', 'Proposal submission is still awaiting its response')
    reconciling.add(target.sessionId)
    try {
      setAction({ ...original, reconciling: true, error: null })
      if (disposed) throw new CommandError('CANCELLED', 'Proposal actions have been disposed')
      if (request.phase === 'mode') {
        const mode = await options.mode?.reconcile(target.sessionId)
        if (mode !== 'default') throw new CommandError('RESULT_UNKNOWN', 'Host Plan exit is not confirmed')
        const { modelId } = await validate(request.target)
        if (!request.runInput || request.runInput.modelId !== modelId)
          throw new CommandError('MODEL_UNAVAILABLE', 'The original proposal model changed during mode recovery')
        return await submitRun(request)
      }
      let receipt = options.getSettledReceipt(target.sessionId, request.key)
      if (!receipt) {
        try {
          receipt = await options.reconcileRun(target.sessionId)
        } catch (error) {
          // The composer may have settled the same owner while this entry was starting its read.
          receipt = options.getSettledReceipt(target.sessionId, request.key)
          if (!receipt) throw error
        }
      }
      if (receipt) {
        if (receipt.sessionId !== target.sessionId || receipt.idempotencyKey !== request.key)
          throw new CommandError('RESULT_UNKNOWN', 'The reconciled proposal receipt does not match')
        pending.delete(target.sessionId)
        setAction({
          target: request.target,
          action: request.action,
          phase: 'run',
          status: 'accepted',
          reconciling: false,
          error: null,
          operationId: receipt.operationId,
        })
      }
      return receipt
    } catch (error) {
      const current = state.reader.getSnapshot().actions[actionKey]
      if (
        request.phase === 'mode' &&
        current?.status === 'unknown' &&
        !options.mode?.isUnknown(target.sessionId) &&
        code(error) !== 'RESULT_UNKNOWN'
      ) {
        pending.delete(target.sessionId)
        setAction({ ...current, status: 'failed', reconciling: false, error: code(error) })
        throw error
      }
      // A failed read says nothing about the original write. Keep its key and
      // target locked, including when that proposal is no longer selected.
      if (pending.get(target.sessionId) === request && current?.status === 'unknown')
        setAction({ ...current, error: code(error) })
      throw error
    } finally {
      reconciling.delete(target.sessionId)
      const current = state.reader.getSnapshot().actions[actionKey]
      if (current?.target === request.target && current.reconciling) setAction({ ...current, reconciling: false })
    }
  })
  return {
    reader: state.reader,
    dispose() {
      disposed = true
      generation += 1
      offTimeline()
      offControls()
      reconciling.clear()
      pending.clear()
      state.dispose()
    },
  }
}
