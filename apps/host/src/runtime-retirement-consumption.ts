import { HbarError } from '@hbar/contracts'
import type { RuntimeOwner } from '@hbar/contracts/runtime'
import type { ManagedProcess, RuntimePhysicalRetirementReceipt } from '@hbar/runtime'

type ReceiptProcess = ManagedProcess
interface Pending {
  readonly process: ReceiptProcess
  readonly owner: RuntimeOwner
}
function key(owner: RuntimeOwner): string {
  return JSON.stringify([owner.unitId, owner.generation, owner.incarnation])
}
/** Metadata queue only. No timer, native proof construction, eviction or automatic acknowledgement. */
export class HostRetirementConsumption {
  private readonly pending = new Map<string, Pending>()
  private draining: Promise<void> | undefined
  observe(process: ReceiptProcess, owner: RuntimeOwner): void {
    const receipt = process.retirementReceipt(owner)
    if (!receipt || key(receipt.owner) !== key(owner) || !receipt.nativeJoined || !receipt.onExitCompleted)
      throw new HbarError('RUNTIME_EXIT_UNKNOWN', 'Retirement receipt has not been published')
    const id = key(owner),
      prior = this.pending.get(id)
    if (prior && prior.process !== process)
      throw new HbarError('RUNTIME_OWNER_MISMATCH', 'Receipt owner belongs to another process')
    if (!prior && this.pending.size >= 512)
      throw new HbarError('RUNTIME_RETIREMENT_CAPACITY', 'Retirement consumer queue requires reconciliation')
    this.pending.set(id, { process, owner: { ...owner } })
  }
  reconcile(consume: (process: ReceiptProcess, owner: RuntimeOwner) => Promise<boolean>): Promise<void> {
    if (this.draining) return this.draining
    const operation = Promise.resolve().then(() => this.consume(consume))
    this.draining = operation
    operation.then(
      () => {
        if (this.draining === operation) this.draining = undefined
      },
      () => {
        if (this.draining === operation) this.draining = undefined
      },
    )
    return operation
  }
  private async consume(consume: (process: ReceiptProcess, owner: RuntimeOwner) => Promise<boolean>): Promise<void> {
    const failures: unknown[] = []
    let failureCount = 0
    for (const [id, pending] of [...this.pending]) {
      // A lifecycle callback can enqueue a successor while this bounded sweep awaits cleanup.
      if (this.pending.get(id) !== pending) continue
      try {
        if (!pending.process.retirementReceipt(pending.owner)) {
          // Manager's normal idle retirement may already have consumed it after its complete checkpoint.
          this.pending.delete(id)
          continue
        }
        if ((await consume(pending.process, pending.owner)) && this.pending.get(id) === pending) this.pending.delete(id)
      } catch (error: unknown) {
        // Keep the exact pending proof, but do not let one failing domain starve other consumers.
        failureCount++
        if (failures.length < 16) failures.push(error)
      }
    }
    if (failureCount > 0)
      throw new AggregateError(
        failures,
        `Retirement consumption failed for ${failureCount} entries; first ${failures.length} errors retained`,
      )
  }
  snapshot(): readonly RuntimeOwner[] {
    return [...this.pending.values()].map((value) => ({ ...value.owner }))
  }
  /** Read the still-retained exact native receipt without consuming or waking its owner. */
  physicalReceipt(owner: RuntimeOwner): RuntimePhysicalRetirementReceipt | null {
    const receipt = this.pending.get(key(owner))?.process.retirementReceipt(owner)
    return receipt && key(receipt.owner) === key(owner) && receipt.nativeJoined && receipt.onExitCompleted
      ? structuredClone(receipt)
      : null
  }
}
