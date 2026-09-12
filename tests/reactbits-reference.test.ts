import { describe, expect, test } from 'bun:test'
import { getReferenceVariant, listReferenceVariants, REFERENCE_CATEGORY_COUNTS, REFERENCE_VARIANTS, validateReferenceRegistry } from '../apps/web/src/react-bits/reference/reference-manifest'
import { REFERENCE_FIXTURE_COUNT } from '../apps/web/src/react-bits/reference/reference-fixtures'

describe('ReactBits reference registry', () => {
  test('contains the complete public Application UI matrix', () => {
    expect(Object.keys(REFERENCE_CATEGORY_COUNTS)).toHaveLength(38)
    expect(REFERENCE_VARIANTS).toHaveLength(300)
    expect(REFERENCE_FIXTURE_COUNT).toBe(300)
    expect(validateReferenceRegistry().ok).toBe(true)
  })

  test('resolves a stable URL, skill and lazy fixture per variant', () => {
    const variant = getReferenceVariant('reactbits.ai-chat-9')
    expect(variant?.sourceUrl).toBe('https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-9')
    expect(variant?.skill).toBe('$hbar-reactbits-ui')
    expect(variant?.fixture).toBeDefined()
    expect(listReferenceVariants('ai-chat')).toHaveLength(9)
  })
})
