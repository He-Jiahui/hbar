import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import type { RuntimeOwner, RuntimeVersion } from '@hbar/contracts/runtime'
import type { RuntimeCoordinator, RuntimeValuePort } from '@hbar/runtime'
import type { StableStoragePort } from '@hbar/storage'
import { runtimeNativeResourceSchema as descriptorSchema } from './runtime-plugin-contract'

interface Retained { readonly resourceId: string; readonly owner: RuntimeOwner; readonly version: RuntimeVersion; readonly descriptor: z.infer<typeof descriptorSchema> }
/** Native handles never cross IPC. Their descriptions retain and route the actual process version. */
export class RuntimeResourceRegistry {
  private readonly entries = new Map<string, Retained>()
  constructor(private readonly coordinator: RuntimeCoordinator, private readonly storage: StableStoragePort) {}
  attach(application: RuntimeValuePort, owner: RuntimeOwner, version: RuntimeVersion): () => void {
    const retain = application.register('resource.retain', async ([raw]) => {
      const descriptor = descriptorSchema.parse(raw)
      if (owner.unitId !== 'plugin.' + descriptor.kind) throw new HbarError('RUNTIME_RESOURCE_OWNER_MISMATCH', 'This unit has no declared native resource capability')
      this.coordinator.assertCanWrite(owner)
      const execution = this.coordinator.executionForSession(descriptor.sessionId)
      if (execution) this.coordinator.assertCanWrite(owner, execution)
      if (this.coordinator.role(owner) === 'draining' && !execution && this.version(owner.unitId, descriptor.sessionId)?.generation !== owner.generation)
        throw new HbarError('RUNTIME_NOT_DEFAULT', 'A draining native owner needs its retained Session or Run')
      await this.storage.call('session', descriptor.sessionId)
      this.coordinator.assertCanWrite(owner, execution ?? undefined)
      const address = owner.unitId + ':' + descriptor.sessionId + ':' + descriptor.id
      const existing = [...this.entries.values()].find(entry => entry.descriptor.id === descriptor.id && entry.descriptor.sessionId === descriptor.sessionId && entry.owner.unitId === owner.unitId)
      if (existing) {
        if (existing.owner.incarnation !== owner.incarnation) throw new HbarError('RUNTIME_RESOURCE_OWNER_MISMATCH', 'Native resource description belongs to another owner')
        return existing.resourceId
      }
      const resource = this.coordinator.retainSessionResource(owner, 'native:' + address, descriptor.sessionId)
      this.entries.set(resource.id, { resourceId: resource.id, owner, version, descriptor })
      return resource.id
    })
    const release = application.register('resource.release', ([raw]) => {
      const id = z.string().uuid().parse(raw), entry = this.entries.get(id)
      if (!entry) return
      if (entry.owner.incarnation !== owner.incarnation) throw new HbarError('RUNTIME_RESOURCE_OWNER_MISMATCH', 'Only the native owner can release its resource')
      this.coordinator.releaseResource(owner, id); this.entries.delete(id)
    })
    return () => { retain(); release() }
  }
  version(unitId: string, sessionId: string): RuntimeVersion | undefined {
    return [...this.entries.values()].find(entry => entry.owner.unitId === unitId && entry.descriptor.sessionId === sessionId)?.version
  }
  sessions(): string[] { return [...new Set([...this.entries.values()].map(entry => entry.descriptor.sessionId))] }
  exited(owner: RuntimeOwner): void {
    for (const [id, entry] of this.entries) if (entry.owner.incarnation === owner.incarnation) this.entries.delete(id)
  }
}
