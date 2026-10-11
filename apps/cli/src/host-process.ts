import { resolve } from 'node:path'

export const INTERNAL_HOST_ROLE = '__hbar_internal_host'
export const INTERNAL_RUNTIME_ROLE = '__hbar_internal_runtime'

export function isCompiledCli(): boolean {
  return Bun.isStandaloneExecutable
}

export function internalHostCommand(): [string, ...string[]] {
  return isCompiledCli()
    ? [process.execPath, INTERNAL_HOST_ROLE]
    : [process.execPath, resolve(import.meta.dir, 'main.ts'), INTERNAL_HOST_ROLE]
}

export function hostProcessCommand(args: readonly string[]): [string, ...string[]] {
  return isCompiledCli()
    ? [process.execPath, INTERNAL_HOST_ROLE, ...args]
    : [process.execPath, resolve(import.meta.dir, '../../host/src/main.ts'), ...args]
}
export function internalRuntimeCommand(): [string, ...string[]] {
  return isCompiledCli()
    ? [process.execPath, INTERNAL_RUNTIME_ROLE]
    : [process.execPath, resolve(import.meta.dir, 'main.ts'), INTERNAL_RUNTIME_ROLE]
}
