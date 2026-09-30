import { CommandError } from '@hbar/commands'
import {
  preSessionLaunchPreparationStateSchema,
  type PreSessionLaunchPreparationState,
} from '@hbar/contracts/commands/pre-session-draft'
import {
  sessionLaunchSelectionSchema,
  sessionLaunchTargetSchema,
  sessionLaunchTargetPreparationOperationInputSchema,
  sessionLaunchTargetPreparationSnapshotSchema,
  sessionLaunchTargetPreparationStartInputSchema,
  sessionLaunchTargetPreparationStartReceiptSchema,
  sessionLaunchTargetSetInputSchema,
  sessionLaunchTargetSetReceiptSchema,
  type SessionLaunchSelection,
  type SessionLaunchTargetPreparationManager,
  type SessionLaunchTargetPreparationOperationInput,
  type SessionLaunchTargetPreparationSnapshot,
  type SessionLaunchTargetPreparationStartInput,
  type SessionLaunchTargetPreparationStartReceipt,
  type SessionLaunchTargetSetInput,
  type SessionLaunchTargetSetReceipt,
} from '@hbar/contracts/commands/session-launch-target'
import { z } from 'zod'

const UNKNOWN_CODES = new Set([
  'RESULT_UNKNOWN',
  'DISCONNECTED',
  'CONNECTION_CLOSED',
  'TIMEOUT',
  'TIMED_OUT',
  'CANCELLED',
  'INVALID_OUTPUT',
  'EXECUTION_FAILED',
])
const DEFAULT_POLL_INTERVAL_MS = 500
const DEFAULT_MAX_POLLS = 180
const MAX_POLL_INTERVAL_MS = 5_000
const MAX_POLL_COUNT = 180
const MANAGER_CALL_TIMEOUT_MS = 12_000
const MAX_MANAGER_CALL_TIMEOUT_MS = 12_000
const MAX_UNSETTLED_MANAGER_CALLS = 4
const RESERVED_CANCELLATION_CALLS = 1
const DEFAULT_MAX_OBSERVATION_MS = 100_000
const MAX_OBSERVATION_MS = 120_000
const workspaceIdSchema = z.string().min(1).max(160)
const idempotencyKeySchema = z.string().min(1).max(128)

export interface PreSessionLaunchPreparationKeys {
  readonly setSelection: string
  readonly start: string
  readonly cancel: string
  readonly reconcile: string
}

export interface PreSessionLaunchPreparationCapture {
  readonly workspaceId: string
  readonly selection: SessionLaunchSelection
  readonly keys: PreSessionLaunchPreparationKeys
}

export interface PreSessionLaunchPreparationContext {
  readonly signal?: AbortSignal
  readonly mayContinue: () => boolean
}

export interface PreSessionLaunchPreparationOptions {
  readonly pollIntervalMs?: number
  readonly maxPolls?: number
  readonly managerCallTimeoutMs?: number
  readonly maxObservationMs?: number
}

export type PreSessionLaunchPreparationOutcome =
  | { readonly kind: 'ready'; readonly snapshot: SessionLaunchTargetPreparationSnapshot }
  | { readonly kind: 'cancel-requested'; readonly snapshot: SessionLaunchTargetPreparationSnapshot | null }
  | { readonly kind: 'cancelled'; readonly snapshot: SessionLaunchTargetPreparationSnapshot | null }
  | { readonly kind: 'failed'; readonly snapshot: SessionLaunchTargetPreparationSnapshot }
  | { readonly kind: 'paused-navigation'; readonly snapshot: SessionLaunchTargetPreparationSnapshot | null }

interface OwnedManagerCall {
  promise: Promise<unknown>
  readonly mutation: boolean
  dispatched: boolean
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code
  return 'EXECUTION_FAILED'
}

function isUnknown(error: unknown): boolean {
  return UNKNOWN_CODES.has(errorCode(error))
}

function freezeSelection(selection: SessionLaunchSelection): SessionLaunchSelection {
  const parsed = sessionLaunchSelectionSchema.parse(selection)
  if (parsed.mode === 'shared-current') return Object.freeze(parsed)
  return Object.freeze({ ...parsed, branch: Object.freeze({ ...parsed.branch }) })
}

/** Copies and freezes the request facts before any async work begins. */
export function capturePreSessionLaunchPreparation(
  workspaceId: string,
  selection: SessionLaunchSelection,
  keys: PreSessionLaunchPreparationKeys,
): PreSessionLaunchPreparationCapture {
  const parsedWorkspaceId = workspaceIdSchema.parse(workspaceId)
  const frozenKeys = Object.freeze({
    setSelection: idempotencyKeySchema.parse(keys.setSelection),
    start: idempotencyKeySchema.parse(keys.start),
    cancel: idempotencyKeySchema.parse(keys.cancel),
    reconcile: idempotencyKeySchema.parse(keys.reconcile),
  })
  return Object.freeze({
    workspaceId: parsedWorkspaceId,
    selection: freezeSelection(selection),
    keys: frozenKeys,
  })
}

function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new CommandError('CANCELLED', 'Preparation observation was cancelled'))
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      resolve()
    }, milliseconds)
    const abort = () => {
      cleanup()
      reject(new CommandError('CANCELLED', 'Preparation observation was cancelled'))
    }
    const cleanup = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function preparationPhase(snapshot: SessionLaunchTargetPreparationSnapshot): PreSessionLaunchPreparationState['phase'] {
  return snapshot.status
}

/**
 * Owns immutable Host request inputs for one first-send handoff. It never submits a Run,
 * changes navigation, or remotely cancels work in response to observation abort/disposal.
 */
export class PreSessionLaunchPreparation {
  readonly capture: PreSessionLaunchPreparationCapture

  private readonly manager: SessionLaunchTargetPreparationManager
  private readonly pollIntervalMs: number
  private readonly maxPolls: number
  private readonly managerCallTimeoutMs: number
  private readonly maxObservationMs: number
  private readonly disposedController = new AbortController()
  private sessionId: string | null = null
  private selectionInput: SessionLaunchTargetSetInput | null = null
  private selectionReceipt: SessionLaunchTargetSetReceipt | null = null
  private startInput: SessionLaunchTargetPreparationStartInput | null = null
  private startReceipt: SessionLaunchTargetPreparationStartReceipt | null = null
  private operationInput: SessionLaunchTargetPreparationOperationInput | null = null
  private snapshot: SessionLaunchTargetPreparationSnapshot | null = null
  private phase: PreSessionLaunchPreparationState['phase'] = 'idle'
  private targetRevision: number | null = null
  private error: string | null = null
  private cancelRequested = false
  private startDispatched = false
  private reconcileDispatched = false
  private readonly managerCalls = new Map<string, OwnedManagerCall>()
  private activeAdvance: Promise<PreSessionLaunchPreparationOutcome> | null = null
  private activeAdvanceController: AbortController | null = null
  private activeCancel: Promise<PreSessionLaunchPreparationOutcome> | null = null

  constructor(
    manager: SessionLaunchTargetPreparationManager,
    capture: PreSessionLaunchPreparationCapture,
    options: PreSessionLaunchPreparationOptions = {},
  ) {
    this.manager = manager
    this.capture = capturePreSessionLaunchPreparation(capture.workspaceId, capture.selection, capture.keys)
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
    this.maxPolls = options.maxPolls ?? DEFAULT_MAX_POLLS
    this.managerCallTimeoutMs = options.managerCallTimeoutMs ?? MANAGER_CALL_TIMEOUT_MS
    this.maxObservationMs = options.maxObservationMs ?? DEFAULT_MAX_OBSERVATION_MS
    if (
      !Number.isSafeInteger(this.pollIntervalMs) ||
      this.pollIntervalMs < 0 ||
      this.pollIntervalMs > MAX_POLL_INTERVAL_MS
    )
      throw new CommandError('INVALID_INPUT', 'Preparation polling interval is invalid')
    if (!Number.isSafeInteger(this.maxPolls) || this.maxPolls < 1 || this.maxPolls > MAX_POLL_COUNT)
      throw new CommandError('INVALID_INPUT', 'Preparation polling bound is invalid')
    if (
      !Number.isSafeInteger(this.managerCallTimeoutMs) ||
      this.managerCallTimeoutMs < 1 ||
      this.managerCallTimeoutMs > MAX_MANAGER_CALL_TIMEOUT_MS
    )
      throw new CommandError('INVALID_INPUT', 'Preparation manager-call timeout is invalid')
    if (
      !Number.isSafeInteger(this.maxObservationMs) ||
      this.maxObservationMs < 1 ||
      this.maxObservationMs > MAX_OBSERVATION_MS
    )
      throw new CommandError('INVALID_INPUT', 'Preparation observation bound is invalid')
  }

  getState(): PreSessionLaunchPreparationState {
    return preSessionLaunchPreparationStateSchema.parse({
      phase: this.phase,
      targetRevision: this.targetRevision,
      snapshot: this.snapshot,
      error: this.error,
      cancelRequested: this.cancelRequested,
    })
  }

  getExpectedTargetRevision(): number | null {
    return this.targetRevision
  }

  getOperationInput(): SessionLaunchTargetPreparationOperationInput | null {
    return this.operationInput
  }

  getRecoveryStage(): 'launchSelection' | 'launchStart' | 'launchPreparation' {
    if (!this.selectionReceipt) return 'launchSelection'
    if (!this.startReceipt) return 'launchStart'
    return 'launchPreparation'
  }

  requestCancel(): void {
    this.cancelRequested = true
    this.error = null
    this.activeAdvanceController?.abort(new CommandError('CANCELLED', 'Launch preparation was cancelled'))
    if (this.operationInput || this.startDispatched) this.phase = 'cancel-requested'
    else this.phase = 'cancelled'
  }

  pauseNavigation(): void {
    if (this.phase !== 'cancelled' && this.phase !== 'failed') this.setPhase('paused-navigation')
  }

  dispose(): void {
    if (!this.disposedController.signal.aborted) this.disposedController.abort()
  }

  async prepare(
    sessionId: string,
    context: PreSessionLaunchPreparationContext,
  ): Promise<PreSessionLaunchPreparationOutcome> {
    this.bindSession(sessionId)
    return this.trackAdvance(async (advanceSignal) => {
      const signal = this.signal(context.signal, advanceSignal)
      this.assertLive()
      try {
        if (this.cancelRequested) {
          if (this.startDispatched && !this.startReceipt) await this.replayStart(signal)
          if (this.operationInput) return this.cancelSingleFlight()
          this.setPhase('cancelled')
          return { kind: 'cancelled', snapshot: this.snapshot }
        }
        if (!context.mayContinue()) return this.pause()
        if (!this.selectionReceipt) await this.ensureSelection(signal, context.mayContinue)
        if (this.cancelRequested) return this.cancelSingleFlight()
        if (!context.mayContinue()) return this.pause()
        if (!this.startReceipt) await this.ensureStart(signal)
        if (this.cancelRequested) return this.cancelSingleFlight()
        return await this.observe(context, signal, false)
      } catch (error) {
        if (this.cancelRequested && !this.disposedController.signal.aborted) return this.cancelSingleFlight()
        throw error
      }
    })
  }

  /** Explicit continuation may repair the same durable operation; it cannot change its target. */
  async continue(
    sessionId: string,
    context: PreSessionLaunchPreparationContext,
  ): Promise<PreSessionLaunchPreparationOutcome> {
    this.bindSession(sessionId)
    return this.trackAdvance(async (advanceSignal) => {
      const signal = this.signal(context.signal, advanceSignal)
      this.assertLive()
      try {
        if (this.cancelRequested) return this.cancelSingleFlight()
        if (!context.mayContinue()) return this.pause()
        if (!this.selectionReceipt) await this.ensureSelection(signal, context.mayContinue)
        if (this.cancelRequested) return this.cancelSingleFlight()
        if (!this.startReceipt) await this.ensureStart(signal)
        if (this.cancelRequested) return this.cancelSingleFlight()
        return await this.observe(context, signal, true)
      } catch (error) {
        if (this.cancelRequested && !this.disposedController.signal.aborted) return this.cancelSingleFlight()
        throw error
      }
    })
  }

  /** Read-only refresh: queries the exact operation once and never starts/reconciles/continues it. */
  async refresh(signal?: AbortSignal): Promise<PreSessionLaunchPreparationState> {
    if (this.activeAdvance || this.activeCancel) return this.getState()
    if (!this.operationInput) return this.getState()
    const combined = this.signal(signal)
    try {
      this.assertLive()
      const snapshot = await this.readSnapshot(combined)
      this.acceptSnapshot(snapshot)
      this.updatePhaseFromSnapshot()
      return this.getState()
    } catch (error) {
      this.markUnknown(error)
      throw error
    }
  }

  /** Resolves only the original selection/start writes, then reads the exact operation once. */
  async reconcile(sessionId: string, signal?: AbortSignal): Promise<PreSessionLaunchPreparationState> {
    this.bindSession(sessionId)
    if (this.activeAdvance || this.activeCancel) return this.getState()
    const combined = this.signal(signal)
    this.assertLive()
    if (!this.selectionReceipt && this.selectionInput) {
      const receipt = await this.boundedCall(
        (requestSignal) =>
          this.manager.readSelectionReceipt(
            { sessionId, idempotencyKey: this.capture.keys.setSelection },
            { signal: requestSignal },
          ),
        combined,
        false,
        'Launch selection receipt read',
        `read-selection-receipt:${sessionId}:${this.capture.keys.setSelection}`,
      )
      this.assertLive()
      if (receipt) this.acceptSelectionReceipt(receipt)
      else {
        if (combined.aborted) throw new CommandError('CANCELLED', 'Selection reconciliation was cancelled')
        const selectionInput = this.selectionInput
        if (!selectionInput) throw new CommandError('INVALID_STATE', 'Launch selection input is missing')
        const replay = await this.boundedCall(
          (requestSignal) =>
            this.manager.setSelection(selectionInput, {
              idempotencyKey: this.capture.keys.setSelection,
              signal: requestSignal,
            }),
          combined,
          true,
          'Launch selection replay',
          `set-selection:${sessionId}:${this.capture.keys.setSelection}`,
        )
        this.assertLive()
        this.acceptSelectionReceipt(replay)
      }
    }
    if (!this.startReceipt && this.startInput && this.startDispatched) await this.replayStart(combined)
    if (this.cancelRequested) {
      if (this.operationInput) await this.cancelSingleFlight()
      else if (!this.startDispatched) this.setPhase('cancelled')
      else this.setPhase('cancel-requested')
      return this.getState()
    }
    if (this.operationInput) await this.refresh(combined)
    return this.getState()
  }

  /** Explicit cancellation latches locally first and returns after the Host accepts or settles it. */
  async cancel(): Promise<PreSessionLaunchPreparationOutcome> {
    this.requestCancel()
    if (!this.operationInput && this.startDispatched && !this.startReceipt) {
      void this.cancelSingleFlight().catch(() => {})
      return { kind: 'cancel-requested', snapshot: this.snapshot }
    }
    if (this.activeAdvance && !this.operationInput) {
      return { kind: 'cancelled', snapshot: this.snapshot }
    }
    return this.cancelSingleFlight()
  }

  private bindSession(sessionId: string): void {
    if (this.sessionId && this.sessionId !== sessionId)
      throw new CommandError('STALE_TARGET', 'Preparation capture belongs to another Session')
    this.sessionId = sessionId
  }

  private signal(external?: AbortSignal, advance?: AbortSignal): AbortSignal {
    const signals = [this.disposedController.signal]
    if (external) signals.push(external)
    if (advance) signals.push(advance)
    return signals.length === 1 ? this.disposedController.signal : AbortSignal.any(signals)
  }

  private trackAdvance(
    action: (signal: AbortSignal) => Promise<PreSessionLaunchPreparationOutcome>,
  ): Promise<PreSessionLaunchPreparationOutcome> {
    if (this.activeAdvance) return this.activeAdvance
    const controller = new AbortController()
    this.activeAdvanceController = controller
    const pending = Promise.resolve().then(() => action(controller.signal))
    this.activeAdvance = pending
    void pending.then(
      () => {
        if (this.activeAdvance === pending) {
          this.activeAdvance = null
          this.activeAdvanceController = null
        }
      },
      () => {
        if (this.activeAdvance === pending) {
          this.activeAdvance = null
          this.activeAdvanceController = null
        }
      },
    )
    return pending
  }

  private async boundedCall<Result>(
    action: (signal: AbortSignal) => Promise<Result>,
    externalSignal: AbortSignal | undefined,
    mutation: boolean,
    operation: string,
    callKey: string,
    reservedCancellation = false,
  ): Promise<Result> {
    this.assertLive()
    const timeoutController = new AbortController()
    const signal = AbortSignal.any(
      externalSignal
        ? [this.disposedController.signal, externalSignal, timeoutController.signal]
        : [this.disposedController.signal, timeoutController.signal],
    )
    let timedOut = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    let removeAbort = () => {}
    let ownedCall = this.managerCalls.get(callKey)
    if (!ownedCall) {
      const maximumCalls = reservedCancellation
        ? MAX_UNSETTLED_MANAGER_CALLS
        : MAX_UNSETTLED_MANAGER_CALLS - RESERVED_CANCELLATION_CALLS
      if (this.managerCalls.size >= maximumCalls)
        throw new CommandError('BUSY', 'Too many unresolved launch preparation manager calls')
      const created: OwnedManagerCall = { promise: Promise.resolve(), mutation, dispatched: false }
      const request = Promise.resolve().then(() => {
        if (signal.aborted) throw new CommandError('CANCELLED', `${operation} was not dispatched`)
        created.dispatched = true
        return action(signal)
      })
      created.promise = request
      ownedCall = created
      this.managerCalls.set(callKey, ownedCall)
      const release = () => {
        if (this.managerCalls.get(callKey) === ownedCall) this.managerCalls.delete(callKey)
      }
      void request.then(release, release)
      void request.catch(() => {})
    } else if (ownedCall.mutation !== mutation) {
      throw new CommandError('INVALID_STATE', 'Manager call identity was reused with a different operation type')
    }
    const cancelled = new Promise<never>((_resolve, reject) => {
      const abort = () => {
        reject(
          new CommandError(
            timedOut ? 'TIMEOUT' : mutation && ownedCall.dispatched ? 'RESULT_UNKNOWN' : 'CANCELLED',
            `${operation} observation ended${mutation && ownedCall.dispatched ? ' after dispatch' : ''}`,
          ),
        )
      }
      signal.addEventListener('abort', abort, { once: true })
      removeAbort = () => signal.removeEventListener('abort', abort)
      if (signal.aborted) abort()
    })
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        timedOut = true
        timeoutController.abort()
        reject(new CommandError('TIMEOUT', `${operation} exceeded its deadline`))
      }, this.managerCallTimeoutMs)
    })
    try {
      return await Promise.race([ownedCall.promise as Promise<Result>, cancelled, deadline])
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
      removeAbort()
    }
  }

  private assertLive(): void {
    if (this.disposedController.signal.aborted) throw new CommandError('DISPOSED', 'Launch preparation was disposed')
  }

  private setPhase(phase: PreSessionLaunchPreparationState['phase'], error: string | null = null): void {
    this.phase = phase
    this.error = error
  }

  private pause(): PreSessionLaunchPreparationOutcome {
    this.setPhase('paused-navigation')
    return { kind: 'paused-navigation', snapshot: this.snapshot }
  }

  private requireSessionId(): string {
    if (!this.sessionId) throw new CommandError('INVALID_STATE', 'Preparation has no captured Session')
    return this.sessionId
  }

  private async ensureSelection(signal: AbortSignal, mayContinue: () => boolean): Promise<void> {
    const sessionId = this.requireSessionId()
    if (!this.selectionInput) {
      this.setPhase('selection')
      const target = await this.boundedCall(
        (requestSignal) => this.manager.readTarget(sessionId, { signal: requestSignal }),
        signal,
        false,
        'Launch target read',
        `read-target:${sessionId}`,
      )
      this.assertLive()
      if (this.cancelRequested) {
        this.setPhase(this.startDispatched ? 'cancel-requested' : 'cancelled')
        return
      }
      if (!mayContinue()) {
        this.pauseNavigation()
        return
      }
      const parsedTarget = sessionLaunchTargetSchema.safeParse(target)
      if (!parsedTarget.success) {
        this.setPhase('failed', 'INVALID_OUTPUT')
        throw new CommandError('INVALID_OUTPUT', 'Launch target read is invalid')
      }
      if (parsedTarget.data.sessionId !== sessionId || parsedTarget.data.workspaceId !== this.capture.workspaceId)
        throw new CommandError('INVALID_OUTPUT', 'Launch target does not match the captured Session and Workspace')
      if (parsedTarget.data.locked)
        throw new CommandError('SESSION_LAUNCH_TARGET_LOCKED', 'Launch target is already locked')
      const parsed = sessionLaunchTargetSetInputSchema.parse({
        sessionId,
        expectedRevision: parsedTarget.data.revision,
        selection: this.capture.selection,
      })
      this.selectionInput = Object.freeze({ ...parsed, selection: freezeSelection(parsed.selection) })
    }
    if (this.selectionReceipt) return
    if (this.cancelRequested) {
      this.setPhase(this.startDispatched ? 'cancel-requested' : 'cancelled')
      return
    }
    const selectionInput = this.selectionInput
    if (!selectionInput) throw new CommandError('INVALID_STATE', 'Launch selection input is missing')
    try {
      const receipt = await this.boundedCall(
        (requestSignal) =>
          this.manager.setSelection(selectionInput, {
            idempotencyKey: this.capture.keys.setSelection,
            signal: requestSignal,
          }),
        signal,
        true,
        'Launch selection write',
        `set-selection:${sessionId}:${this.capture.keys.setSelection}`,
      )
      this.acceptSelectionReceipt(receipt)
    } catch (error) {
      if (!isUnknown(error)) throw error
      this.assertLive()
      if (errorCode(error) === 'TIMEOUT' || errorCode(error) === 'TIMED_OUT') {
        this.markUnknown(error)
        throw new CommandError('RESULT_UNKNOWN', 'Launch selection needs reconciliation with its original key')
      }
      if (signal.aborted && errorCode(error) !== 'RESULT_UNKNOWN') {
        this.markUnknown(error)
        throw new CommandError('RESULT_UNKNOWN', 'Launch selection needs reconciliation with its original key')
      }
      try {
        const receipt = await this.boundedCall(
          (requestSignal) =>
            this.manager.readSelectionReceipt(
              { sessionId, idempotencyKey: this.capture.keys.setSelection },
              { signal: requestSignal },
            ),
          signal,
          false,
          'Launch selection receipt read',
          `read-selection-receipt:${sessionId}:${this.capture.keys.setSelection}`,
        )
        this.assertLive()
        if (receipt) {
          this.acceptSelectionReceipt(receipt)
          return
        }
        if (this.cancelRequested || signal.aborted) throw new CommandError('CANCELLED', 'Selection replay was stopped')
        this.assertLive()
        const replay = await this.boundedCall(
          (requestSignal) =>
            this.manager.setSelection(selectionInput, {
              idempotencyKey: this.capture.keys.setSelection,
              signal: requestSignal,
            }),
          signal,
          true,
          'Launch selection replay',
          `set-selection:${sessionId}:${this.capture.keys.setSelection}`,
        )
        this.assertLive()
        this.acceptSelectionReceipt(replay)
      } catch (recoveryError) {
        this.markUnknown(recoveryError)
        throw new CommandError('RESULT_UNKNOWN', 'Launch selection needs reconciliation with its original key')
      }
    }
  }

  private acceptSelectionReceipt(raw: SessionLaunchTargetSetReceipt): void {
    if (!this.selectionInput) throw new CommandError('INVALID_STATE', 'Launch selection input is missing')
    const receipt = sessionLaunchTargetSetReceiptSchema.safeParse(raw)
    if (!receipt.success || !sameJson(receipt.data.request, this.selectionInput))
      throw new CommandError('INVALID_OUTPUT', 'Launch selection receipt does not match the captured request')
    if (this.selectionReceipt && !sameJson(this.selectionReceipt, receipt.data)) {
      this.setPhase('unknown', 'INVALID_OUTPUT')
      throw new CommandError('INVALID_OUTPUT', 'Launch selection receipt changed for the original key')
    }
    this.selectionReceipt = receipt.data
    // This receipt is authoritative even when changed=false; never infer revision + 1.
    this.targetRevision = receipt.data.revision
    this.setPhase('starting')
  }

  private async ensureStart(signal: AbortSignal): Promise<void> {
    const sessionId = this.requireSessionId()
    const targetRevision = this.targetRevision
    if (targetRevision === null) throw new CommandError('INVALID_STATE', 'Launch selection has no confirmed revision')
    if (!this.startInput) {
      this.startInput = Object.freeze(
        sessionLaunchTargetPreparationStartInputSchema.parse({ sessionId, expectedRevision: targetRevision }),
      )
    }
    if (this.startReceipt) return
    this.setPhase('starting')
    await this.replayStart(signal)
  }

  private async replayStart(externalSignal?: AbortSignal): Promise<void> {
    const startInput = this.startInput
    if (!startInput) throw new CommandError('INVALID_STATE', 'Preparation start input is missing')
    try {
      this.startDispatched = true
      const receipt = await this.boundedCall(
        (signal) => this.manager.startPreparation(startInput, { idempotencyKey: this.capture.keys.start, signal }),
        externalSignal,
        true,
        'Preparation start',
        `start-preparation:${startInput.sessionId}:${this.capture.keys.start}`,
      )
      this.assertLive()
      this.acceptStartReceipt(receipt)
    } catch (error) {
      if (!isUnknown(error)) throw error
      this.assertLive()
      if (externalSignal?.aborted || errorCode(error) === 'TIMEOUT') {
        this.markUnknown(error)
        throw new CommandError('RESULT_UNKNOWN', 'Preparation start needs reconciliation with its original key')
      }
      try {
        // A replay uses the exact same frozen input and idempotency key.
        this.startDispatched = true
        const receipt = await this.boundedCall(
          (signal) => this.manager.startPreparation(startInput, { idempotencyKey: this.capture.keys.start, signal }),
          externalSignal,
          true,
          'Preparation start replay',
          `start-preparation:${startInput.sessionId}:${this.capture.keys.start}`,
        )
        this.assertLive()
        this.acceptStartReceipt(receipt)
      } catch (recoveryError) {
        this.markUnknown(recoveryError)
        throw new CommandError('RESULT_UNKNOWN', 'Preparation start needs reconciliation with its original key')
      }
    }
  }

  private acceptStartReceipt(raw: SessionLaunchTargetPreparationStartReceipt): void {
    const input = this.startInput
    if (!input) throw new CommandError('INVALID_STATE', 'Preparation start input is missing')
    const receipt = sessionLaunchTargetPreparationStartReceiptSchema.safeParse(raw)
    if (
      !receipt.success ||
      receipt.data.sessionId !== input.sessionId ||
      receipt.data.workspaceId !== this.capture.workspaceId ||
      receipt.data.targetRevision !== input.expectedRevision
    )
      throw new CommandError('INVALID_OUTPUT', 'Preparation receipt does not match the captured target')
    if (this.startReceipt && !sameJson(this.startReceipt, receipt.data)) {
      this.setPhase('unknown', 'INVALID_OUTPUT')
      throw new CommandError('INVALID_OUTPUT', 'Preparation receipt changed for the original key')
    }
    this.startReceipt = receipt.data
    this.operationInput = Object.freeze(
      sessionLaunchTargetPreparationOperationInputSchema.parse({
        sessionId: receipt.data.sessionId,
        expectedRevision: receipt.data.targetRevision,
        operationId: receipt.data.operationId,
      }),
    )
    this.setPhase('queued')
  }

  private async observe(
    context: PreSessionLaunchPreparationContext,
    signal: AbortSignal,
    allowReconcile: boolean,
  ): Promise<PreSessionLaunchPreparationOutcome> {
    if (!this.operationInput) throw new CommandError('INVALID_STATE', 'Preparation operation identity is missing')
    const startedAt = Date.now()
    for (let poll = 0; poll < this.maxPolls; poll += 1) {
      this.assertLive()
      if (Date.now() - startedAt >= this.maxObservationMs) break
      if (this.cancelRequested) return this.cancelSingleFlight()
      if (!context.mayContinue()) return this.pause()
      let snapshot: SessionLaunchTargetPreparationSnapshot
      try {
        snapshot = await this.readSnapshot(signal)
      } catch (error) {
        this.markUnknown(error)
        throw new CommandError('RESULT_UNKNOWN', 'Preparation status could not be confirmed')
      }
      this.assertLive()
      this.acceptSnapshot(snapshot)
      if (this.cancelRequested || snapshot.status === 'cancel-requested') return this.cancelSingleFlight()
      if (!context.mayContinue()) return this.pause()
      if (snapshot.status === 'ready') {
        this.setPhase('ready')
        return { kind: 'ready', snapshot }
      }
      if (snapshot.status === 'cancelled') return this.finishCancellation(snapshot)
      if (snapshot.status === 'failed') {
        this.setPhase('failed', snapshot.error.code)
        throw new CommandError(snapshot.error.code, snapshot.error.message)
      }
      if (snapshot.status === 'reconciling' && allowReconcile && !this.reconcileDispatched) {
        this.reconcileDispatched = true
        const input = this.operationInput
        const repaired = await this.boundedCall(
          (requestSignal) =>
            this.manager.reconcilePreparation(input, {
              idempotencyKey: this.capture.keys.reconcile,
              signal: requestSignal,
            }),
          signal,
          true,
          'Preparation reconciliation',
          `reconcile-preparation:${input.operationId}:${this.capture.keys.reconcile}`,
        )
        this.assertLive()
        this.acceptSnapshot(repaired)
        if (this.cancelRequested) return this.cancelSingleFlight()
        if (!context.mayContinue()) return this.pause()
        if (repaired.status === 'ready') {
          this.setPhase('ready')
          return { kind: 'ready', snapshot: repaired }
        }
        if (repaired.status === 'cancelled') return this.finishCancellation(repaired)
        if (repaired.status === 'failed') {
          this.setPhase('failed', repaired.error.code)
          throw new CommandError(repaired.error.code, repaired.error.message)
        }
      }
      if (!this.cancelRequested) this.setPhase(preparationPhase(this.snapshot ?? snapshot))
      if (poll + 1 < this.maxPolls) await sleep(this.pollIntervalMs, signal)
    }
    this.setPhase('unknown', 'TIMEOUT')
    throw new CommandError('RESULT_UNKNOWN', 'Preparation did not reach a terminal state within the observation bound')
  }

  private acceptSnapshot(raw: SessionLaunchTargetPreparationSnapshot): void {
    const parsed = sessionLaunchTargetPreparationSnapshotSchema.safeParse(raw)
    const input = this.operationInput
    const startReceipt = this.startReceipt
    if (!parsed.success || !input || !startReceipt) {
      this.setPhase('unknown', 'INVALID_OUTPUT')
      throw new CommandError('INVALID_OUTPUT', 'Preparation snapshot is invalid')
    }
    const snapshot = parsed.data
    if (
      snapshot.operationId !== input.operationId ||
      snapshot.sessionId !== input.sessionId ||
      snapshot.workspaceId !== this.capture.workspaceId ||
      snapshot.targetRevision !== input.expectedRevision ||
      snapshot.targetRevision !== startReceipt.targetRevision
    ) {
      this.setPhase('unknown', 'INVALID_OUTPUT')
      throw new CommandError('INVALID_OUTPUT', 'Preparation snapshot belongs to another operation')
    }
    if (this.snapshot) {
      if (snapshot.operationVersion < this.snapshot.operationVersion) {
        this.setPhase('unknown', 'INVALID_OUTPUT')
        throw new CommandError('INVALID_OUTPUT', 'Preparation operation version moved backwards')
      }
      if (snapshot.operationVersion === this.snapshot.operationVersion && !sameJson(snapshot, this.snapshot)) {
        this.setPhase('unknown', 'INVALID_OUTPUT')
        throw new CommandError('INVALID_OUTPUT', 'Preparation snapshot changed without a new operation version')
      }
    }
    this.snapshot = snapshot
    this.targetRevision = snapshot.targetRevision
    if (snapshot.status === 'cancel-requested') this.cancelRequested = true
  }

  private updatePhaseFromSnapshot(): void {
    if (!this.snapshot) return
    if (terminal(this.snapshot.status) && (this.cancelRequested || this.snapshot.status === 'cancelled')) {
      this.setPhase('cancelled', this.snapshot.status === 'ready' ? 'CANCELLED' : null)
    } else if (this.cancelRequested || this.snapshot.status === 'cancel-requested') {
      this.setPhase('cancel-requested')
    } else if (this.snapshot.status === 'failed') {
      this.setPhase('failed', this.snapshot.error.code)
    } else {
      this.setPhase(preparationPhase(this.snapshot))
    }
  }

  private finishCancellation(snapshot: SessionLaunchTargetPreparationSnapshot): PreSessionLaunchPreparationOutcome {
    if (snapshot.status === 'failed') {
      this.setPhase('failed', snapshot.error.code)
      return { kind: 'failed', snapshot }
    }
    this.setPhase('cancelled', snapshot.status === 'ready' ? 'CANCELLED' : null)
    return { kind: 'cancelled', snapshot }
  }

  private cancelSingleFlight(): Promise<PreSessionLaunchPreparationOutcome> {
    if (this.activeCancel) return this.activeCancel
    const pending = Promise.resolve().then(() => this.cancelInternal())
    this.activeCancel = pending
    void pending.then(
      () => {
        if (this.activeCancel === pending) this.activeCancel = null
      },
      () => {
        if (this.activeCancel === pending) this.activeCancel = null
      },
    )
    return pending
  }

  private async cancelInternal(): Promise<PreSessionLaunchPreparationOutcome> {
    this.assertLive()
    if (!this.operationInput && this.startDispatched && !this.startReceipt) await this.replayStart()
    if (!this.operationInput) {
      this.setPhase('cancelled')
      return { kind: 'cancelled', snapshot: this.snapshot }
    }
    if (this.snapshot && terminal(this.snapshot.status)) return this.finishCancellation(this.snapshot)
    const input = this.operationInput
    const cancelled = await this.boundedCall(
      (signal) =>
        this.manager.cancelPreparation(input, {
          idempotencyKey: this.capture.keys.cancel,
          signal,
        }),
      undefined,
      true,
      'Preparation cancellation',
      `cancel-preparation:${input.operationId}:${this.capture.keys.cancel}`,
      true,
    )
    this.assertLive()
    this.acceptSnapshot(cancelled)
    if (terminal(cancelled.status)) return this.finishCancellation(cancelled)
    this.setPhase('cancel-requested')
    return { kind: 'cancel-requested', snapshot: cancelled }
  }

  private async readSnapshot(signal: AbortSignal): Promise<SessionLaunchTargetPreparationSnapshot> {
    const input = this.operationInput
    if (!input) throw new CommandError('INVALID_STATE', 'Preparation operation identity is missing')
    return this.boundedCall(
      (requestSignal) => this.manager.readPreparation(input, { signal: requestSignal }),
      signal,
      false,
      'Preparation status read',
      `read-preparation:${input.operationId}`,
    )
  }

  private markUnknown(error: unknown): void {
    this.setPhase('unknown', errorCode(error))
  }
}

function terminal(status: SessionLaunchTargetPreparationSnapshot['status']): boolean {
  return status === 'ready' || status === 'cancelled' || status === 'failed'
}
