#!/usr/bin/env bun
import { parseArgs } from 'node:util'
import { INTERNAL_HOST_ROLE, INTERNAL_RUNTIME_ROLE, INTERNAL_NODE_ROLE, internalHostCommand, internalRuntimeCommand } from './host-process'

declare const HBAR_RUNTIME_PACKAGE_JSON: string | undefined
const publicRole = Bun.argv[2] === 'serve'
  ? parseArgs({ args: Bun.argv.slice(3), allowPositionals: true, strict: false, options: { role: { type: 'string' } } }).values.role
  : undefined

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
} else if (Bun.argv[2] === INTERNAL_NODE_ROLE || publicRole === 'workspace') {
  const { runNode } = await import('@hbar/node')
  const { runtimeArtifactPackageSchema } = await import('@hbar/runtime')
  const packaged = typeof HBAR_RUNTIME_PACKAGE_JSON === 'undefined' ? undefined : runtimeArtifactPackageSchema.parse(JSON.parse(HBAR_RUNTIME_PACKAGE_JSON))
  await runNode(Bun.argv.slice(3), { command: internalRuntimeCommand(), ...(packaged ? { packaged } : {}) })
} else if (Bun.argv[2] === 'node') {
  const { runNodeCommand } = await import('@hbar/node')
  await runNodeCommand(Bun.argv.slice(3))
} else {
  await import('./application')
}
