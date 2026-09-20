import { describe, expect, test } from 'bun:test'
import {
  productionUiInteractions,
  productionUiSurfaces,
  type ProductionUiInteraction,
} from '../e2e/support/production-ui-interactions.ts'
import { UiInteractionCoverage, validateProductionUiManifest } from '../e2e/support/ui-interaction-coverage.ts'

function evidenceFor(interaction: ProductionUiInteraction) {
  return Object.fromEntries(interaction.evidence.map((kind) => [kind, `artifacts/${interaction.id}/${kind}`]))
}

describe('production UI interaction contract', () => {
  test('registers every production surface with unique, reachable interactions', () => {
    const validation = validateProductionUiManifest()

    expect(productionUiInteractions.length).toBeGreaterThan(80)
    expect(validation).toEqual({ duplicate: [], invalid: [], unreachable: [], missingSurfaces: [] })
    expect(new Set(productionUiInteractions.map(({ surface }) => surface))).toEqual(new Set(productionUiSurfaces))
  })

  test('requires an authoritative Host result and fact evidence for every command write', () => {
    const writes = productionUiInteractions.filter(({ effect }) => effect.kind === 'command-write')

    expect(writes.length).toBeGreaterThan(20)
    for (const interaction of writes) {
      expect(interaction.result.host, interaction.id).toBeTruthy()
      expect(interaction.evidence, interaction.id).toContain('host-fact')
    }
  })

  test('rejects duplicate ids, unreachable entries, and writes without Host results', () => {
    const valid = productionUiInteractions[0]
    if (!valid) throw new Error('Production interaction manifest is empty')
    const broken: ProductionUiInteraction[] = [
      valid,
      valid,
      { ...valid, id: 'shell.empty-precondition', precondition: [] },
      {
        ...valid,
        id: 'shell.write-without-host',
        effect: { kind: 'command-write', name: 'fixture.write' },
        result: { visible: 'local-only confirmation' },
      },
    ]

    const validation = validateProductionUiManifest(broken)
    expect(validation.duplicate).toEqual([valid.id])
    expect(validation.unreachable).toEqual(['shell.empty-precondition'])
    expect(validation.invalid).toContain(
      'shell.write-without-host: write interaction requires an authoritative Host result',
    )
  })

  test('exercise records the required evidence and keeps Web and Tauri coverage separate', async () => {
    const coverage = new UiInteractionCoverage('web')
    const definition = productionUiInteractions.find(
      (interaction) => interaction.platforms === 'both' && interaction.effect.kind === 'command-write',
    )
    if (!definition) throw new Error('No shared write interaction is registered')

    await coverage.exercise(
      definition.id,
      { role: 'button', name: 'fixture', description: 'fixture locator' },
      async () => ({
        assertions: [
          { kind: 'ui', description: 'visible result matches the command target', passed: true },
          { kind: 'host', description: 'authoritative Host fact matches the command target', passed: true },
        ],
        evidence: evidenceFor(definition),
      }),
    )

    const report = coverage.report('2026-09-20T00:00:00.000Z')
    expect(report.platform).toBe('web')
    expect(report.executed).toBe(1)
    expect(report.passed).toBe(1)
    expect(report.failed).toBe(0)
    expect(report.uncovered).not.toContain(definition.id)
    expect(() => coverage.assertComplete()).toThrow(/coverage is incomplete/)
  })

  test('exercise fails when UI, screenshot, geometry, ARIA, or Host evidence is missing', async () => {
    const coverage = new UiInteractionCoverage('tauri')
    const definition = productionUiInteractions.find(
      (interaction) => interaction.platforms !== 'web' && interaction.effect.kind === 'command-write',
    )
    if (!definition) throw new Error('No Tauri write interaction is registered')

    await expect(
      coverage.exercise(definition.id, { description: 'missing evidence fixture' }, async () => ({
        assertions: [{ kind: 'ui', description: 'visible result', passed: true }],
        evidence: { 'after-screenshot': 'after.png', aria: 'aria.json', geometry: 'geometry.json' },
      })),
    ).rejects.toThrow(/Host evidence/)
    expect(coverage.report().failed).toBe(1)
  })

  test('exercise rejects duplicate execution and platform-only misuse', async () => {
    const coverage = new UiInteractionCoverage('web')
    const shared = productionUiInteractions.find(
      (interaction) => interaction.platforms === 'both' && interaction.effect.kind !== 'command-write',
    )
    const desktopOnly = productionUiInteractions.find(({ platforms }) => platforms === 'tauri')
    if (!shared || !desktopOnly) throw new Error('Expected shared and desktop-only interactions')
    const result = {
      assertions: [{ kind: 'ui' as const, description: 'visible result', passed: true }],
      evidence: evidenceFor(shared),
    }

    await coverage.exercise(shared.id, { description: 'shared fixture' }, async () => result)
    await expect(
      coverage.exercise(shared.id, { description: 'duplicate fixture' }, async () => result),
    ).rejects.toThrow(/more than once/)
    await expect(
      coverage.exercise(desktopOnly.id, { description: 'desktop-only fixture' }, async () => result),
    ).rejects.toThrow(/does not apply to web/)
  })
})
