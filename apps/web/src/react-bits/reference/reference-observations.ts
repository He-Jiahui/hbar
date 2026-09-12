import type { ReferenceCategory, ReferenceObservation, ReferenceVariantDefinition } from './reference-types'

/**
 * Stable observations taken from the public ReactBits document shell.  The
 * private Code tab is intentionally not part of this data set.  Keeping the
 * shell facts in the registry means the gallery can explain what was
 * observed even when the ignored raw capture directory is not present in a
 * production checkout.
 */
export type ReferenceObservationSummary = Pick<
  ReferenceObservation,
  'sourceUrl' | 'publicSurface' | 'cssResources' | 'jsResources' | 'captureStatus'
> & {
  readonly title: string
  readonly description: string
  readonly canonicalUrl: string
  readonly iframeCount: number
  readonly previewTabs: readonly string[]
  readonly viewportControls: readonly string[]
  readonly actionControls: readonly string[]
  readonly ariaRoles: Readonly<Record<string, number>>
  readonly cssResourceCount: number
  readonly jsResourceCount: number
}

const CATEGORY_DESCRIPTIONS: Record<ReferenceCategory, string> = {
  'ai-chat': 'Assistant thread, composer, model and context surfaces.',
  'prompt-input': 'Prompt composition, attachment and command interactions.',
  'agent-activity': 'Run activity, timeline, queue and terminal feedback.',
  'tool-calls': 'Tool invocation, result, diff and permission feedback.',
  'agent-approval': 'Human-in-the-loop permission and risk decisions.',
  'agent-plan': 'Plan checklist, tree, progress and execution states.',
  'ai-usage': 'Token, quota, rate-limit and spend presentation.',
  'app-shell': 'Application frame, context panels and responsive shell.',
  'app-sidebar': 'Workspace navigation, search and contextual sidebars.',
  'command-menu': 'Search-first command, nested and argument surfaces.',
  navbar: 'Headers, breadcrumbs, tabs, scope and account actions.',
  mobile: 'Mobile navigation bars, docks and sheets.',
  card: 'Metric, file, integration, profile and summary cards.',
  'data-table': 'Toolbar, filter, selection, editing and detail tables.',
  dashboard: 'Metric grids, status boards and operational dashboards.',
  analytics: 'Charts, metrics, filters and drill-down analytics.',
  list: 'Rows, feeds, queues, trees and selectable collections.',
  filtering: 'Facets, query builders and refinement controls.',
  'file-manager': 'Folders, breadcrumbs, previews and transfer queues.',
  monitoring: 'Health, live metrics, logs and incident monitoring.',
  'empty-state': 'First-run, no-result, failure and drop-zone states.',
  'settings-form': 'Scoped settings, search, save, reset and danger zones.',
  forms: 'Validated forms, review steps and sticky action bars.',
  'app-dialog': 'Dialogs, drawers, sheets, popovers and confirmations.',
  notifications: 'Banners, toast stacks, inboxes and delivery state.',
  onboarding: 'Step-based setup, checklists and completion feedback.',
  paywall: 'Usage gates, limits and non-commercial feature explanations.',
  authentication: 'Pairing, sign-in, recovery and account state forms.',
  kanban: 'Status columns, grouping, movement and detail panels.',
  wizard: 'Multi-step questions, review and progress surfaces.',
  comments: 'Threads, annotations, reactions and review notes.',
  scheduling: 'Calendars, agendas, availability and time pickers.',
  integrations: 'Connection, consent, API key and sync states.',
  editor: 'Rich text, markdown, code and review workspaces.',
  feedback: 'Ratings, surveys, requests and triage inboxes.',
  support: 'Help center, tickets, chat and response flows.',
  billing: 'Statements, plans, invoices and usage summaries.',
  chat: 'Channel, direct, group and support conversations.',
}

const PUBLIC_SURFACE = [
  'HTML structure',
  'Next/RSC metadata',
  'Preview/Code controls',
  'ARIA text and roles',
  'desktop/tablet/mobile controls',
  'public stylesheet/script resource hashes',
] as const

const PREVIEW_TABS = ['Preview', 'Code'] as const
const VIEWPORT_CONTROLS = ['Desktop preview width', 'Tablet preview width', 'Mobile preview width'] as const
const ACTION_CONTROLS = ['Open fullscreen preview', 'Refresh preview', 'Drag to resize preview', 'Previous/next variant'] as const

/**
 * Fallback metadata for a clean checkout.  `capture-reactbits-reference.ts`
 * can replace/augment this information in the ignored artifact index after a
 * public crawl; the UI never assumes private source access.
 */
export function createObservationSummary(definition: Pick<ReferenceVariantDefinition, 'category' | 'variantSlug' | 'sourceUrl' | 'title' | 'description'>): ReferenceObservationSummary {
  return {
    sourceUrl: definition.sourceUrl,
    title: definition.title,
    description: definition.description,
    canonicalUrl: definition.sourceUrl,
    publicSurface: PUBLIC_SURFACE,
    cssResources: [],
    jsResources: [],
    captureStatus: 'fixture-derived',
    iframeCount: 1,
    previewTabs: PREVIEW_TABS,
    viewportControls: VIEWPORT_CONTROLS,
    actionControls: ACTION_CONTROLS,
    ariaRoles: { tab: 2, button: 7, textbox: 1 },
    cssResourceCount: 0,
    jsResourceCount: 0,
  }
}

export function categoryDescription(category: ReferenceCategory): string {
  return CATEGORY_DESCRIPTIONS[category]
}
