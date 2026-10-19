import { HbarError } from '@hbar/contracts'
import type { RuntimeOwner, RuntimeVersion } from '@hbar/contracts/runtime'
import type { RuntimePluginState } from '@hbar/plugin-sdk/runtime-plugin'

interface Entry {
  readonly owner: RuntimeOwner
  readonly version: RuntimeVersion
  readonly state: RuntimePluginState
}
/** Bounded Host metadata only: no peer/process/application object is retained. */
export class RuntimePluginCatalogCache {
  private readonly entries = new Map<string, Entry>()
  constructor(private readonly registered: readonly string[]) {
    if (registered.length > 32 || new Set(registered).size !== registered.length)
      throw new RangeError('Invalid plugin catalog registration')
  }
  /** Host must call only for the selected serving default after state validation. */
  publish(owner: RuntimeOwner, version: RuntimeVersion, state: RuntimePluginState): void {
    if (
      !this.registered.includes(owner.unitId) ||
      version.unitId !== owner.unitId ||
      version.generation !== owner.generation
    )
      throw new HbarError('RUNTIME_VERSION_MISMATCH', 'Plugin catalog metadata belongs to another owner')
    const previous = this.entries.get(owner.unitId)
    if (previous && previous.owner.generation > owner.generation)
      throw new HbarError('RUNTIME_VERSION_MISMATCH', 'Plugin catalog metadata is stale')
    if (previous && previous.owner.generation === owner.generation && previous.owner.incarnation !== owner.incarnation)
      throw new HbarError('RUNTIME_OWNER_REVOKED', 'Plugin catalog incarnation changed without generation')
    this.entries.set(owner.unitId, structuredClone({ owner, version, state }))
  }
  snapshot(): { unitId: string; state: RuntimePluginState }[] {
    return this.registered.map((unitId) => {
      const entry = this.entries.get(unitId)
      if (!entry) throw new HbarError('RUNTIME_INITIALIZING', 'Plugin catalog bootstrap is incomplete')
      return { unitId, state: structuredClone(entry.state) }
    })
  }
  /** Preparation may read only dependencies already published by selected defaults. */
  published(): { unitId: string; state: RuntimePluginState }[] {
    return this.registered.flatMap((unitId) => {
      const entry = this.entries.get(unitId)
      return entry ? [{ unitId, state: structuredClone(entry.state) }] : []
    })
  }
  metadata(): readonly { owner: RuntimeOwner; version: RuntimeVersion }[] {
    return [...this.entries.values()].map((entry) => structuredClone({ owner: entry.owner, version: entry.version }))
  }
}
