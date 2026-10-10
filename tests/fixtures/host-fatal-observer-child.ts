import { createHostRuntimeDiagnostics } from '../../apps/host/src/runtime-diagnostics.ts'

const root = Bun.argv[2]
if (!root) throw new Error('missing diagnostics root')
const runtime = createHostRuntimeDiagnostics({ root, enabled: true, fullCoverage: true })
runtime.installFatalObserver('running')
setTimeout(() => {
  throw new Error('anonymous-fatal')
}, 10)
