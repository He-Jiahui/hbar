import { createMessageScope } from './messages'
import type { HbarSystemDiagnosticsLabels } from './system-diagnostics'

export const systemDiagnosticsMessages = createMessageScope<HbarSystemDiagnosticsLabels>()
