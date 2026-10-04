import type { HbarAppUiSupportContent } from '../../packages/hbar-app-ui/src/index'
import { createSupportThreadReferenceFixtures } from './hbar-app-ui-support-thread-reference-fixtures'
import { createSupportHelpReferenceFixture } from './hbar-app-ui-support-help-reference-fixtures'
import { createSupportAssistantReferenceFixture } from './hbar-app-ui-support-assistant-reference-fixtures'
import { createSupportRequestsReferenceFixture } from './hbar-app-ui-support-requests-reference-fixtures'

/** All Support source shapes are preview/test data supplied through the public Host contract. */
export function createSupportReferencePreviewFixtures(locale: 'en' | 'de-long' = 'en'): HbarAppUiSupportContent {
  return {
    ...createSupportThreadReferenceFixtures(locale === 'de-long' ? 'de' : 'en'),
    help: createSupportHelpReferenceFixture(locale),
    assistant: createSupportAssistantReferenceFixture(locale),
    requests: createSupportRequestsReferenceFixture(locale),
  }
}
