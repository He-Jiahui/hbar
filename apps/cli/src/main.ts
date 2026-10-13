#!/usr/bin/env bun
import {
  INTERNAL_HOST_ROLE,
  INTERNAL_RUNTIME_ROLE,
  INTERNAL_NODE_ROLE,
  internalHostCommand,
  internalRuntimeCommand,
} from './host-process'
import { publicServiceEntry, type PublicServiceEntry } from './service-entry'

declare const HBAR_RUNTIME_PACKAGE_JSON: string | undefined

// Dispatch service roles before loading interactive UI, native terminal packages or command execution.
if (Bun.argv[2] === INTERNAL_RUNTIME_ROLE) {
  const { enterRuntimeProcessGroup, exitRuntimeProcessGroup } = await import('@hbar/runtime-native')
  enterRuntimeProcessGroup()
  const { runRuntimeProcess } = await import('@hbar/runtime/entry')
  await runRuntimeProcess({ exit: exitRuntimeProcessGroup })
  await new Promise<never>(() => {})
} else if (Bun.argv[2] === INTERNAL_HOST_ROLE) {
  const { runHost } = await import('@hbar/host')
  await runHost(Bun.argv.slice(3), internalHostCommand(), internalRuntimeCommand())
  await new Promise<never>(() => {})
} else if (Bun.argv[2] === INTERNAL_NODE_ROLE) {
  const { runNode } = await import('@hbar/node')
  const { runtimeArtifactPackageSchema } = await import('@hbar/runtime')
  const packaged =
    typeof HBAR_RUNTIME_PACKAGE_JSON === 'undefined'
      ? undefined
      : runtimeArtifactPackageSchema.parse(JSON.parse(HBAR_RUNTIME_PACKAGE_JSON))
  await runNode(Bun.argv.slice(3), { command: internalRuntimeCommand(), ...(packaged ? { packaged } : {}) })
} else {
  let entry: PublicServiceEntry
  try {
    entry = publicServiceEntry(Bun.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(2)
  }
  if (entry.kind === 'workspace') {
    const { runNode } = await import('@hbar/node')
    const { runtimeArtifactPackageSchema } = await import('@hbar/runtime')
    const packaged =
      typeof HBAR_RUNTIME_PACKAGE_JSON === 'undefined'
        ? undefined
        : runtimeArtifactPackageSchema.parse(JSON.parse(HBAR_RUNTIME_PACKAGE_JSON))
    await runNode(entry.argv, { command: internalRuntimeCommand(), ...(packaged ? { packaged } : {}) })
  } else if (entry.kind === 'node') {
    const { runNodeCommand } = await import('@hbar/node')
    await runNodeCommand(entry.argv)
  } else await import('./application')
}
