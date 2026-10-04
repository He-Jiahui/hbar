import type {
    HbarAppUiEditorContent,
    HbarAppUiEditorFormattingAction,
    HbarAppUiMarkdownMode,
    HbarAppUiRichEditorReferenceContent,
    HbarAppUiMarkdownReferenceContent,
    HbarAppUiCodeReferenceContent,
    HbarAppUiSuggestionsReferenceContent,
    HbarAppUiReaderReferenceContent,
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

export function editorWordCount(body: string): number {
    return body.trim() ? body.trim().split(/\s+/).length : 0
}

const richEditorReference: HbarAppUiRichEditorReferenceContent = {
    labels: {
        emptyBlocks: 'No block styles', formatAction: (action) => formattingLabels[action], saving: 'Saving…',
        undo: 'Undo', redo: 'Redo', title: 'Document title', body: 'Document body',
        titlePlaceholder: 'Untitled', bodyPlaceholder: 'Start writing…',
        wordCount: (body) => `${editorWordCount(body)} words`, characterCount: (body) => `${body.length} characters`,
        readingTime: (body) => `${Math.max(1, Math.round(editorWordCount(body) / 220))} min read`, footerNote: 'Markdown shortcuts are on',
    },
    document: {
        id: 'audit-ledger', title: 'Audit ledger design notes', metadata: 'Draft by Ana Reyes · last edited 4 minutes ago',
        body: 'Halcyon writes every permission change to an append-only ledger. Each entry records the actor, the resource, the previous value and the reason supplied at the time of the change.\n\nEntries are immutable. A correction is a new entry that supersedes the old one, which means the history of a resource can always be replayed exactly as it happened.\n\nRetention follows the workspace plan: ninety days on Team, one year on Scale, and seven years on Enterprise.',
    },
    blocks: [
        {id: 'paragraph', label: 'Paragraph'}, {id: 'heading-1', label: 'Heading 1', icon: 'heading-1'}, {id: 'heading-2', label: 'Heading 2', icon: 'heading-2'},
        {id: 'quote', label: 'Quote', icon: 'quote'}, {id: 'bulleted-list', label: 'Bulleted list', icon: 'bulleted-list'}, {id: 'numbered-list', label: 'Numbered list', icon: 'numbered-list'},
    ],
    blockStrategy: {kind: 'pane-scroll', expectedMaximum: 6}, blockId: 'paragraph',
    pressed: {bold: true, italic: false, strikethrough: false, 'inline-code': false, link: false},
    status: 'Saved',
}

const markdownReference: HbarAppUiMarkdownReferenceContent = {
    labels: {view: 'Editor view', mode: (mode) => markdownModeLabels[mode], summary: (count) => `${count} words · Markdown`, source: 'Source', preview: 'Preview', sourceInput: 'Markdown source'},
    document: {
        id: 'streaming-meter', fileName: 'streaming-meter.md',
        source: '# Migrating to the streaming meter\n\nThe nightly aggregation job is being replaced by a streaming counter. This note covers what changes for existing workspaces and what to do if a number looks wrong.\n\n## What changes\n\n- Usage updates within about **ten seconds** instead of once per night.\n- Historical rows are *unchanged*; only new events take the new path.\n- The `v1/usage` endpoint keeps its shape and stays supported until March.\n\n## Rollout\n\n1. Enable the flag for internal workspaces.\n2. Backfill the previous 30 days and compare against the old totals.\n3. Move Scale customers, then everyone else.\n\n> A drift of under 0.5% between the two systems is expected during the overlap window.\n\nReach out to Wei Chen if a workspace shows a larger gap.',
    },
    mode: 'split', paneStrategy: {kind: 'pane-scroll', expectedMaximumWords: 5000},
}

const codeReference: HbarAppUiCodeReferenceContent = {
    labels: {
        openFiles: 'Open files', closeFile: (name) => `Close ${name}`, unsavedChanges: 'Unsaved changes',
        run: 'Run', emptyFiles: 'No open files', codeOverview: 'Code overview', warning: (count) => `${count} warning`,
        cursor: (line, column) => `Ln ${line}, Col ${column}`,
    },
    files: [
        {id: 'meter', name: 'meter.ts', dirty: true, source: 'import { ledger } from "./ledger";\nimport type { Event, Window } from "./types";\n\nconst WINDOW_MS = 10_000;\n\nexport function meter(events: Event[], window: Window) {\n  const buckets = new Map<string, number>();\n\n  for (const event of events) {\n    if (event.ts < window.from) continue;\n    if (event.ts >= window.to) break;\n\n    const key = event.workspace;\n    buckets.set(key, (buckets.get(key) ?? 0) + event.units);\n  }\n\n  return [...buckets].map(([workspace, units]) => ({\n    workspace,\n    units,\n    window: WINDOW_MS,\n  }));\n}\n\nexport async function flush(window: Window) {\n  const rows = meter(await ledger.since(window.from), window);\n  await ledger.commit(rows);\n  return rows.length;\n}'},
        {id: 'ledger', name: 'ledger.ts', source: 'import { db } from "./db";\n\nexport const ledger = {\n  async since(ts: number) {\n    return db.events.where("ts").aboveOrEqual(ts).toArray();\n  },\n\n  async commit(rows: unknown[]) {\n    return db.rollups.bulkPut(rows);\n  },\n};'},
        {id: 'types', name: 'types.ts', source: 'export type Event = {\n  ts: number;\n  workspace: string;\n  units: number;\n};\n\nexport type Window = {\n  from: number;\n  to: number;\n};'},
    ],
    activeFileId: 'meter',
    cursor: {line: 12, column: 0},
    footer: {cursor: 'Ln 12, Col 0', language: 'TypeScript', encoding: 'UTF-8', indentation: 'Spaces: 2', warningCount: 1},
    paneStrategy: {kind: 'pane-scroll', expectedMaximumLines: 5000},
}

/**
 * Preview and behavior-test data only. The reusable package intentionally has
 * no implicit English records or locale fallback.
 */
const BASE_HBAR_APP_UI_EDITOR_FIXTURES: HbarAppUiEditorContent = {
    referenceRichText: richEditorReference,
    referenceMarkdown: markdownReference,
    referenceCode: codeReference,
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

const baseReferenceReview = BASE_HBAR_APP_UI_EDITOR_FIXTURES.suggestions
if (!baseReferenceReview) throw new Error('Expected suggestion fixture')
const suggestionsReference: HbarAppUiSuggestionsReferenceContent = {
    labels: {
        panel: baseReferenceReview.labels.suggestionPanelLabel,
        acceptAll: baseReferenceReview.labels.acceptAllLabel,
        accept: baseReferenceReview.labels.acceptLabel,
        resolve: baseReferenceReview.labels.resolveLabel,
        dismiss: baseReferenceReview.labels.dismissLabel,
        openCount: baseReferenceReview.labels.openCountLabel,
        remainingCount: baseReferenceReview.labels.remainingCountLabel,
        completeTitle: 'Review complete',
        completeBody: 'Every suggestion on this draft has been handled.',
        restore: 'Restore',
    },
    document: {...baseReferenceReview.document,
        paragraphs: baseReferenceReview.document.paragraphs.map(paragraph => ({...paragraph,
            segments: paragraph.segments.map(segment => segment.kind === 'strong'
                ? {kind: 'text' as const, value: segment.value} : segment),
        })),
    },
    suggestions: baseReferenceReview.suggestions,
    selectedSuggestionId: 'rollout', decisions: {},
    paneStrategy: {kind: 'pane-scroll', expectedMaximum: 3},
}
const baseReferenceReader = BASE_HBAR_APP_UI_EDITOR_FIXTURES.reader
if (!baseReferenceReader) throw new Error('Expected reader fixture')
function readerHeadingLevel(id: string): 2 | 3 {
    return id === 'access' || id === 'reading' ? 2 : 3
}
const readerReference: HbarAppUiReaderReferenceContent = {
    documentId: 'access-ledger',
    labels: {...baseReferenceReader.labels, outlineLabel: 'Outline', breadcrumbSeparator: ' /'},
    workspaceLabel: baseReferenceReader.workspaceLabel,
    documentLabel: baseReferenceReader.documentLabel,
    sections: baseReferenceReader.sections.map(section => ({...section, headingLevel: readerHeadingLevel(section.id)})),
    selectedSectionId: baseReferenceReader.initialFocusSectionId,
    focusMode: baseReferenceReader.initialFocusMode,
    outlineOpen: baseReferenceReader.initialOutlineOpen,
    listStrategy: baseReferenceReader.listStrategy,
}
export const HBAR_APP_UI_EDITOR_FIXTURES: HbarAppUiEditorContent = {
    ...BASE_HBAR_APP_UI_EDITOR_FIXTURES,
    referenceSuggestions: suggestionsReference,
    referenceReader: readerReference,
}

function requiredFixture<T>(value: T | undefined): T {
    if (!value) throw new Error('Expected editor overflow fixture')
    return value
}

const baseSuggestions = requiredFixture(HBAR_APP_UI_EDITOR_FIXTURES.suggestions)
const baseReader = requiredFixture(HBAR_APP_UI_EDITOR_FIXTURES.reader)

/** Exercises the pane-owned scroll path without embedding example rows in the package. */
export function createHbarAppUiEditorOverflowFixtures(): HbarAppUiEditorContent {
    const overflowSuggestions = Array.from({length: 24}, (_, index) => {
        const source = baseSuggestions.suggestions[index % baseSuggestions.suggestions.length]
        if (!source) throw new Error('Expected suggestion source')
        return {...source, id: `overflow-suggestion-${index}`, author: `${source.author} ${index}`}
    })
    const overflowSections = Array.from({length: 28}, (_, index) => {
        const source = baseReader.sections[index % baseReader.sections.length]
        if (!source) throw new Error('Expected reader section source')
        return {...source, id: `overflow-section-${index}`, label: `${source.label} ${index}`, title: `${source.title} ${index}`, headingLevel: readerHeadingLevel(source.id)}
    })
    return {
        ...HBAR_APP_UI_EDITOR_FIXTURES,
        referenceMarkdown: {...markdownReference, document: {...markdownReference.document, source: `${markdownReference.document.source}\n\n`.repeat(60) + 'Final editable paragraph'}},
        referenceCode: {...codeReference, files: [...codeReference.files, {id: 'long', name: 'long.ts', source: `${codeReference.files[0]!.source}\n`.repeat(70) + 'export const finalLine = true;'}], activeFileId: 'long'},
        referenceSuggestions: {...suggestionsReference, suggestions: overflowSuggestions, selectedSuggestionId: overflowSuggestions[0]?.id},
        referenceReader: {...readerReference, sections: overflowSections, selectedSectionId: overflowSections[0]?.id},
        referenceRichText: {...richEditorReference,
            document: {...richEditorReference.document, body: `${richEditorReference.document.body}\n\n`.repeat(60) + 'Last editable paragraph'},
            blocks: [...richEditorReference.blocks, ...Array.from({length: 34}, (_, index) => ({id: `extra-${index}`, label: `Additional block style ${index + 1}`}))],
        },
        suggestions: {
            ...baseSuggestions,
            suggestions: overflowSuggestions,
        },
        reader: {
            ...baseReader,
            sections: overflowSections,
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
        referenceMarkdown: {...markdownReference,
            labels: {view: 'Bearbeitungsmodus mit absichtlich langer lokalisierter Bezeichnung', mode: (mode) => modeLabels[mode], summary: (count) => `${count} Woerter · Markdown`, source: 'Quelltext', preview: 'Vorschau', sourceInput: 'Markdown-Quelltext'},
            document: {...markdownReference.document, fileName: 'arbeitsbereichsweite-streaming-zaehler-migration.md'},
        },
        referenceCode: {...codeReference,
            labels: {...codeReference.labels, openFiles: 'Geoeffnete Dateien', closeFile: (name) => `Datei ${name} schliessen`, unsavedChanges: 'Ungespeicherte Aenderungen', run: 'Ausfuehren', emptyFiles: 'Keine geoeffneten Dateien', codeOverview: 'Codeuebersicht', warning: (count) => `${count} Warnung`, cursor: (line, column) => `Zeile ${line}, Spalte ${column}`},
            files: codeReference.files.map(file => ({...file, name: `arbeitsbereichsweite-streaming-zaehler-${file.name}`})),
        },
        referenceSuggestions: {...suggestionsReference,
            labels: {panel: 'Vorschlaege', acceptAll: 'Alle annehmen', accept: 'Annehmen', resolve: 'Klaeren', dismiss: 'Verwerfen', openCount: (count) => `${count} offen`, remainingCount: (count) => `${count} Vorschlaege verbleiben`, completeTitle: 'Pruefung abgeschlossen', completeBody: 'Alle Vorschlaege fuer diesen Entwurf wurden bearbeitet.', restore: 'Wiederherstellen'},
            document: {...suggestionsReference.document, title: 'Ausfuehrlicher Entwurf zur Streaming-Zaehler-Migration', summary: 'In Pruefung · drei Mitwirkende'},
        },
        referenceReader: {...readerReference,
            labels: {outlineLabel: 'GLIEDERUNG', documentOutlineLabel: 'Dokumentgliederung', sectionCountLabel: (count) => `${count} Abschnitte`, toggleOutlineLabel: 'Gliederung umschalten', focusLabel: 'Fokusmodus mit langer Bezeichnung', emptyOutlineLabel: 'Keine Abschnitte', breadcrumbSeparator: '/'},
            workspaceLabel: 'Ausfuehrliches Handbuch fuer Arbeitsbereiche', documentLabel: 'Unveraenderliches Zugriffsprotokoll',
            sections: readerReference.sections.map(section => ({...section, label: `Abschnitt ${section.label} mit erweiterter Bezeichnung`})),
        },
        referenceRichText: {...richEditorReference,
            labels: {...richEditorReference.labels,
                emptyBlocks: 'Keine Absatzformate', formatAction: (action) => ({bold: 'Fett', italic: 'Kursiv', strikethrough: 'Durchgestrichen', 'inline-code': 'Inline-Code', link: 'Verknuepfung'})[action], saving: 'Wird gespeichert…',
                undo: 'Rueckgaengig', redo: 'Wiederholen', title: 'Dokumenttitel', body: 'Dokumentinhalt',
                titlePlaceholder: 'Unbenannt', bodyPlaceholder: 'Hier schreiben…',
                wordCount: (body) => `${editorWordCount(body)} Woerter`, characterCount: (body) => `${body.length} Zeichen`,
                readingTime: (body) => `${Math.max(1, Math.round(editorWordCount(body) / 220))} Min. Lesezeit`,
                footerNote: 'Markdown-Tastenkuerzel sind aktiviert',
            },
            document: {...richEditorReference.document, title: 'Entwurfsnotizen zum unveraenderlichen Audit-Protokoll', metadata: 'Entwurf von Ana Reyes · zuletzt vor vier Minuten bearbeitet'},
            blocks: richEditorReference.blocks.toReversed().map((block) => ({...block, label: `Lokalisierter Absatzstil mit absichtlich sehr langer Bezeichnung: ${block.id}`})),
            status: 'Gespeichert',
        },
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
