import type { ComponentType, LazyExoticComponent } from 'react'

export const REFERENCE_SKILL = '$hbar-reactbits-ui' as const

export const REFERENCE_VIEWPORTS = ['desktop', 'tablet', 'mobile'] as const
export type ReferenceViewport = (typeof REFERENCE_VIEWPORTS)[number]

export type ReferenceCategory =
  | 'ai-chat'
  | 'prompt-input'
  | 'agent-activity'
  | 'tool-calls'
  | 'agent-approval'
  | 'agent-plan'
  | 'ai-usage'
  | 'app-shell'
  | 'app-sidebar'
  | 'command-menu'
  | 'navbar'
  | 'mobile'
  | 'card'
  | 'data-table'
  | 'dashboard'
  | 'analytics'
  | 'list'
  | 'filtering'
  | 'file-manager'
  | 'monitoring'
  | 'empty-state'
  | 'settings-form'
  | 'forms'
  | 'app-dialog'
  | 'notifications'
  | 'onboarding'
  | 'paywall'
  | 'authentication'
  | 'kanban'
  | 'wizard'
  | 'comments'
  | 'scheduling'
  | 'integrations'
  | 'editor'
  | 'feedback'
  | 'support'
  | 'billing'
  | 'chat'

export type ReferenceInteraction = {
  readonly action: string
  readonly target: string
  readonly expectedState: string
  readonly screenshotId?: string
}

/**
 * Compact, public stylesheet evidence extracted from the observed resource
 * bundles.  It intentionally stores selector/token summaries rather than
 * copying the remote stylesheet into the runtime bundle.
 */
export type ReferenceCssObservation = {
  readonly selectorCount: number
  readonly selectorSamples: readonly string[]
  readonly relevantSelectors: readonly string[]
  readonly customPropertyNames: readonly string[]
  readonly mediaQueryCount: number
  readonly mediaQueries: readonly string[]
  readonly keyframeNames: readonly string[]
  readonly animationDeclarations: readonly string[]
  readonly colorTokenCount: number
  readonly fontFaceCount: number
  readonly declarationCount: number
}

export type ReferenceObservation = {
  readonly sourceUrl: string
  readonly observationFile: string
  readonly interactionsFile: string
  readonly publicSurface: readonly string[]
  readonly cssResources: readonly string[]
  readonly jsResources: readonly string[]
  readonly title?: string
  readonly description?: string
  readonly canonicalUrl?: string
  readonly iframeCount?: number
  readonly previewTabs?: readonly string[]
  readonly viewportControls?: readonly string[]
  readonly actionControls?: readonly string[]
  readonly ariaRoles?: Readonly<Record<string, number>>
  readonly cssResourceCount?: number
  readonly jsResourceCount?: number
  readonly cssObservation?: readonly ReferenceCssObservation[]
  readonly captureStatus: 'public-observed' | 'fixture-derived'
}

export type ProductionBinding =
  | { readonly mode: 'hbar-bound'; readonly adapterId: string }
  | { readonly mode: 'fixture-only'; readonly reason: string }

export type ReferenceVariantDefinition = {
  readonly referenceId: string
  readonly category: ReferenceCategory
  readonly variantSlug: string
  readonly sourceUrl: string
  readonly title: string
  readonly description: string
  readonly skill: typeof REFERENCE_SKILL
  readonly observationFile: string
  readonly interactionsFile: string
  readonly viewportModes: readonly ReferenceViewport[]
  readonly observation: ReferenceObservation
  readonly interactions: readonly ReferenceInteraction[]
  readonly productionBinding: ProductionBinding
  readonly fixture: LazyExoticComponent<ComponentType<ReferenceFixtureProps>>
}

export type ReferenceFixtureProps = {
  readonly definition: ReferenceVariantDefinition
  readonly viewport: ReferenceViewport
  readonly onInteraction?: ((interaction: ReferenceInteraction) => void) | undefined
  readonly refreshKey?: number
}
