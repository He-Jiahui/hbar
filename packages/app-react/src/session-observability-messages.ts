import { createMessageScope } from './messages'
import type { HbarSessionObservabilityLabels } from './session-observability-labels'

export const sessionObservabilityMessages = createMessageScope<HbarSessionObservabilityLabels>()
