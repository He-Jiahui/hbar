import { CommandError, defineCommand, type CommandRegistry } from '@hbar/commands'
import { idSchema } from '@hbar/contracts'
import {
  sessionLaunchBranchCreateResultSchema,
  sessionLaunchBranchesPageSchema,
  type SessionLaunchBranchesManager,
  type SessionLaunchBranchesReader,
} from '@hbar/contracts/commands/session-launch-branches'
import {
  sessionLaunchSelectionSchema,
  type SessionLaunchSelection,
} from '@hbar/contracts/commands/session-launch-target'
import { preSessionDraftCommands, type PreSessionDraftState } from '@hbar/contracts/commands/pre-session-draft'
import { z } from 'zod'
import { createState, type StateReader } from './state'
import type { PreSessionDraftsState } from './types'

const MAX_BASE_LOOKUP_PAGES = 4
const BASE_LOOKUP_PAGE_SIZE = 50
const ACTION_TIMEOUT_MS = 30_000
const draftIdSchema = z.string().uuid()
const revisionSchema = z.number().int().nonnegative().safe()
const branchRefSchema = z
  .string()
  .min('refs/heads/'.length + 1)
  .max(1_011)
  .startsWith('refs/heads/')
const gitObjectIdSchema = z.union([z.string().regex(/^[0-9a-f]{40}$/i), z.string().regex(/^[0-9a-f]{64}$/i)])
const phaseSchema = z.enum(['capturing', 'ready', 'creating', 'unknown', 'verified', 'created', 'selected', 'failed'])
const checkResultSchema = z.enum(['not-checked', 'not-found', 'different-oid', 'incomplete', 'matched'])

export interface PreSessionLaunchBranchCreationEntry {
  readonly draftId: string
  readonly workspaceId: string
  /** Draft revision observed when this base was captured; later text edits remain independently owned. */
  readonly draftRevision: number
  readonly selection: SessionLaunchSelection
  readonly baseRef: string | null
  readonly baseOid: string | null
  readonly phase: z.infer<typeof phaseSchema>
  readonly name: string | null
  readonly createdRef: string | null
  readonly createdOid: string | null
  readonly attemptId: string | null
  readonly checkResult: z.infer<typeof checkResultSchema>
  readonly error: string | null
}

export interface PreSessionLaunchBranchCreationState {
  readonly entries: Readonly<Record<string, Readonly<PreSessionLaunchBranchCreationEntry>>>
}

const entrySchema = z.strictObject({
  draftId: draftIdSchema,
  workspaceId: idSchema,
  draftRevision: revisionSchema,
  selection: sessionLaunchSelectionSchema,
  baseRef: branchRefSchema.nullable(),
  baseOid: gitObjectIdSchema.nullable(),
  phase: phaseSchema,
  name: z.string().trim().min(1).max(1_000).nullable(),
  createdRef: branchRefSchema.nullable(),
  createdOid: gitObjectIdSchema.nullable(),
  attemptId: z.string().uuid().nullable(),
  checkResult: checkResultSchema,
  error: z.string().max(128).nullable(),
})
const stateSchema = z.strictObject({ entries: z.record(draftIdSchema, entrySchema) })
const captureInputSchema = z.strictObject({ draftId: draftIdSchema, expectedRevision: revisionSchema })
const createInputSchema = z.strictObject({
  draftId: draftIdSchema,
  expectedRevision: revisionSchema,
  name: z.string().trim().min(1).max(1_000),
})
const actionInputSchema = z.strictObject({ draftId: draftIdSchema, expectedRevision: revisionSchema })
const cancelInputSchema = z.strictObject({ draftId: draftIdSchema })

function commandMetadata(id: string) {
  return {
    id,
    version: 1,
    owner: 'hbar.pre-session-launch-branch-creation',
    kind: 'command' as const,
    execution: 'client' as const,
    stateEffect: 'application' as const,
    category: 'workspace.session-launch-target',
    scope: 'client' as const,
    titleKey: `commands.${id}.title`,
    descriptionKey: `commands.${id}.description`,
    visibility: 'internal' as const,
    surfaces: ['api'] as ('api' | 'cli' | 'palette' | 'tui')[],
    timeoutMs: ACTION_TIMEOUT_MS,
    maxConcurrent: 4,
    cancelMode: 'cooperative' as const,
  }
}

export const preSessionLaunchBranchCreationCommands = {
  'preSessionLaunchBranchCreation.capture': defineCommand(
    commandMetadata('preSessionLaunchBranchCreation.capture'),
    captureInputSchema,
    entrySchema,
  ),
  'preSessionLaunchBranchCreation.create': defineCommand(
    commandMetadata('preSessionLaunchBranchCreation.create'),
    createInputSchema,
    entrySchema,
  ),
  'preSessionLaunchBranchCreation.reconcile': defineCommand(
    commandMetadata('preSessionLaunchBranchCreation.reconcile'),
    actionInputSchema,
    entrySchema,
  ),
  'preSessionLaunchBranchCreation.adopt': defineCommand(
    commandMetadata('preSessionLaunchBranchCreation.adopt'),
    actionInputSchema,
    entrySchema,
  ),
  'preSessionLaunchBranchCreation.cancel': defineCommand(
    commandMetadata('preSessionLaunchBranchCreation.cancel'),
    cancelInputSchema,
    entrySchema.nullable(),
  ),
}

interface CaptureOwner {
  readonly generation: number
  readonly controller: AbortController
  readonly removeAbort: () => void
}

type ExactBranchLookup =
  | { readonly kind: 'found'; readonly branch: z.infer<typeof sessionLaunchBranchesPageSchema>['branches'][number] }
  | { readonly kind: 'not-found' | 'incomplete' }

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string')
    return error.code.slice(0, 128)
  return 'EXECUTION_FAILED'
}

function asCommandError(error: unknown): CommandError {
  if (error instanceof CommandError) return error
  return new CommandError(errorCode(error), 'Branch creation failed')
}

function assertActive(signal: AbortSignal): void {
  if (signal.aborted) throw new CommandError('CANCELLED', 'Branch operation was cancelled')
}

function assertEditableDraft(draft: PreSessionDraftState, expectedRevision: number): void {
  if (draft.revision !== expectedRevision) throw new CommandError('VERSION_CONFLICT', 'Pre-session draft changed')
  if (draft.phase === 'accepted') throw new CommandError('STALE_TARGET', 'This draft was already sent')
  if (['preparing', 'creating', 'configuring', 'submitting', 'unknown'].includes(draft.phase))
    throw new CommandError('BUSY', 'Wait for the first send to finish before changing its branch')
  if (draft.workspaceId === null) throw new CommandError('INVALID_STATE', 'Choose a workspace before creating a branch')
}

function baseRefFromSelection(selection: SessionLaunchSelection): {
  readonly ref: string | null
  readonly oid: string | null
} {
  if (selection.mode === 'shared-current') return { ref: null, oid: null }
  if (selection.mode === 'shared-branch') return { ref: selection.branch.ref, oid: selection.branch.tipOid }
  if (selection.branch.kind === 'derived') return { ref: selection.branch.baseRef, oid: null }
  if (selection.branch.kind === 'existing') return { ref: `refs/heads/${selection.branch.name}`, oid: null }
  return { ref: null, oid: null }
}

function sameSelection(left: SessionLaunchSelection, right: SessionLaunchSelection): boolean {
  return (
    JSON.stringify(sessionLaunchSelectionSchema.parse(left)) ===
    JSON.stringify(sessionLaunchSelectionSchema.parse(right))
  )
}

async function readExactBranch(
  reader: SessionLaunchBranchesReader,
  workspaceId: string,
  ref: string,
  signal: AbortSignal,
): Promise<ExactBranchLookup> {
  const name = ref.slice('refs/heads/'.length)
  const search = name.slice(0, 256)
  let cursor: string | undefined
  for (let pageNumber = 0; pageNumber < MAX_BASE_LOOKUP_PAGES; pageNumber++) {
    assertActive(signal)
    const raw: unknown = await reader.list(
      {
        workspaceId,
        search,
        limit: BASE_LOOKUP_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      },
      { signal },
    )
    const parsed = sessionLaunchBranchesPageSchema.safeParse(raw)
    if (!parsed.success || parsed.data.workspaceId !== workspaceId)
      throw new CommandError('INVALID_OUTPUT', 'Branch lookup returned another workspace or invalid page')
    const page = parsed.data
    if (page.repository.kind !== 'repository') return { kind: 'not-found' }
    if (page.repository.workspaceScope !== 'repository-root')
      throw new CommandError('CAPABILITY_UNAVAILABLE', 'Branch creation requires the registered repository root')
    const branch = page.branches.find((candidate) => candidate.ref === ref)
    if (branch) return { kind: 'found', branch }
    if (!page.nextCursor) return { kind: page.incomplete ? 'incomplete' : 'not-found' }
    cursor = page.nextCursor
  }
  return { kind: 'incomplete' }
}

function selectedBranch(
  selection: SessionLaunchSelection,
  createdRef: string,
  createdOid: string,
): SessionLaunchSelection {
  if (selection.mode === 'isolated-worktree')
    return { mode: 'isolated-worktree', branch: { kind: 'derived', baseRef: createdRef } }
  return { mode: 'shared-branch', branch: { ref: createdRef, tipOid: createdOid } }
}

function selectionStillCurrent(draft: PreSessionDraftState | undefined, entry: PreSessionLaunchBranchCreationEntry) {
  return Boolean(
    draft &&
    draft.workspaceId === entry.workspaceId &&
    sameSelection(draft.launchSelection, entry.selection) &&
    draft.phase !== 'accepted' &&
    !['preparing', 'creating', 'configuring', 'submitting', 'unknown'].includes(draft.phase),
  )
}

/** Owns exact base capture and unknown-write reconciliation for one pre-session draft. */
export function createPreSessionLaunchBranchCreation(
  local: CommandRegistry,
  options: {
    readonly reader?: SessionLaunchBranchesReader
    readonly manager?: SessionLaunchBranchesManager
    readonly drafts: StateReader<PreSessionDraftsState>
    readonly onSubscriberError: (error: unknown) => void
    readonly isDisposed: () => boolean
  },
) {
  const state = createState<PreSessionLaunchBranchCreationState>({ entries: {} }, options.onSubscriberError)
  const captures = new Map<string, CaptureOwner>()
  const generations = new Map<string, number>()
  let disposed = false

  const currentDraft = (draftId: string, expectedRevision: number): PreSessionDraftState => {
    const draft = options.drafts.getSnapshot()[draftId]
    if (!draft) throw new CommandError('DRAFT_NOT_FOUND', 'Pre-session draft is no longer open')
    assertEditableDraft(draft, expectedRevision)
    return draft
  }
  const preflightDraftEdit = async (draftId: string, expectedRevision: number): Promise<PreSessionDraftState> => {
    const draft = currentDraft(draftId, expectedRevision)
    await local.execute(preSessionDraftCommands['preSessionDraft.setLaunchSelection'].metadata.id, {
      draftId,
      selection: draft.launchSelection,
      expectedRevision,
    })
    if (disposed || options.isDisposed()) throw new CommandError('DISPOSED', 'Branch creation runtime was disposed')
    return currentDraft(draftId, expectedRevision)
  }
  const getEntry = (draftId: string): PreSessionLaunchBranchCreationEntry => {
    const entry = state.reader.getSnapshot().entries[draftId]
    if (!entry) throw new CommandError('INVALID_STATE', 'No branch base is captured for this draft')
    return entry
  }
  const publish = (entry: PreSessionLaunchBranchCreationEntry | null, draftId: string): void => {
    const entries = { ...state.reader.getSnapshot().entries }
    if (entry) entries[draftId] = entry
    else delete entries[draftId]
    state.replace(stateSchema.parse({ entries }))
  }
  const bumpGeneration = (draftId: string): number => {
    const generation = (generations.get(draftId) ?? 0) + 1
    generations.set(draftId, generation)
    return generation
  }
  const createOwner = (draftId: string, signal: AbortSignal): CaptureOwner => {
    const controller = new AbortController()
    const relayAbort = () => controller.abort()
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', relayAbort, { once: true })
    const generation = bumpGeneration(draftId)
    const prior = captures.get(draftId)
    prior?.controller.abort()
    prior?.removeAbort()
    const owner = { generation, controller, removeAbort: () => signal.removeEventListener('abort', relayAbort) }
    captures.set(draftId, owner)
    return owner
  }
  const ownerIsCurrent = (draftId: string, owner: CaptureOwner): boolean =>
    !disposed && !options.isDisposed() && generations.get(draftId) === owner.generation
  const releaseOwner = (draftId: string, owner: CaptureOwner): void => {
    owner.removeAbort()
    if (captures.get(draftId) === owner) captures.delete(draftId)
  }
  const requireReader = (): SessionLaunchBranchesReader => {
    if (!options.reader) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Workspace branch discovery is unavailable')
    return options.reader
  }

  local.register(
    preSessionLaunchBranchCreationCommands['preSessionLaunchBranchCreation.capture'],
    async ({ draftId, expectedRevision }, execution) => {
      if (disposed || options.isDisposed()) throw new CommandError('DISPOSED', 'Branch creation runtime was disposed')
      const draft = await preflightDraftEdit(draftId, expectedRevision)
      const workspaceId = draft.workspaceId
      if (!workspaceId) throw new CommandError('INVALID_STATE', 'Choose a workspace before creating a branch')
      const previous = state.reader.getSnapshot().entries[draftId]
      if (previous && ['creating', 'unknown', 'verified', 'created'].includes(previous.phase)) return previous
      const owner = createOwner(draftId, execution.signal)
      const base = baseRefFromSelection(draft.launchSelection)
      let ref = base.ref
      let expectedOid = base.oid
      const capturing: PreSessionLaunchBranchCreationEntry = {
        draftId,
        workspaceId,
        draftRevision: draft.revision,
        selection: sessionLaunchSelectionSchema.parse(draft.launchSelection),
        baseRef: ref,
        baseOid: null,
        phase: 'capturing',
        name: previous?.name ?? null,
        createdRef: null,
        createdOid: null,
        attemptId: null,
        checkResult: 'not-checked',
        error: null,
      }
      publish(capturing, draftId)
      try {
        const reader = requireReader()
        if (!ref && draft.launchSelection.mode === 'shared-current') {
          const rawHead: unknown = await reader.list(
            { workspaceId, search: '', limit: 1 },
            { signal: owner.controller.signal },
          )
          const parsedHead = sessionLaunchBranchesPageSchema.safeParse(rawHead)
          if (!parsedHead.success || parsedHead.data.workspaceId !== workspaceId)
            throw new CommandError('INVALID_OUTPUT', 'Branch head does not match the selected workspace')
          if (parsedHead.data.repository.kind !== 'repository')
            throw new CommandError('GIT_NOT_REPOSITORY', 'The selected workspace is not a Git repository')
          if (parsedHead.data.repository.workspaceScope !== 'repository-root')
            throw new CommandError('CAPABILITY_UNAVAILABLE', 'Branch creation requires the registered repository root')
          if (parsedHead.data.repository.head.kind !== 'branch')
            throw new CommandError(
              'GIT_BRANCH_BASE_NOT_FOUND',
              'Choose a committed local branch before creating another',
            )
          ref = parsedHead.data.repository.head.ref
          expectedOid = parsedHead.data.repository.head.oid
        }
        if (!ref)
          throw new CommandError('CAPABILITY_UNAVAILABLE', 'Select a local base branch before creating a branch')
        if (!ref.startsWith('refs/heads/') || ref.length <= 'refs/heads/'.length)
          throw new CommandError('GIT_BRANCH_BASE_NOT_FOUND', 'The selected base is not a local branch')
        const lookup = await readExactBranch(reader, workspaceId, ref, owner.controller.signal)
        if (!ownerIsCurrent(draftId, owner)) throw new CommandError('CANCELLED', 'Branch base capture was superseded')
        if (lookup.kind !== 'found')
          throw new CommandError(
            lookup.kind === 'incomplete' ? 'BRANCH_BASE_UNVERIFIABLE' : 'GIT_BRANCH_BASE_NOT_FOUND',
            'The selected branch could not be verified from the bounded local branch list',
          )
        if (expectedOid && lookup.branch.tipOid.toLowerCase() !== expectedOid.toLowerCase())
          throw new CommandError('GIT_BRANCH_BASE_CHANGED', 'The selected branch moved after it was chosen')
        const latest = currentDraft(draftId, expectedRevision)
        if (latest.workspaceId !== workspaceId || !sameSelection(latest.launchSelection, draft.launchSelection))
          throw new CommandError('STALE_TARGET', 'The selected workspace or base branch changed')
        const ready = entrySchema.parse({
          ...capturing,
          baseRef: ref,
          baseOid: lookup.branch.tipOid,
          phase: 'ready',
        })
        if (ownerIsCurrent(draftId, owner)) publish(ready, draftId)
        return ready
      } catch (error: unknown) {
        const failure = asCommandError(error)
        if (ownerIsCurrent(draftId, owner)) publish({ ...capturing, phase: 'failed', error: failure.code }, draftId)
        throw failure
      } finally {
        releaseOwner(draftId, owner)
      }
    },
  )

  local.register(
    preSessionLaunchBranchCreationCommands['preSessionLaunchBranchCreation.create'],
    async ({ draftId, expectedRevision, name }, execution) => {
      if (disposed || options.isDisposed()) throw new CommandError('DISPOSED', 'Branch creation runtime was disposed')
      const draft = await preflightDraftEdit(draftId, expectedRevision)
      const current = getEntry(draftId)
      if (['creating', 'unknown', 'verified', 'created'].includes(current.phase))
        throw new CommandError('BUSY', 'Reconcile or use the existing branch before another write')
      if (current.phase !== 'ready' && current.phase !== 'failed')
        throw new CommandError('INVALID_STATE', 'Verify the selected base before creating a branch')
      if (!current.baseRef || !current.baseOid)
        throw new CommandError('INVALID_STATE', 'The selected base commit is unavailable')
      if (draft.workspaceId !== current.workspaceId || !sameSelection(draft.launchSelection, current.selection))
        throw new CommandError('STALE_TARGET', 'The selected workspace or base branch changed')
      if (!options.manager) {
        const error = new CommandError('CAPABILITY_UNAVAILABLE', 'Branch creation is unavailable on this Host')
        publish({ ...current, phase: 'failed', name, error: error.code }, draftId)
        throw error
      }

      const attemptId = crypto.randomUUID()
      const pending = entrySchema.parse({
        ...current,
        phase: 'creating',
        name,
        attemptId,
        checkResult: 'not-checked',
        error: null,
        createdRef: null,
        createdOid: null,
      })
      publish(pending, draftId)
      try {
        if (execution.signal.aborted)
          throw new CommandError('CANCELLED', 'Branch creation was cancelled before dispatch')
        const raw: unknown = await options.manager.create(
          { workspaceId: current.workspaceId, name, baseRef: current.baseRef, expectedBaseOid: current.baseOid },
          { idempotencyKey: attemptId, requestId: execution.requestId, signal: execution.signal },
        )
        if (disposed || options.isDisposed())
          return entrySchema.parse({ ...pending, phase: 'unknown', error: 'RESULT_UNKNOWN' })
        const parsed = sessionLaunchBranchCreateResultSchema.safeParse(raw)
        if (
          !parsed.success ||
          parsed.data.workspaceId !== current.workspaceId ||
          parsed.data.name !== name ||
          parsed.data.createdRef !== `refs/heads/${name}` ||
          parsed.data.baseRef !== current.baseRef ||
          parsed.data.baseOid.toLowerCase() !== current.baseOid.toLowerCase() ||
          parsed.data.createdOid.toLowerCase() !== current.baseOid.toLowerCase()
        )
          throw new CommandError('RESULT_UNKNOWN', 'Branch creation acknowledgement is not verifiable')
        if (execution.signal.aborted)
          throw new CommandError('RESULT_UNKNOWN', 'Branch creation response was interrupted; verify the original ref')

        const latest = options.drafts.getSnapshot()[draftId]
        const confirmed = entrySchema.parse({
          ...pending,
          phase: 'created',
          createdRef: parsed.data.createdRef,
          createdOid: parsed.data.createdOid,
          checkResult: 'matched',
        })
        if (!latest || !selectionStillCurrent(latest, current)) {
          publish({ ...confirmed, error: 'STALE_TARGET' }, draftId)
          return confirmed
        }
        try {
          await local.execute(preSessionDraftCommands['preSessionDraft.setLaunchSelection'].metadata.id, {
            draftId,
            selection: selectedBranch(current.selection, parsed.data.createdRef, parsed.data.createdOid),
            expectedRevision: latest.revision,
          })
        } catch {
          if (!disposed && !options.isDisposed()) publish({ ...confirmed, error: 'STALE_TARGET' }, draftId)
          return confirmed
        }
        const selected = entrySchema.parse({ ...confirmed, phase: 'selected', error: null })
        if (!disposed && !options.isDisposed()) publish(selected, draftId)
        return selected
      } catch (error: unknown) {
        const failure = asCommandError(error)
        const unknown = [
          'RESULT_UNKNOWN',
          'GIT_BRANCH_RESULT_UNKNOWN',
          'DISCONNECTED',
          'CONNECTION_CLOSED',
          'TIMEOUT',
          'TIMED_OUT',
          'CANCELLED',
          'INVALID_OUTPUT',
          'EXECUTION_FAILED',
        ].includes(failure.code)
        const next = entrySchema.parse({
          ...pending,
          phase: unknown ? 'unknown' : 'failed',
          checkResult: 'not-checked',
          error: failure.code,
        })
        if (disposed || options.isDisposed())
          return entrySchema.parse({ ...pending, phase: 'unknown', error: failure.code })
        publish(next, draftId)
        if (unknown) return next
        throw failure
      }
    },
  )

  local.register(
    preSessionLaunchBranchCreationCommands['preSessionLaunchBranchCreation.reconcile'],
    async ({ draftId, expectedRevision }, execution) => {
      if (disposed || options.isDisposed()) throw new CommandError('DISPOSED', 'Branch creation runtime was disposed')
      const draft = options.drafts.getSnapshot()[draftId]
      if (!draft) throw new CommandError('DRAFT_NOT_FOUND', 'Pre-session draft is no longer open')
      if (draft.revision !== expectedRevision)
        throw new CommandError('VERSION_CONFLICT', 'Pre-session draft changed before branch verification')
      const current = getEntry(draftId)
      if (current.phase !== 'unknown' || !current.name || !current.baseOid)
        throw new CommandError('INVALID_STATE', 'There is no uncertain branch creation to verify')
      const reader = requireReader()
      const owner = createOwner(draftId, execution.signal)
      try {
        const lookup = await readExactBranch(
          reader,
          current.workspaceId,
          `refs/heads/${current.name}`,
          owner.controller.signal,
        )
        if (!ownerIsCurrent(draftId, owner)) throw new CommandError('CANCELLED', 'Branch check was superseded')
        if (!options.drafts.getSnapshot()[draftId])
          throw new CommandError('DRAFT_NOT_FOUND', 'Pre-session draft is no longer open')
        if (lookup.kind !== 'found') {
          const pending = entrySchema.parse({
            ...current,
            checkResult: lookup.kind,
            error: lookup.kind === 'incomplete' ? 'BRANCH_BASE_UNVERIFIABLE' : 'BRANCH_NOT_CONFIRMED',
          })
          publish(pending, draftId)
          return pending
        }
        if (lookup.branch.tipOid.toLowerCase() !== current.baseOid.toLowerCase()) {
          const pending = entrySchema.parse({ ...current, checkResult: 'different-oid', error: 'BRANCH_NOT_CONFIRMED' })
          publish(pending, draftId)
          return pending
        }
        const verified = entrySchema.parse({
          ...current,
          phase: 'verified',
          createdRef: `refs/heads/${current.name}`,
          createdOid: lookup.branch.tipOid,
          checkResult: 'matched',
          error: null,
        })
        publish(verified, draftId)
        return verified
      } finally {
        releaseOwner(draftId, owner)
      }
    },
  )

  local.register(
    preSessionLaunchBranchCreationCommands['preSessionLaunchBranchCreation.adopt'],
    async ({ draftId, expectedRevision }) => {
      if (disposed || options.isDisposed()) throw new CommandError('DISPOSED', 'Branch creation runtime was disposed')
      const draft = await preflightDraftEdit(draftId, expectedRevision)
      const current = getEntry(draftId)
      if (current.phase !== 'verified' || !current.createdRef || !current.createdOid)
        throw new CommandError('INVALID_STATE', 'Verify the exact branch ref and base OID before using it')
      if (!selectionStillCurrent(draft, current))
        throw new CommandError('STALE_TARGET', 'The selected workspace or base branch changed')
      await local.execute(preSessionDraftCommands['preSessionDraft.setLaunchSelection'].metadata.id, {
        draftId,
        selection: selectedBranch(current.selection, current.createdRef, current.createdOid),
        expectedRevision: draft.revision,
      })
      const selected = entrySchema.parse({ ...current, phase: 'selected', error: null })
      if (!disposed && !options.isDisposed()) publish(selected, draftId)
      return selected
    },
  )

  local.register(preSessionLaunchBranchCreationCommands['preSessionLaunchBranchCreation.cancel'], ({ draftId }) => {
    const current = state.reader.getSnapshot().entries[draftId]
    if (!current) return null
    if (['creating', 'unknown', 'verified', 'created'].includes(current.phase)) return current
    bumpGeneration(draftId)
    captures.get(draftId)?.controller.abort()
    captures.get(draftId)?.removeAbort()
    captures.delete(draftId)
    publish(null, draftId)
    return null
  })

  return {
    reader: state.reader,
    dispose() {
      if (disposed) return
      disposed = true
      for (const [draftId, owner] of captures) {
        bumpGeneration(draftId)
        owner.controller.abort()
        owner.removeAbort()
      }
      captures.clear()
      state.dispose()
    },
  }
}
