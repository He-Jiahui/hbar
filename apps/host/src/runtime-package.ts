import { resolve } from 'node:path'
import { runtimeArtifactPackageSchema, type RuntimeArtifactPackage } from '@hbar/runtime'

declare const HBAR_RUNTIME_PACKAGE_JSON: string | undefined
declare const HBAR_RUNTIME_ENTRY_FILE: string | undefined

export function embeddedRuntimePackage(): RuntimeArtifactPackage | undefined {
  return typeof HBAR_RUNTIME_PACKAGE_JSON === 'undefined'
    ? undefined
    : runtimeArtifactPackageSchema.parse(JSON.parse(HBAR_RUNTIME_PACKAGE_JSON))
}
export function hostRuntimeProcessCommand(): [string, ...string[]] {
  const entry = typeof HBAR_RUNTIME_ENTRY_FILE === 'undefined' ? 'runtime-entry.ts' : HBAR_RUNTIME_ENTRY_FILE
  return [process.execPath, '--smol', resolve(import.meta.dir, entry)]
}
