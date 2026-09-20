import {
  getProductionUiInteraction,
  interactionAppliesTo,
  productionUiInteractions,
  productionUiSurfaces,
  type ProductionUiEvidence,
  type ProductionUiInteraction,
  type ProductionUiPlatform,
  type ProductionUiSurface,
} from './production-ui-interactions.ts'

export type UiInteractionLocator = Readonly<{
  role?: string
  name?: string
  description: string
}>

export type UiInteractionAssertion = Readonly<{
  kind: 'ui' | 'host'
  description: string
  passed: boolean
}>

export type UiInteractionExerciseResult = Readonly<{
  assertions: readonly UiInteractionAssertion[]
  evidence: Readonly<Partial<Record<ProductionUiEvidence, string>>>
}>

export type UiInteractionCoverageEntry = Readonly<{
  interactionId: string
  platform: Exclude<ProductionUiPlatform, 'both'>
  locator: UiInteractionLocator
  status: 'passed' | 'failed'
  assertions: readonly UiInteractionAssertion[]
  evidence: Readonly<Partial<Record<ProductionUiEvidence, string>>>
  error?: string
}>

export type UiInteractionCoverageReport = Readonly<{
  schemaVersion: 1
  platform: Exclude<ProductionUiPlatform, 'both'>
  generatedAt: string
  registered: number
  applicable: number
  executed: number
  passed: number
  failed: number
  uncovered: readonly string[]
  duplicate: readonly string[]
  unreachable: readonly string[]
  entries: readonly UiInteractionCoverageEntry[]
}>

export type ProductionUiManifestValidation = Readonly<{
  duplicate: readonly string[]
  invalid: readonly string[]
  unreachable: readonly string[]
  missingSurfaces: readonly ProductionUiSurface[]
}>

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) repeated.add(value)
    seen.add(value)
  }
  return [...repeated].sort()
}

export function validateProductionUiManifest(
  interactions: readonly ProductionUiInteraction[] = productionUiInteractions,
): ProductionUiManifestValidation {
  const duplicate = duplicates(interactions.map(({ id }) => id))
  const invalid: string[] = []
  const unreachable: string[] = []
  const coveredSurfaces = new Set<ProductionUiSurface>()

  for (const interaction of interactions) {
    coveredSurfaces.add(interaction.surface)
    if (!interaction.id.startsWith(`${interaction.surface}.`) && !interaction.id.startsWith('desktop.')) {
      invalid.push(`${interaction.id}: id must start with its surface`)
    }
    if (
      interaction.precondition.length === 0 ||
      interaction.precondition.some((condition) => condition.trim() === '')
    ) {
      unreachable.push(interaction.id)
    }
    if (interaction.effect.kind === 'command-write' && !interaction.result.host) {
      invalid.push(`${interaction.id}: write interaction requires an authoritative Host result`)
    }
    if (interaction.result.host && !interaction.evidence.includes('host-fact')) {
      invalid.push(`${interaction.id}: Host result requires host-fact evidence`)
    }
    for (const required of ['after-screenshot', 'aria', 'geometry'] as const) {
      if (!interaction.evidence.includes(required)) invalid.push(`${interaction.id}: missing ${required} evidence`)
    }
  }

  const missingSurfaces: ProductionUiSurface[] = productionUiSurfaces.filter((surface) => !coveredSurfaces.has(surface))

  return { duplicate, invalid, unreachable, missingSurfaces }
}

function assertSuccessfulResult(definition: ProductionUiInteraction, result: UiInteractionExerciseResult): void {
  if (!result.assertions.some((assertion) => assertion.kind === 'ui' && assertion.passed)) {
    throw new Error(`${definition.id} did not record a passing UI assertion`)
  }
  if (result.assertions.some((assertion) => !assertion.passed)) {
    throw new Error(`${definition.id} recorded a failed assertion`)
  }
  if (definition.result.host && !result.evidence['host-fact']) {
    throw new Error(`${definition.id} did not record authoritative Host evidence`)
  }
  if (definition.result.host && !result.assertions.some((assertion) => assertion.kind === 'host' && assertion.passed)) {
    throw new Error(`${definition.id} did not record a passing Host assertion`)
  }
  for (const required of definition.evidence) {
    if (!result.evidence[required]) throw new Error(`${definition.id} did not record ${required}`)
  }
}

export class UiInteractionCoverage {
  readonly #entries: UiInteractionCoverageEntry[] = []

  constructor(readonly platform: Exclude<ProductionUiPlatform, 'both'>) {}

  async exercise(
    interactionId: string,
    locator: UiInteractionLocator,
    action: (definition: ProductionUiInteraction) => Promise<UiInteractionExerciseResult>,
  ): Promise<void> {
    const definition = getProductionUiInteraction(interactionId)
    if (!definition) throw new Error(`Unknown production UI interaction: ${interactionId}`)
    if (!interactionAppliesTo(definition, this.platform)) {
      throw new Error(`${interactionId} does not apply to ${this.platform}`)
    }
    if (this.#entries.some((entry) => entry.interactionId === interactionId)) {
      throw new Error(`${interactionId} was exercised more than once on ${this.platform}`)
    }

    try {
      const result = await action(definition)
      assertSuccessfulResult(definition, result)
      this.#entries.push({
        interactionId,
        platform: this.platform,
        locator,
        status: 'passed',
        assertions: result.assertions,
        evidence: result.evidence,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.#entries.push({
        interactionId,
        platform: this.platform,
        locator,
        status: 'failed',
        assertions: [],
        evidence: {},
        error: message,
      })
      throw error
    }
  }

  report(generatedAt = new Date().toISOString()): UiInteractionCoverageReport {
    const validation = validateProductionUiManifest()
    const applicable = productionUiInteractions.filter((interaction) =>
      interactionAppliesTo(interaction, this.platform),
    )
    const executed = new Set(this.#entries.map(({ interactionId }) => interactionId))
    return {
      schemaVersion: 1,
      platform: this.platform,
      generatedAt,
      registered: productionUiInteractions.length,
      applicable: applicable.length,
      executed: this.#entries.length,
      passed: this.#entries.filter(({ status }) => status === 'passed').length,
      failed: this.#entries.filter(({ status }) => status === 'failed').length,
      uncovered: applicable.map(({ id }) => id).filter((id) => !executed.has(id)),
      duplicate: validation.duplicate,
      unreachable: validation.unreachable,
      entries: [...this.#entries],
    }
  }

  assertComplete(): UiInteractionCoverageReport {
    const report = this.report()
    if (
      report.uncovered.length > 0 ||
      report.duplicate.length > 0 ||
      report.unreachable.length > 0 ||
      report.failed > 0
    ) {
      throw new Error(
        `Production UI coverage is incomplete on ${this.platform}: ` +
          `${report.uncovered.length} uncovered, ${report.duplicate.length} duplicate, ` +
          `${report.unreachable.length} unreachable, ${report.failed} failed`,
      )
    }
    return report
  }
}
