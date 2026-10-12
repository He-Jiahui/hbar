import type { LumenPromptReferenceContent } from '@lumen/app-ui/catalog'
import { createPrompt1ReferenceFixture } from '../../../tests/fixtures/hbar-app-ui-prompt-input-1-reference-fixture'
import { createPrompt2ReferenceFixture } from '../../../tests/fixtures/hbar-app-ui-prompt-input-2-reference-fixture'
import { createPrompt3ReferenceFixture } from '../../../tests/fixtures/hbar-app-ui-prompt-input-3-reference-fixture'
import { createPrompt4ReferenceFixture } from '../../../tests/fixtures/hbar-app-ui-prompt-input-4-reference-fixture'
import { createPrompt5ReferenceFixture } from '../../../tests/fixtures/hbar-app-ui-prompt-input-5-reference-fixture'
import { createPrompt6ReferenceFixture } from '../../../tests/fixtures/hbar-app-ui-prompt-input-6-reference-fixture'
import { createPrompt7ReferenceFixture } from '../../../tests/fixtures/hbar-app-ui-prompt-input-7-reference-fixture'

export function createPromptReferenceFixture(
  variant: number,
  locale: 'en' | 'zh',
): LumenPromptReferenceContent | undefined {
  switch (variant) {
    case 1:
      return createPrompt1ReferenceFixture(locale)
    case 2:
      return createPrompt2ReferenceFixture(locale)
    case 3:
      return createPrompt3ReferenceFixture(locale)
    case 4:
      return createPrompt4ReferenceFixture(locale)
    case 5:
      return createPrompt5ReferenceFixture(locale)
    case 6:
      return createPrompt6ReferenceFixture(locale)
    case 7:
      return createPrompt7ReferenceFixture(locale)
    default:
      return undefined
  }
}
