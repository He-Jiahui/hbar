import { runtimeUnitDescriptorSchema, type RuntimeSnapshot, type RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import type { HostRuntimeDeferredDriver } from './runtime-host-demand'

/** Cold-entry admission only. Manager readiness and physical ownership remain unchanged. */
export function dormantDriverBootstrapReady(
  snapshot: RuntimeSnapshot,
  descriptors: readonly RuntimeUnitDescriptor[],
  selection: HostRuntimeDeferredDriver | undefined,
): boolean {
  if (!selection || selection.unitId !== 'driver.pi' || !selection.selectedArtifactId) return false
  if (snapshot.units.length !== descriptors.length) return false
  const driver = snapshot.units.find((unit) => unit.descriptor.id === selection.unitId)
  if (
    !driver ||
    driver.descriptor.kind !== 'driver' ||
    driver.descriptor.dependencies.length !== 0 ||
    driver.generations.length !== 0 ||
    driver.queuedArtifactId !== null ||
    driver.idle?.phase !== 'dormant' ||
    driver.idle.selectedArtifactId !== selection.selectedArtifactId ||
    driver.idle.demandHolds !== 0 ||
    driver.idle.checkpointPending ||
    driver.idle.enabled
  )
    return false
  return descriptors.every((descriptor) => {
    const unit = snapshot.units.find((value) => value.descriptor.id === descriptor.id)
    if (!unit || JSON.stringify(runtimeUnitDescriptorSchema.parse(descriptor)) !== JSON.stringify(unit.descriptor))
      return false
    // Bootstrap must never conceal a real registered dependency on the absent Driver.
    if (descriptor.id !== selection.unitId && descriptor.dependencies.includes(selection.unitId)) return false
    if (descriptor.id !== selection.unitId && unit.idle?.phase === 'dormant') return false
    if (descriptor.id === selection.unitId || !descriptor.required) return true
    return (
      (unit.idle?.phase === 'active' &&
        unit.generations.some((generation) => generation.role === 'default' && generation.phase === 'serving')) ||
      (unit.idle?.phase === 'sleeping' &&
        typeof unit.idle.selectedArtifactId === 'string' &&
        unit.idle.selectedArtifactId.length > 0)
    )
  })
}
