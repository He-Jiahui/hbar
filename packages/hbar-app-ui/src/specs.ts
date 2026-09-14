import { HBAR_APP_UI_CATEGORIES, HBAR_APP_UI_CATEGORY_COUNTS, type HbarAppUiCategory, type HbarAppUiVariantSpec } from './types'
import { getHbarAppUiVariantProfile } from './profiles'

const TITLES: Readonly<Record<HbarAppUiCategory, string>> = {
  'ai-chat': 'AI Chat',
  'prompt-input': 'Prompt Input',
  'agent-activity': 'Agent Activity',
  'tool-calls': 'Tool Calls',
  'agent-approval': 'Agent Approval',
  'agent-plan': 'Agent Plan',
  'ai-usage': 'AI Usage',
  'app-shell': 'App Shell',
  'app-sidebar': 'App Sidebar',
  'command-menu': 'Command Menu',
  navbar: 'Navbar',
  mobile: 'Mobile',
  card: 'Card',
  'data-table': 'Data Table',
  dashboard: 'Dashboard',
  analytics: 'Analytics',
  list: 'List',
  filtering: 'Filtering',
  'file-manager': 'File Manager',
  monitoring: 'Monitoring',
  'empty-state': 'Empty State',
  'settings-form': 'Settings Form',
  forms: 'Forms',
  'app-dialog': 'App Dialog',
  notifications: 'Notifications',
  onboarding: 'Onboarding',
  paywall: 'Paywall',
  authentication: 'Authentication',
  kanban: 'Kanban',
  wizard: 'Wizard',
  comments: 'Comments',
  scheduling: 'Scheduling',
  integrations: 'Integrations',
  editor: 'Editor',
  feedback: 'Feedback',
  support: 'Support',
  billing: 'Billing',
  chat: 'Chat',
}

const DESCRIPTIONS: Readonly<Record<HbarAppUiCategory, string>> = {
  'ai-chat': 'Conversational workspace with streaming messages, tools, context and artifacts.',
  'prompt-input': 'Composer surface with modes, attachments, commands, context and model controls.',
  'agent-activity': 'Live run activity with step status, elapsed time, history and cancellation.',
  'tool-calls': 'Tool invocation, result, diff, terminal and permission presentation.',
  'agent-approval': 'Human review surface for impact, scope, decision and audit state.',
  'agent-plan': 'Task plans, checklists, dependencies and execution progress.',
  'ai-usage': 'Usage meters, quotas, rate windows and per-model attribution.',
  'app-shell': 'Complete application frame with navigation, header and content regions.',
  'app-sidebar': 'Application sidebar, icon rail, workspace scope and mobile navigation.',
  'command-menu': 'Search-first command palette with keyboard navigation and grouped actions.',
  navbar: 'Top navigation with breadcrumbs, scopes, menus and responsive controls.',
  mobile: 'Mobile tabs, docks, sheets and full-screen navigation surfaces.',
  card: 'Standalone cards for metrics, files, people, plans and integrations.',
  'data-table': 'Dense table with filtering, selection, inline actions and detail context.',
  dashboard: 'Metric grids, charts, status boards and operational overview panels.',
  analytics: 'Charts, ranges, comparison controls and reporting summaries.',
  list: 'Feeds, queues, trees and selectable collections with compact row states.',
  filtering: 'Facets, query builders and refinement controls over result sets.',
  'file-manager': 'Breadcrumbs, file rows, previews, uploads and transfer status.',
  monitoring: 'Live health, logs, incidents, follow controls and expandable context.',
  'empty-state': 'First-run, no-result, failure, caught-up and dropzone states.',
  'settings-form': 'Scoped settings sections, search, save, reset and conflict feedback.',
  forms: 'Sectioned forms with validation, review, completion and sticky actions.',
  'app-dialog': 'Dialogs, drawers, sheets, popovers and menu overlays.',
  notifications: 'Notification centers, banners, toasts, delivery and read states.',
  onboarding: 'First-run steppers, checklists, invites and completion feedback.',
  paywall: 'Feature gates, limits, plan comparison and capability explanation.',
  authentication: 'Sign-in, pairing, recovery and credential state forms.',
  kanban: 'Status columns, swimlanes, grouping and work item detail.',
  wizard: 'Multi-step flows with progress, review and recovery states.',
  comments: 'Threads, replies, reactions, mentions and resolve workflows.',
  scheduling: 'Calendar, agenda, availability and time selection surfaces.',
  integrations: 'Marketplace, connection detail, sync status and consent flows.',
  editor: 'Markdown, code, document chrome, review and outline surfaces.',
  feedback: 'Feedback forms, surveys, ratings, attachments and confirmation.',
  support: 'Help center, ticket forms, support chat and request lists.',
  billing: 'Invoice ledgers, plan management, recovery and usage meters.',
  chat: 'Channels, direct messages, threads, attachments and composer states.',
}

const LAYOUTS: Readonly<Record<HbarAppUiCategory, HbarAppUiVariantSpec['layout']>> = {
  'ai-chat': 'conversation', 'prompt-input': 'composer', 'agent-activity': 'activity', 'tool-calls': 'activity',
  'agent-approval': 'overlay', 'agent-plan': 'workflow', 'ai-usage': 'dashboard', 'app-shell': 'conversation',
  'app-sidebar': 'conversation', 'command-menu': 'overlay', navbar: 'conversation', mobile: 'conversation',
  card: 'dashboard', 'data-table': 'table', dashboard: 'dashboard', analytics: 'dashboard', list: 'table',
  filtering: 'table', 'file-manager': 'table', monitoring: 'activity', 'empty-state': 'form',
  'settings-form': 'form', forms: 'form', 'app-dialog': 'overlay', notifications: 'overlay', onboarding: 'workflow',
  paywall: 'dashboard', authentication: 'form', kanban: 'workflow', wizard: 'workflow', comments: 'conversation',
  scheduling: 'workflow', integrations: 'dashboard', editor: 'form', feedback: 'form', support: 'conversation',
  billing: 'dashboard', chat: 'conversation',
}

function actionsFor(category: HbarAppUiCategory): HbarAppUiVariantSpec['actions'] {
  if (category === 'agent-activity') return [{ id: 'pause', label: 'Pause', tone: 'warning' }, { id: 'cancel', label: 'Stop', tone: 'danger' }]
  if (category === 'monitoring') return [{ id: 'filter', label: 'Filter' }, { id: 'open', label: 'Inspect', tone: 'accent' }]
  if (category === 'agent-approval' || category === 'app-dialog') return [{ id: 'open', label: 'Open' }, { id: 'confirm', label: 'Confirm', tone: 'accent' }]
  if (category === 'prompt-input') return [{ id: 'mode', label: 'Change mode' }, { id: 'attach', label: 'Attach' }, { id: 'send', label: 'Send', tone: 'accent' }]
  if (category === 'chat') return [{ id: 'invite', label: 'Invite' }, { id: 'open', label: 'Open channel' }, { id: 'send', label: 'Send', tone: 'accent' }]
  if (category === 'ai-chat') return [{ id: 'attach', label: 'Attach' }, { id: 'open', label: 'Open context' }, { id: 'send', label: 'Send', tone: 'accent' }]
  if (category === 'empty-state') return [{ id: 'recover', label: 'Get started', tone: 'accent' }]
  if (category === 'settings-form' || category === 'forms' || category === 'authentication') return [{ id: 'reset', label: 'Reset' }, { id: 'save', label: 'Save', tone: 'accent' }]
  return [{ id: 'filter', label: 'Filter' }, { id: 'open', label: 'Open', tone: 'accent' }]
}

export function createHbarAppUiVariantSpec(category: HbarAppUiCategory, variant: number): HbarAppUiVariantSpec {
  const count = HBAR_APP_UI_CATEGORY_COUNTS[category]
  if (!Number.isInteger(variant) || variant < 1 || variant > count) throw new RangeError(`Invalid ${category} variant ${variant}`)
  const actions = actionsFor(category)
  const id = `hbar-app-ui-${category}-${variant}`
  const profile = getHbarAppUiVariantProfile(id)
  const description = profile.scenario || DESCRIPTIONS[category]
  return {
    id,
    entry: id,
    category,
    variant,
    title: `${TITLES[category]} ${variant}`,
    description,
    layout: LAYOUTS[category],
    actions,
    behavior: actions.map((action) => `${action.id}: ${action.label}`).concat(`profile ${profile.surface} starts ${profile.initialState} and exposes ${profile.controls.join(', ')}`),
    observation: [`${TITLES[category]} variant ${variant} presents a ${profile.surface} surface`, `Initial state is ${profile.initialState}; controls are ${profile.controls.join(', ')}`],
    visualValidation: ['desktop, tablet and mobile viewports', 'light and dark themes', `${profile.visualMode} topology with ${profile.itemCount} seeded items`],
    density: profile.visualMode === 'dense' ? 'compact' : profile.visualMode === 'airy' ? 'spacious' : 'comfortable',
    profile,
  }
}

export const HBAR_APP_UI_VARIANT_SPECS: readonly HbarAppUiVariantSpec[] = HBAR_APP_UI_CATEGORIES.flatMap((category) => Array.from({ length: HBAR_APP_UI_CATEGORY_COUNTS[category] }, (_, index) => createHbarAppUiVariantSpec(category, index + 1)))
