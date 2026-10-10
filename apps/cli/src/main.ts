#!/usr/bin/env bun
import { INTERNAL_HOST_ROLE, INTERNAL_RUNTIME_ROLE, internalHostCommand } from './host-process'

// Dispatch service roles before loading interactive UI, native terminal packages or command execution.
if (Bun.argv[2] === INTERNAL_RUNTIME_ROLE) {
  const { runRuntimeProcess } = await import('@hbar/runtime/entry')
  await runRuntimeProcess()
  await new Promise<never>(() => {})
} else if (Bun.argv[2] === INTERNAL_HOST_ROLE) {
  const { runHost } = await import('@hbar/host')
  await runHost(Bun.argv.slice(3), internalHostCommand())
  await new Promise<never>(() => {})
} else {
  await import('./application')
}
