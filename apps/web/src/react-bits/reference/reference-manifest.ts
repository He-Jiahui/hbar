import { getReferenceFixture } from './reference-fixtures'
import { REFERENCE_SKILL, REFERENCE_VIEWPORTS, type ReferenceCategory, type ReferenceInteraction, type ReferenceVariantDefinition } from './reference-types'

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
  { action: 'click', target: 'primary control', expectedState: 'shows the next deterministic state' },
  { action: 'keyboard', target: 'Escape', expectedState: 'closes the active surface and restores focus' },
]

function createDefinition(category: ReferenceCategory, index: number): ReferenceVariantDefinition {
  const variantSlug = `${category}-${index}`
  const sourceUrl = `https://pro.reactbits.dev/docs/app-ui/${category}/${variantSlug}`
  const isBound = ['ai-chat', 'prompt-input', 'agent-activity', 'tool-calls', 'agent-approval', 'agent-plan', 'ai-usage', 'app-shell', 'app-sidebar', 'command-menu', 'navbar', 'mobile', 'card', 'data-table', 'dashboard', 'analytics', 'list', 'filtering', 'file-manager', 'monitoring', 'empty-state', 'settings-form', 'forms', 'app-dialog', 'notifications', 'editor'].includes(category)
  return {
    referenceId: `reactbits.${variantSlug}`,
    category,
    variantSlug,
    sourceUrl,
    title: `${CATEGORY_TITLES[category]} ${index}`,
    description: `Public-surface recreation of ${CATEGORY_TITLES[category]} variant ${index}.`,
    skill: REFERENCE_SKILL,
    viewportModes: REFERENCE_VIEWPORTS,
    observation: {
      sourceUrl,
      observationFile: `artifacts/reactbits-reference/${variantSlug}/observation.json`,
      interactionsFile: `artifacts/reactbits-reference/${variantSlug}/interactions.json`,
      publicSurface: ['HTML structure', 'ARIA states', 'computed geometry', 'responsive viewport behavior'],
      cssResources: [],
      jsResources: [],
      captureStatus: 'fixture-derived',
    },
    interactions,
    productionBinding: isBound ? { mode: 'hbar-bound', adapterId: `hbar.${category}` } : { mode: 'fixture-only', reason: 'No matching hbar contract is currently exposed.' },
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

export function getProductionAdapter(referenceId: string) {
  return getReferenceVariant(referenceId)?.productionBinding
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
