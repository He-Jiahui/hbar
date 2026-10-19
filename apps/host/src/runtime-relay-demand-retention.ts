import type { HostRuntimeDemandHold } from './runtime-host-demand'

/** Each reference ends at physical reply/not-dispatched, resource close or native join. */
export class RelayDemandRetention {
  private references = 1
  private ended = false
  constructor(
    private readonly hold: HostRuntimeDemandHold,
    private readonly onReleased: () => void,
  ) {}
  retain(): () => void {
    if (this.ended) throw new Error('Relay demand retention already ended')
    this.references++
    let released = false
    return () => {
      if (released) return
      released = true
      this.drop()
    }
  }
  private drop(): void {
    if (this.ended) return
    this.references--
    if (this.references === 0) this.joined()
  }
  releaseResource(): void {
    this.dropResource()
  }
  private resourceReleased = false
  private dropResource(): void {
    if (this.resourceReleased) return
    this.resourceReleased = true
    this.drop()
  }
  /** Call only after exact owner's confirmed native join. */
  joined(): void {
    if (this.ended) return
    this.ended = true
    this.hold.release()
    this.onReleased()
  }
}
