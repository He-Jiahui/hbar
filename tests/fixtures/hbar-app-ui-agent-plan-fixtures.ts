import type {HbarAppUiAgentPlanContent, HbarAppUiAgentPlanStep} from '../../packages/hbar-app-ui/src/index'

const checklistSteps: readonly HbarAppUiAgentPlanStep[] = [
    {id: 'contract-notes', title: 'Read the billing contract notes', state: 'done', stateLabel: 'Done', detail: 'Collected the pricing rules, renewal terms and license caps.', target: 'docs/billing.md', estimate: '2 min'},
    {id: 'resolver-map', title: 'Map the entitlement resolver', state: 'done', stateLabel: 'Done', detail: 'Traced how a key resolves to a tier before touching the branch.', target: 'lib/registry-auth.ts', estimate: '3 min'},
    {id: 'tier-lookup', title: 'Patch the tier lookup', state: 'running', stateLabel: 'Running', detail: 'Adding the renewal fallback so expired keys keep access through the grace window, without changing the response shape.', target: 'lib/registry-auth.ts', estimate: '6 min'},
    {id: 'renewal-test', title: 'Add a renewal-grace test', state: 'queued', stateLabel: 'Queued', detail: 'Covers the expired-but-in-grace path from key to response.', target: 'tests/entitlements.test.ts', estimate: '4 min'},
    {id: 'license-checks', title: 'Run the license checks', state: 'queued', stateLabel: 'Queued', detail: 'Verifies expired, starter, pro and ultimate keys each branch.', target: 'npm test', estimate: '5 min'},
    {id: 'entitlement-fixtures', title: 'Regenerate the entitlement fixtures', state: 'skipped', stateLabel: 'Skipped', detail: 'Skipped in review: the current fixtures already cover the change.', target: 'scripts/fixtures.ts', estimate: '4 min'},
    {id: 'installation-docs', title: 'Update the installation docs', state: 'queued', stateLabel: 'Queued', detail: 'Describes the renewal fallback in plain language.', target: 'docs/installation.md', estimate: '3 min'},
]

const editableSteps: readonly HbarAppUiAgentPlanStep[] = [
    {id: 'contract-notes', title: 'Read the billing contract notes', state: 'queued', stateLabel: 'Ready'},
    {id: 'resolver-map', title: 'Map the entitlement resolver', state: 'queued', stateLabel: 'Ready'},
    {id: 'tier-fallback', title: 'Patch the tier lookup fallback', state: 'queued', stateLabel: 'Ready'},
    {id: 'renewal-regression', title: 'Add a renewal-grace regression test', state: 'queued', stateLabel: 'Ready'},
    {id: 'license-branch', title: 'Run the license branch checks', state: 'queued', stateLabel: 'Ready'},
    {id: 'fixtures', title: 'Regenerate the entitlement fixtures', state: 'skipped', stateLabel: 'Skipped'},
    {id: 'installation-docs', title: 'Update the installation docs', state: 'queued', stateLabel: 'Ready'},
    {id: 'reviewer-channel', title: 'Notify the reviewer channel', state: 'queued', stateLabel: 'Ready'},
    {id: 'handoff', title: 'Summarize the handoff for review', state: 'queued', stateLabel: 'Ready'},
]

const treeGroups = [
    {
        id: 'prepare', title: 'Prepare the data', done: 3, total: 3, progressLabel: '3 of 3', openByDefault: true,
        items: [
            {id: 'load-source', title: 'Load the source files', state: 'done' as const, stateLabel: 'Done'},
            {id: 'validate-schema', title: 'Validate the schema', state: 'done' as const, stateLabel: 'Done'},
            {id: 'snapshot-rows', title: 'Snapshot the current rows', state: 'done' as const, stateLabel: 'Done'},
        ],
    },
    {
        id: 'apply', title: 'Apply the migration', done: 2, total: 4, progressLabel: '2 of 4', openByDefault: true,
        items: [
            {id: 'write-migration', title: 'Write the migration file', state: 'done' as const, stateLabel: 'Done'},
            {id: 'backfill-users', title: 'Backfill the user rows', state: 'done' as const, stateLabel: 'Done'},
            {id: 'verify-counts', title: 'Verify the row counts', state: 'failed' as const, stateLabel: 'Failed'},
            {id: 'drop-legacy', title: 'Drop the legacy tier column', state: 'queued' as const, stateLabel: 'Queued'},
        ],
    },
    {id: 'ship', title: 'Ship the change', done: 0, total: 3, progressLabel: '0 of 3', openByDefault: false, items: [
        {id: 'changelog', title: 'Update the changelog', state: 'queued', stateLabel: 'Queued'},
        {id: 'tag-release', title: 'Tag the release', state: 'queued', stateLabel: 'Queued'},
        {id: 'publish-registry', title: 'Publish the registry payloads', state: 'queued', stateLabel: 'Queued'},
    ]},
    {id: 'verify', title: 'Verify in staging', done: 0, total: 3, progressLabel: '0 of 3', openByDefault: false, items: [
        {id: 'smoke-tests', title: 'Run the smoke tests', state: 'queued', stateLabel: 'Queued'},
        {id: 'billing-dashboard', title: 'Check the billing dashboard', state: 'queued', stateLabel: 'Queued'},
        {id: 'entitlement-counts', title: 'Compare the entitlement counts', state: 'queued', stateLabel: 'Queued'},
    ]},
] as const

const actualRows = [
    {id: 'contract-notes', title: 'Read the billing contract notes', durationProgress: 3/11, plannedProgress: 2/11, planned: '2m', actual: '3m', drift: '+1m', tone: 'warning' as const},
    {id: 'resolver-map', title: 'Map the entitlement resolver', durationProgress: 2/11, plannedProgress: 3/11, planned: '3m', actual: '2m', drift: '−1m', tone: 'neutral' as const},
    {id: 'tier-fallback', title: 'Patch the tier lookup fallback', durationProgress: 1, plannedProgress: 6/11, planned: '6m', actual: '11m', drift: '+5m', tone: 'warning' as const},
    {id: 'renewal-test', title: 'Add a renewal-grace test', durationProgress: 5/11, plannedProgress: 5/11, planned: '5m', actual: '5m', drift: ',', tone: 'neutral' as const},
    {id: 'handoff', title: 'Summarize the handoff', durationProgress: 0, plannedProgress: 1/11, planned: '1m', actual: '-', drift: '-', tone: 'neutral' as const},
]

function completedPlanSteps(entries: readonly (readonly [string, string, string])[]): readonly HbarAppUiAgentPlanStep[] {
    return entries.map(([id, title, duration]) => ({id, title, duration, state: 'done', stateLabel: 'Done'}))
}

function statefulPlanSteps(entries: readonly (readonly [string, string, string, HbarAppUiAgentPlanStep['state']])[]): readonly HbarAppUiAgentPlanStep[] {
    return entries.map(([id, title, duration, state]) => ({id, title, duration, state, stateLabel: state === 'done' ? 'Done' : state === 'running' ? 'Running' : 'Queued'}))
}

const investigateItems: readonly HbarAppUiAgentPlanStep[] = completedPlanSteps([
    ['contract-notes', 'Read the billing contract notes', '3m'],
    ['resolver-map', 'Map the entitlement resolver', '2m'],
    ['trace-key', 'Trace an expired key end to end', '4m'],
    ['support-tickets', 'Collect the failing support tickets', '2m'],
    ['tier-tables', 'Diff the two tier tables', '1m'],
    ['webhook-log', 'Check the renewal webhook log', '3m'],
    ['root-cause', 'Write up the root cause', '2m'],
])

const implementItems: readonly HbarAppUiAgentPlanStep[] = statefulPlanSteps([
    ['tier-fallback', 'Patch the tier lookup fallback', '11m', 'done'],
    ['grace-constant', 'Add the grace-window constant', '1m', 'done'],
    ['renewal-test', 'Add a renewal-grace test', '4m', 'running'],
    ['expired-branch', 'Cover the expired-key branch', '3m', 'queued'],
    ['license-branch', 'Run the license branch checks', '5m', 'queued'],
    ['registry-payload', 'Regenerate the registry payloads', '2m', 'queued'],
    ['installation-docs', 'Update the installation docs', '3m', 'queued'],
])

const verifyItems: readonly HbarAppUiAgentPlanStep[] = statefulPlanSteps([
    ['staging-project', 'Deploy to the staging project', '4m', 'queued'],
    ['smoke-tests', 'Run the smoke tests', '6m', 'queued'],
    ['billing-dashboard', 'Check the billing dashboard', '2m', 'queued'],
    ['entitlement-counts', 'Compare the entitlement counts', '2m', 'queued'],
    ['replay-tickets', 'Replay the failing tickets', '3m', 'queued'],
    ['reviewer-channel', 'Notify the reviewer channel', '1m', 'queued'],
    ['handoff', 'Summarize the handoff', '2m', 'queued'],
])

export const HBAR_APP_UI_AGENT_PLAN_FIXTURES: HbarAppUiAgentPlanContent = {
    checklist: {
        runId: 'billing-entitlements', paused: false,
        labels: {title: 'Fix billing entitlements', progress: (done, total) => `${done} of ${total} done`, stop: 'Stop', resume: 'Resume', paused: 'Paused', target: 'Target', estimate: 'Estimate', empty: 'No plan steps', workingOn: (title) => `Working on ${title}.`, pausedOn: (title) => `Paused on ${title}.`},
        steps: checklistSteps,
        activeStepId: 'tier-lookup',
        listStrategy: {kind: 'pane-scroll', expectedMaximum: 12},
    },
    editable: {
        planId: 'billing-entitlements-review', running: false, onStop() {},
        draft: '', busy: false, canAdd: true, canSubmit: true,
        onDraftChange() {}, onAdd() {}, onMove() {}, onRemove() {}, onSubmit() {},
        labels: {title: 'Review the plan', summary: '8 to run · 1 skipped', summaryCounts: (included, skipped) => `${included} to run${skipped ? ` · ${skipped} skipped` : ''}`, skippedSuffix: ': skipped', stop: 'Stop', runningReview: 'Running. Stop to keep editing the plan.', moved: (title, position, total) => `${title} moved to position ${position} of ${total}.`, added: (title) => `${title} added to the end of the plan.`, review: 'Reorder or skip steps, then start the run.', addPlaceholder: 'Add a step', add: 'Add', start: (count) => `Start ${count} steps`, moveUp: (title) => `Move ${title} up`, moveDown: (title) => `Move ${title} down`, skip: (title) => `Skip ${title}`, restore: (title) => `Restore ${title}`, newStepStateLabel: 'Ready', empty: 'No editable steps'},
        steps: editableSteps,
        listStrategy: {kind: 'pane-scroll', expectedMaximum: 16},
    },
    tree: {
        runId: 'entitlement-migration',
        labels: {title: 'Migrate the entitlement tables', progress: (done, total) => `${done} of ${total} done`, expand: (title) => `Expand ${title}`, collapse: (title) => `Collapse ${title}`, retry: 'Retry', running: 'Running', empty: 'No plan groups'},
        groups: treeGroups,
        listStrategy: {kind: 'pane-scroll', expectedMaximum: 20},
    },
    actual: {
        labels: {title: 'Plan vs actual', remaining: '1 step left', description: 'Planned versus actual duration for each step', step: 'Step', duration: 'Duration', planned: 'Planned', actual: 'Actual', drift: 'Drift', empty: 'No timing rows'},
        metrics: [{id: 'planned', label: 'Planned', value: '17m'}, {id: 'actual', label: 'Actual', value: '21m'}, {id: 'drift', label: 'Drift', value: '+4m', tone: 'warning'}],
        rows: actualRows,
        listStrategy: {kind: 'pane-scroll', expectedMaximum: 12},
    },
    board: {
        labels: {title: 'Fix billing entitlements', progress: (done, total) => `${done} of ${total} done`, separator: '·', empty: 'No tasks in this phase'},
        sections: [
            {id: 'investigate', title: 'Investigate', done: 7, total: 7, progressLabel: '7/7', items: investigateItems},
            {id: 'implement', title: 'Implement', done: 2, total: 7, progressLabel: '2/7', items: implementItems},
            {id: 'verify', title: 'Verify', done: 0, total: 7, progressLabel: '0/7', items: verifyItems},
        ],
        listStrategy: {kind: 'pane-scroll', expectedMaximum: 24},
    },
    summary: {
        labels: {title: 'Fix billing entitlements', stepCount: '10 steps', goal: 'Goal', tools: 'Tools', breakdown: 'Breakdown', review: 'Review the plan before it runs.', edit: 'Edit plan', run: 'Run plan', empty: 'No breakdown rows'},
        goal: 'Repairs the tier lookup so expired keys fall back to the renewal grace period before access is revoked.',
        metrics: [{id: 'steps', label: 'Steps', value: '10'}, {id: 'time', label: 'Est. time', value: '26m'}, {id: 'cost', label: 'Est. cost', value: '$0.54'}],
        tools: ['Read files', 'Search code', 'Edit files', 'Run tests', 'Shell commands'],
        breakdown: [{id: 'prepare', title: 'Prepare the data', countLabel: '2 steps', duration: '5m'}, {id: 'apply', title: 'Apply the migration', countLabel: '3 steps', duration: '11m'}, {id: 'ship', title: 'Ship the change', countLabel: '2 steps', duration: '4m'}, {id: 'verify', title: 'Verify in staging', countLabel: '3 steps', duration: '6m'}],
        listStrategy: {kind: 'content-grown', expectedMaximum: 12},
    },
}

export function createHbarAppUiAgentPlanOverflowFixtures(): HbarAppUiAgentPlanContent {
    const base = HBAR_APP_UI_AGENT_PLAN_FIXTURES
    const overflowSteps = Array.from({length: 18}, (_, index) => ({id: `overflow-step-${index}`, title: `Additional plan step ${index + 1}`, state: 'queued' as const, stateLabel: 'Queued', duration: '2m'}))
    return {
        ...base,
        checklist: base.checklist && {...base.checklist, steps: [...base.checklist.steps, ...overflowSteps]},
        editable: base.editable && {...base.editable, steps: [...base.editable.steps, ...overflowSteps]},
        tree: base.tree && {...base.tree, groups: [...base.tree.groups, {id: 'overflow-group', title: 'Additional verification work', done: 0, total: overflowSteps.length, progressLabel: `0 of ${overflowSteps.length}`, openByDefault: true, items: overflowSteps}]},
        actual: base.actual && {...base.actual, rows: [...base.actual.rows, ...overflowSteps.map((step) => ({id: step.id, title: step.title, planned: '2m', actual: '2m', drift: '-', tone: 'neutral' as const}))]},
        board: base.board && {...base.board, sections: base.board.sections.map((section) => ({...section, items: [...section.items, ...overflowSteps]}))},
        summary: base.summary && {...base.summary, breakdown: [...base.summary.breakdown, ...overflowSteps.map((step) => ({id: step.id, title: step.title, countLabel: '1 step', duration: '2m'}))]},
    }
}

export function createHbarAppUiAgentPlanLocalizedFixtures(): HbarAppUiAgentPlanContent {
    const base = HBAR_APP_UI_AGENT_PLAN_FIXTURES
    return {
        ...base,
        checklist: base.checklist && {...base.checklist, labels: {...base.checklist.labels, title: 'Abrechnung und Berechtigungen reparieren', stop: 'Ausführung stoppen', resume: 'Ausführung fortsetzen', paused: 'Pausiert', empty: 'Keine Planschritte', target: 'Zieldatei', estimate: 'Schätzung', progress: (done, total) => `${done} von ${total} Schritten abgeschlossen`, workingOn: (title) => `Aktiver Schritt: ${title}.`, pausedOn: (title) => `Pausierter Schritt: ${title}.`}},
        editable: base.editable && {...base.editable, labels: {...base.editable.labels, title: 'Plan vor dem Start prüfen', summary: '8 ausführen · 1 übersprungen', summaryCounts: (included, skipped) => `${included} ausführen${skipped ? ` · ${skipped} übersprungen` : ''}`, skippedSuffix: ': übersprungen', stop: 'Ausführung stoppen', runningReview: 'Läuft. Zum Bearbeiten zuerst stoppen.', moved: (title, position, total) => `${title} auf Position ${position} von ${total} verschoben.`, added: (title) => `${title} am Ende des Plans hinzugefügt.`, empty: 'Keine bearbeitbaren Schritte', review: 'Schritte neu ordnen oder überspringen und danach den Lauf starten.', addPlaceholder: 'Einen weiteren Schritt hinzufügen', add: 'Hinzufügen', start: (count) => `${count} Schritte starten`, moveUp: (title) => `${title} nach oben`, moveDown: (title) => `${title} nach unten`, skip: (title) => `${title} überspringen`, restore: (title) => `${title} wiederherstellen`, newStepStateLabel: 'Bereit'}},
        tree: base.tree && {...base.tree, labels: {...base.tree.labels, title: 'Berechtigungstabellen migrieren', retry: 'Erneut versuchen', running: 'Wird ausgeführt', empty: 'Keine Plangruppen', progress: (done, total) => `${done} von ${total} abgeschlossen`}},
        actual: base.actual && {...base.actual, labels: {...base.actual.labels, title: 'Plan und Ist-Zeit vergleichen', remaining: 'Noch ein Schritt', description: 'Geplante und tatsächliche Dauer je Arbeitsschritt', step: 'Arbeitsschritt', duration: 'Zeitdauer', planned: 'Geplant', actual: 'Tatsächlich', drift: 'Abweichung', empty: 'Keine Zeitmessungen'}, metrics: base.actual.metrics.map(metric => ({...metric, label: metric.id === 'planned' ? 'Geplante Gesamtdauer' : metric.id === 'actual' ? 'Tatsächliche Gesamtdauer' : 'Zeitliche Abweichung'}))},
        board: base.board && {...base.board, labels: {...base.board.labels, title: 'Berechtigungen reparieren', progress: (done, total) => `${done} von ${total} abgeschlossen`, empty: 'Keine Aufgaben in dieser Phase', separator: '·'}, sections: base.board.sections.map(section => ({...section, title: section.id === 'investigate' ? 'Untersuchung der vollständigen Abrechnungsvereinbarung' : section.id === 'implement' ? 'Umsetzung' : 'Überprüfung', items: section.items.map(item => ({...item, title: item.id === 'contract-notes' ? 'Die Abrechnungsvereinbarung vollständig und nachvollziehbar untersuchen' : item.title, stateLabel: {done: 'Abgeschlossen', running: 'Wird ausgeführt', queued: 'In der Warteschlange', skipped: 'Übersprungen', failed: 'Fehlgeschlagen', blocked: 'Blockiert', waiting: 'Wartet'}[item.state]}))}))},
        summary: base.summary && {...base.summary, labels: {...base.summary.labels, title: 'Berechtigungen reparieren', stepCount: '10 Schritte', goal: 'Ziel', tools: 'Werkzeuge', breakdown: 'Aufschlüsselung', review: 'Plan vor dem Start prüfen.', edit: 'Plan bearbeiten', run: 'Plan ausführen'}, goal: 'Der Tier-Lookup fällt für abgelaufene Schlüssel auf die Verlängerungsfrist zurück, bevor der Zugriff widerrufen wird.', tools: ['Dateien lesen', 'Code suchen', 'Dateien bearbeiten', 'Tests ausführen', 'Shell-Befehle']},
    }
}
