import type {HbarAppUiAgentActivityContent} from '../../packages/hbar-app-ui/src/index'

const liveSteps = [
    ['loaded-ledger', 'Loaded October general ledger', '0.4s', 'complete'],
    ['pulled-statement', 'Pulled bank statement export', '1.3s', 'complete'],
    ['normalised-transactions', 'Normalised 1,284 transactions', '2.1s', 'complete'],
    ['split-currency', 'Split multi-currency lines', '1.7s', 'complete'],
    ['matched-ledger', 'Matched transactions to ledger', '3.6s', 'complete'],
    ['flagged-unmatched', 'Flagged 12 unmatched entries', '0.8s', 'complete'],
    ['grouped-duplicates', 'Grouped duplicates by reference', '0.5s', 'complete'],
    ['reconciling-entries', 'Reconciling flagged entries', '1.8s', 'running'],
    ['resolve-rounding', 'Resolve foreign-exchange rounding', '-', 'queued'],
    ['post-adjustments', 'Post adjustments to the ledger', '-', 'queued'],
    ['generate-report', 'Generate the reconciliation report', '-', 'queued'],
    ['archive-run', 'Archive the reconciliation run', '-', 'queued'],
    ['notify-finance', 'Notify the finance team', '-', 'queued'],
] as const

const historyRows = [
    ['reconcile-october', 'Reconcile October invoices', 'complete', 'Succeeded', '24.1s', '$0.42', '12m ago'],
    ['sync-northwind', 'Sync Northwind CRM accounts', 'complete', 'Succeeded', '1m 18s', '$1.85', '46m ago'],
    ['refresh-churn', 'Refresh churn model features', 'failed', 'Failed', '8.3s', '$0.11', '1h ago'],
    ['export-board', 'Export weekly board metrics', 'complete', 'Succeeded', '42.7s', '$0.63', '2h ago'],
    ['deduplicate-contacts', 'Deduplicate contact records', 'cancelled', 'Cancelled', '5.0s', '-', '3h ago'],
    ['backfill-subscriptions', 'Backfill subscription events', 'complete', 'Succeeded', '3m 04s', '$2.40', '5h ago'],
    ['retag-support', 'Retag support conversations', 'complete', 'Succeeded', '58.9s', '$0.71', '6h ago'],
    ['quarterly-revenue', 'Generate quarterly revenue summary for the finance leadership review', 'complete', 'Succeeded', '1m 02s', '$0.94', '9h ago'],
    ['rotate-credentials', 'Rotate warehouse credentials', 'failed', 'Failed', '2.1s', '$0.03', '11h ago'],
    ['import-leads', 'Import marketing leads', 'cancelled', 'Cancelled', '14.6s', '-', '14h ago'],
    ['reindex-catalogue', 'Reindex the product catalogue', 'complete', 'Succeeded', '2m 41s', '$1.12', '18h ago'],
    ['recompute-health', 'Recompute account health scores', 'complete', 'Succeeded', '47.5s', '$0.55', '1d ago'],
    ['overnight-support', 'Summarise overnight support volume', 'complete', 'Succeeded', '31.2s', '$0.38', '1d ago'],
    ['prune-embeddings', 'Prune stale vector embeddings', 'cancelled', 'Cancelled', '9.4s', '-', '2d ago'],
] as const

const logEntries = [
    ['log-00', '0:00.0', 'Starting run for workspace acme-analytics', 'info'],
    ['log-01', '0:00.6', 'Loaded 3 source connectors', 'info'],
    ['log-02', '0:01.4', 'Connector postgres queued 1,284 rows', 'info'],
    ['log-03', '0:02.1', 'Connector halcyon queued 642 records', 'info'],
    ['log-04', '0:02.9', 'Connector lumendesk queued 318 tickets', 'info'],
    ['log-05', '0:03.7', 'Fetching postgres batch 1 of 3', 'info'],
    ['log-06', '0:04.5', 'Fetched 512 rows in 0.8s', 'info'],
    ['log-07', '0:05.2', 'Rate limit hit on halcyon, backing off 2s', 'warning'],
    ['log-08', '0:07.3', 'Resumed halcyon after backoff', 'info'],
    ['log-09', '0:08.0', 'Fetched 642 halcyon records', 'info'],
    ['log-10', '0:08.8', 'Transforming records to the canonical schema', 'info'],
    ['log-11', '0:09.6', 'Dropped 14 rows that failed validation', 'info'],
    ['log-12', '0:10.4', 'Missing owner on 6 accounts, defaulting to unassigned', 'warning'],
    ['log-13', '0:11.2', 'Writing batch to the warehouse', 'info'],
    ['log-14', '0:12.0', 'Write to reporting.accounts timed out after 30s', 'error'],
    ['log-15', '0:12.4', 'Retrying write with a smaller batch size', 'info'],
    ['log-16', '0:13.9', 'Write succeeded on retry', 'info'],
    ['log-17', '0:14.6', 'Indexed 2,244 documents', 'info'],
    ['log-18', '0:15.3', 'Building embeddings for 318 tickets', 'info'],
    ['log-19', '0:17.1', 'Embeddings complete', 'info'],
    ['log-20', '0:17.8', 'Refreshing materialised views', 'info'],
    ['log-21', '0:18.5', 'View account_health refreshed', 'info'],
    ['log-22', '0:19.2', 'View revenue_daily refreshed', 'info'],
    ['log-23', '0:19.9', 'Verifying row counts against the sources', 'info'],
    ['log-24', '0:20.6', 'Row counts match across 3 connectors', 'info'],
    ['log-25', '0:21.3', 'Run complete, 2,244 records processed', 'info'],
] as const

export const HBAR_APP_UI_AGENT_ACTIVITY_FIXTURES: HbarAppUiAgentActivityContent = {
    live: {
        labels: {title: 'Reconcile October invoices', status: 'Running', elapsed: '11.1s', separator: '·', stop: 'Stop'},
        steps: liveSteps.map(([id, label, duration, state]) => ({id, label, duration, state})),
        activeStepId: 'reconciling-entries',
        listStrategy: {kind: 'pane-scroll', expectedMaximum: 13},
    },
    nested: {
        labels: {
            title: 'Weekly warehouse export',
            status: 'Succeeded',
            elapsed: '32.4s',
            separator: '·',
            expand: 'Expand all',
            collapse: 'Collapse all',
            expandGroup: 'Expand group',
            collapseGroup: 'Collapse group',
        },
        groups: [
            {
                id: 'prepare', label: 'Prepare export', duration: '4.2s', openByDefault: true,
                children: [
                    {id: 'schema', label: 'Validate source schema', duration: '1.1s', progress: 48},
                    {id: 'snapshot', label: 'Snapshot three tables', duration: '2.4s', progress: 60},
                    {id: 'lock', label: 'Acquire export lock', duration: '0.7s', progress: 14},
                ],
            },
            {
                id: 'extract', label: 'Extract records', duration: '12.8s', openByDefault: true,
                children: [
                    {id: 'customers', label: 'Read customers', duration: '3.1s', progress: 52},
                    {id: 'subscriptions', label: 'Read subscriptions', duration: '6.4s', progress: 100},
                    {id: 'invoices', label: 'Read invoices', duration: '3.3s', progress: 56},
                ],
            },
            {
                id: 'transform', label: 'Transform rows', duration: '8.3s', openByDefault: true,
                children: [
                    {id: 'currencies', label: 'Normalise currencies', duration: '2.2s', progress: 48},
                    {id: 'owners', label: 'Resolve account owners', duration: '4.0s', progress: 82},
                    {id: 'tests', label: 'Drop test accounts', duration: '2.1s', progress: 46},
                ],
            },
            {id: 'load', label: 'Load warehouse', duration: '5.1s', openByDefault: false, children: []},
            {id: 'verify', label: 'Verify output', duration: '2.0s', openByDefault: false, children: []},
        ],
        listStrategy: {kind: 'pane-scroll', expectedMaximum: 5},
    },
    deployment: {
        labels: {title: 'Deploy checkout-api', status: 'Running', currentStep: '1 of 7', elapsed: '0:02 / 0:36', stop: 'Stop'},
        steps: [
            {id: 'build', label: 'Build the container image', state: 'running', stateLabel: 'Running'},
            {id: 'tests', label: 'Run the test suite', state: 'queued', stateLabel: 'Queued'},
            {id: 'push', label: 'Push image to the registry', state: 'queued', stateLabel: 'Queued'},
            {id: 'migrate', label: 'Apply database migrations', state: 'queued', stateLabel: 'Queued'},
            {id: 'rollout', label: 'Roll out to production', state: 'queued', stateLabel: 'Queued'},
            {id: 'smoke', label: 'Run smoke checks', state: 'queued', stateLabel: 'Queued'},
            {id: 'notify', label: 'Notify the release channel', state: 'queued', stateLabel: 'Queued'},
        ],
        activeStepId: 'build',
        progress: 5,
        progressLabel: 'Deployment progress',
        listStrategy: {kind: 'pane-scroll', expectedMaximum: 7},
    },
    history: {
        labels: {
            title: 'Run history', count: '14 runs', description: 'Run history, newest first. Fourteen agent runs with status, duration, cost and start time.',
            run: 'Run', status: 'Status', duration: 'Duration', cost: 'Cost', started: 'Started', actions: 'Actions', rerun: 'Re-run',
        },
        rows: historyRows.map(([id, name, state, stateLabel, duration, cost, started]) => ({id, name, state, stateLabel, duration, cost, started})),
        listStrategy: {kind: 'pane-scroll', expectedMaximum: 14},
    },
    log: {
        labels: {title: 'Run log', lineCount: '26 lines', filters: 'Log filters', stop: 'Stop'},
        filters: [
            {id: 'all', label: 'All'},
            {id: 'info', label: 'Info', level: 'info'},
            {id: 'warning', label: 'Warnings', level: 'warning'},
            {id: 'error', label: 'Errors', level: 'error'},
        ],
        activeFilterId: 'all',
        entries: logEntries.map(([id, time, message, level]) => ({id, time, message, level})),
        listStrategy: {kind: 'pane-scroll', expectedMaximum: 26},
    },
    workers: {
        labels: {title: 'Import workers', activeSummary: '4 active', queuedSummary: '18 queued'},
        workers: [
            {id: 'invoices', name: 'Invoices', rate: '42/min', task: 'Reconciling batch 3 of 5', state: 'running', stateLabel: 'Running', progress: 63, progressLabel: 'Invoices progress'},
            {id: 'contacts', name: 'Contacts', rate: '18/min', task: 'Merging duplicate records', state: 'running', stateLabel: 'Running', progress: 35, progressLabel: 'Contacts progress'},
            {id: 'documents', name: 'Documents', rate: '-', task: 'Waiting to delete 240 archived files', state: 'needs-approval', stateLabel: 'Needs approval', progress: 0, progressLabel: 'Documents progress'},
            {id: 'embeddings', name: 'Embeddings', rate: '96/min', task: 'Indexing 318 support tickets', state: 'running', stateLabel: 'Running', progress: 81, progressLabel: 'Embeddings progress'},
            {id: 'metrics', name: 'Metrics', rate: '63/min', task: 'Aggregating daily revenue', state: 'running', stateLabel: 'Running', progress: 49, progressLabel: 'Metrics progress'},
            {id: 'exports', name: 'Exports', rate: '-', task: 'Waiting for a free slot', state: 'queued', stateLabel: 'Queued', progress: 0, progressLabel: 'Exports progress'},
        ],
        listStrategy: {kind: 'pane-scroll', expectedMaximum: 6},
    },
    failure: {
        labels: {
            title: 'Export October ledger', status: 'Failed', duration: '42.1s', separator: '·', viewLog: 'View log', errorTitle: 'Failure summary',
            inputs: 'Inputs', attempts: 'Attempts', output: 'Output', retry: 'Retry run', download: 'Download',
        },
        summaryTitle: 'Warehouse write timed out',
        summaryDescription: 'Two attempts exceeded the 30s write limit. Retry off-peak or lower the batch size before running again.',
        inputs: [
            {id: 'trigger', label: 'Trigger', value: 'Scheduled'},
            {id: 'dataset', label: 'Dataset', value: 'reporting.ledger'},
            {id: 'model', label: 'Model', value: 'Atlas Pro'},
            {id: 'started', label: 'Started', value: 'Today at 06:00'},
            {id: 'requested-by', label: 'Requested by', value: 'Automation'},
        ],
        attempts: [
            {id: 'attempt-1', label: 'Attempt 1', description: 'Timed out writing 2,244 rows', duration: '12.0s'},
            {id: 'attempt-2', label: 'Attempt 2', description: 'Timed out writing 1,536 rows', duration: '30.0s'},
        ],
        outputs: [
            {id: 'ledger-partial', name: 'ledger-partial.csv', detail: '1,024 of 2,244 rows · 84 KB', downloadLabel: 'Download'},
            {id: 'run-log', name: 'run.log', detail: 'Full trace · 12 KB', downloadLabel: 'Download'},
        ],
        listStrategy: {kind: 'content-grown', expectedMaximum: 3},
    },
}

export function createHbarAppUiAgentActivityOverflowFixtures(): HbarAppUiAgentActivityContent {
    const base = HBAR_APP_UI_AGENT_ACTIVITY_FIXTURES
    return {
        ...base,
        live: base.live && {
            ...base.live,
            steps: [...base.live.steps, ...Array.from({length: 28}, (_, index) => ({id: `live-overflow-${index}`, label: `Queued reconciliation step ${index + 1}`, duration: '-', state: 'queued' as const}))],
            listStrategy: {kind: 'pane-scroll', expectedMaximum: 13},
        },
        nested: base.nested && {
            ...base.nested,
            groups: [...base.nested.groups, ...Array.from({length: 12}, (_, index) => ({id: `group-overflow-${index}`, label: `Additional export phase ${index + 1}`, duration: '-', openByDefault: false, children: []}))],
            listStrategy: {kind: 'pane-scroll', expectedMaximum: 5},
        },
        deployment: base.deployment && {
            ...base.deployment,
            steps: [...base.deployment.steps, ...Array.from({length: 10}, (_, index) => ({id: `deployment-overflow-${index}`, label: `Queued release step ${index + 1}`, state: 'queued' as const, stateLabel: 'Queued'}))],
        },
        history: base.history && {
            ...base.history,
            rows: [...base.history.rows, ...Array.from({length: 30}, (_, index) => ({id: `history-overflow-${index}`, name: `Backfill historical run ${index + 1}`, state: 'complete' as const, stateLabel: 'Succeeded', duration: '12.0s', cost: '$0.10', started: `${index + 3}d ago`}))],
            listStrategy: {kind: 'pane-scroll', expectedMaximum: 14},
        },
        log: base.log && {
            ...base.log,
            entries: [...base.log.entries, ...Array.from({length: 80}, (_, index) => ({id: `log-overflow-${index}`, time: `0:${String(22 + index).padStart(2, '0')}.0`, level: 'info' as const, message: `Continuing incremental sync record ${index + 1}`}))],
            listStrategy: {kind: 'pane-scroll', expectedMaximum: 26},
        },
        workers: base.workers && {
            ...base.workers,
            workers: [...base.workers.workers, ...Array.from({length: 12}, (_, index) => ({id: `worker-overflow-${index}`, name: `Worker ${index + 7}`, rate: '-', task: 'Waiting for capacity', state: 'queued' as const, stateLabel: 'Queued', progress: 0, progressLabel: `Worker ${index + 7} progress`}))],
            listStrategy: {kind: 'pane-scroll', expectedMaximum: 6},
        },
    }
}

export function createHbarAppUiAgentActivityLocalizedFixtures(): HbarAppUiAgentActivityContent {
    const base = HBAR_APP_UI_AGENT_ACTIVITY_FIXTURES
    return {
        ...base,
        live: base.live && {
            ...base.live,
            labels: {title: 'Oktober-Abstimmung der Rechnungen mit besonders langem Arbeitsbereichstitel', status: 'Wird ausgeführt', elapsed: '11,1 Sek.', separator: '·', stop: 'Ausführung sicher anhalten'},
        },
        nested: base.nested && {
            ...base.nested,
            labels: {...base.nested.labels, expand: 'Alle verschachtelten Exportphasen öffnen', collapse: 'Alle verschachtelten Exportphasen schließen'},
        },
        deployment: base.deployment && {
            ...base.deployment,
            labels: {...base.deployment.labels, stop: 'Bereitstellung anhalten', currentStep: 'Schritt 1 von 7'},
        },
        history: base.history && {
            ...base.history,
            labels: {...base.history.labels, description: 'Ausführungsverlauf, neueste zuerst, mit Status, Dauer, Kosten und Startzeit.', rerun: 'Diese Ausführung erneut starten'},
        },
        log: base.log && {
            ...base.log,
            labels: {...base.log.labels, title: 'Ausführungsprotokoll mit absichtlich langem lokalisiertem Titel', lineCount: '26 Zeilen', filters: 'Protokollfilter', stop: 'Ausführung anhalten'},
            filters: [{id: 'all', label: 'Alle Einträge'}, {id: 'info', label: 'Informationen', level: 'info'}, {id: 'warning', label: 'Warnungen', level: 'warning'}, {id: 'error', label: 'Fehler', level: 'error'}],
        },
        workers: base.workers && {
            ...base.workers,
            labels: {title: 'Import-Arbeitswarteschlangen für mehrere Datenquellen', activeSummary: '4 aktiv', queuedSummary: '18 warten'},
        },
        failure: base.failure && {
            ...base.failure,
            labels: {...base.failure.labels, title: 'Oktoberbuch-Export fehlgeschlagen', viewLog: 'Protokoll anzeigen', retry: 'Ausführung erneut versuchen', download: 'Datei herunterladen'},
            summaryDescription: 'Zwei Versuche überschritten das Schreiblimit von 30 Sekunden. Erneut außerhalb der Spitzenzeit oder mit kleinerer Batch-Größe ausführen.',
        },
    }
}
