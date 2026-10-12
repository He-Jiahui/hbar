import type { LumenEmptyStateContent } from '@lumen/app-ui/catalog'

export type EmptyStatePreviewLocale = 'en' | 'de' | 'de-long'
export type EmptyStatePreviewCapacity = 'source' | 'empty' | 'one' | 'boundary' | 'overflow'

export const EMPTY_STATE_HOST_CAPACITY_POLICY = {
  expectedMaximum: 6,
  overflowCount: 17,
} as const

type FirstRunContent = NonNullable<LumenEmptyStateContent['firstRun']>
type NoResultsContent = NonNullable<LumenEmptyStateContent['noResults']>
type CaughtUpContent = NonNullable<LumenEmptyStateContent['caughtUp']>
type LoadFailureContent = NonNullable<LumenEmptyStateContent['loadFailure']>
type FolderContent = NonNullable<LumenEmptyStateContent['folder']>

type FirstRunChoice = FirstRunContent['choices'][number]
type Filter = NoResultsContent['filters'][number]
type Suggestion = NoResultsContent['suggestions'][number]
type Metric = CaughtUpContent['metrics'][number]
type CaughtUpChoice = CaughtUpContent['choices'][number]
type Detail = LoadFailureContent['details'][number]
type Breadcrumb = FolderContent['breadcrumbs'][number]
type FileType = FolderContent['fileTypes'][number]

interface EmptyStateCopy {
  readonly firstRun: FirstRunContent['labels']
  readonly noResults: NoResultsContent['labels']
  readonly caughtUp: CaughtUpContent['labels']
  readonly loadFailure: LoadFailureContent['labels']
  readonly folder: FolderContent['labels']
}

const COPY: Readonly<Record<EmptyStatePreviewLocale, EmptyStateCopy>> = {
  en: {
    firstRun: {
      title: 'Nothing in this workspace yet',
      description:
        'Point Northwind at a source and the first charts build themselves. You can change or remove a source at any time.',
      addSource: 'Add a source',
      setupGuide: 'Read the setup guide',
      emptyChoices: 'No setup choices are available.',
    },
    noResults: {
      search: 'Search reports',
      title: (query) => `No reports match “${query}”`,
      description: (filterCount) =>
        `${filterCount} ${filterCount === 1 ? 'filter is' : 'filters are'} narrowing this search. Removing one usually brings results back.`,
      removeFilter: (label) => `Remove ${label} filter`,
      clearAll: 'Clear all',
      footer: 'Searches cover report titles, descriptions and column names.',
      emptySuggestions: 'No suggestions are available.',
    },
    caughtUp: {
      title: 'Inbox zero, and it is only 3pm',
      description:
        'Nothing is assigned to you and nothing is overdue. New tickets will appear here the moment they are routed.',
      prompt: 'If you want something to do',
      footer: 'Last refreshed a moment ago · updates arrive automatically',
      emptyChoices: 'There is nothing else waiting in the queue.',
    },
    loadFailure: {
      title: 'We could not load your orders',
      description:
        'The request to the orders service timed out after 30 seconds. Your data is safe and nothing was changed.',
      retry: 'Try again',
      retrying: 'Trying again',
      retryUnverified: 'This preview cannot confirm that the service recovered. Check its status, then try again.',
      serviceStatus: 'Check service status',
      footer:
        'Still failing after a couple of attempts? Send the trace ID to support and we will pick it up from there.',
    },
    folder: {
      breadcrumb: 'Breadcrumb',
      title: 'This folder is empty',
      description:
        'Drag files anywhere in this area, or add them from your computer. Everything here is shared with the Brand team.',
      upload: 'Upload files',
      importLink: 'Import from a link',
      release: 'Drop files here to select them',
      selected: (fileCount) => `${fileCount} ${fileCount === 1 ? 'file' : 'files'} selected in this preview`,
      footer: 'Up to 2 GB per file · 46 GB of 100 GB used in this workspace',
    },
  },
  de: {
    firstRun: {
      title: 'In diesem Arbeitsbereich ist noch nichts',
      description:
        'Verbinde Northwind mit einer Datenquelle, dann entstehen die ersten Diagramme automatisch. Du kannst eine Quelle jederzeit ändern oder entfernen.',
      addSource: 'Quelle hinzufügen',
      setupGuide: 'Einrichtungsanleitung lesen',
      emptyChoices: 'Keine Einrichtungsoptionen verfügbar.',
    },
    noResults: {
      search: 'Berichte durchsuchen',
      title: (query) => `Keine Berichte passen zu „${query}“`,
      description: (filterCount) =>
        `${filterCount} ${filterCount === 1 ? 'Filter schränkt' : 'Filter schränken'} diese Suche ein. Wenn du einen entfernst, findest du meist wieder Ergebnisse.`,
      removeFilter: (label) => `${label}-Filter entfernen`,
      clearAll: 'Alle löschen',
      footer: 'Die Suche umfasst Berichtstitel, Beschreibungen und Spaltennamen.',
      emptySuggestions: 'Keine Vorschläge verfügbar.',
    },
    caughtUp: {
      title: 'Posteingang leer, und es ist erst 15 Uhr',
      description:
        'Dir ist nichts zugewiesen und nichts ist überfällig. Neue Tickets erscheinen hier, sobald sie zugewiesen werden.',
      prompt: 'Wenn du noch etwas übernehmen möchtest',
      footer: 'Vor einem Moment aktualisiert · neue Einträge erscheinen automatisch',
      emptyChoices: 'In der Warteschlange steht nichts weiter an.',
    },
    loadFailure: {
      title: 'Deine Bestellungen konnten nicht geladen werden',
      description:
        'Die Anfrage an den Bestellservice hat nach 30 Sekunden das Zeitlimit überschritten. Deine Daten sind sicher und wurden nicht verändert.',
      retry: 'Erneut versuchen',
      retrying: 'Wird erneut versucht',
      retryUnverified:
        'Diese Vorschau kann nicht bestätigen, dass der Dienst wieder funktioniert. Prüfe den Status und versuche es erneut.',
      serviceStatus: 'Dienststatus prüfen',
      footer: 'Wenn es nach einigen Versuchen weiter fehlschlägt, sende die Trace-ID an den Support.',
    },
    folder: {
      breadcrumb: 'Brotkrumennavigation',
      title: 'Dieser Ordner ist leer',
      description:
        'Ziehe Dateien in diesen Bereich oder füge sie von deinem Computer hinzu. Alles hier wird mit dem Brand-Team geteilt.',
      upload: 'Dateien auswählen',
      importLink: 'Link importieren',
      release: 'Dateien hier ablegen, um sie auszuwählen',
      selected: (fileCount) => `${fileCount} ${fileCount === 1 ? 'Datei' : 'Dateien'} in dieser Vorschau ausgewählt`,
      footer: 'Bis zu 2 GB pro Datei · 46 GB von 100 GB in diesem Arbeitsbereich belegt',
    },
  },
  'de-long': {
    firstRun: {
      title: 'In diesem gemeinsam genutzten Northwind-Arbeitsbereich ist noch keine Datenquelle eingerichtet',
      description:
        'Verbinde Northwind mit einer geeigneten Unternehmensdatenquelle, damit die ersten Diagramme für den gesamten Arbeitsbereich automatisch aufgebaut werden. Eine verbundene Quelle kann später jederzeit geändert oder entfernt werden.',
      addSource: 'Eine weitere Datenquelle für diesen Arbeitsbereich hinzufügen',
      setupGuide: 'Die ausführliche Anleitung zur Einrichtung von Datenquellen lesen',
      emptyChoices: 'Für diesen Arbeitsbereich stehen derzeit keine Einrichtungsvorschläge zur Verfügung.',
    },
    noResults: {
      search: 'Berichte, Beschreibungen und enthaltene Spalten durchsuchen',
      title: (query) => `Für die Suche „${query}“ wurden keine passenden Berichte gefunden`,
      description: (filterCount) =>
        `${filterCount} aktive Filter grenzen die Suche nach Berichten zusätzlich ein. Wenn du einzelne Filter entfernst, werden normalerweise wieder mehr passende Ergebnisse angezeigt.`,
      removeFilter: (label) => `Den aktiven Filter „${label}“ aus der Suche entfernen`,
      clearAll: 'Alle aktiven Berichtsfilter auf einmal entfernen',
      footer:
        'Durchsucht werden Berichtstitel, ausführliche Beschreibungen und die Namen der enthaltenen Datenspalten.',
      emptySuggestions: 'Für diese Suche sind derzeit keine ähnlichen Suchbegriffe verfügbar.',
    },
    caughtUp: {
      title: 'Der gemeinsame Posteingang ist leer, obwohl der Arbeitstag noch bis 15 Uhr läuft',
      description:
        'Dir sind gerade keine neuen Vorgänge zugewiesen und es ist keine Antwort überfällig. Neu weitergeleitete Tickets erscheinen automatisch in diesem Posteingang.',
      prompt: 'Wenn du in der Zwischenzeit noch eine andere Aufgabe übernehmen möchtest',
      footer: 'Zuletzt vor einem Augenblick aktualisiert · neue Vorgänge werden automatisch angezeigt',
      emptyChoices: 'Außerhalb deiner aktuellen Ansicht warten keine weiteren Aufgaben auf dich.',
    },
    loadFailure: {
      title: 'Die Bestellungen für diesen gemeinsam genutzten Arbeitsbereich konnten nicht geladen werden',
      description:
        'Die Anfrage an den Bestellservice hat das Zeitlimit von 30 Sekunden überschritten. Die gespeicherten Bestelldaten sind weiterhin sicher und wurden durch diesen fehlgeschlagenen Ladevorgang nicht geändert.',
      retry: 'Den Ladevorgang für die Bestellungen erneut starten',
      retrying: 'Der Bestellservice wird für einen neuen Ladeversuch erneut angefragt',
      retryUnverified:
        'Diese Vorschau kann nicht feststellen, ob der Bestellservice wieder erreichbar ist oder die Bestellungen geladen wurden. Prüfe den Dienststatus oder starte später einen weiteren Versuch.',
      serviceStatus: 'Den aktuellen Status des Bestellservice prüfen',
      footer:
        'Wenn der Ladevorgang auch nach mehreren Versuchen fehlschlägt, gib die unten angezeigte Trace-ID an den Support weiter, damit die Anfrage nachvollzogen werden kann.',
    },
    folder: {
      breadcrumb: 'Brotkrumennavigation für den gemeinsam genutzten Markenordner',
      title: 'Dieser gemeinsam genutzte Markenordner enthält noch keine Dateien',
      description:
        'Ziehe Dateien an eine beliebige Stelle in diesem Bereich oder wähle sie auf deinem Computer aus. Alle abgelegten Dateien werden mit dem gesamten Brand-Team geteilt.',
      upload: 'Dateien von deinem Computer auswählen und für den Markenordner bereitstellen',
      importLink: 'Eine Datei über einen freigegebenen Link in diesen Ordner importieren',
      release: 'Dateien in diesem Bereich ablegen, um sie lokal für die Vorschau auszuwählen',
      selected: (fileCount) =>
        `${fileCount} ${fileCount === 1 ? 'Datei wurde' : 'Dateien wurden'} in dieser Vorschau ausgewählt; ein Upload in einen Dienst wurde nicht ausgeführt`,
      footer:
        'Jede einzelne Datei darf bis zu 2 GB groß sein · in diesem Arbeitsbereich sind 46 GB des verfügbaren Speichers von insgesamt 100 GB belegt',
    },
  },
}

const SOURCE_FIRST_RUN_CHOICES: readonly FirstRunChoice[] = [
  {
    id: 'warehouse',
    title: 'Connect a warehouse',
    description: 'Postgres, BigQuery or Snowflake. Read-only credentials are enough.',
    meta: 'About 2 minutes',
    icon: 'database',
  },
  {
    id: 'spreadsheet',
    title: 'Upload a spreadsheet',
    description: 'Drop in a CSV and we will infer the column types for you.',
    meta: 'No setup',
    icon: 'upload',
  },
  {
    id: 'sample-dataset',
    title: 'Load the sample dataset',
    description: 'A fictional storefront with 18 months of orders to explore.',
    meta: 'Instant',
    icon: 'sample',
  },
]

const SOURCE_FILTERS: readonly Filter[] = [
  { id: 'owner', label: 'Owner', value: 'Priya Nandakumar' },
  { id: 'status', label: 'Status', value: 'Archived' },
  { id: 'created', label: 'Created', value: 'Last 7 days' },
  { id: 'tag', label: 'Tag', value: 'Finance' },
]

const SOURCE_SUGGESTIONS: readonly Suggestion[] = [
  { id: 'quarterly-revenue', label: 'quarterly revenue', query: 'quarterly revenue', count: '46' },
  { id: 'revenue-region', label: 'revenue by region', query: 'revenue by region', count: '12' },
  { id: 'revenue-forecast', label: 'revenue forecast', query: 'revenue forecast', count: '8' },
]

const SOURCE_METRICS: readonly Metric[] = [
  { id: 'resolved', label: 'Resolved', value: '14' },
  { id: 'assigned', label: 'Assigned on', value: '6' },
  { id: 'first-reply', label: 'Median first reply', value: '9m' },
]

const SOURCE_CAUGHT_UP_CHOICES: readonly CaughtUpChoice[] = [
  {
    id: 'waiting-customer',
    title: '3 tickets waiting on the customer',
    description: 'Nothing to do until they reply. We will nudge each one after 48 hours.',
    icon: 'clock',
  },
  {
    id: 'unsent-drafts',
    title: '2 drafts you never sent',
    description: 'Both are from yesterday afternoon and are still editable.',
    icon: 'draft',
  },
  {
    id: 'unassigned-team',
    title: 'Team queue has 5 unassigned',
    description: 'Outside your view, but you have permission to pick them up.',
    icon: 'inbox',
  },
]

const SOURCE_DETAILS: readonly Detail[] = [
  { id: 'request', label: 'Request', value: 'GET /v2/workspaces/orders' },
  { id: 'trace', label: 'Trace', value: '8f31c0a4e7b2' },
  { id: 'last-success', label: 'Last success', value: 'Today, 14:02' },
]

const SOURCE_BREADCRUMBS: readonly Breadcrumb[] = [
  { id: 'northwind', label: 'Northwind' },
  { id: 'brand', label: 'Brand' },
  { id: 'refresh', label: '2025 refresh' },
]

const SOURCE_FILE_TYPES: readonly FileType[] = [
  { id: 'pdf', label: 'PDF' },
  { id: 'png', label: 'PNG' },
  { id: 'jpg', label: 'JPG' },
  { id: 'svg', label: 'SVG' },
  { id: 'fig', label: 'FIG' },
  { id: 'mp4', label: 'MP4' },
]

function countFor(capacity: EmptyStatePreviewCapacity, sourceCount: number): number {
  switch (capacity) {
    case 'source':
      return sourceCount
    case 'empty':
      return 0
    case 'one':
      return Math.min(sourceCount, 1)
    case 'boundary':
      return EMPTY_STATE_HOST_CAPACITY_POLICY.expectedMaximum
    case 'overflow':
      return EMPTY_STATE_HOST_CAPACITY_POLICY.overflowCount
  }
}

function fitItems<Item extends { readonly id: string }>(
  source: readonly Item[],
  capacity: EmptyStatePreviewCapacity,
  makeOverflowItem: (ordinal: number) => Item,
): readonly Item[] {
  const desiredCount = countFor(capacity, source.length)
  const kept = source.slice(0, desiredCount)
  if (kept.length === desiredCount) return kept
  return [
    ...kept,
    ...Array.from({ length: desiredCount - kept.length }, (_, index) => makeOverflowItem(kept.length + index + 1)),
  ]
}

function localizedChoice(locale: EmptyStatePreviewLocale, ordinal: number): FirstRunChoice {
  const label = locale === 'en' ? 'Additional source choice' : 'Zusätzliche Quellenoption'
  return {
    id: `host-source-${ordinal}`,
    title: `${label} ${ordinal}`,
    description:
      locale === 'en'
        ? `A host-provided source option ${ordinal} remains available in the expanded list.`
        : `Eine vom Host bereitgestellte Quellenoption ${ordinal} bleibt in der erweiterten Liste verfügbar.`,
    meta: locale === 'en' ? 'Host option' : 'Host-Option',
    icon: 'database',
  }
}

function localizedFilter(locale: EmptyStatePreviewLocale, ordinal: number): Filter {
  return {
    id: `host-filter-${ordinal}`,
    label: locale === 'en' ? `Filter ${ordinal}` : `Filter ${ordinal}`,
    value: locale === 'en' ? `Value ${ordinal}` : `Wert ${ordinal}`,
  }
}

function localizedSuggestion(locale: EmptyStatePreviewLocale, ordinal: number): Suggestion {
  const label = locale === 'en' ? `Related report ${ordinal}` : `Ähnlicher Bericht ${ordinal}`
  const query = locale === 'en' ? `related report ${ordinal}` : `related report ${ordinal}`
  return { id: `host-suggestion-${ordinal}`, label, query, count: String(ordinal) }
}

function localizedCaughtUpChoice(locale: EmptyStatePreviewLocale, ordinal: number): CaughtUpChoice {
  const label = locale === 'en' ? 'More work in the queue' : 'Weitere Vorgänge in der Warteschlange'
  return {
    id: `host-inbox-choice-${ordinal}`,
    title: `${label} ${ordinal}`,
    description:
      locale === 'en'
        ? `This host-provided inbox option ${ordinal} is available to review.`
        : `Diese vom Host bereitgestellte Posteingangsoption ${ordinal} kann geprüft werden.`,
    icon: 'inbox',
  }
}

function localizedMetric(locale: EmptyStatePreviewLocale, ordinal: number): Metric {
  return {
    id: `host-metric-${ordinal}`,
    label: locale === 'en' ? `Metric ${ordinal}` : `Kennzahl ${ordinal}`,
    value: String(ordinal),
  }
}

function localizedDetail(locale: EmptyStatePreviewLocale, ordinal: number): Detail {
  return {
    id: `host-detail-${ordinal}`,
    label: locale === 'en' ? `Additional detail ${ordinal}` : `Zusätzliche Angabe ${ordinal}`,
    value: locale === 'en' ? `Reference ${ordinal}` : `Referenz ${ordinal}`,
  }
}

function localizedBreadcrumb(locale: EmptyStatePreviewLocale, ordinal: number): Breadcrumb {
  return { id: `host-folder-${ordinal}`, label: locale === 'en' ? `Folder ${ordinal}` : `Ordner ${ordinal}` }
}

function localizedFileType(locale: EmptyStatePreviewLocale, ordinal: number): FileType {
  return { id: `host-file-type-${ordinal}`, label: locale === 'en' ? `TYPE ${ordinal}` : `TYP ${ordinal}` }
}

/** Representative host content extracted from the cached English desktop references. */
export function createEmptyStatePreviewFixture(
  locale: EmptyStatePreviewLocale = 'en',
  capacity: EmptyStatePreviewCapacity = 'source',
): LumenEmptyStateContent {
  const copy = COPY[locale]
  return {
    firstRun: {
      labels: copy.firstRun,
      choices: fitItems(SOURCE_FIRST_RUN_CHOICES, capacity, (ordinal) => localizedChoice(locale, ordinal)),
      listStrategy: { kind: 'content-grown', expectedMaximum: EMPTY_STATE_HOST_CAPACITY_POLICY.expectedMaximum },
    },
    noResults: {
      labels: copy.noResults,
      query: 'quaterly revenu',
      filters: fitItems(SOURCE_FILTERS, capacity, (ordinal) => localizedFilter(locale, ordinal)),
      suggestions: fitItems(SOURCE_SUGGESTIONS, capacity, (ordinal) => localizedSuggestion(locale, ordinal)),
      listStrategy: { kind: 'content-grown', expectedMaximum: EMPTY_STATE_HOST_CAPACITY_POLICY.expectedMaximum },
      onQueryChange: () => undefined,
      onRemoveFilter: () => undefined,
      onClear: () => undefined,
      onSuggestionSelect: () => undefined,
    },
    caughtUp: {
      labels: copy.caughtUp,
      metrics: fitItems(SOURCE_METRICS, capacity, (ordinal) => localizedMetric(locale, ordinal)),
      choices: fitItems(SOURCE_CAUGHT_UP_CHOICES, capacity, (ordinal) => localizedCaughtUpChoice(locale, ordinal)),
      listStrategy: { kind: 'content-grown', expectedMaximum: EMPTY_STATE_HOST_CAPACITY_POLICY.expectedMaximum },
    },
    loadFailure: {
      labels: copy.loadFailure,
      details: fitItems(SOURCE_DETAILS, capacity, (ordinal) => localizedDetail(locale, ordinal)),
      listStrategy: { kind: 'content-grown', expectedMaximum: EMPTY_STATE_HOST_CAPACITY_POLICY.expectedMaximum },
      retrying: false,
      error: null,
      onRetry: () => undefined,
    },
    folder: {
      labels: copy.folder,
      breadcrumbs: fitItems(SOURCE_BREADCRUMBS, capacity, (ordinal) => localizedBreadcrumb(locale, ordinal)),
      fileTypes: fitItems(SOURCE_FILE_TYPES, capacity, (ordinal) => localizedFileType(locale, ordinal)),
      accept: '.pdf,.png,.jpg,.jpeg,.svg,.fig,.mp4',
      multiple: true,
      listStrategy: { kind: 'content-grown', expectedMaximum: EMPTY_STATE_HOST_CAPACITY_POLICY.expectedMaximum },
      feedback: null,
      onUpload: () => undefined,
    },
  }
}

export const HBAR_APP_UI_EMPTY_STATE_FIXTURES: LumenEmptyStateContent = createEmptyStatePreviewFixture()

export function createEmptyStateLocalizedFixtures(
  locale: Exclude<EmptyStatePreviewLocale, 'en'>,
): LumenEmptyStateContent {
  return createEmptyStatePreviewFixture(locale)
}

export function createEmptyStateOverflowFixtures(): LumenEmptyStateContent {
  return createEmptyStatePreviewFixture('en', 'overflow')
}
