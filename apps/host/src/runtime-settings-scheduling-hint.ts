import { HbarError } from '@hbar/contracts'
/** A retained hint is consumed only by an actual foreground owner. No timer or retry is created. */
export class RuntimeSettingsSchedulingHint<Owner> {
  private requested = false
  private failed: { readonly owner: Owner; readonly error: unknown } | undefined
  constructor(private readonly sameOwner: (left: Owner, right: Owner) => boolean = Object.is) {}
  private active: { readonly owner: Owner; readonly operation: Promise<void> } | undefined
  private otherOwnerRequested = false
  request(): void {
    this.requested = true
  }
  pending(): boolean {
    return this.requested
  }
  running(): Promise<void> | undefined {
    return this.active?.operation
  }
  consume(
    owner: Owner,
    signal: AbortSignal,
    refresh: (owner: Owner, signal: AbortSignal) => Promise<void>,
  ): Promise<void> {
    if (this.active) {
      if (this.sameOwner(this.active.owner, owner)) return this.active.operation
      this.otherOwnerRequested = true
      return Promise.reject(
        new HbarError('RUNTIME_OWNER_REVOKED', 'Another exact owner still owns the settings refresh'),
      )
    }
    if (this.failed && this.sameOwner(this.failed.owner, owner)) return Promise.reject(this.failed.error)
    if (!this.requested) return Promise.resolve()
    this.otherOwnerRequested = false
    const operation = (async () => {
      while (this.requested) {
        signal.throwIfAborted()
        this.requested = false
        try {
          await refresh(owner, signal)
          this.failed = undefined
          if (this.otherOwnerRequested) {
            this.requested = true
            break
          }
        } catch (error) {
          this.requested = true
          this.failed = { owner, error }
          throw error
        }
      }
    })().finally(() => {
      if (this.active?.operation === operation) this.active = undefined
    })
    this.active = { owner, operation }
    return operation
  }
}
