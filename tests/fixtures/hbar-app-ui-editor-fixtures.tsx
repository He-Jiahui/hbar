import type {
    HbarAppUiEditorContent,
    HbarAppUiEditorFormattingAction,
    HbarAppUiMarkdownMode,
} from '../../packages/hbar-app-ui/src/index'

const formattingLabels: Readonly<Record<HbarAppUiEditorFormattingAction, string>> = {
    bold: 'Bold',
    italic: 'Italic',
    strikethrough: 'Strikethrough',
    'inline-code': 'Inline code',
    link: 'Link',
}

const markdownModeLabels: Readonly<Record<HbarAppUiMarkdownMode, string>> = {
    write: 'Write',
    split: 'Split',
    preview: 'Preview',
}

/**
 * Preview and behavior-test data only. The reusable package intentionally has
 * no implicit English records or locale fallback.
 */
export const HBAR_APP_UI_EDITOR_FIXTURES: HbarAppUiEditorContent = {
    richText: {
        labels: {
            blockMenuLabel: 'Paragraph',
            formattingToolbarLabel: 'Text formatting',
            historyToolbarLabel: 'History',
            formatActionLabel: (action) => formattingLabels[action],
            undoLabel: 'Undo',
            redoLabel: 'Redo',
            savedLabel: 'Saved',
            unsavedLabel: 'Unsaved changes',
            documentEditorLabel: 'Document editor',
            documentTitleLabel: 'Document title',
            documentBodyLabel: 'Document body',
        },
        document: {
            id: 'audit-ledger',
            title: 'Audit ledger design notes',
            body: 'Halcyon writes every permission change to an append-only ledger. Each entry records the actor, the resource, the previous value and the reason supplied at the time of the change.\n\nEntries are immutable. A correction is a new entry that supersedes the old one, which means the history of a resource can always be replayed exactly as it happened.\n\nRetention follows the workspace plan: ninety days on Team, one year on Scale, and seven years on Enterprise.',
            metadata: 'Draft by Ana Reyes · last edited 4 minutes ago',
            statistics: ['76 words', '454 characters', '1 min read'],
            footerNote: 'Markdown shortcuts are on',
        },
        saved: true,
        onChange: () => undefined,
    },
    markdown: {
        labels: {
            modeTabsLabel: 'Editor mode',
            modeLabel: (mode) => markdownModeLabels[mode],
            sourcePanelLabel: 'SOURCE',
            previewPanelLabel: 'PREVIEW',
            sourceInputLabel: 'Markdown source',
        },
        document: {
            id: 'streaming-meter',
            fileName: 'streaming-meter.md',
            summary: '129 words · Markdown',
            source: '# Migrating to the streaming meter\n\nThe nightly aggregation job is being replaced by a streaming counter. This note covers what changes for existing workspaces and what to do if a number looks wrong.\n\n## What changes\n\n- Usage updates within about **ten seconds** instead of once per night.\n- Historical rows are *unchanged*; only new events take the new path.\n- The `v1/usage` endpoint keeps its shape and stays supported until March.\n\n## Rollout\n\n1. Enable the flag for internal workspaces.\n2. Backfill the previous 30 days and compare against the old totals.\n3. Move Scale customers, then everyone else.\n\n> A drift of under 0.5% between the two systems is expected during the overlap window.\n\nReach out to Wei Chen if a workspace shows a larger gap.',
            preview: <>
                <h1>Migrating to the streaming meter</h1>
                <p>The nightly aggregation job is being replaced by a streaming counter. This note covers what changes for existing workspaces and what to do if a number looks wrong.</p>
                <h2>What changes</h2>
                <ul>
                    <li>Usage updates within about <strong>ten seconds</strong> instead of once per night.</li>
                    <li>Historical rows are <em>unchanged</em>; only new events take the new path.</li>
                    <li>The <code>v1/usage</code> endpoint keeps its shape and stays supported until March.</li>
                </ul>
                <h2>Rollout</h2>
                <ol>
                    <li>Enable the flag for internal workspaces.</li>
                    <li>Backfill the previous 30 days and compare against the old totals.</li>
                    <li>Move Scale customers, then everyone else.</li>
                </ol>
                <blockquote>A drift of under 0.5% between the two systems is expected during the overlap window.</blockquote>
                <p>Reach out to Wei Chen if a workspace shows a larger gap.</p>
            </>,
        },
        initialMode: 'split',
        onSourceChange: () => undefined,
        onModeChange: () => undefined,
    },
    code: {
        labels: {
            openFilesLabel: 'Open files',
            closeFileLabel: (fileName) => `Close ${fileName}`,
            unsavedLabel: 'Unsaved',
            runLabel: 'Run',
            stopLabel: 'Stop',
            codeEditorLabel: 'Code editor',
            codeOverviewLabel: 'Code overview',
            warningLabel: (count) => `${count} warning`,
            emptyFilesLabel: 'No open files',
        },
        files: [
            {
                id: 'meter',
                name: 'meter.ts',
                dirty: true,
                source: 'import { ledger } from "./ledger";\nimport type { Event, Window } from "./types";\n\nconst WINDOW_MS = 10_000;\n\nexport function meter(events: Event[], window: Window) {\n  const buckets = new Map<string, number>();\n\n  for (const event of events) {\n    if (event.ts < window.from) continue;\n    if (event.ts >= window.to) break;\n\n    const key = event.workspace;\n    buckets.set(key, (buckets.get(key) ?? 0) + event.units);\n  }\n\n  return [...buckets].map(([workspace, units]) => ({\n    workspace,\n    units,\n    window: WINDOW_MS,\n  }));\n}\n\nexport async function flush(window: Window) {\n  const rows = meter(await ledger.since(window.from), window);\n  await ledger.commit(rows);\n  return rows.length;\n}',
            },
            {id: 'ledger', name: 'ledger.ts', source: 'export const ledger = undefined;'},
            {id: 'types', name: 'types.ts', source: 'export type Event = unknown;'},
        ],
        activeFileId: 'meter',
        currentLine: 12,
        footer: {
            cursor: 'Ln 12, Col 0',
            language: 'TypeScript',
            encoding: 'UTF-8',
            indentation: 'Spaces: 2',
            warningCount: 1,
        },
        listStrategy: {kind: 'content-grown', expectedMaximum: 3},
        onSelectFile: () => undefined,
        onCloseFile: () => undefined,
        onRunChange: () => undefined,
    },
    suggestions: {
        labels: {
            suggestionPanelLabel: 'Suggestions',
            acceptAllLabel: 'Accept all',
            acceptLabel: 'Accept',
            resolveLabel: 'Resolve',
            dismissLabel: 'Dismiss',
            resolvedLabel: 'Done',
            openCountLabel: (count) => `${count} open`,
            remainingCountLabel: (count) => `${count} suggestions remaining`,
            emptySuggestionsLabel: 'No suggestions',
        },
        document: {
            id: 'rollout',
            title: 'Streaming meter rollout',
            summary: 'Reviewing · 3 contributors',
            paragraphs: [
                {id: 'intro', segments: [
                    {kind: 'text', value: 'The nightly aggregation job is being replaced by a streaming counter. Usage updates within about '},
                    {kind: 'strong', value: 'ten seconds'},
                    {kind: 'text', value: ' instead of once per night.'},
                ]},
                {id: 'rollout', segments: [
                    {kind: 'text', value: 'The change '},
                    {kind: 'suggestion', suggestionId: 'rollout', value: 'should probably be rolled out slowly'},
                    {kind: 'text', value: ', starting with internal workspaces and ending with everyone on a paid plan.'},
                ]},
                {id: 'drift', segments: [
                    {kind: 'text', value: 'During the overlap window both systems run side by side. '},
                    {kind: 'suggestion', suggestionId: 'drift', value: 'a drift of under 0.5%'},
                    {kind: 'text', value: ' between them is expected and does not need a ticket.'},
                ]},
                {id: 'plans', segments: [
                    {kind: 'text', value: 'We move '},
                    {kind: 'suggestion', suggestionId: 'plans', value: 'customers on the bigger plans'},
                    {kind: 'text', value: ' first, because their invoices are generated from the same rollup table.'},
                ]},
            ],
        },
        suggestions: [
            {id: 'rollout', initials: 'PN', author: 'Priya Nandakumar', age: '2h ago', selected: 'should probably be rolled out slowly', replacement: 'rolls out in three stages', detail: 'Hedging. State the plan.', primaryAction: 'accept'},
            {id: 'drift', initials: 'MS', author: 'Marco Silva', age: '3h ago', selected: '“a drift of under 0.5%”', detail: 'Where does 0.5% come from? Link the comparison run so support can quote it.', primaryAction: 'resolve'},
            {id: 'plans', initials: 'WC', author: 'Wei Chen', age: 'yesterday', selected: 'customers on the bigger plans', replacement: 'Scale and Enterprise workspaces', detail: 'Use the plan names we sell.', primaryAction: 'accept'},
        ],
        listStrategy: {kind: 'pane-scroll', expectedMaximum: 3},
        onResolve: () => undefined,
        onOpenSuggestion: () => undefined,
    },
    reader: {
        labels: {
            outlineLabel: 'OUTLINE',
            documentOutlineLabel: 'Document outline',
            sectionCountLabel: (count) => `${count} sections`,
            toggleOutlineLabel: 'Toggle outline',
            focusLabel: 'Focus',
            emptyOutlineLabel: 'No sections',
            breadcrumbSeparator: '/',
        },
        workspaceLabel: 'Halcyon handbook',
        documentLabel: 'Access ledger',
        sections: [
            {id: 'access', label: 'Access ledger', title: 'Access ledger', paragraphs: ['Every permission change in Halcyon is written to an append-only ledger. Each entry records the actor, the resource, the previous value and the reason supplied at the time of the change.']},
            {id: 'immutability', label: 'Immutability', title: 'Immutability', paragraphs: ['Entries are never edited. A correction is a new entry that supersedes the old one, so the history of a resource can always be replayed exactly as it happened.', 'This is why the ledger is the only source support quotes from during an incident review.']},
            {id: 'retention', label: 'Retention', title: 'Retention', paragraphs: ['Retention follows the workspace plan: ninety days on Team, one year on Scale and seven years on Enterprise. Expired entries are removed by a nightly sweep that itself writes a summary entry.']},
            {id: 'export', label: 'Export', title: 'Export', paragraphs: ['Workspace owners can export the ledger as newline-delimited JSON. Exports are generated asynchronously and expire after 24 hours.', 'Large workspaces are chunked at one million entries per file so the download survives a flaky connection.']},
            {id: 'reading', label: 'Reading the ledger', title: 'Reading the ledger', paragraphs: ['The read API is cursor paginated and ordered by sequence, not timestamp, because two entries can share a millisecond.']},
            {id: 'filters', label: 'Filters', title: 'Filters', paragraphs: ['Filters compose with AND. Filtering by actor and resource together is the common case for support, and both are indexed.']},
            {id: 'limits', label: 'Rate limits', title: 'Rate limits', paragraphs: ['Reads are limited to sixty requests per minute per token. A 429 carries a Retry-After header, and clients should honour it rather than backing off on their own schedule.']},
        ],
        initialFocusSectionId: 'immutability',
        initialFocusMode: true,
        initialOutlineOpen: true,
        listStrategy: {kind: 'pane-scroll', expectedMaximum: 7},
        onSelectSection: () => undefined,
        onFocusModeChange: () => undefined,
        onOutlineOpenChange: () => undefined,
    },
}

function requiredFixture<T>(value: T | undefined): T {
    if (!value) throw new Error('Expected editor overflow fixture')
    return value
}

const baseSuggestions = requiredFixture(HBAR_APP_UI_EDITOR_FIXTURES.suggestions)
const baseReader = requiredFixture(HBAR_APP_UI_EDITOR_FIXTURES.reader)

/** Exercises the pane-owned scroll path without embedding example rows in the package. */
export function createHbarAppUiEditorOverflowFixtures(): HbarAppUiEditorContent {
    return {
        ...HBAR_APP_UI_EDITOR_FIXTURES,
        suggestions: {
            ...baseSuggestions,
            suggestions: Array.from({length: 24}, (_, index) => {
                const source = baseSuggestions.suggestions[index % baseSuggestions.suggestions.length]
                if (!source) throw new Error('Expected suggestion source')
                return {
                    ...source,
                    id: `overflow-suggestion-${index}`,
                    author: `${source.author} ${index}`,
                }
            }),
        },
        reader: {
            ...baseReader,
            sections: Array.from({length: 28}, (_, index) => {
                const source = baseReader.sections[index % baseReader.sections.length]
                if (!source) throw new Error('Expected reader section source')
                return {
                    ...source,
                    id: `overflow-section-${index}`,
                    label: `${source.label} ${index}`,
                    title: `${source.title} ${index}`,
                }
            }),
        },
    }
}

const baseMarkdown = requiredFixture(HBAR_APP_UI_EDITOR_FIXTURES.markdown)

/** A non-default locale fixture with deliberately long visible labels for narrow-layout checks. */
export function createHbarAppUiEditorLocalizedFixtures(): HbarAppUiEditorContent {
    const modeLabels: Readonly<Record<HbarAppUiMarkdownMode, string>> = {
        write: 'Bearbeitungsansicht',
        split: 'Geteilte Vergleichsansicht',
        preview: 'Vollstaendige Vorschauansicht',
    }
    return {
        ...HBAR_APP_UI_EDITOR_FIXTURES,
        markdown: {
            ...baseMarkdown,
            labels: {
                ...baseMarkdown.labels,
                modeTabsLabel: 'Bearbeitungsmodus mit absichtlich langer lokalisierter Bezeichnung',
                modeLabel: (mode) => modeLabels[mode],
                sourcePanelLabel: 'QUELLTEXTANSICHT',
                previewPanelLabel: 'VORSCHAUANSICHT',
            },
            document: {
                ...baseMarkdown.document,
                fileName: 'arbeitsbereichsweite-streaming-zaehler-migration.md',
                summary: 'Lokalisierte Zusammenfassung mit absichtlich langem beschreibendem Text',
            },
        },
    }
}
