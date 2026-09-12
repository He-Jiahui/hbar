import { describe, expect, test } from 'bun:test'
import { getReferenceVariant, listReferenceVariants, REFERENCE_CATEGORY_COUNTS, REFERENCE_VARIANTS, validateReferenceRegistry } from '../apps/web/src/react-bits/reference/reference-manifest'
import { REFERENCE_FIXTURE_COUNT } from '../apps/web/src/react-bits/reference/reference-fixtures'
import { getReferenceProductionAdapter, listReferenceProductionAdapters } from '../apps/web/src/react-bits/reference/adapters/reference-adapters'
import observationIndex from '../apps/web/src/react-bits/reference/reference-observation-index.json'

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
    expect(variant?.observationFile).toBe('artifacts/reactbits-reference/ai-chat-9/observation.json')
    expect(variant?.interactionsFile).toBe('artifacts/reactbits-reference/ai-chat-9/interactions.json')
    expect(variant?.fixture).toBeDefined()
    expect(listReferenceVariants('ai-chat')).toHaveLength(9)
  })

  test('keeps public observations and typed production bindings honest', () => {
    expect(observationIndex.records).toHaveLength(300)
    expect(new Set(observationIndex.records.map((record: { sourceUrl: string }) => record.sourceUrl)).size).toBe(300)
    expect(listReferenceProductionAdapters().length).toBeGreaterThan(0)
    const bound = REFERENCE_VARIANTS.filter((variant) => variant.productionBinding.mode === 'hbar-bound')
    expect(bound.length).toBeGreaterThan(0)
    for (const variant of bound) {
      const binding = variant.productionBinding
      if (binding.mode === 'hbar-bound') expect(getReferenceProductionAdapter(binding.adapterId)).toBeDefined()
    }
    for (const variant of REFERENCE_VARIANTS) expect(variant.viewportModes).toEqual(['desktop', 'tablet', 'mobile'])
  })

  test('records variant-specific public interaction contracts', () => {
    const modelPicker = getReferenceVariant('reactbits.ai-chat-9')
    expect(modelPicker?.interactions.some((interaction) => interaction.target === 'model picker')).toBe(true)
    expect(modelPicker?.interactions.some((interaction) => interaction.target === 'reasoning effort radio')).toBe(true)

    const dropZone = getReferenceVariant('reactbits.prompt-input-5')
    expect(dropZone?.interactions.some((interaction) => interaction.action === 'drag')).toBe(true)

    const terminal = getReferenceVariant('reactbits.agent-activity-5')
    expect(terminal?.interactions.some((interaction) => interaction.target === 'timeline, history or terminal tab')).toBe(true)

    const diff = getReferenceVariant('reactbits.tool-calls-3')
    expect(diff?.interactions.some((interaction) => interaction.target === 'tool call disclosure')).toBe(true)
  })
})
