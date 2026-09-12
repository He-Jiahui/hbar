import type { ReferenceCategory } from './reference-types'

export type ChatPreviewConfig = {
  readonly heading: string
  readonly model: string
  readonly modelProvider?: string
  readonly status?: string
  readonly userMessages: readonly string[]
  readonly assistantMessages: readonly string[]
  readonly toolLabel?: string
  readonly sourceLabels?: readonly string[]
  readonly attachmentLabels?: readonly string[]
  readonly artifact?: { readonly title: string; readonly code: string; readonly versions: readonly string[] }
  readonly approval?: { readonly title: string; readonly description: string; readonly primary: string; readonly secondary: string }
  readonly voice?: { readonly status: string; readonly duration: string; readonly files: readonly string[] }
  readonly pinnedContext?: string
  readonly usage?: string
  readonly empty?: boolean
  readonly subheading?: string
  readonly labels?: readonly string[]
  readonly composerPlaceholder: string
}

export const CHAT_PREVIEWS: Record<string, ChatPreviewConfig> = {
  'ai-chat-1': {
    heading: 'Revenue assistant',
    model: 'Atlas',
    userMessages: ['Why did refunds spike last week?', 'Break it down by plan tier.'],
    assistantMessages: ['Refunds rose 38% week over week. The increase came mostly from failed renewals after the card-retry window changed.', 'Growth accounted for most of the increase; Starter stayed nearly flat.'],
    toolLabel: 'Searched 1,284 refunds · Done 1.2s',
    sourceLabels: ['Billing events', 'Pricing change · Jun 12'],
    attachmentLabels: ['refunds-week-24.csv'],
    composerPlaceholder: 'Reply, or ask a follow-up',
  },
  'ai-chat-2': {
    heading: 'Build assistant',
    model: 'Draft',
    userMessages: ['Build a three-tier pricing table component for the marketing site.', 'Add a short plan description under each price.', 'Can you make the middle plan stand out?'],
    assistantMessages: ['Here is a responsive pricing table with Starter, Growth, and Scale.', 'Done. I added a description line beneath each price and kept the current version easy to compare.', 'Growth is marked as recommended with a stronger border and a small label.'],
    artifact: { title: 'pricing-table.tsx', code: 'type Plan = { name: string; price: string; period: string; cta: string }\n\nexport function PricingTable({ plans }: { plans: Plan[] }) {\n  return plans.map((plan) => <article key={plan.name}>…</article>)\n}', versions: ['v3', 'v2', 'v1'] },
    composerPlaceholder: 'Ask for another revision',
  },
  'ai-chat-3': {
    heading: 'Assistant Ready',
    model: 'Ready',
    userMessages: ['Summarize the latest release notes', 'What changed in the filter panel?', 'Draft acceptance criteria for the new filter'],
    assistantMessages: ['Version 2.4 focused on the new filter panel, faster search indexing, and keyboard-navigation fixes.', 'It moved into a docked sidebar, gained saved views, and remembers the last query per project.', 'Filters apply instantly, saved views persist per project, and every control stays reachable by keyboard.'],
    composerPlaceholder: 'Message',
  },
  'ai-chat-4': {
    heading: 'Onboarding analysis',
    model: 'Atlas',
    usage: '12.4k / 32k tokens',
    userMessages: ['Compare our onboarding completion rate to last quarter.', 'Where do people still drop off?', 'Draft a one-line summary for the weekly update.'],
    assistantMessages: ['Completion rose to 71%, up from 63% last quarter.', 'The largest remaining drop is at the invite-teammates step, where 22% leave without adding anyone.', 'Onboarding completion reached 71% this quarter, up eight points year over year.'],
    composerPlaceholder: 'Message',
  },
  'ai-chat-5': {
    heading: 'Staging cleanup',
    model: 'Atlas',
    status: 'Needs review',
    userMessages: ['Clean up the staging environment before tomorrow’s demo.'],
    assistantMessages: ['I found two inactive preview databases and three unused API keys. I will remove them one step at a time so each action can be approved.'],
    toolLabel: 'Scanned staging resources · Done 0.9s',
    approval: { title: 'Delete 3 unused API keys?', description: 'Any service still using them will return 401 errors. This cannot be undone.', primary: 'Delete keys', secondary: 'Keep them' },
    composerPlaceholder: 'Message',
  },
  'ai-chat-6': {
    heading: 'Competitive brief',
    model: 'Planner',
    status: '3 agents',
    userMessages: ['Put together a competitive brief on the top three note-taking apps.'],
    assistantMessages: ['PLANNER — I’ll split this into research and writing.', 'RESEARCHER — All three offer a free tier; encryption and offline sync are the clearest differentiators.', 'WRITER — The encrypted app is the best fit for a small privacy-focused team.'],
    toolLabel: 'Planner · Researcher · Writer',
    composerPlaceholder: 'Message',
  },
  'ai-chat-7': {
    heading: 'Q3 retention review',
    model: 'Atlas',
    status: '6 sources · cited',
    pinnedContext: 'Pinned context · 6 sources',
    userMessages: ['Summarize why net revenue retention dropped in Q3.', 'What would recover it fastest?', 'Which segment held up best?'],
    assistantMessages: ['Net revenue retention fell to 104% from 111%; the decline is concentrated in mid-market accounts.', 'Re-engaging the two downgraded accounts would recover most of the lost points.', 'Enterprise held up best, with expansion roughly flat.'],
    sourceLabels: ['Q3 board pack', 'Renewal cohort export', 'Pricing change memo'],
    composerPlaceholder: 'Message',
  },
  'ai-chat-8': {
    heading: 'Voice message',
    model: 'Listening',
    status: '0:14',
    userMessages: ['Pull the three designs'],
    assistantMessages: [],
    attachmentLabels: ['hero-option-a.png', 'hero-option-b.png', 'brand-guidelines.pdf'],
    voice: { status: 'Listening', duration: '0:14', files: ['hero-option-a.png', 'hero-option-b.png', 'brand-guidelines.pdf'] },
    composerPlaceholder: 'Reply with text or voice',
  },
  'ai-chat-9': {
    heading: 'Depot capacity model',
    model: 'Atlas',
    modelProvider: 'Meridian Labs',
    status: 'Balanced',
    userMessages: ['Our depot capacity model is off by roughly 8% on Tuesdays. Where should I look first?', 'Makes sense. Draft the fix and list what it changes.', 'Does the test catch the reverse case, where reconciliation finishes late?'],
    assistantMessages: ['Tuesday is the only day the model reads the carrier feed before overnight reconciliation, so late Monday arrivals are counted twice.', 'The patch moves the ingest cutoff to 04:00, removes duplicate rows, and adds a regression test for four weeks of Tuesday feeds.', 'It does. The fixture parameterises the reconciliation finish time and fails on row counts instead of passing quietly.'],
    toolLabel: 'Context analysis · complete',
    composerPlaceholder: 'Reply, or pick a different model below',
  },
}

export type PromptPreviewConfig = {
  readonly heading: string
  readonly subheading: string
  readonly placeholder: string
  readonly labels: readonly string[]
  readonly helper?: string
  readonly tokens?: string
  readonly modes?: readonly string[]
  readonly dropzone?: string
  readonly contextPills?: readonly string[]
  readonly empty?: boolean
}

export const PROMPT_PREVIEWS: Record<string, PromptPreviewConfig> = {
  'prompt-input-1': { heading: 'Prompt input', subheading: 'Autosizing composer', placeholder: 'Message', labels: ['auth-service.ts · 12 KB', 'billing-invoice-4021.pdf · 1.2 MB'], helper: 'Type / to run a command, or drop a file to attach it.' },
  'prompt-input-2': { heading: 'Prompt input', subheading: 'Model and tools', placeholder: 'Ask anything', labels: ['Atlas', 'Search'], tokens: '356 / 8K', helper: 'Responses can be inaccurate; check anything important.' },
  'prompt-input-3': { heading: 'What do you want to build?', subheading: 'Describe it in a sentence and get a working first draft.', placeholder: 'Describe your idea', labels: ['Landing page', 'Analytics dashboard', 'Storefront', 'Onboarding flow'], empty: true },
  'prompt-input-4': { heading: 'PROMPT TEMPLATE', subheading: 'Write a warm announcement for existing customers introducing product.', placeholder: 'Write a reusable template…', labels: ['Tone', 'Audience', 'Product'], helper: '1 variable needs a value' },
  'prompt-input-5': { heading: 'Attachment drop zone', subheading: 'Transfer state', placeholder: 'Add a message about these files', labels: ['brand-guidelines.pdf · 3.4 MB', 'q3-campaign-metrics.csv · 44%', 'product-shot-hero.png'], dropzone: 'Connection lost · Drag files here, or browse' },
  'prompt-input-6': { heading: 'Prompt context', subheading: 'Scoped source pills', placeholder: 'Type @ to pull context…', labels: ['auth-service.ts', 'billing', 'Dana Whitfield'], contextPills: ['@workspace', '@git diff'], helper: 'Type @ to pull a file, person, or channel into context.' },
  'prompt-input-7': { heading: 'Prompt input', subheading: 'Ask, agent, or edit', placeholder: 'Describe the task', labels: ['Ask', 'Agent', 'Edit'], modes: ['Ask', 'Agent', 'Edit'], helper: 'Enter to send · Shift Enter for a new line' },
}

export type ActivityPreviewConfig = {
  readonly heading: string
  readonly status: string
  readonly summary: string
  readonly steps: readonly { title: string; meta: string; status: 'pending' | 'running' | 'success' | 'warning' | 'danger' }[]
  readonly tabs?: readonly string[]
}

export const ACTIVITY_PREVIEWS: Record<string, ActivityPreviewConfig> = {
  'agent-activity-1': { heading: 'Reconcile October invoices', status: 'Running · 10.8s', summary: 'Current run', steps: ['Loaded October general ledger', 'Pulled bank statement export', 'Normalised 1,284 transactions', 'Split multi-currency lines', 'Matched transactions to ledger', 'Flagged 12 unmatched entries', 'Reconciling flagged entries'].map((title, index) => ({ title, meta: `${[0.4, 1.3, 2.1, 1.7, 3.6, 0.8, 0.4][index]}s`, status: index < 6 ? 'success' : 'running' })), tabs: ['Timeline', 'Details'] },
  'agent-activity-2': { heading: 'Weekly warehouse export', status: 'Succeeded · 32.4s', summary: 'Nested run timeline', steps: ['Prepare export', 'Validate source schema', 'Snapshot three tables', 'Acquire export lock', 'Extract records', 'Transform rows', 'Load warehouse', 'Verify output'].map((title, index) => ({ title, meta: `${[4.2, 1.1, 2.4, 0.7, 12.8, 8.3, 5.1, 2.0][index]}s`, status: 'success' })), tabs: ['Timeline', 'History'] },
  'agent-activity-3': { heading: 'Deploy checkout-api', status: 'Running · 1 of 7', summary: '0:00 / 0:36', steps: ['Build the container image', 'Run the test suite', 'Push image to the registry', 'Apply database migrations', 'Roll out to production', 'Run smoke checks', 'Notify the release channel'].map((title, index) => ({ title, meta: index === 0 ? 'running' : 'queued', status: index === 0 ? 'running' : 'pending' })), tabs: ['Timeline', 'Details'] },
  'agent-activity-4': { heading: 'Run history', status: '14 runs', summary: 'Newest first · status, duration, cost and start time', steps: ['Reconcile October invoices', 'Sync Northwind CRM accounts', 'Refresh churn model features', 'Export weekly board metrics', 'Deduplicate contact records', 'Backfill subscription events'].map((title, index) => ({ title, meta: index === 2 ? 'Failed · 8.3s · $0.11' : index === 4 ? 'Cancelled · 5.0s' : 'Succeeded · 24.1s · $0.42', status: index === 2 ? 'danger' : index === 4 ? 'warning' : 'success' })), tabs: ['History', 'Details'] },
  'agent-activity-5': { heading: 'Run log', status: 'Running', summary: 'All · Info · Warnings · Errors', steps: ['Starting run for workspace acme-analytics', 'Loaded 3 source connectors', 'Connector postgres queued 1,284 rows', 'Rate limit hit on halcyon, backing off 2s', 'Transforming records to the canonical schema', 'Write succeeded on retry', 'Refreshing materialised views'].map((title, index) => ({ title, meta: `0:${String(index * 3).padStart(2, '0')}`, status: index === 3 ? 'warning' : 'success' })), tabs: ['Terminal', 'JSON'] },
  'agent-activity-6': { heading: 'Import workers', status: '4 active · 18 queued', summary: 'Parallel lanes and throughput', steps: ['Invoices · 42/min · Reconciling batch 3 of 5', 'Contacts · 18/min · Merging duplicate records', 'Documents · waiting to delete 240 archived files', 'Embeddings · 96/min · Indexing 318 support tickets', 'Metrics · 63/min · Aggregating daily revenue', 'Exports · waiting for a free slot'].map((title, index) => ({ title, meta: index === 2 || index === 5 ? 'queued' : 'running', status: index === 2 || index === 5 ? 'pending' : 'running' })), tabs: ['Lanes', 'Queue'] },
  'agent-activity-7': { heading: 'Export October ledger', status: 'Failed · 42.1s', summary: 'Warehouse write timed out', steps: ['Attempt 1 · Timed out writing 2,244 rows', 'Attempt 2 · Timed out writing 1,536 rows', 'Reduced batch size and stopped to avoid partial writes', 'Output · ledger-partial.csv · 1,024 of 2,244 rows'].map((title, index) => ({ title, meta: index < 2 ? `${[12, 30][index]}s` : 'detail', status: index < 2 ? 'danger' : 'warning' })), tabs: ['Details', 'Inputs', 'Output'] },
}

export type ToolCallPreviewConfig = {
  readonly heading: string
  readonly status: string
  readonly command: string
  readonly detail: string
  readonly lines: readonly string[]
  readonly mode: 'call' | 'diff' | 'web' | 'terminal' | 'permission'
}

export const TOOL_CALL_PREVIEWS: Record<string, ToolCallPreviewConfig> = {
  'tool-calls-1': { heading: 'Tool calls', status: 'Streaming', command: 'read_file', detail: 'Arguments and formatted result', lines: ['read_file · 38ms · Done', 'grep · 112ms · Done', 'run_tests · 2.30s · Failed', 'search_incidents · Streaming'], mode: 'call' },
  'tool-calls-2': { heading: 'Tool activity', status: 'Running', command: 'codebase_search', detail: 'Pending, success, failure and retry affordances', lines: ['read_file · Done', 'edit_file · Running', 'run_terminal · Streaming', 'apply_patch · Approved', 'send_email · Needs approval'], mode: 'call' },
  'tool-calls-3': { heading: 'edit_file', status: 'Applied 2 file edits', command: 'file.patch', detail: '+15 −4 · before / after', lines: ['- const backoff = 100', '+ const baseBackoff = options.backoffMs ?? 200', '+ const jitter = () => Math.random() * baseBackoff', '  return reconcile(feed, cutoff)'], mode: 'diff' },
  'tool-calls-4': { heading: 'web_search', status: 'Done · 7 results', command: 'web.search', detail: 'Ranked sources with relevance metadata', lines: ['Idempotent requests · docs.halcyonpay.com · 98%', 'Designing robust APIs · halcyonpay.com · 94%', 'Handling retries in payment systems · 89%', 'Idempotency-Key HTTP header · 82%'], mode: 'web' },
  'tool-calls-5': { heading: 'run_terminal', status: 'Command output · 4.12s', command: 'shell.exec', detail: 'exit 1 · stdout / stderr', lines: ['PASS retry.test.ts · 18 ms', 'PASS idempotency.test.ts · 6 ms', 'FAIL charge.test.ts · 31 ms', 'Test Suites: 1 failed, 2 passed'], mode: 'terminal' },
  'tool-calls-6': { heading: 'Tool permissions', status: '2 pending requests', command: 'workspace.write', detail: 'Scope disclosure and decision controls', lines: ['send_email · Needs approval', 'run_migration · Needs approval', 'read_file · Auto-approved', 'web_search · Public documentation'], mode: 'permission' },
}

export type ApprovalPreviewConfig = { readonly heading: string; readonly status: string; readonly title: string; readonly description: string; readonly items: readonly string[] }
export const APPROVAL_PREVIEWS: Record<string, ApprovalPreviewConfig> = {
  'agent-approval-1': { heading: 'Today', status: 'Needs approval', title: 'Delete 12 archived projects and their build history?', description: 'Frees about 4.2 GB. Active projects are untouched and this cannot be undone.', items: ['list_projects · 0.8s · Done'] },
  'agent-approval-2': { heading: 'Repo maintenance agent', status: 'Needs approval', title: 'Change the invoice retention window from 180 to 45 days', description: 'Drafts older than 45 days will be purged nightly; posted invoices are never touched.', items: ['Retention window · 180 days → 45 days', 'Grace period before purge · None → 7 days'] },
  'agent-approval-3': { heading: 'Approvals', status: '3 waiting', title: 'Refund 3 duplicate charges to Acme Logistics', description: '$1,240.00 total · West billing account', items: ['Email the Q3 renewal summary · Queued', 'Archive 312 paused campaigns · Queued', 'Add a private note to ticket #4821 · Auto-approved'] },
  'agent-approval-4': { heading: 'Permission request', status: 'Needs approval', title: 'Grant read access to customer records for 45 minutes', description: 'Read-only access to api.lumendesk.com; access ends automatically when the timer runs out.', items: ['Read customer records', 'Read recent tickets', 'Create one export · Expires in 45:00'] },
  'agent-approval-5': { heading: 'High-cost operation', status: 'Needs approval', title: 'Run the Q4 demand forecast', description: 'About 40 minutes and up to $18.40 in model usage, capped at $25.00.', items: ['Runtime · ~40 min', 'Warehouse queries · 9,600', 'Projected spend · $18.40 of $25.00 cap'] },
  'agent-approval-6': { heading: 'Approval history', status: 'Search history', title: 'Approved, skipped, expired and refunded actions', description: 'Filter the audit list by outcome and review the original request details.', items: ['Refund duplicate charges · Approved 10:42', 'Rotated production API token · Skipped 9:18', 'Changed retention window · Expired Yesterday'] },
}

export type PlanPreviewConfig = { readonly heading: string; readonly status: string; readonly summary: string; readonly steps: readonly string[] }
export const PLAN_PREVIEWS: Record<string, PlanPreviewConfig> = {
  'agent-plan-1': { heading: 'Fix billing entitlements', status: '2 of 7 done', summary: 'Patch the tier lookup · 6 min', steps: ['Read the billing contract notes · Done', 'Map the entitlement resolver · Done', 'Patch the tier lookup · Running', 'Add a renewal-grace test · Queued', 'Run the license checks · Queued'] },
  'agent-plan-2': { heading: 'Review the plan', status: '8 to run · 1 skipped', summary: 'Add, reorder or skip steps before starting', steps: ['Read the billing contract notes', 'Map the entitlement resolver', 'Patch the tier lookup fallback', 'Add a renewal-grace regression test', 'Run the license branch checks', 'Regenerate the entitlement fixtures', 'Update the installation docs', 'Notify the reviewer channel'] },
  'agent-plan-3': { heading: 'Migrate the entitlement tables', status: '5 of 13 done', summary: 'Nested execution tree', steps: ['Prepare the data · 3 of 3', 'Apply the migration · 2 of 4', 'Verify the row counts · Retry', 'Ship the change · 0 of 3'] },
  'agent-plan-4': { heading: 'Plan vs actual', status: '1 step left', summary: 'Planned 17m · Actual 21m · Drift +4m', steps: ['Read the billing contract notes · +1m', 'Map the entitlement resolver · −1m', 'Patch the tier lookup fallback · +5m', 'Summarize the handoff · —'] },
  'agent-plan-5': { heading: 'Fix billing entitlements', status: '9 of 21 done', summary: 'Investigate · Implement · Verify', steps: ['Investigate · 7/7 done', 'Patch the tier lookup fallback · Done · 11m', 'Add a renewal-grace test · Running · 4m', 'Run the license branch checks · Queued · 5m', 'Verify · 0/7 queued'] },
  'agent-plan-6': { heading: 'Fix billing entitlements', status: '10 steps', summary: 'Goal · Repair the tier lookup before access is revoked', steps: ['Prepare the data · 2 steps · 5m', 'Apply the migration · 3 steps · 11m', 'Ship the change · 2 steps · 4m', 'Verify in staging · 3 steps · 6m'] },
}

export type UsagePreviewConfig = { readonly heading: string; readonly summary: string; readonly metrics: readonly [string, string, string][]; readonly rows: readonly string[]; readonly tabs: readonly string[] }
export const USAGE_PREVIEWS: Record<string, UsagePreviewConfig> = {
  'ai-usage-1': { heading: 'Token usage', summary: 'Input and output tokens billed to this workspace.', metrics: [['Total tokens', '48M', '7d'], ['Input', '35M', '73%'], ['Output', '14M', '$311 spend']], rows: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], tabs: ['7d', '30d', '90d'] },
  'ai-usage-2': { heading: 'Spend by model', summary: '$3,600.00 across 6 models this billing period.', metrics: [['Requests', '48k', 'Atlas Pro'], ['Tokens', '215M', '61M output'], ['Share', '12.4%', '$1,565.40']], rows: ['Atlas Pro · Meridian Labs', 'Atlas · Meridian Labs', 'Atlas Long · Meridian Labs', 'Quill · Northwind AI', 'Ember · Orbital'], tabs: ['Cost', 'Requests', 'Tokens'] },
  'ai-usage-3': { heading: 'Rate limits', summary: '1 limit near capacity', metrics: [['Requests / minute', '412 / 500', 'rolling 60s'], ['Tokens / minute', '148k / 400k', 'input + output'], ['Concurrent requests', '18 / 40', 'in flight']], rows: ['Queued batch jobs · 3 / 25'], tabs: ['Tier 1', 'Tier 2', 'Tier 3'] },
  'ai-usage-4': { heading: 'Usage by member', summary: '$1,217 across 7 seats this month.', metrics: [['Platform', '42M', '77% of cap'], ['Support', '39M', '87% of cap'], ['Research', '26M', '41% of cap']], rows: ['Priya Nandakumar · Platform', 'Marcus Bell · Support', 'Sofia Alvarez · Platform', 'Tomás Guerrero · Research'], tabs: ['All teams', 'Platform', 'Support'] },
  'ai-usage-5': { heading: 'Budget and alerts', summary: 'Cap monthly model spend and decide who hears about it.', metrics: [['This month', '$1,840', 'of $2,500'], ['Projected', '$2,613', 'over budget on 26th'], ['Monthly cap', '$2,500', 'hard stop at 100%']], rows: ['Notify at 50% · 75% · 90%', 'Pause requests at 100%', 'Weekly spend digest · On'], tabs: ['Spend', 'Alerts'] },
  'ai-usage-6': { heading: 'You are over your included tokens', summary: 'Requests keep working; overage is billed at $2.40 per million.', metrics: [['Tokens used', '128M', '100M included'], ['Overage', '28M', '$68 so far'], ['Allowance', 'Scale', '$400 / mo']], rows: ['Stay on overage', 'Upgrade to a larger allowance'], tabs: ['Included', 'Overage'] },
  'ai-usage-7': { heading: 'Request log', summary: 'Last 8 calls · $0.7446 billed', metrics: [['All', '8', 'calls'], ['Capped', '1', 'call'], ['Errors', '1', 'call']], rows: ['/v1/messages · Atlas Pro · 14k · 4.2s', '/v1/messages · Atlas · 3.9k · 1.2s', '/v1/embeddings · Ember · 48k · 0.6s', '/v1/messages · Atlas Long · 187k · 12.9s'], tabs: ['All', 'Capped', 'Errors'] },
  'ai-usage-8': { heading: 'Plan usage', summary: 'Northwind · Team plan', metrics: [['Assistant messages', '1,842 / 2,000', '92% used'], ['Agent runs', '96 / 250', '38% used'], ['Indexed documents', '4,310 / 10,000', '43% used']], rows: ['Member seats · 12 / 20', 'Unlimited messages on Scale'], tabs: ['Details', 'Limits'] },
}

export function previewDescription(category: ReferenceCategory, variant: number): string | undefined {
  const key = `${category}-${variant}`
  return CHAT_PREVIEWS[key]?.heading || PROMPT_PREVIEWS[key]?.heading || ACTIVITY_PREVIEWS[key]?.heading || TOOL_CALL_PREVIEWS[key]?.heading || APPROVAL_PREVIEWS[key]?.heading || PLAN_PREVIEWS[key]?.heading || USAGE_PREVIEWS[key]?.heading
}
