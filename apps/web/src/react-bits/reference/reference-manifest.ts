import { getReferenceFixture } from './reference-fixtures'
import { REFERENCE_SKILL, REFERENCE_VIEWPORTS, type ReferenceCategory, type ReferenceInteraction, type ReferenceVariantDefinition } from './reference-types'
import { categoryDescription, createObservationSummary } from './reference-observations'
import { getReferenceProductionAdapter, type ReferenceProductionAdapter } from './adapters/reference-adapters'
import observationIndex from './reference-observation-index.json'

const CATEGORY_COUNTS = {
  'ai-chat': 9, 'prompt-input': 7, 'agent-activity': 7, 'tool-calls': 6, 'agent-approval': 6, 'agent-plan': 6, 'ai-usage': 8,
  'app-shell': 9, 'app-sidebar': 7, 'command-menu': 6, navbar: 14, mobile: 5,
  card: 11, 'data-table': 8, dashboard: 14, analytics: 16, list: 12, filtering: 9, 'file-manager': 4, monitoring: 10, 'empty-state': 5,
  'settings-form': 6, forms: 12, 'app-dialog': 7, notifications: 6,
  onboarding: 7, paywall: 7, authentication: 14,
  kanban: 6, wizard: 7, comments: 6, scheduling: 7, integrations: 6, editor: 5, feedback: 6, support: 5, billing: 8, chat: 6,
} as const satisfies Record<ReferenceCategory, number>

const CATEGORY_TITLES: Record<ReferenceCategory, string> = {
  'ai-chat': 'AI Chat', 'prompt-input': 'Prompt Input', 'agent-activity': 'Agent Activity', 'tool-calls': 'Tool Calls', 'agent-approval': 'Agent Approval', 'agent-plan': 'Agent Plan', 'ai-usage': 'AI Usage',
  'app-shell': 'App Shell', 'app-sidebar': 'App Sidebar', 'command-menu': 'Command Menu', navbar: 'Navbar', mobile: 'Mobile',
  card: 'Card', 'data-table': 'Data Table', dashboard: 'Dashboard', analytics: 'Analytics', list: 'List', filtering: 'Filtering', 'file-manager': 'File Manager', monitoring: 'Monitoring', 'empty-state': 'Empty State',
  'settings-form': 'Settings Form', forms: 'Forms', 'app-dialog': 'App Dialog', notifications: 'Notifications', onboarding: 'Onboarding', paywall: 'Paywall', authentication: 'Authentication',
  kanban: 'Kanban', wizard: 'Wizard', comments: 'Comments', scheduling: 'Scheduling', integrations: 'Integrations', editor: 'Editor', feedback: 'Feedback', support: 'Support', billing: 'Billing', chat: 'Chat',
}

const interactions: readonly ReferenceInteraction[] = [
  { action: 'click', target: 'Preview / Code or view tab', expectedState: 'switches the visible presentation without changing the selected variant' },
  { action: 'click', target: 'viewport control', expectedState: 'constrains the preview to desktop, tablet or mobile width' },
  { action: 'click', target: 'primary control', expectedState: 'shows the next deterministic state' },
  { action: 'keyboard', target: 'Escape', expectedState: 'closes the active surface and restores focus' },
]

function productionBindingFor(category: ReferenceCategory, index: number): ReferenceVariantDefinition['productionBinding'] {
  const adapterId =
    category === 'ai-chat' && [1, 2, 3, 4, 5, 9].includes(index) ? (index === 9 ? 'model-picker' : index === 2 ? 'artifact' : index === 5 ? 'approval' : 'session-chat') :
    category === 'prompt-input' && [1, 2, 5, 7].includes(index) ? (index === 5 ? 'artifact' : index === 2 ? 'model-picker' : 'session-chat') :
    ['agent-activity', 'monitoring'].includes(category) && ([1, 2, 3, 4, 5, 7].includes(index) || category === 'monitoring' && index === 9) ? 'activity' :
    category === 'tool-calls' && [1, 2, 3, 5, 6].includes(index) ? (index === 6 ? 'approval' : index === 3 ? 'artifact' : index === 5 ? 'session-events' : 'activity') :
    category === 'agent-approval' && [1, 2, 4].includes(index) ? 'approval' :
    category === 'agent-plan' && [1, 3, 5].includes(index) ? 'plan' :
    category === 'ai-usage' && [1, 2, 3, 5, 7].includes(index) ? 'usage' :
    ['app-shell', 'app-sidebar', 'command-menu', 'navbar', 'mobile'].includes(category) ? 'bootstrap-shell' :
    category === 'file-manager' && [1, 2, 3].includes(index) ? 'artifact' :
    category === 'editor' && [2, 3, 4].includes(index) ? 'artifact' :
    ['settings-form', 'forms'].includes(category) && [1, 2, 3].includes(index) ? 'settings' :
    category === 'chat' && [1, 2, 4, 5].includes(index) ? 'session-chat' :
    undefined
  if (adapterId && getReferenceProductionAdapter(adapterId)) return { mode: 'hbar-bound', adapterId }
  return { mode: 'fixture-only', reason: 'The public fixture is complete, but this surface has no matching hbar contract/adapter yet; no mock production data is used.' }
}

function createDefinition(category: ReferenceCategory, index: number): ReferenceVariantDefinition {
  const variantSlug = `${category}-${index}`
  const sourceUrl = `https://pro.reactbits.dev/docs/app-ui/${category}/${variantSlug}`
  const observed = observationIndex.records.find((record) => record.sourceUrl === sourceUrl)
  const observedBundle = observed ? observationIndex.resourceBundles[observed.resourceBundle] : undefined
  const title = observed?.title?.split(' – ')[0] || `${CATEGORY_TITLES[category]} ${index}`
  const description = observed?.description || `${categoryDescription(category)} Public-surface recreation of variant ${index}.`
  const observationSummary = createObservationSummary({ category, variantSlug, sourceUrl, title, description })
  const captured = observed?.status === 200
  const cssResources = observedBundle?.css.filter((resource) => resource.status === 200).map((resource) => resource.url) ?? []
  const jsResources = observedBundle?.js.filter((resource) => resource.status === 200).map((resource) => resource.url) ?? []
  const observedFields = observed ? {
    ...(observed.title === undefined ? {} : { title: observed.title }),
    ...(observed.description === undefined ? {} : { description: observed.description }),
    canonicalUrl: observed.canonicalUrl || sourceUrl,
    iframeCount: observed.domSummary.iframeCount,
    previewTabs: observed.domSummary.previewTabs,
    viewportControls: observed.domSummary.viewportControls,
    actionControls: observed.domSummary.actionControls,
    ariaRoles: observed.domSummary.ariaRoles,
  } : {}
  return {
    referenceId: `reactbits.${variantSlug}`,
    category,
    variantSlug,
    sourceUrl,
    title,
    description,
    skill: REFERENCE_SKILL,
    observationFile: `artifacts/reactbits-reference/${variantSlug}/observation.json`,
    interactionsFile: `artifacts/reactbits-reference/${variantSlug}/interactions.json`,
    viewportModes: REFERENCE_VIEWPORTS,
    observation: {
      ...observationSummary,
      sourceUrl,
      observationFile: `artifacts/reactbits-reference/${variantSlug}/observation.json`,
      interactionsFile: `artifacts/reactbits-reference/${variantSlug}/interactions.json`,
      publicSurface: [...observationSummary.publicSurface, 'computed geometry', 'responsive viewport behavior'],
      cssResources,
      jsResources,
      ...observedFields,
      cssResourceCount: cssResources.length,
      jsResourceCount: jsResources.length,
      captureStatus: captured ? 'public-observed' : 'fixture-derived',
    },
    interactions,
    productionBinding: productionBindingFor(category, index),
    fixture: getReferenceFixture(variantSlug),
  }
}

export const REFERENCE_CATEGORY_COUNTS = CATEGORY_COUNTS
export const REFERENCE_VARIANTS: readonly ReferenceVariantDefinition[] = Object.entries(CATEGORY_COUNTS).flatMap(([category, count]) => Array.from({ length: count }, (_, offset) => createDefinition(category as ReferenceCategory, offset + 1)))

export function listReferenceVariants(category?: ReferenceCategory): readonly ReferenceVariantDefinition[] {
  return category ? REFERENCE_VARIANTS.filter((variant) => variant.category === category) : REFERENCE_VARIANTS
}

export function getReferenceVariant(referenceId: string): ReferenceVariantDefinition | undefined {
  return REFERENCE_VARIANTS.find((variant) => variant.referenceId === referenceId)
}

export function loadReferenceVariant(referenceId: string) {
  const definition = getReferenceVariant(referenceId)
  if (!definition) throw new Error(`Unknown ReactBits reference variant: ${referenceId}`)
  return definition.fixture
}

export function getProductionBinding(referenceId: string): ReferenceVariantDefinition['productionBinding'] | undefined {
  return getReferenceVariant(referenceId)?.productionBinding
}

export function getProductionAdapter(referenceId: string): ReferenceProductionAdapter | undefined {
  const binding = getReferenceVariant(referenceId)?.productionBinding
  return binding?.mode === 'hbar-bound' ? getReferenceProductionAdapter(binding.adapterId) : undefined
}

export function validateReferenceRegistry() {
  const ids = new Set<string>()
  const urls = new Set<string>()
  const errors: string[] = []
  for (const variant of REFERENCE_VARIANTS) {
    if (ids.has(variant.referenceId)) errors.push(`duplicate referenceId: ${variant.referenceId}`)
    if (urls.has(variant.sourceUrl)) errors.push(`duplicate sourceUrl: ${variant.sourceUrl}`)
    ids.add(variant.referenceId)
    urls.add(variant.sourceUrl)
  }
  if (REFERENCE_VARIANTS.length !== 300) errors.push(`expected 300 variants, got ${REFERENCE_VARIANTS.length}`)
  return { ok: errors.length === 0, errors, variantCount: REFERENCE_VARIANTS.length, categoryCount: Object.keys(CATEGORY_COUNTS).length }
}
