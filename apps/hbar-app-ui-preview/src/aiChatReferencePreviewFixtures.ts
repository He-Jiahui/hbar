import type { LumenAiChatReferenceContent } from '@lumen/app-ui'
import { createAiChat1ReferenceFixture } from '../../../tests/fixtures/hbar-app-ui-ai-chat-1-reference-fixture'
import { createAiChat2ReferenceFixture } from '../../../tests/fixtures/hbar-app-ui-ai-chat-2-reference-fixture'
import { createAiChat3ReferenceFixture } from '../../../tests/fixtures/hbar-app-ui-ai-chat-3-reference-fixture'
import { createAiChat4ReferenceFixture } from '../../../tests/fixtures/hbar-app-ui-ai-chat-4-reference-fixture'
import { createAiChat5ReferenceFixture } from '../../../tests/fixtures/hbar-app-ui-ai-chat-5-reference-fixture'
import { createAiChat6ReferenceFixture } from '../../../tests/fixtures/hbar-app-ui-ai-chat-6-reference-fixture'
import { createAiChat7ReferenceFixture } from '../../../tests/fixtures/hbar-app-ui-ai-chat-7-reference-fixture'
import { createAiChat8ReferenceFixture } from '../../../tests/fixtures/hbar-app-ui-ai-chat-8-reference-fixture'
import { createAiChat9ReferenceFixture } from '../../../tests/fixtures/hbar-app-ui-ai-chat-9-reference-fixture'

export function createAiChatReferencePreviewFixture(
  variant: number,
  locale: 'en' | 'zh',
): LumenAiChatReferenceContent | undefined {
  switch (variant) {
    case 1:
      return createAiChat1ReferenceFixture(locale)
    case 2:
      return createAiChat2ReferenceFixture(locale)
    case 3:
      return createAiChat3ReferenceFixture(locale)
    case 4:
      return createAiChat4ReferenceFixture(locale)
    case 5:
      return createAiChat5ReferenceFixture(locale)
    case 6:
      return createAiChat6ReferenceFixture(locale)
    case 7:
      return createAiChat7ReferenceFixture(locale)
    case 8:
      return createAiChat8ReferenceFixture(locale)
    case 9:
      return createAiChat9ReferenceFixture(locale)
    default:
      return undefined
  }
}
