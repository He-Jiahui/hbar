import { CommandError, defineCommand, type CommandRegistry, type ExecuteOptions } from '@hbar/commands'
import { idSchema } from '@hbar/contracts'
import { sessionSchema } from '@hbar/contracts/directory'
import {
  preSessionLaunchPreparationStateSchema,
  type PreSessionLaunchPreparationState,
} from '@hbar/contracts/commands/pre-session-draft'
import {
  sessionLaunchSelectionSchema,
  sessionLaunchTargetSchema,
  type SessionLaunchTargetPreparationManager,
  type SessionLaunchTargetSetInput,
  type SessionLaunchTargetSetReceipt,
} from '@hbar/contracts/commands/session-launch-target'
import { z } from 'zod'
import { createState, type StateReader } from './state'
import type { DirectoryQueries } from './directory'
import type { SessionLaunchDraftEntry, SessionLaunchDraftState, SessionTimelinePort, NavigationState } from './types'
import {
  capturePreSessionLaunchPreparation,
  PreSessionLaunchPreparation,
  type PreSessionLaunchPreparationKeys,
} from './pre-session-launch-preparation'

const MAX_ENTRIES = 32
const MAX_ACTIVE_OPERATIONS = 4
const id = idSchema
const revision = z.number().int().nonnegative().safe()
const sessionInput = z.strictObject({ sessionId: id })
const openInput = sessionInput.extend({ workspaceId: id })
const setSelectionInput = sessionInput.extend({
  expectedRevision: revision,
  selection: sessionLaunchSelectionSchema,
})

const entrySchema = z.strictObject({
  sessionId: id,
  workspaceId: id,
  revision,
  hostRevision: revision,
  selection: sessionLaunchSelectionSchema,
  phase: preSessionLaunchPreparationStateSchema.shape.phase,
  targetRevision: revision.nullable(),
  error: z.string().max(128).nullable(),
  preparation: preSessionLaunchPreparationStateSchema,
})
const entryResult = entrySchema
const entryOrNullResult = entrySchema.nullable()
const revisionResult = z.strictObject({ sessionId: id, revision })
const closeResult = z.strictObject({ sessionId: id, closed: z.literal(true) })
const metadata = (name: string, kind: 'command' | 'query' = 'command') => ({
  id: name,
  version: 1,
  owner: 'hbar.app-runtime',
  kind,
  execution: 'client' as const,
  stateEffect: kind === 'query' ? ('none' as const) : ('application' as const),
  scope: 'session' as const,
  category: 'workspace.session-launch-target',
  visibility: 'internal' as const,
  titleKey: `commands.${name}.title`,
  descriptionKey: `commands.${name}.description`,
  surfaces: ['api'] as ('api' | 'cli' | 'tui' | 'palette')[],
})

export const sessionLaunchDraftCommands = {
  'sessionLaunchDraft.open': defineCommand(metadata('sessionLaunchDraft.open'), openInput, entryResult),
  'sessionLaunchDraft.read': defineCommand(
    metadata('sessionLaunchDraft.read', 'query'),
    sessionInput,
    entryOrNullResult,
  ),
  'sessionLaunchDraft.setSelection': defineCommand(
    metadata('sessionLaunchDraft.setSelection'),
    setSelectionInput,
    revisionResult,
  ),
  'sessionLaunchDraft.prepare': defineCommand(
    metadata('sessionLaunchDraft.prepare'),
    sessionInput.extend({ expectedRevision: revision }),
    entryResult,
  ),
  'sessionLaunchDraft.reconcile': defineCommand(metadata('sessionLaunchDraft.reconcile'), sessionInput, entryResult),
  'sessionLaunchDraft.cancel': defineCommand(metadata('sessionLaunchDraft.cancel'), sessionInput, entryResult),
  'sessionLaunchDraft.close': defineCommand(metadata('sessionLaunchDraft.close'), sessionInput, closeResult),
}

const initialPreparation = (
  phase: PreSessionLaunchPreparationState['phase'] = 'idle',
  targetRevision: number | null = null,
  error: string | null = null,
): PreSessionLaunchPreparationState =>
  preSessionLaunchPreparationStateSchema.parse({
    phase,
    targetRevision,
    snapshot: null,
    error,
    cancelRequested: phase === 'cancel-requested',
  })

function failureCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code
  return 'EXECUTION_FAILED'
}

function sameSelection(
  left: SessionLaunchDraftEntry['selection'],
  right: SessionLaunchDraftEntry['selection'],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function phaseForTarget(target: z.infer<typeof sessionLaunchTargetSchema>): PreSessionLaunchPreparationState['phase'] {
  switch (target.resolution.status) {
    case 'idle':
      return 'idle'
    case 'preparing':
      return 'reconciling'
    case 'reconciling':
      return 'reconciling'
    case 'ready':
      return 'ready'
    case 'cancelled':
      return 'cancelled'
    case 'failed':
      return 'failed'
  }
}

function targetError(target: z.infer<typeof sessionLaunchTargetSchema>): string | null {
  return target.resolution.status === 'failed' || target.resolution.status === 'cancelled'
    ? target.resolution.code
    : target.resolution.status === 'reconciling'
      ? target.resolution.code
      : null
}

function freezeSelection(selection: z.infer<typeof sessionLaunchSelectionSchema>) {
  const parsed = sessionLaunchSelectionSchema.parse(selection)
  return Object.freeze(
    parsed.mode === 'shared-current' ? parsed : { ...parsed, branch: Object.freeze({ ...parsed.branch }) },
  ) as typeof parsed
}

function freezeEntry(entry: SessionLaunchDraftEntry): SessionLaunchDraftEntry {
  return Object.freeze({ ...entry, selection: freezeSelection(entry.selection) })
}

/** Local launch choice for an already-created, still-empty session; no Run or navigation side effect. */
export function createSessionLaunchDrafts(
  local: CommandRegistry,
  options: {
    readonly queries: DirectoryQueries
    readonly timeline?: SessionTimelinePort
    readonly preparation?: SessionLaunchTargetPreparationManager
    readonly navigation: StateReader<NavigationState>
    readonly onSubscriberError: (error: unknown) => void
    readonly isDisposed: () => boolean
  },
) {
  const available = Boolean(options.timeline && options.preparation)
  const state = createState<SessionLaunchDraftState>({ available, entries: {} }, options.onSubscriberError)
  const openings = new Map<string, Promise<SessionLaunchDraftEntry>>()
  const inFlight = new Map<string, Promise<SessionLaunchDraftEntry>>()
  const preparations = new Map<string, PreSessionLaunchPreparation>()
  let disposed = false

  const current = (sessionId: string) => state.reader.getSnapshot().entries[sessionId]
  const publish = (entry: SessionLaunchDraftEntry) => {
    if (disposed || options.isDisposed()) return
    const snapshot = state.reader.getSnapshot()
    if (!snapshot.entries[entry.sessionId] && Object.keys(snapshot.entries).length >= MAX_ENTRIES)
      throw new CommandError('BUSY', 'Too many session launch drafts are open')
    state.replace({
      ...snapshot,
      entries: { ...snapshot.entries, [entry.sessionId]: freezeEntry(entry) },
    })
  }
  const requireEntry = (sessionId: string) => {
    const entry = current(sessionId)
    if (!entry) throw new CommandError('NOT_FOUND', 'Open the session launch draft before using it')
    return entry
  }
  const requireAvailable = () => {
    if (disposed || options.isDisposed()) throw new CommandError('DISPOSED', 'Session launch drafts are disposed')
    if (!options.preparation || !options.timeline)
      throw new CommandError('CAPABILITY_UNAVAILABLE', 'Session launch preparation is unavailable')
    return { manager: options.preparation, timeline: options.timeline }
  }
  const assertSelected = (sessionId: string, workspaceId: string) => {
    const navigation = options.navigation.getSnapshot()
    if (navigation.status !== 'idle' || navigation.sessionId !== sessionId || navigation.workspaceId !== workspaceId)
      throw new CommandError('STALE_TARGET', 'Session launch draft belongs to another active Session')
  }
  const assertEntrySelected = (entry: SessionLaunchDraftEntry) => assertSelected(entry.sessionId, entry.workspaceId)

  async function inspectEligible(input: { sessionId: string; workspaceId: string }, execution: ExecuteOptions) {
    const { manager, timeline } = requireAvailable()
    assertSelected(input.sessionId, input.workspaceId)
    execution.signal?.throwIfAborted()
    const rawSession = await options.queries.execute('session.get', { sessionId: input.sessionId }, execution)
    if (!rawSession) throw new CommandError('NOT_FOUND', 'Session was not found')
    const session = sessionSchema.parse(rawSession)
    if (session.id !== input.sessionId || session.workspaceId !== input.workspaceId)
      throw new CommandError('STALE_TARGET', 'Session workspace changed; reopen its launch draft')
    if (session.archived)
      throw new CommandError('SESSION_ARCHIVED', 'Restore the Session before preparing its launch target')

    const rawTarget = await manager.readTarget(input.sessionId, execution.signal ? { signal: execution.signal } : {})
    const target = sessionLaunchTargetSchema.parse(rawTarget)
    if (target.sessionId !== input.sessionId || target.workspaceId !== input.workspaceId)
      throw new CommandError('INVALID_OUTPUT', 'Launch target does not belong to this Session and Workspace')
    if (target.locked)
      throw new CommandError('SESSION_LAUNCH_TARGET_LOCKED', 'The launch target is locked after the first Run')

    execution.signal?.throwIfAborted()
    // SessionTimelinePort currently has no AbortSignal parameter. Its snapshot is bounded to one message;
    // after it settles, every fact is rechecked before publishing or allowing preparation.
    const rawSnapshot: unknown = await timeline.snapshot(input.sessionId, undefined, 1)
    const timelineSnapshot = z
      .object({
        session: sessionSchema,
        messages: z.array(z.unknown()),
        runs: z.array(z.unknown()),
        approvals: z.array(z.unknown()),
        userInputs: z.array(z.unknown()),
        streams: z.array(z.unknown()),
        hasOlder: z.boolean(),
      })
      .safeParse(rawSnapshot)
    if (
      !timelineSnapshot.success ||
      timelineSnapshot.data.session.id !== input.sessionId ||
      timelineSnapshot.data.session.workspaceId !== input.workspaceId
    )
      throw new CommandError('INVALID_OUTPUT', 'Timeline snapshot does not match the selected Session')
    if (
      timelineSnapshot.data.messages.length > 0 ||
      timelineSnapshot.data.hasOlder ||
      timelineSnapshot.data.runs.length > 0 ||
      timelineSnapshot.data.approvals.length > 0 ||
      timelineSnapshot.data.userInputs.length > 0 ||
      timelineSnapshot.data.streams.length > 0
    )
      throw new CommandError(
        'SESSION_LAUNCH_TARGET_LOCKED',
        'Session launch options are only available before its first Run',
      )

    execution.signal?.throwIfAborted()
    assertSelected(input.sessionId, input.workspaceId)
    const [latestSessionRaw, latestTargetRaw] = await Promise.all([
      options.queries.execute('session.get', { sessionId: input.sessionId }, execution),
      manager.readTarget(input.sessionId, execution.signal ? { signal: execution.signal } : {}),
    ])
    const latestSession = latestSessionRaw ? sessionSchema.parse(latestSessionRaw) : null
    const latestTarget = sessionLaunchTargetSchema.parse(latestTargetRaw)
    if (!latestSession || latestSession.id !== input.sessionId || latestSession.workspaceId !== input.workspaceId)
      throw new CommandError('STALE_TARGET', 'Session changed while verifying launch eligibility')
    if (latestSession.archived)
      throw new CommandError('SESSION_ARCHIVED', 'Restore the Session before preparing its launch target')
    if (latestTarget.sessionId !== input.sessionId || latestTarget.workspaceId !== input.workspaceId)
      throw new CommandError('INVALID_OUTPUT', 'Launch target changed ownership during verification')
    if (latestTarget.locked)
      throw new CommandError('SESSION_LAUNCH_TARGET_LOCKED', 'The launch target is locked after the first Run')
    if (target.revision !== latestTarget.revision || !sameSelection(target.selection, latestTarget.selection))
      throw new CommandError('COMMAND_CONFLICT', 'Session launch target changed while opening its draft')
    return { target: latestTarget, session: latestSession }
  }

  function prepKeys(): PreSessionLaunchPreparationKeys {
    return Object.freeze({
      setSelection: crypto.randomUUID(),
      start: crypto.randomUUID(),
      cancel: crypto.randomUUID(),
      reconcile: crypto.randomUUID(),
    })
  }

  function createPreparation(entry: SessionLaunchDraftEntry): PreSessionLaunchPreparation {
    const { manager } = requireAvailable()
    const expectedHostRevision = entry.hostRevision
    const fencedManager: SessionLaunchTargetPreparationManager = {
      async readTarget(sessionId, readOptions) {
        const target = sessionLaunchTargetSchema.parse(await manager.readTarget(sessionId, readOptions))
        if (
          sessionId !== entry.sessionId ||
          target.sessionId !== entry.sessionId ||
          target.workspaceId !== entry.workspaceId
        )
          throw new CommandError('INVALID_OUTPUT', 'Launch target does not match the captured Session')
        if (target.revision !== expectedHostRevision)
          throw new CommandError('COMMAND_CONFLICT', 'Session launch target changed; reopen its launch draft')
        if (target.locked)
          throw new CommandError('SESSION_LAUNCH_TARGET_LOCKED', 'The launch target is locked after the first Run')
        return target
      },
      async setSelection(input: SessionLaunchTargetSetInput, writeOptions): Promise<SessionLaunchTargetSetReceipt> {
        if (input.sessionId !== entry.sessionId || input.expectedRevision !== expectedHostRevision)
          throw new CommandError('COMMAND_CONFLICT', 'Session launch target changed; reopen its launch draft')
        return manager.setSelection(input, writeOptions)
      },
      readSelectionReceipt: (input, readOptions) => manager.readSelectionReceipt(input, readOptions),
      startPreparation: (input, writeOptions) => manager.startPreparation(input, writeOptions),
      readPreparation: (input, readOptions) => manager.readPreparation(input, readOptions),
      cancelPreparation: (input, writeOptions) => manager.cancelPreparation(input, writeOptions),
      reconcilePreparation: (input, writeOptions) => manager.reconcilePreparation(input, writeOptions),
    }
    return new PreSessionLaunchPreparation(
      fencedManager,
      capturePreSessionLaunchPreparation(entry.workspaceId, entry.selection, prepKeys()),
    )
  }

  function replacePreparationState(
    entry: SessionLaunchDraftEntry,
    preparation: PreSessionLaunchPreparationState,
    error: string | null = preparation.error,
  ) {
    const targetRevision = preparation.phase === 'ready' ? preparation.targetRevision : null
    const hostRevision = preparation.targetRevision ?? entry.hostRevision
    const updated: SessionLaunchDraftEntry = {
      ...entry,
      hostRevision,
      phase: preparation.phase,
      targetRevision,
      error,
      preparation,
    }
    publish(updated)
    return current(entry.sessionId) ?? updated
  }

  local.register(sessionLaunchDraftCommands['sessionLaunchDraft.open'], async (input, execution) => {
    const existing = current(input.sessionId)
    if (existing) {
      if (existing.workspaceId !== input.workspaceId)
        throw new CommandError('STALE_TARGET', 'Session launch draft is already open for another Workspace')
      assertEntrySelected(existing)
      return existing
    }
    const prior = openings.get(input.sessionId)
    if (prior) {
      const result = await prior
      if (result.workspaceId !== input.workspaceId)
        throw new CommandError('STALE_TARGET', 'Session launch draft is already opening for another Workspace')
      return result
    }
    if (Object.keys(state.reader.getSnapshot().entries).length >= MAX_ENTRIES)
      throw new CommandError('BUSY', 'Too many session launch drafts are open')
    requireAvailable()
    assertSelected(input.sessionId, input.workspaceId)
    const opening = (async () => {
      const { target } = await inspectEligible(input, execution)
      execution.signal?.throwIfAborted()
      assertSelected(input.sessionId, input.workspaceId)
      const phase = phaseForTarget(target)
      const phaseError = targetError(target)
      const prep = initialPreparation(phase, phase === 'ready' ? target.revision : null, phaseError)
      const result = entrySchema.parse({
        sessionId: input.sessionId,
        workspaceId: input.workspaceId,
        revision: 0,
        hostRevision: target.revision,
        selection: target.selection,
        phase,
        targetRevision: phase === 'ready' ? target.revision : null,
        error: phaseError,
        preparation: prep,
      })
      publish(result)
      return current(input.sessionId) ?? result
    })()
    openings.set(input.sessionId, opening)
    try {
      return await opening
    } finally {
      if (openings.get(input.sessionId) === opening) openings.delete(input.sessionId)
    }
  })

  local.register(sessionLaunchDraftCommands['sessionLaunchDraft.read'], (input) => current(input.sessionId) ?? null)

  local.register(sessionLaunchDraftCommands['sessionLaunchDraft.setSelection'], (input) => {
    const entry = requireEntry(input.sessionId)
    assertEntrySelected(entry)
    if (inFlight.has(input.sessionId)) throw new CommandError('BUSY', 'Session launch draft is preparing')
    if (entry.revision !== input.expectedRevision)
      throw new CommandError('COMMAND_CONFLICT', 'Session launch draft revision changed')
    const selection = freezeSelection(input.selection)
    if (sameSelection(entry.selection, selection)) return { sessionId: input.sessionId, revision: entry.revision }
    if (entry.revision === Number.MAX_SAFE_INTEGER)
      throw new CommandError('INVALID_STATE', 'Session launch draft revision is exhausted')
    if (['queued', 'starting', 'preparing', 'cancel-requested', 'reconciling', 'unknown'].includes(entry.phase))
      throw new CommandError('BUSY', 'Reconcile or cancel the current preparation before changing its selection')
    preparations.get(input.sessionId)?.dispose()
    preparations.delete(input.sessionId)
    const nextRevision = entry.revision + 1
    const updated = entrySchema.parse({
      ...entry,
      revision: nextRevision,
      selection,
      phase: 'idle',
      targetRevision: null,
      error: null,
      preparation: initialPreparation(),
    })
    publish(updated)
    return { sessionId: input.sessionId, revision: nextRevision }
  })

  local.register(sessionLaunchDraftCommands['sessionLaunchDraft.prepare'], async (input, execution) => {
    const initial = requireEntry(input.sessionId)
    assertEntrySelected(initial)
    if (initial.revision !== input.expectedRevision)
      throw new CommandError('COMMAND_CONFLICT', 'Session launch draft revision changed')
    const prior = inFlight.get(input.sessionId)
    if (prior) return prior
    if (inFlight.size >= MAX_ACTIVE_OPERATIONS)
      throw new CommandError('BUSY', 'Session launch preparation capacity is full')
    const pending = (async () => {
      try {
        const { target } = await inspectEligible(initial, execution)
        const currentEntry = requireEntry(input.sessionId)
        if (currentEntry.revision !== initial.revision)
          throw new CommandError('COMMAND_CONFLICT', 'Session launch draft changed while preparing')
        let preparation = preparations.get(input.sessionId)
        // An existing adapter owns frozen idempotency keys and may need to recover a
        // committed-but-unacknowledged Host receipt. Do not fence that recovery with
        // the older outer draft revision; the adapter validates its original receipt.
        if (!preparation && target.revision !== currentEntry.hostRevision)
          throw new CommandError('COMMAND_CONFLICT', 'Session launch target changed; reopen its draft')
        if (
          !preparation &&
          target.resolution.status === 'ready' &&
          sameSelection(target.selection, currentEntry.selection)
        ) {
          const preparation = initialPreparation('ready', target.revision)
          return replacePreparationState({ ...currentEntry, hostRevision: target.revision }, preparation, null)
        }
        if (!preparation) {
          preparation = createPreparation(currentEntry)
          preparations.set(input.sessionId, preparation)
        }
        const working = {
          ...currentEntry,
          phase: 'preparing' as const,
          targetRevision: null,
          error: null,
          preparation: initialPreparation('preparing', null),
        }
        publish(working)
        if (preparation.getRecoveryStage() !== 'launchPreparation') {
          const recovered = await preparation.reconcile(input.sessionId, execution.signal)
          const recoveredEntry = replacePreparationState(current(input.sessionId) ?? currentEntry, recovered)
          if (recovered.phase === 'ready') return recoveredEntry
        }
        const outcome = await preparation.prepare(input.sessionId, {
          ...(execution.signal ? { signal: execution.signal } : {}),
          mayContinue: () => {
            if (disposed || options.isDisposed()) return false
            const latest = current(input.sessionId)
            if (!latest || latest.revision !== initial.revision || latest.workspaceId !== initial.workspaceId)
              return false
            const navigation = options.navigation.getSnapshot()
            return (
              navigation.status === 'idle' &&
              navigation.sessionId === input.sessionId &&
              navigation.workspaceId === initial.workspaceId
            )
          },
        })
        const resultState = preparation.getState()
        const updated = replacePreparationState(
          current(input.sessionId) ?? currentEntry,
          resultState,
          resultState.error,
        )
        if (outcome.kind === 'ready' && outcome.snapshot.targetRevision !== updated.targetRevision)
          throw new CommandError('INVALID_OUTPUT', 'Ready preparation did not match its captured target revision')
        return updated
      } catch (error) {
        const activePreparation = preparations.get(input.sessionId)
        if (activePreparation) {
          const currentEntry = current(input.sessionId)
          if (currentEntry?.revision === initial.revision)
            replacePreparationState(currentEntry, activePreparation.getState(), failureCode(error))
        }
        throw error
      }
    })()
    inFlight.set(input.sessionId, pending)
    try {
      return await pending
    } finally {
      if (inFlight.get(input.sessionId) === pending) inFlight.delete(input.sessionId)
    }
  })

  local.register(sessionLaunchDraftCommands['sessionLaunchDraft.reconcile'], async (input, execution) => {
    const entry = requireEntry(input.sessionId)
    assertEntrySelected(entry)
    const prior = inFlight.get(input.sessionId)
    if (prior) throw new CommandError('BUSY', 'Session launch draft already has an active operation')
    if (inFlight.size >= MAX_ACTIVE_OPERATIONS)
      throw new CommandError('BUSY', 'Session launch preparation capacity is full')
    const pending = (async () => {
      const { target } = await inspectEligible(entry, execution)
      const currentEntry = requireEntry(input.sessionId)
      let preparation = preparations.get(input.sessionId)
      if (!preparation && target.revision !== currentEntry.hostRevision)
        throw new CommandError('COMMAND_CONFLICT', 'Session launch target changed; reopen its draft')
      if (
        !preparation &&
        target.resolution.status === 'ready' &&
        sameSelection(target.selection, currentEntry.selection)
      ) {
        const preparation = initialPreparation('ready', target.revision)
        return replacePreparationState({ ...currentEntry, hostRevision: target.revision }, preparation, null)
      }

      const joinDurableOperation =
        !preparation && (target.resolution.status === 'preparing' || target.resolution.status === 'reconciling')
      if (!preparation && !joinDurableOperation) return currentEntry
      if (!preparation) {
        preparation = createPreparation(currentEntry)
        preparations.set(input.sessionId, preparation)
      }
      publish({
        ...currentEntry,
        phase: 'reconciling',
        targetRevision: null,
        error: null,
        preparation: initialPreparation('reconciling'),
      })
      try {
        if (joinDurableOperation) {
          await preparation.prepare(input.sessionId, {
            ...(execution.signal ? { signal: execution.signal } : {}),
            mayContinue: () => {
              const latest = current(input.sessionId)
              const navigation = options.navigation.getSnapshot()
              return (
                !disposed &&
                !options.isDisposed() &&
                latest?.revision === entry.revision &&
                navigation.status === 'idle' &&
                navigation.sessionId === input.sessionId &&
                navigation.workspaceId === entry.workspaceId
              )
            },
          })
        } else {
          await preparation.reconcile(input.sessionId, execution.signal)
        }
        return replacePreparationState(current(input.sessionId) ?? currentEntry, preparation.getState())
      } catch (error) {
        const latest = current(input.sessionId)
        if (latest?.revision === entry.revision)
          replacePreparationState(latest, preparation.getState(), failureCode(error))
        throw error
      }
    })()
    inFlight.set(input.sessionId, pending)
    try {
      return await pending
    } finally {
      if (inFlight.get(input.sessionId) === pending) inFlight.delete(input.sessionId)
    }
  })

  local.register(sessionLaunchDraftCommands['sessionLaunchDraft.cancel'], async (input) => {
    const entry = requireEntry(input.sessionId)
    const preparation = preparations.get(input.sessionId)
    if (!preparation) return entry
    const currentEntry = current(input.sessionId) ?? entry
    publish({
      ...currentEntry,
      phase: 'cancel-requested',
      error: null,
      preparation: { ...preparation.getState(), phase: 'cancel-requested', cancelRequested: true, error: null },
    })
    try {
      await preparation.cancel()
    } catch (error) {
      const latest = current(input.sessionId)
      if (latest) replacePreparationState(latest, preparation.getState(), failureCode(error))
      throw error
    }
    return replacePreparationState(current(input.sessionId) ?? currentEntry, preparation.getState())
  })

  local.register(sessionLaunchDraftCommands['sessionLaunchDraft.close'], (input) => {
    const entry = requireEntry(input.sessionId)
    if (openings.has(input.sessionId) || inFlight.has(input.sessionId))
      throw new CommandError('BUSY', 'Wait for the current launch-draft operation before closing it')
    if (
      ['queued', 'starting', 'preparing', 'cancel-requested', 'reconciling', 'unknown', 'paused-navigation'].includes(
        entry.phase,
      )
    )
      throw new CommandError('BUSY', 'Reconcile or cancel the unresolved preparation before closing this draft')
    preparations.get(input.sessionId)?.dispose()
    preparations.delete(input.sessionId)
    const snapshot = state.reader.getSnapshot()
    const entries = { ...snapshot.entries }
    delete entries[input.sessionId]
    state.replace({ ...snapshot, entries })
    return { sessionId: input.sessionId, closed: true as const }
  })

  return {
    reader: state.reader,
    dispose() {
      if (disposed) return
      disposed = true
      for (const preparation of preparations.values()) preparation.dispose()
      preparations.clear()
      openings.clear()
      inFlight.clear()
      state.dispose()
    },
  }
}
