import { CommandError, createCommandClient, type CommandRegistry } from '@hbar/commands'
import { agentPolicyEditorCommands } from '@hbar/contracts/commands/agent-policy-editor'
import {
  agentCommands,
  agentDispatchCandidatesSchema,
  type AgentPolicySetInput,
  type AgentPolicySnapshot,
} from '@hbar/contracts/commands/agents'
import { createState, type StateReader } from './state'
import type { RuntimeOptions, SurfaceState } from './types'

export interface AgentPolicyRow {
  readonly id: string
  readonly difficulty: string
  readonly modelId: string
  readonly thinkingLevel: string
  readonly weight: string
}
export interface AgentPolicyEditorEntry {
  readonly parentSessionId: string
  readonly status: 'loading' | 'ready' | 'saving' | 'error' | 'unknown'
  readonly snapshot: AgentPolicySnapshot | null
  readonly rows: readonly AgentPolicyRow[]
  readonly dirty: boolean
  readonly error: string | null
  readonly pending?: { readonly input: AgentPolicySetInput; readonly key: string }
}
export interface AgentPolicyEditorState {
  readonly entries: Readonly<Record<string, AgentPolicyEditorEntry>>
  readonly feedback?: { readonly parentSessionId: string; readonly code: string }
}
const unknownCodes = new Set([
  'RESULT_UNKNOWN',
  'DISCONNECTED',
  'CONNECTION_CLOSED',
  'TIMEOUT',
  'TIMED_OUT',
  'CANCELLED',
])
const errorCode = (error: unknown) =>
  error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'INVALID_INPUT'
export function createAgentPolicyEditor(
  local: CommandRegistry,
  options: RuntimeOptions,
  surfaces: StateReader<SurfaceState>,
  onError: (error: unknown) => void,
  isDisposed: () => boolean,
) {
  const state = createState<AgentPolicyEditorState>({ entries: {} }, onError)
  const client = options.agents ? createCommandClient(agentCommands, options.agents) : null
  const reads = new Map<string, AbortController>()
  const stopSurfaces = surfaces.subscribe(() => {
    const openParents = new Set(
      Object.values(surfaces.getSnapshot().panels)
        .filter((panel) => panel.panelId === 'agents')
        .map((panel) => panel.sessionId),
    )
    for (const [parentId, controller] of reads)
      if (!openParents.has(parentId)) {
        controller.abort()
        reads.delete(parentId)
        const current = state.reader.getSnapshot()
        const entry = current.entries[parentId]
        if (entry?.status === 'loading')
          state.replace({
            ...current,
            entries: { ...current.entries, [parentId]: { ...entry, status: 'error', error: 'CANCELLED' } },
          })
      }
  })
  const summary = (entry: AgentPolicyEditorEntry) => ({
    parentSessionId: entry.parentSessionId,
    status: entry.status,
    count: entry.rows.length,
    error: entry.error,
  })
  const target = (input: { instanceId: string; parentSessionId: string }) => {
    const panel = surfaces.getSnapshot().panels[input.instanceId]
    if (isDisposed() || panel?.panelId !== 'agents' || panel.sessionId !== input.parentSessionId)
      throw new CommandError('STALE_TARGET', 'Agent policy target changed')
    if (!client) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Agent policy commands are unavailable')
    return client
  }
  const replace = (entry: AgentPolicyEditorEntry) => {
    if (isDisposed()) return
    const current = state.reader.getSnapshot()
    const entries = { ...current.entries }
    if (!entries[entry.parentSessionId] && Object.keys(entries).length >= 8) {
      const removable = Object.values(entries).find(
        (value) =>
          !value.dirty &&
          !value.pending &&
          value.status !== 'saving' &&
          !Object.values(surfaces.getSnapshot().panels).some(
            (panel) => panel.panelId === 'agents' && panel.sessionId === value.parentSessionId,
          ),
      )
      if (!removable) {
        state.replace({ ...current, feedback: { parentSessionId: entry.parentSessionId, code: 'CAPACITY_EXCEEDED' } })
        throw new CommandError('CAPACITY_EXCEEDED', 'Close or reuse an Agent policy editor')
      }
      delete entries[removable.parentSessionId]
    }
    state.replace({ entries: { ...entries, [entry.parentSessionId]: entry } })
  }
  const editable = (input: { instanceId: string; parentSessionId: string }) => {
    target(input)
    const entry = state.reader.getSnapshot().entries[input.parentSessionId]
    if (!entry?.snapshot) throw new CommandError('RESULT_UNKNOWN', 'Load the dispatch policy first')
    if (entry.status === 'saving' || entry.status === 'unknown' || entry.status === 'loading')
      throw new CommandError('BUSY', 'Resolve the pending policy operation first')
    return entry
  }
  const fromSnapshot = (snapshot: AgentPolicySnapshot): AgentPolicyEditorEntry => ({
    parentSessionId: snapshot.parentSessionId,
    status: 'ready',
    snapshot,
    rows: snapshot.candidates.map((item) => ({ id: crypto.randomUUID(), ...item, weight: String(item.weight) })),
    dirty: false,
    error: null,
  })
  const unregister = [
    local.register(agentPolicyEditorCommands['agentPolicy.load'], async (input, context) => {
      const commands = target(input)
      const current = state.reader.getSnapshot().entries[input.parentSessionId]
      if (current?.status === 'saving' || current?.status === 'unknown')
        throw new CommandError('BUSY', 'Retry the unresolved save first')
      reads.get(input.parentSessionId)?.abort()
      const controller = new AbortController()
      reads.set(input.parentSessionId, controller)
      replace({
        ...(current ?? { parentSessionId: input.parentSessionId, snapshot: null, rows: [], dirty: false }),
        status: 'loading',
        error: null,
      })
      try {
        const snapshot = await commands.execute(
          'agent.policy.get',
          { parentSessionId: input.parentSessionId },
          { signal: AbortSignal.any([controller.signal, context.signal]) },
        )
        target(input)
        if (controller.signal.aborted) throw new CommandError('CANCELLED', 'Policy read was superseded')
        const ready = current?.dirty
          ? { ...current, snapshot, status: 'ready' as const, error: null }
          : fromSnapshot(snapshot)
        replace(ready)
        return summary(ready)
      } catch (error) {
        if (!controller.signal.aborted)
          replace({
            ...(current ?? { parentSessionId: input.parentSessionId, snapshot: null, rows: [], dirty: false }),
            status: 'error',
            error: errorCode(error),
          })
        throw error
      } finally {
        if (reads.get(input.parentSessionId) === controller) reads.delete(input.parentSessionId)
      }
    }),
    local.register(agentPolicyEditorCommands['agentPolicy.add'], (input) => {
      const entry = editable(input)
      if (entry.rows.length >= 32) throw new CommandError('CAPACITY_EXCEEDED', 'At most 32 candidates are allowed')
      const next = {
        ...entry,
        rows: [
          ...entry.rows,
          { id: crypto.randomUUID(), difficulty: 'medium', modelId: '', thinkingLevel: '', weight: '100' },
        ],
        dirty: true,
        error: null,
      }
      replace(next)
      return summary(next)
    }),
    local.register(agentPolicyEditorCommands['agentPolicy.change'], (input) => {
      const entry = editable(input)
      if (!entry.rows.some((row) => row.id === input.rowId))
        throw new CommandError('STALE_TARGET', 'Candidate was removed')
      const next = {
        ...entry,
        rows: entry.rows.map((row) =>
          row.id === input.rowId
            ? { ...row, [input.field]: input.value, ...(input.field === 'modelId' ? { thinkingLevel: '' } : {}) }
            : row,
        ),
        dirty: true,
        error: null,
      }
      replace(next)
      return summary(next)
    }),
    local.register(agentPolicyEditorCommands['agentPolicy.remove'], (input) => {
      const entry = editable(input)
      const next = { ...entry, rows: entry.rows.filter((row) => row.id !== input.rowId), dirty: true, error: null }
      replace(next)
      return summary(next)
    }),
    local.register(agentPolicyEditorCommands['agentPolicy.save'], async (input) => {
      const commands = target(input)
      const entry = state.reader.getSnapshot().entries[input.parentSessionId]
      if (!entry?.snapshot || entry.status === 'saving')
        throw new CommandError('BUSY', 'Load or resolve the policy first')
      let pending: NonNullable<AgentPolicyEditorEntry['pending']>
      try {
        pending = entry.pending ?? {
          input: {
            parentSessionId: input.parentSessionId,
            baselineRevisions: entry.snapshot.revisions,
            candidates: input.inherit
              ? null
              : agentDispatchCandidatesSchema.parse(
                  entry.rows.map((row) => ({
                    difficulty: row.difficulty,
                    modelId: row.modelId,
                    thinkingLevel: row.thinkingLevel,
                    weight: Number(row.weight),
                  })),
                ),
          },
          key: crypto.randomUUID(),
        }
      } catch (error) {
        replace({ ...entry, status: 'error', error: 'INVALID_INPUT' })
        throw error
      }
      replace({ ...entry, status: 'saving', pending, error: null })
      try {
        const snapshot = await commands.execute('agent.policy.set', pending.input, { idempotencyKey: pending.key })
        const ready = fromSnapshot(snapshot)
        replace(ready)
        return summary(ready)
      } catch (error) {
        const failed: AgentPolicyEditorEntry = {
          parentSessionId: entry.parentSessionId,
          snapshot: entry.snapshot,
          rows: entry.rows,
          dirty: entry.dirty,
          status: unknownCodes.has(errorCode(error)) ? 'unknown' : 'error',
          error: errorCode(error),
          ...(unknownCodes.has(errorCode(error)) ? { pending } : {}),
        }
        replace(failed)
        throw error
      }
    }),
  ]
  return {
    reader: state.reader,
    dispose() {
      stopSurfaces()
      for (const controller of reads.values()) controller.abort()
      reads.clear()
      for (const stop of unregister) stop()
    },
  }
}
