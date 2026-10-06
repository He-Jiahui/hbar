export type DesktopElementCategory =
  'structure' | 'text' | 'interaction' | 'form' | 'collection' | 'technical' | 'feedback' | 'platform'

export type DesktopElementStatus = 'semantic' | 'composed' | 'renderer-boundary' | 'schema-boundary' | 'pending'

export interface DesktopElement {
  readonly id: string
  readonly path: string
  readonly line: number
  readonly owner: string
  readonly surface: string
  readonly component: string
  readonly category: DesktopElementCategory
  readonly context: string | null
  readonly contentSources: readonly string[]
  readonly accessibleNameSources: readonly string[]
  readonly actionBindings: Readonly<Record<string, string>>
  readonly targetSources: readonly string[]
  readonly stateSources: readonly string[]
  readonly flow: string
  readonly lumenMapping: string
  readonly status: DesktopElementStatus
  readonly issues: readonly string[]
}

export interface DesktopElementInventory {
  readonly schemaVersion: 1
  readonly entry: string
  readonly elements: readonly DesktopElement[]
  readonly sourceModules: readonly string[]
  readonly unusedTsxModules: readonly string[]
  readonly excludedBoundaries: readonly string[]
  readonly productionBuildInputs: readonly string[]
  readonly productionBuildStatus: 'passed' | 'not-run'
}
