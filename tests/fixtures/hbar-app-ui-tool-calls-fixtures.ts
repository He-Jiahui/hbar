import type {HbarAppUiToolCallsContent} from '../../packages/hbar-app-ui/src/index'

/**
 * Public-reference-shaped preview and test data. Reusable tool-call surfaces
 * contain no shipped demo copy or sample records; hosts inject this contract.
 */
export const HBAR_APP_UI_TOOL_CALLS_FIXTURES: HbarAppUiToolCallsContent = {
    trace: {
        labels: {
            title: 'Tool calls',
            stop: 'Stop',
            started: 'Started',
            duration: 'Duration',
            arguments: 'ARGUMENTS',
            result: 'RESULT',
        },
        items: [
            {id: 'read-file-first', name: 'read_file', duration: '38ms', state: 'complete', stateLabel: 'Done'},
            {id: 'grep', name: 'grep', duration: '112ms', state: 'complete', stateLabel: 'Done'},
            {id: 'list-dir', name: 'list_dir', duration: '12ms', state: 'complete', stateLabel: 'Done'},
            {id: 'read-file-second', name: 'read_file', duration: '41ms', state: 'complete', stateLabel: 'Done'},
            {id: 'run-tests', name: 'run_tests', duration: '2.30s', state: 'failed', stateLabel: 'Failed'},
            {id: 'read-deploys', name: 'read_deploys', duration: '88ms', state: 'complete', stateLabel: 'Done'},
            {id: 'git-blame', name: 'git_blame', duration: '64ms', state: 'complete', stateLabel: 'Done'},
            {id: 'fetch-dashboard', name: 'fetch_dashboard', duration: '210ms', state: 'complete', stateLabel: 'Done'},
            {id: 'read-config', name: 'read_config', duration: '22ms', state: 'complete', stateLabel: 'Done'},
            {id: 'query-logs', name: 'query_logs', duration: '173ms', state: 'complete', stateLabel: 'Done'},
            {id: 'list-owners', name: 'list_owners', duration: '—', state: 'running', stateLabel: 'Running'},
            {
                id: 'search-incidents',
                name: 'search_incidents',
                duration: '—',
                state: 'streaming',
                stateLabel: 'Streaming',
                startedAt: '14:08:30.118',
                argumentsText: '{\n  "workspace": "northstar-prod",\n  "query": "open incidents touching checkout latency",\n  "include": ["timeline", "owners", "recent_deploys"],\n  "window": "last 24h",\n  "limit": 5\n}',
            },
        ],
        activeItemId: 'search-incidents',
        listStrategy: {kind: 'pane-scroll', expectedMaximum: 64},
    },
    activity: {
        labels: {title: 'Tool activity', stop: 'Stop', filtersLabel: 'Tool activity filters'},
        filters: [{id: 'all', label: 'All'}, {id: 'running', label: 'Running'}, {id: 'failed', label: 'Failed'}],
        activeFilterId: 'all',
        items: [
            {id: 'activity-read-file', name: 'read_file', detail: 'app/api/checkout/route.ts', duration: '38ms', filterIds: ['all'], state: 'complete', stateLabel: 'Done'},
            {id: 'activity-codebase-search', name: 'codebase_search', detail: 'where is the retry backoff configured', duration: '1.24s', filterIds: ['all'], state: 'complete', stateLabel: 'Done'},
            {id: 'activity-grep', name: 'grep', detail: 'RETRY_BACKOFF_MS across the services directory', duration: '112ms', filterIds: ['all'], state: 'complete', stateLabel: 'Done'},
            {id: 'activity-edit-file', name: 'edit_file', detail: 'services/payments/retry.ts', duration: '0.94s', filterIds: ['all', 'running'], state: 'running', stateLabel: 'Running'},
            {id: 'activity-run-terminal', name: 'run_terminal', detail: 'pnpm test payments --runInBand', duration: '—', filterIds: ['all', 'running'], state: 'streaming', stateLabel: 'Streaming'},
            {id: 'activity-web-search', name: 'web_search', detail: 'Halcyon Pay idempotency key best practices', duration: '2.10s', filterIds: ['all'], state: 'complete', stateLabel: 'Done'},
            {id: 'activity-fetch-url', name: 'fetch_url', detail: 'https://docs.halcyonpay.com/api/idempotent_requests', duration: '—', filterIds: ['all', 'failed'], state: 'failed', stateLabel: 'Failed', retryLabel: 'Retry fetch URL'},
            {id: 'activity-apply-patch', name: 'apply_patch', detail: 'services/payments/retry.ts', duration: '—', filterIds: ['all'], state: 'approved', stateLabel: 'Approved'},
            {id: 'activity-read-file-second', name: 'read_file', detail: 'services/payments/retry.ts', duration: '18ms', filterIds: ['all'], state: 'complete', stateLabel: 'Done'},
            {id: 'activity-run-terminal-failed', name: 'run_terminal', detail: 'pnpm test payments --runInBand', duration: '4.12s', filterIds: ['all', 'failed'], state: 'failed', stateLabel: 'Failed', retryLabel: 'Retry command'},
            {id: 'activity-send-email', name: 'send_email', detail: 'Q3 renewal summary', duration: '—', filterIds: ['all', 'running'], state: 'needs-approval', stateLabel: 'Needs approval'},
            {id: 'activity-delete-file', name: 'delete_file', detail: 'legacy retry fixture', duration: '—', filterIds: ['all'], state: 'skipped', stateLabel: 'Skipped'},
        ],
        listStrategy: {kind: 'pane-scroll', expectedMaximum: 64},
    },
    diff: {
        toolName: 'edit_file',
        title: 'Applied 2 file edits',
        summary: '+15 −4',
        files: [
            {
                id: 'retry-file',
                fileName: 'services/payments/retry.ts',
                fileSummary: '+9 −3',
                lines: [
                    {id: 'diff-1', beforeLine: '', afterLine: '', text: '@@ -18,13 +18,19 @@ export function withRetry(', kind: 'context'},
                    {id: 'diff-2', beforeLine: '18', afterLine: '18', text: '  const max = options.maxAttempts ?? 5;', kind: 'context'},
                    {id: 'diff-3', beforeLine: '19', afterLine: '19', text: '  let attempt = 0;', kind: 'context'},
                    {id: 'diff-4', beforeLine: '20', marker: '−', text: '  const backoff = 100;', kind: 'removed'},
                    {id: 'diff-5', afterLine: '20', marker: '+', text: '  const baseBackoff = options.backoffMs ?? 200;', kind: 'added'},
                    {id: 'diff-6', afterLine: '21', marker: '+', text: '  const jitter = () => Math.random() * baseBackoff;', kind: 'added'},
                    {id: 'diff-7', beforeLine: '21', afterLine: '22', text: '', kind: 'context'},
                    {id: 'diff-8', beforeLine: '22', afterLine: '23', text: '  while (attempt < max) {', kind: 'context'},
                    {id: 'diff-9', beforeLine: '23', marker: '−', text: '    await sleep(backoff * attempt);', kind: 'removed'},
                    {id: 'diff-10', afterLine: '24', marker: '+', text: '    await sleep(baseBackoff * 2 ** attempt + jitter());', kind: 'added'},
                    {id: 'diff-11', beforeLine: '24', afterLine: '25', text: '    try {', kind: 'context'},
                    {id: 'diff-12', beforeLine: '25', afterLine: '26', text: '      return await run();', kind: 'context'},
                    {id: 'diff-13', beforeLine: '26', marker: '−', text: '    } catch (err) {', kind: 'removed'},
                    {id: 'diff-14', afterLine: '27', marker: '+', text: '    } catch (err: unknown) {', kind: 'added'},
                    {id: 'diff-15', afterLine: '28', marker: '+', text: '      if (!isRetryable(err)) throw err;', kind: 'added'},
                    {id: 'diff-16', beforeLine: '27', afterLine: '29', text: '      attempt += 1;', kind: 'context'},
                    {id: 'diff-17', beforeLine: '28', afterLine: '30', text: '    }', kind: 'context'},
                    {id: 'diff-18', beforeLine: '29', afterLine: '31', text: '  }', kind: 'context'},
                    {id: 'diff-19', beforeLine: '30', afterLine: '32', text: '', kind: 'context'},
                    {id: 'diff-20', beforeLine: '31', afterLine: '33', text: '  throw new RetryError(max);', kind: 'context'},
                    {id: 'diff-21', beforeLine: '32', afterLine: '34', text: '}', kind: 'context'},
                ],
            },
            {
                id: 'idempotency-file',
                fileName: 'services/payments/idempotency.ts',
                fileSummary: '+6 −1',
                lines: [
                    {id: 'idempotency-1', beforeLine: '7', afterLine: '7', text: 'export function keyFor(input: ChargeInput) {', kind: 'context'},
                    {id: 'idempotency-2', afterLine: '8', marker: '+', text: '  return stableKey(input.customerId, input.intentId);', kind: 'added'},
                ],
            },
        ],
        activeFileId: 'retry-file',
        listStrategy: {kind: 'pane-scroll', expectedMaximum: 128},
    },
    search: {
        toolName: 'web_search',
        query: 'Halcyon Pay idempotency key best practices',
        statusLabel: 'Done · 7 results',
        items: [
            {id: 'result-docs', title: 'Idempotent requests', source: 'Halcyon Pay Docs/docs.halcyonpay.com', excerpt: 'Pass a unique Idempotency-Key header so a retried request is only executed once, even if the network fails after the charge is created.', relevance: '98%'},
            {id: 'result-blog', title: 'Designing robust and predictable APIs with idempotency', source: 'Halcyon Pay Blog/halcyonpay.com', excerpt: 'How Halcyon Pay stores the first response against a key and replays it for 24 hours, and why keys should be derived from the client request.', relevance: '94%'},
            {id: 'result-api', title: 'Handling retries and idempotency in payment systems', source: 'Increase Engineering/increase.com', excerpt: 'A survey of key derivation strategies, including hashing the customer, amount, and currency to avoid duplicate charges under retry storms.', relevance: '89%'},
            {id: 'result-retries', title: 'Idempotency-Key HTTP header field', source: 'IETF Draft/datatracker.ietf.org', excerpt: 'The proposed standard header that lets clients express at-most-once semantics for unsafe HTTP methods across intermediaries.', relevance: '82%'},
            {id: 'result-webhooks', title: 'What is an idempotency key and when should you use one?', source: 'Fly.io/fly.io', excerpt: 'A practical walkthrough of adding idempotency to a checkout endpoint, with a Postgres table keyed on the request fingerprint.', relevance: '76%'},
            {id: 'result-guide', title: 'Exactly-once delivery is a myth. Idempotency is the answer', source: 'Confluent/confluent.io', excerpt: 'Why distributed systems cannot guarantee exactly-once side effects, and how idempotent consumers make duplicate delivery harmless.', relevance: '71%'},
            {id: 'result-faq', title: 'Add idempotency keys to your webhook handlers', source: 'Svix/svix.com', excerpt: 'Store processed event IDs so a redelivered webhook is acknowledged without running the handler a second time.', relevance: '64%'},
        ],
        listStrategy: {kind: 'pane-scroll', expectedMaximum: 48},
    },
    command: {
        toolName: 'run_terminal',
        title: 'Command output',
        duration: '4.12s',
        command: '$ pnpm test payments --runInBand',
        exitLabel: 'exit 1',
        tabsLabel: 'Command output streams',
        tabs: [
            {id: 'stdout', label: 'stdout', output: '> payments@1.4.0 test\n> jest --config jest.config.ts --runInBand\n\nPASS services/payments/retry.test.ts\n  withRetry\n    retries on transient errors (18 ms)\n    applies exponential backoff with jitter (24 ms)\n    gives up after maxAttempts (9 ms)\nPASS services/payments/idempotency.test.ts\n  keyFor\n    derives a stable key from the request (6 ms)\nFAIL services/payments/charge.test.ts\n  createCharge\n    rejects duplicate idempotency keys (31 ms)\n\nTest Suites: 1 failed, 2 passed, 3 total\nTests:       1 failed, 5 passed, 6 total\nTime:        4.12 s'},
            {id: 'stderr', label: 'stderr', output: 'Error: expected status 409, received status 500\n    at createCharge (services/payments/charge.test.ts:84:11)'},
        ],
        initialTabId: 'stdout',
        outputStrategy: {kind: 'pane-scroll', expectedMaximum: 512},
    },
    permissions: {
        title: 'Tool permissions',
        pendingLabel: '2 pending',
        groups: [
            {
                id: 'requests', label: 'REQUESTS', items: [
                    {id: 'send-email-request', kind: 'request', name: 'Send the Q3 renewal summary to 4 recipients', description: 'send_email', actions: [{id: 'view', label: 'View request'}, {id: 'approve', label: 'Approve', tone: 'accent'}, {id: 'reject', label: 'Reject', tone: 'danger'}]},
                    {id: 'migration-request', kind: 'request', name: 'Apply migration 0042_add_idempotency_key to production', description: 'run_migration', statusLabel: 'Waiting for the request above', actions: [{id: 'view', label: 'View request'}]},
                    {id: 'approval-read-file', kind: 'status', name: 'read_file', description: 'Read services/payments/retry.ts', statusLabel: 'Auto-approved'},
                ],
            },
            {
                id: 'filesystem', label: 'FILESYSTEM', items: [
                    {id: 'permission-read-file', kind: 'toggle', name: 'read_file', description: 'Read any file inside the workspace', enabled: true, toggleLabel: 'Toggle read file permission'},
                    {id: 'permission-edit-file', kind: 'toggle', name: 'edit_file', description: 'Modify files and show a diff before saving', enabled: true, toggleLabel: 'Toggle edit file permission'},
                    {id: 'permission-delete-file', kind: 'toggle', name: 'delete_file', description: 'Remove files, asking before each deletion', enabled: false, toggleLabel: 'Toggle delete file permission'},
                ],
            },
            {
                id: 'network', label: 'NETWORK', items: [
                    {id: 'permission-web-search', kind: 'toggle', name: 'web_search', description: 'Search the web for public documentation', enabled: true, toggleLabel: 'Toggle web search permission'},
                    {id: 'permission-send-email', kind: 'toggle', name: 'send_email', description: 'Send email, asking approval each time', enabled: false, toggleLabel: 'Toggle send email permission'},
                ],
            },
        ],
        groupStrategy: {kind: 'content-grown', expectedMaximum: 8},
    },
}

function requiredTrace(content: HbarAppUiToolCallsContent) {
    if (!content.trace) throw new Error('Expected tool trace fixture')
    return content.trace
}

function requiredActivity(content: HbarAppUiToolCallsContent) {
    if (!content.activity) throw new Error('Expected tool activity fixture')
    return content.activity
}

function requiredSearch(content: HbarAppUiToolCallsContent) {
    if (!content.search) throw new Error('Expected tool search fixture')
    return content.search
}

function requiredCommand(content: HbarAppUiToolCallsContent) {
    if (!content.command) throw new Error('Expected tool command fixture')
    return content.command
}

/** Deliberately exceeds the documented pane bounds to exercise real scroll regions. */
export function createHbarAppUiToolCallsOverflowFixtures(): HbarAppUiToolCallsContent {
    const trace = requiredTrace(HBAR_APP_UI_TOOL_CALLS_FIXTURES)
    const activity = requiredActivity(HBAR_APP_UI_TOOL_CALLS_FIXTURES)
    const search = requiredSearch(HBAR_APP_UI_TOOL_CALLS_FIXTURES)
    const command = requiredCommand(HBAR_APP_UI_TOOL_CALLS_FIXTURES)
    const traceItems = Array.from({length: trace.listStrategy.expectedMaximum + 8}, (_, index) => ({
        id: `overflow-trace-${index}`,
        name: `read_workspace_${index}`,
        duration: `${index + 1}ms`,
        state: 'complete' as const,
        stateLabel: 'Done',
    }))
    const activityItems = Array.from({length: activity.listStrategy.expectedMaximum + 8}, (_, index) => ({
        id: `overflow-activity-${index}`,
        name: `run_batch_${index}`,
        detail: `batch queue ${index}`,
        duration: `${index + 1}ms`,
        filterIds: ['all'],
        state: 'complete' as const,
        stateLabel: 'Done',
    }))
    const searchItems = Array.from({length: search.listStrategy.expectedMaximum + 8}, (_, index) => ({
        id: `overflow-result-${index}`,
        title: `Overflow search result ${index}`,
        source: 'Search fixture',
        excerpt: `Long result excerpt ${index}`,
        relevance: '80%',
    }))
    return {
        ...HBAR_APP_UI_TOOL_CALLS_FIXTURES,
        trace: {...trace, items: traceItems, activeItemId: traceItems.at(-1)?.id ?? trace.activeItemId},
        activity: {...activity, items: activityItems},
        search: {...search, items: searchItems},
        command: {
            ...command,
            tabs: command.tabs.map((tab) => ({
                ...tab,
                output: `${tab.output}\n${Array.from({length: 80}, (_, index) => `overflow output line ${index}`).join('\\n')}`,
            })),
        },
    }
}

/** A deliberately long non-default locale proves that labels come from the host. */
export function createHbarAppUiToolCallsLocalizedFixtures(): HbarAppUiToolCallsContent {
    const trace = requiredTrace(HBAR_APP_UI_TOOL_CALLS_FIXTURES)
    const activity = requiredActivity(HBAR_APP_UI_TOOL_CALLS_FIXTURES)
    const permissions = HBAR_APP_UI_TOOL_CALLS_FIXTURES.permissions
    if (!permissions) throw new Error('Expected tool permissions fixture')
    return {
        ...HBAR_APP_UI_TOOL_CALLS_FIXTURES,
        trace: {
            ...trace,
            labels: {
                ...trace.labels,
                title: 'Werkzeugaufrufe und laufende Ausfuehrungen',
                stop: 'Ausfuehrung sofort anhalten',
                arguments: 'UEBERGEBENE AUSFUEHRUNGSPARAMETER',
            },
        },
        activity: {
            ...activity,
            labels: {
                ...activity.labels,
                title: 'Werkzeugaktivitaet mit langen Statusbeschreibungen',
                filtersLabel: 'Werkzeugaktivitaetsfilter und Ausfuehrungsstatus',
            },
        },
        permissions: {
            ...permissions,
            title: 'Werkzeugberechtigungen fuer diesen Arbeitsbereich',
            pendingLabel: '2 ausstehende Freigabeanfragen',
        },
    }
}
