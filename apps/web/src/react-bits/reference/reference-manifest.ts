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

/**
 * Public iframe controls observed for the focused Application UI variants.
 * These are interaction contracts, not copied implementation details: the
 * fixture is free to use hbar primitives as long as the same visible state
 * transition and keyboard affordance remain available.
 */
const interactionProfiles: Partial<Record<ReferenceCategory, readonly ReferenceInteraction[]>> = {
  'ai-chat': [
    { action: 'click', target: 'model picker', expectedState: 'opens a provider/model list with context, speed, cost and reasoning details' },
    { action: 'click', target: 'message or composer action', expectedState: 'keeps the conversation content order and updates the local fixture state' },
  ],
  'prompt-input': [
    { action: 'input', target: 'prompt textarea', expectedState: 'keeps the composer draft and updates the enabled send/run state' },
    { action: 'click', target: 'mode, attachment or context control', expectedState: 'changes the visible composer affordance without losing the draft' },
  ],
  'agent-activity': [
    { action: 'click', target: 'timeline, history or terminal tab', expectedState: 'switches the run detail view while keeping the same run identity' },
    { action: 'click', target: 'pause, resume or cancel control', expectedState: 'shows the corresponding running, paused or cancelled state' },
  ],
  'tool-calls': [
    { action: 'click', target: 'tool call disclosure', expectedState: 'expands arguments, result, diff, source cards or terminal output in place' },
    { action: 'click', target: 'retry or permission control', expectedState: 'exposes the next safe action without fabricating a tool result' },
  ],
  'agent-approval': [
    { action: 'click', target: 'approve or deny action', expectedState: 'resolves the pending decision and leaves an auditable outcome visible' },
    { action: 'click', target: 'risk or scope disclosure', expectedState: 'reveals impact and requested permission details before the decision' },
  ],
  'agent-plan': [
    { action: 'click', target: 'plan step', expectedState: 'selects the step and preserves its status in the progress rail' },
    { action: 'click', target: 'add, reorder, skip or continue control', expectedState: 'updates the deterministic plan state in place' },
  ],
  'ai-usage': [
    { action: 'click', target: '24h, 7d or 30d range control', expectedState: 'switches the usage period while preserving the meter hierarchy' },
    { action: 'click', target: 'model or quota row', expectedState: 'reveals per-model attribution or the applicable quota state' },
  ],
  'app-shell': [
    { action: 'click', target: 'sidebar navigation item', expectedState: 'changes the active product area while retaining the shell frame' },
    { action: 'click', target: 'context panel or scope switcher', expectedState: 'opens or closes the secondary context without changing the main route' },
  ],
  'app-sidebar': [
    { action: 'click', target: 'workspace switcher or scoped search', expectedState: 'filters or changes the sidebar scope with focus retained' },
    { action: 'click', target: 'pinned item or inline row action', expectedState: 'updates the selected navigation row without reordering unrelated items' },
  ],
  'command-menu': [
    { action: 'input', target: 'command search', expectedState: 'filters grouped commands and preserves keyboard navigation' },
    { action: 'keyboard', target: 'ArrowDown / Enter / Escape', expectedState: 'moves, executes or closes the active command surface' },
  ],
  navbar: [
    { action: 'click', target: 'breadcrumb, scope or segmented tab', expectedState: 'changes the active navigation scope and underline state' },
    { action: 'click', target: 'account, search or overflow action', expectedState: 'opens the corresponding top-level surface' },
  ],
  mobile: [
    { action: 'click', target: 'bottom navigation tab', expectedState: 'switches the single active mobile panel and indicator' },
    { action: 'click', target: 'floating dock or bottom sheet', expectedState: 'opens the mobile action surface without horizontal overflow' },
  ],
  card: [
    { action: 'click', target: 'card action or connect toggle', expectedState: 'updates the selected card state and preserves card density' },
  ],
  'data-table': [
    { action: 'click', target: 'filter, column or row control', expectedState: 'updates the table view while keeping selection and detail context stable' },
    { action: 'click', target: 'pagination or inline edit control', expectedState: 'shows the next deterministic table state with its save status' },
  ],
  dashboard: [
    { action: 'click', target: 'metric or status board card', expectedState: 'opens the related detail without changing the metric grid layout' },
  ],
  analytics: [
    { action: 'click', target: 'range or chart control', expectedState: 'updates the selected analytics period or hover detail' },
  ],
  list: [
    { action: 'click', target: 'selectable list row', expectedState: 'selects the row and reveals its inline detail or action state' },
  ],
  filtering: [
    { action: 'click', target: 'facet or refinement control', expectedState: 'applies the filter and updates the derived count summary' },
  ],
  'file-manager': [
    { action: 'click', target: 'folder, breadcrumb or file row', expectedState: 'changes the current file scope and keeps preview metadata aligned' },
    { action: 'click', target: 'upload or selection control', expectedState: 'shows the transfer or selection state for the chosen file' },
  ],
  monitoring: [
    { action: 'click', target: 'follow, pause, severity or window control', expectedState: 'updates the live monitoring view without losing the current health scope' },
    { action: 'click', target: 'incident or JSON disclosure', expectedState: 'reveals the selected event details in place' },
  ],
  'empty-state': [
    { action: 'click', target: 'empty-state primary action', expectedState: 'moves from first-run, no-result or failure copy to its recovery affordance' },
  ],
  'settings-form': [
    { action: 'input', target: 'settings field', expectedState: 'marks the form dirty and keeps the scoped section selected' },
    { action: 'click', target: 'save or reset action', expectedState: 'shows saved, reset or validation feedback next to the action bar' },
  ],
  forms: [
    { action: 'input', target: 'form field', expectedState: 'updates validation or completion feedback without losing entered values' },
    { action: 'click', target: 'review or revert action', expectedState: 'moves to the next form state or restores the previous draft' },
  ],
  'app-dialog': [
    { action: 'click', target: 'dialog, drawer or sheet trigger', expectedState: 'opens the highest-level surface with a scrollable body and sticky actions' },
    { action: 'keyboard', target: 'Escape', expectedState: 'closes the surface and restores focus to its trigger' },
  ],
  notifications: [
    { action: 'click', target: 'notification read or dismiss action', expectedState: 'updates delivery state and removes only the addressed notification' },
  ],
  onboarding: [
    { action: 'click', target: 'stepper or continue action', expectedState: 'advances the setup state and updates completion feedback' },
  ],
  paywall: [
    { action: 'click', target: 'feature gate or limit detail', expectedState: 'explains the current capability limit without starting a commercial flow' },
  ],
  authentication: [
    { action: 'input', target: 'credential or pairing field', expectedState: 'updates validation state without exposing a token in the URL' },
    { action: 'click', target: 'provider or reveal control', expectedState: 'changes the sign-in affordance while keeping the form scoped' },
  ],
  kanban: [
    { action: 'click', target: 'status column or card', expectedState: 'selects the work item and keeps its status grouping visible' },
    { action: 'keyboard', target: 'ArrowUp / ArrowDown / Space', expectedState: 'moves or toggles the selected card using a keyboard-safe action' },
  ],
  wizard: [
    { action: 'click', target: 'wizard next or previous action', expectedState: 'changes the active step while preserving entered details' },
  ],
  comments: [
    { action: 'click', target: 'thread, reaction or sort control', expectedState: 'updates the selected discussion state without collapsing replies' },
    { action: 'input', target: 'comment composer', expectedState: 'keeps the draft and enables the appropriate submit affordance' },
  ],
  scheduling: [
    { action: 'click', target: 'calendar date or agenda item', expectedState: 'changes the selected availability scope and agenda detail' },
  ],
  integrations: [
    { action: 'click', target: 'category, search or connect toggle', expectedState: 'filters the marketplace or updates the selected connection state' },
  ],
  editor: [
    { action: 'click', target: 'block type, mark or review control', expectedState: 'updates editor presentation while retaining the document content' },
    { action: 'input', target: 'editor title or body', expectedState: 'updates autosave state and word-count feedback' },
  ],
  feedback: [
    { action: 'click', target: 'feedback type or screenshot control', expectedState: 'changes the feedback form and attachment state' },
    { action: 'click', target: 'send feedback action', expectedState: 'shows the sent confirmation without resubmitting the form' },
  ],
  support: [
    { action: 'input', target: 'help search', expectedState: 'filters topic and article results without leaving the help surface' },
    { action: 'click', target: 'contact or article row', expectedState: 'opens the selected support detail or contact affordance' },
  ],
  billing: [
    { action: 'click', target: 'invoice or recovery action', expectedState: 'reveals statement detail and keeps payment data out of the fixture' },
  ],
  chat: [
    { action: 'click', target: 'channel or thread row', expectedState: 'changes the active conversation scope and preserves the message composer' },
    { action: 'input', target: 'message composer', expectedState: 'updates the draft and send affordance for the active channel' },
  ],
}

function interactionsFor(category: ReferenceCategory, index: number): readonly ReferenceInteraction[] {
  const profile = interactionProfiles[category] ?? []
  const variantSpecific = category === 'ai-chat' && index === 9
    ? [{ action: 'click', target: 'reasoning effort radio', expectedState: 'updates the selected reasoning level in the model detail card' }]
    : category === 'ai-chat' && index === 2
      ? [{ action: 'click', target: 'Preview / Code / Document artifact tab', expectedState: 'switches the artifact view without changing the chat transcript' }]
      : category === 'prompt-input' && index === 5
        ? [{ action: 'drag', target: 'attachment drop zone', expectedState: 'shows the per-file transfer state and a retry-safe result' }]
        : []
  return [...interactions, ...profile, ...variantSpecific]
}

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
    interactions: interactionsFor(category, index),
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
