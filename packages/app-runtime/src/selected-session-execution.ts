import {
  CommandError,
  createCommandClient,
  defineCommand,
  type CommandExecutor,
  type CommandRegistry,
} from '@hbar/commands'
import { z } from 'zod'
import { directoryCommands } from '@hbar/contracts/commands'
import { sessionExecutionSnapshotSchema } from '@hbar/contracts/sidebar-directory'
import type { SessionExecutionSnapshot } from '@hbar/contracts/sidebar-directory'
import { createState, type StateReader } from './state'
import type { ComposerIntentState } from './composer-intent'
import type { NavigationState, PresentationState, RuntimeOptions } from './types'

const targetSchema = z.strictObject({ sessionId: z.string().min(1).max(160), workspaceId: z.string().min(1).max(160) })
type Target = z.output<typeof targetSchema>
export const SELECTED_EXECUTION_MAX_READS = 2
const REFRESH_DELAY = 300
const READ_TIMEOUT = 8_000

export interface SelectedSessionExecutionState {
  readonly target: Target | null
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly snapshot: Readonly<SessionExecutionSnapshot> | null
  readonly error: string | null
}

export const selectedSessionExecutionCommands = {
  'selectedSessionExecution.refresh': defineCommand(
    {
      id: 'selectedSessionExecution.refresh',
      version: 1,
      owner: 'hbar.app-runtime',
      kind: 'command',
      execution: 'client',
      stateEffect: 'application',
      category: 'session.activity',
      scope: 'session',
      visibility: 'internal',
      titleKey: 'commands.selectedSessionExecution.refresh.title',
      descriptionKey: 'commands.selectedSessionExecution.refresh.description',
      surfaces: ['api'],
    },
    targetSchema,
    z.strictObject({ status: z.enum(['ready', 'error']), error: z.string().nullable() }),
  ),
}

interface Options {
  readonly queries: CommandExecutor
  readonly navigation: StateReader<NavigationState>
  readonly presentation: StateReader<PresentationState>
  readonly goals: StateReader<ComposerIntentState>
  readonly events?: RuntimeOptions['sidebarActivityEvents']
  readonly onSubscriberError: (reason: unknown) => void
}

function sameTarget(left: Target | null, right: Target | null) {
  return (
    left === right ||
    Boolean(left && right && left.sessionId === right.sessionId && left.workspaceId === right.workspaceId)
  )
}
function errorCode(reason: unknown) {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'READ_FAILED'
}

/** One visible Goal's execution facts; independent of partial sidebar pages and Goal mutations. */
export function createSelectedSessionExecution(local: CommandRegistry, options: Options) {
  const state = createState<SelectedSessionExecutionState>(
    { target: null, status: 'idle', snapshot: null, error: null },
    options.onSubscriberError,
  )
  const queries = createCommandClient(directoryCommands, options.queries)
  let disposed = false
  let connected = true
  let generation = 0
  let acceptedRevision = -1
  let invalidated = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let active: { controller: AbortController; promise: Promise<void> } | null = null
  const physical = new Set<AbortController>()
  const target = (): Target | null => {
    const navigation = options.navigation.getSnapshot()
    const facts = options.goals.getSnapshot().facts
    if (
      !connected ||
      navigation.status !== 'idle' ||
      options.presentation.getSnapshot().page.kind !== 'session' ||
      !navigation.sessionId ||
      !navigation.workspaceId ||
      facts.sessionId !== navigation.sessionId ||
      !facts.snapshot?.goal ||
      facts.snapshot.goal.status === 'complete'
    )
      return null
    return { sessionId: navigation.sessionId, workspaceId: navigation.workspaceId }
  }
  const clearTimer = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
  }
  const retire = () => {
    generation += 1
    acceptedRevision = -1
    clearTimer()
    invalidated = false
    active?.controller.abort(new CommandError('RESULT_UNKNOWN', 'Selected execution read was retired'))
    active = null
  }
  const current = (captured: Target, epoch: number, controller: AbortController) =>
    !disposed && !controller.signal.aborted && epoch === generation && sameTarget(target(), captured)
  const refresh = async (captured: Target): Promise<void> => {
    if (!sameTarget(target(), captured)) throw new CommandError('TARGET_CHANGED', 'The current Goal target changed')
    if (active) return active.promise
    clearTimer()
    if (physical.size >= SELECTED_EXECUTION_MAX_READS) {
      state.replace({ target: captured, status: 'error', snapshot: null, error: 'CAPACITY_EXCEEDED' })
      return
    }
    invalidated = false
    const epoch = generation
    const controller = new AbortController()
    physical.add(controller)
    const previous = state.reader.getSnapshot()
    state.replace({ target: captured, status: 'loading', snapshot: previous.snapshot, error: null })
    let removeAbort = () => {}
    const interrupted = new Promise<never>((_resolve, reject) => {
      const abort = () => reject(controller.signal.reason)
      controller.signal.addEventListener('abort', abort, { once: true })
      removeAbort = () => controller.signal.removeEventListener('abort', abort)
    })
    const timeout = setTimeout(
      () => controller.abort(new CommandError('TIMEOUT', 'Selected execution read timed out')),
      READ_TIMEOUT,
    )
    const read = queries
      .execute('session.execution.get', captured, { signal: controller.signal })
      .then((value) => {
        const result = sessionExecutionSnapshotSchema.safeParse(value)
        if (!result.success || !sameTarget(result.data, captured))
          throw new CommandError('INVALID_OUTPUT', 'Execution snapshot does not match its target')
        if (!current(captured, epoch, controller)) return
        if (result.data.revision < acceptedRevision)
          throw new CommandError('STALE_SNAPSHOT', 'Execution snapshot revision moved backwards')
        acceptedRevision = result.data.revision
        state.replace({ target: captured, status: 'ready', snapshot: result.data, error: null })
      })
      .finally(() => {
        physical.delete(controller)
        if (!disposed && state.reader.getSnapshot().error === 'CAPACITY_EXCEEDED') schedule()
      })
    const promise = Promise.race([read, interrupted])
      .catch((reason: unknown) => {
        if (!disposed && epoch === generation && sameTarget(target(), captured))
          state.replace({ target: captured, status: 'error', snapshot: null, error: errorCode(reason) })
      })
      .finally(() => {
        clearTimeout(timeout)
        removeAbort()
        if (active?.controller !== controller) return
        active = null
        if (invalidated) schedule()
      })
    active = { controller, promise }
    await promise
  }
  function schedule() {
    if (disposed || !target()) return
    invalidated = true
    if (active || timer) return
    timer = setTimeout(() => {
      timer = undefined
      const captured = target()
      if (captured) void refresh(captured).catch(() => {})
    }, REFRESH_DELAY)
  }
  const sync = () => {
    if (disposed) return
    const selected = target()
    if (sameTarget(selected, state.reader.getSnapshot().target)) return
    retire()
    state.replace({ target: selected, status: selected ? 'loading' : 'idle', snapshot: null, error: null })
    if (selected) void refresh(selected).catch(() => {})
  }
  const stops = [
    options.navigation.subscribe(sync),
    options.presentation.subscribe(sync),
    options.goals.subscribe(sync),
  ]
  if (options.events) stops.push(options.events.subscribe(schedule))
  if (options.events?.onConnection)
    stops.push(
      options.events.onConnection((value) => {
        connected = value
        sync()
      }),
    )
  local.register(selectedSessionExecutionCommands['selectedSessionExecution.refresh'], async (input) => {
    const epoch = generation
    await refresh(input)
    if (epoch !== generation || !sameTarget(target(), input))
      throw new CommandError('RESULT_UNKNOWN', 'Execution refresh target was retired')
    const current = state.reader.getSnapshot()
    return { status: current.status === 'ready' ? ('ready' as const) : ('error' as const), error: current.error }
  })
  sync()
  return {
    reader: state.reader,
    dispose() {
      disposed = true
      retire()
      for (const stop of stops) stop()
      for (const controller of physical)
        controller.abort(new CommandError('RESULT_UNKNOWN', 'Execution owner disposed'))
      state.dispose()
    },
  }
}
