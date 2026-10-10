import { KERNEL_RUNTIME_FINGERPRINT } from '@hbar/kernel/runtime-port'
import { RUNTIME_BUNDLE_EXTERNALS, type RuntimeBuildUnit } from '@hbar/runtime'
import { STORAGE_RPC_FINGERPRINT, STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import type { RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import { DRIVER_RUNTIME_FINGERPRINT } from './runtime-driver-contract'
import { CONTROLLER_RUNTIME_FINGERPRINT } from './runtime-controller-contract'
import { dirname } from 'node:path'

const descriptor = (id: string, kind: RuntimeUnitDescriptor['kind'], fingerprint: string, dependencies: string[] = []): RuntimeUnitDescriptor => ({
  id, kind, dependencies, isolation: 'process', required: true, reloadable: true,
  contractFingerprint: fingerprint, storageSchema: STORAGE_SCHEMA_VERSION,
})
/** One catalog is shared by source development and packaged startup. It imports public contracts alone. */
export function hostRuntimeBuildUnits(options: { profileModule?: string } = {}): readonly RuntimeBuildUnit[] {
  return [
    { descriptor: descriptor('storage', 'storage', STORAGE_RPC_FINGERPRINT), entrypoint: 'apps/host/src/runtime-storage-process.ts', workers: ['packages/storage/src/worker.ts'] },
    { descriptor: { ...descriptor('driver.pi', 'driver', DRIVER_RUNTIME_FINGERPRINT), required: !options.profileModule }, entrypoint: 'apps/host/src/runtime-driver-process.ts' },
    { descriptor: descriptor('controller', 'controller', CONTROLLER_RUNTIME_FINGERPRINT), entrypoint: 'apps/host/src/runtime-controller-process.ts' },
    { descriptor: { ...descriptor('kernel', 'kernel', KERNEL_RUNTIME_FINGERPRINT, ['storage', 'driver.pi']), reloadable: !options.profileModule }, entrypoint: 'apps/host/src/runtime-kernel-process.ts',
      ...(options.profileModule ? { modules: [{ name: 'profile', path: options.profileModule }], sourceRoots: [dirname(options.profileModule)] } : {}),
      define: { HBAR_EXTERNAL_DRIVER: 'true' }, external: RUNTIME_BUNDLE_EXTERNALS },
  ]
}

/** Emitted dependencies of the stable listener/supervisor require an explicit restart when changed. */
export function hostRuntimeBaseBuildUnit(): RuntimeBuildUnit {
  return { descriptor: { ...descriptor('base', 'base', CONTROLLER_RUNTIME_FINGERPRINT), isolation: 'base', reloadable: false },
    entrypoint: 'apps/host/src/main.ts', external: RUNTIME_BUNDLE_EXTERNALS, resources: ['packages/runtime/src/build-worker.ts'] }
}
