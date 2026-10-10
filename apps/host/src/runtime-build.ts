import { KERNEL_RUNTIME_FINGERPRINT } from '@hbar/kernel/runtime-port'
import { RUNTIME_BUNDLE_EXTERNALS, type RuntimeBuildUnit } from '@hbar/runtime'
import { STORAGE_RPC_FINGERPRINT, STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import type { RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import { DRIVER_RUNTIME_FINGERPRINT } from './runtime-driver-contract'
import { CONTROLLER_RUNTIME_FINGERPRINT } from './runtime-controller-contract'

const descriptor = (id: string, kind: RuntimeUnitDescriptor['kind'], fingerprint: string, dependencies: string[] = []): RuntimeUnitDescriptor => ({
  id, kind, dependencies, isolation: 'process', required: true, reloadable: true,
  contractFingerprint: fingerprint, storageSchema: STORAGE_SCHEMA_VERSION,
})
/** One catalog is shared by source development and packaged startup. It imports public contracts alone. */
export function hostRuntimeBuildUnits(): readonly RuntimeBuildUnit[] {
  return [
    { descriptor: descriptor('storage', 'storage', STORAGE_RPC_FINGERPRINT), entrypoint: 'apps/host/src/runtime-storage-process.ts', workers: ['packages/storage/src/worker.ts'] },
    { descriptor: descriptor('driver.pi', 'driver', DRIVER_RUNTIME_FINGERPRINT), entrypoint: 'apps/host/src/runtime-driver-process.ts' },
    { descriptor: descriptor('controller', 'controller', CONTROLLER_RUNTIME_FINGERPRINT), entrypoint: 'apps/host/src/runtime-controller-process.ts' },
    { descriptor: descriptor('kernel', 'kernel', KERNEL_RUNTIME_FINGERPRINT, ['storage', 'driver.pi']), entrypoint: 'apps/host/src/runtime-kernel-process.ts',
      define: { HBAR_EXTERNAL_DRIVER: 'true' }, external: RUNTIME_BUNDLE_EXTERNALS },
  ]
}
