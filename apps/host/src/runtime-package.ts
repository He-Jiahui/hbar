import { basename, resolve } from 'node:path'
import { runtimeArtifactPackageSchema, type RuntimeArtifactPackage } from '@hbar/runtime'
import { HbarError } from '@hbar/contracts/errors'

declare const HBAR_RUNTIME_PACKAGE_JSON: string | undefined
declare const HBAR_RUNTIME_ENTRY_FILE: string | undefined
declare const HBAR_RUNTIME_BUILD_ENTRY_FILE: string | undefined

export function embeddedRuntimePackage(): RuntimeArtifactPackage | undefined {
  return typeof HBAR_RUNTIME_PACKAGE_JSON === 'undefined'
    ? undefined
    : runtimeArtifactPackageSchema.parse(JSON.parse(HBAR_RUNTIME_PACKAGE_JSON))
}
export function hostRuntimeProcessCommand(): [string, ...string[]] {
  const entry = typeof HBAR_RUNTIME_ENTRY_FILE === 'undefined' ? 'runtime-entry.ts' : HBAR_RUNTIME_ENTRY_FILE
  return [process.execPath, '--smol', resolve(import.meta.dir, entry)]
}

export function hostMaintenanceWorkerPath(): string | undefined {
  return typeof HBAR_RUNTIME_ENTRY_FILE === 'undefined' ? undefined : resolve(import.meta.dir, 'maintenance-worker.js')
}

/** Standalone executables must inject their complete compiler command through trusted Host options. */
export function hostRuntimeBuildProcessCommand(): [string, ...string[]] {
  if (Bun.isStandaloneExecutable === true || !['bun', 'bun.exe'].includes(basename(process.execPath).toLowerCase()))
    throw new HbarError('RUNTIME_RESTART_REQUIRED', 'This Host executable requires an explicit compiler command')
  const entry =
    typeof HBAR_RUNTIME_BUILD_ENTRY_FILE === 'undefined' ? 'runtime-build-entry.ts' : HBAR_RUNTIME_BUILD_ENTRY_FILE
  return [process.execPath, '--smol', resolve(import.meta.dir, entry)]
}
