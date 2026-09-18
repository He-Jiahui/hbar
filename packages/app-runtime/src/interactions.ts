import { CommandError, type CommandExecutor, type ExecuteOptions } from '@hbar/commands'
import type { StateReader } from './state'
import { createState } from './state'
import type { InteractionActionState, InteractionState, SessionTimelineState } from './types'

const MAX_ACTIONS = 100

function key(name: string, input: unknown): string {
  const value = input as Record<string, unknown>
  if (name === 'approval.resolve' && typeof value.approvalId === 'string') return `approval:${value.approvalId}`
  if (name === 'questionnaire.answer' && typeof value.requestId === 'string') return `questionnaire:${value.requestId}`
  throw new CommandError('INVALID_INPUT', 'Interaction target is missing')
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code
  return error instanceof Error ? error.message : 'EXECUTION_FAILED'
}

export function createInteractions(
  port: CommandExecutor | undefined,
  timeline: StateReader<SessionTimelineState>,
  onSubscriberError: (error: unknown) => void,
  isDisposed: () => boolean,
) {
  const state = createState<InteractionState>({}, onSubscriberError)

  const replace = (id: string, action: InteractionActionState) => {
    if (isDisposed()) return
    const current = state.reader.getSnapshot()
    const next: Record<string, InteractionActionState> = { ...current }
    if (!next[id] && Object.keys(next).length >= MAX_ACTIONS) {
      const settled = Object.entries(next).find(([, item]) => ['failed', 'succeeded'].includes(item.status))
      if (!settled) throw new CommandError('BUSY', 'Too many interaction actions are pending')
      delete next[settled[0]]
    }
    next[id] = action
    state.replace(next)
  }
  const reconcile = () => {
    const current = state.reader.getSnapshot()
    const session = timeline.getSnapshot()
    let changed = false
    const next: Record<string, InteractionActionState> = { ...current }
    for (const [id, action] of Object.entries(current)) {
      if (action.sessionId !== session.sessionId || !['submitting', 'unknown'].includes(action.status)) continue
      const settled =
        action.kind === 'approval'
          ? session.approvals.some((approval) => approval.id === action.targetId && approval.status !== 'pending')
          : !session.userInputs.some((request) => request.requestId === action.targetId)
      if (settled) {
        next[id] = { ...action, status: 'succeeded', error: null }
        changed = true
      }
    }
    if (changed) state.replace(next)
  }
  const unsubscribe = timeline.subscribe(reconcile)

  return {
    reader: state.reader,
    async execute(name: string, input: unknown, options: ExecuteOptions = {}): Promise<unknown> {
      if (!port) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Interaction commands are unavailable')
      const id = key(name, input)
      const value = input as { sessionId: string; approvalId?: string; requestId?: string }
      const action: InteractionActionState = {
        id,
        kind: name === 'approval.resolve' ? 'approval' : 'questionnaire',
        sessionId: value.sessionId,
        targetId: value.approvalId ?? value.requestId!,
        status: 'submitting',
        error: null,
      }
      replace(id, action)
      try {
        const result = await port.execute(name, input, options)
        replace(id, { ...action, status: 'succeeded' })
        return result
      } catch (error) {
        const code = errorCode(error)
        replace(id, { ...action, status: code === 'RESULT_UNKNOWN' ? 'unknown' : 'failed', error: code })
        throw error
      }
    },
    dispose() {
      unsubscribe()
      state.dispose()
    },
  }
}
