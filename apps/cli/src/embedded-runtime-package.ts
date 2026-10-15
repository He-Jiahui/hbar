import type { RuntimeArtifactPackage } from '@hbar/runtime'

/** Source execution builds runtime units normally; the standalone build supplies embedded DATA. */
export function loadEmbeddedRuntimePackage(): Promise<RuntimeArtifactPackage | undefined> {
  if (Bun.isStandaloneExecutable) throw new Error('RUNTIME_PACKAGE_EMBED_REQUIRED')
  return Promise.resolve(undefined)
}
