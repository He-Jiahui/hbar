import type { RuntimeArtifactPackage } from '@hbar/runtime'

/** Shared by desktop assembly and relocation tests; importing this catalog starts no build. */
export const HOST_BUNDLE_ENTRIES = [
  ['apps/host/src/main.ts', 'host.js'],
  ['apps/host/src/runtime-entry.ts', 'runtime-entry.js'],
  ['apps/host/src/runtime-build-entry.ts', 'runtime-build-entry.js'],
  ['packages/storage/src/worker.ts', 'storage-worker.js'],
  ['packages/storage/src/session-log-scan-worker.ts', 'session-log-scan-worker.js'],
  ['packages/storage/src/maintenance-worker.ts', 'maintenance-worker.js'],
] as const

export function hostBundleDefines(packaged: RuntimeArtifactPackage): Readonly<Record<string, string>> {
  return {
    HBAR_RUNTIME_PACKAGE_JSON: JSON.stringify(JSON.stringify(packaged)),
    HBAR_RUNTIME_ENTRY_FILE: JSON.stringify('runtime-entry.js'),
    HBAR_RUNTIME_BUILD_ENTRY_FILE: JSON.stringify('runtime-build-entry.js'),
  }
}
