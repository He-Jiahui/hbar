import type { LumenAppShellDocumentsContent, LumenDocumentBlock, LumenDocumentFolder } from '@lumen/app-ui'

const blocks: readonly LumenDocumentBlock[] = [
  {
    id: 'intro',
    kind: 'paragraph',
    text: 'Every webhook Halden sends is retried until the endpoint accepts it or the schedule runs out. This page describes the schedule as it behaves in production today, so support and integration engineers can answer a merchant’s question without reading the delivery service.',
  },
  {
    id: 'endpoints',
    kind: 'paragraph',
    text: 'Retries are tracked per endpoint rather than per account. If a merchant has three endpoints registered and one of them is unreachable, deliveries to the other two are unaffected and stay on time.',
  },
  { id: 'timing', kind: 'heading', text: 'Timing' },
  {
    id: 'schedule',
    kind: 'paragraph',
    text: 'The first retry is sent 30 seconds after a failed attempt. Each attempt after that waits about three times as long as the one before it, up to a ceiling of six hours. A delivery is abandoned after 21 attempts, which works out to just under three days.',
  },
  {
    id: 'config',
    kind: 'code',
    text: 'retry:\n  initial_delay: 30s\n  multiplier: 3\n  max_delay: 6h\n  max_attempts: 21\n  jitter: 0.2',
  },
  { id: 'failure', kind: 'heading', text: 'What counts as a failure' },
  {
    id: 'failure-description',
    kind: 'paragraph',
    text: 'An attempt fails when any of the following happens. Everything else, including a slow but successful response, counts as delivered.',
  },
  {
    id: 'criteria',
    kind: 'list',
    items: [
      { id: 'status', text: 'The endpoint returns a status outside the 2xx range, including redirects.' },
      { id: 'connect', text: 'The connection is not established within 10 seconds.' },
      { id: 'response', text: 'The response body has not arrived 30 seconds after the request was sent.' },
      { id: 'tls', text: 'The TLS certificate cannot be verified against the public trust store.' },
    ],
  },
  { id: 'replay', kind: 'heading', text: 'Replaying a delivery' },
  {
    id: 'support',
    kind: 'paragraph',
    text: 'Support can replay a single delivery from the endpoint page. A replay sends the payload as it was recorded when the event happened, so a replayed charge still carries the amount that was charged at the time rather than the amount on the account today.',
  },
  {
    id: 'counter',
    kind: 'paragraph',
    text: 'Replays do not reset the retry counter and do not extend the three day window. If a merchant needs deliveries older than that, read them from the events API instead and reconcile against the ledger export.',
  },
]
const folders: readonly LumenDocumentFolder[] = [
  {
    id: 'product',
    label: 'Product specs',
    initiallyExpanded: true,
    documents: [
      ['checkout', 'Checkout redesign'],
      ['payments', 'Saved payment methods'],
      ['refunds', 'Refund policy for marketplace sellers and connected accounts'],
      ['disputes', 'Dispute handling'],
      ['payouts', 'Payout scheduling'],
      ['onboarding', 'Merchant onboarding'],
      ['currency', 'Currency support'],
    ].map(([id = '', title = '']) => ({
      id,
      title,
      metadata: 'Last edited 14 March 2025 by Mara Vogt',
      wordCount: '812 words',
      blocks,
    })),
  },
  {
    id: 'meetings',
    label: 'Meeting notes',
    initiallyExpanded: false,
    documents: [
      ['sync', 'Weekly sync, 14 March'],
      ['planning', 'Q2 planning'],
      ['postmortem', 'Payout delay postmortem'],
    ].map(([id = '', title = '']) => ({
      id,
      title,
      metadata: 'Last edited 14 March 2025 by Mara Vogt',
      wordCount: '812 words',
      blocks,
    })),
  },
  {
    id: 'engineering',
    label: 'Engineering',
    initiallyExpanded: true,
    documents: [
      ['webhook', 'Webhook retry schedule'],
      ['versioning', 'API versioning'],
      ['ledger', 'Ledger migration plan'],
      ['idempotency', 'Idempotency keys'],
      ['incident', 'Incident runbook'],
      ['limits', 'Rate limits'],
      ['signing', 'Signing key rotation'],
      ['queue', 'Queue backpressure'],
      ['sandbox', 'Sandbox data reset'],
    ].map(([id = '', title = '']) => ({
      id,
      title,
      metadata:
        id === 'versioning' ? 'Last edited 9 March 2025 by Tobias Lindqvist' : 'Last edited 14 March 2025 by Mara Vogt',
      wordCount: id === 'versioning' ? '1,340 words' : '812 words',
      blocks,
    })),
  },
]
const en: LumenAppShellDocumentsContent['labels'] = {
  documents: 'Documents',
  openDocuments: 'Open documents',
  closeDocuments: 'Close documents',
  closeOverlay: 'Close documents overlay',
  newDocument: 'New document',
  trash: 'Trash',
  title: 'Document title',
  share: 'Share',
  actions: 'Document actions',
  textStyle: 'Text style',
  blockStyle: 'Block style',
  moreFormatting: 'More formatting',
  link: 'Insert link',
  emptyTree: 'No documents',
  emptyDocument: 'Select a document',
  formats: {
    bold: 'Bold',
    italic: 'Italic',
    strike: 'Strikethrough',
    list: 'Bulleted list',
    quote: 'Quote',
    code: 'Code block',
  },
}
const de: LumenAppShellDocumentsContent['labels'] = {
  documents: 'Dokumente',
  openDocuments: 'Dokumente öffnen',
  closeDocuments: 'Dokumente schließen',
  closeOverlay: 'Dokumentüberlagerung schließen',
  newDocument: 'Neues Dokument',
  trash: 'Papierkorb',
  title: 'Dokumenttitel',
  share: 'Teilen',
  actions: 'Dokumentaktionen',
  textStyle: 'Textstil',
  blockStyle: 'Blockstil',
  moreFormatting: 'Weitere Formatierungen',
  link: 'Verknüpfung einfügen',
  emptyTree: 'Keine Dokumente',
  emptyDocument: 'Wählen Sie ein Dokument aus',
  formats: {
    bold: 'Fett',
    italic: 'Kursiv',
    strike: 'Durchgestrichen',
    list: 'Aufzählung',
    quote: 'Zitat',
    code: 'Codeblock',
  },
}
export function appShellDocumentsFixture(
  mode: string | null,
  report: (action: string, id?: string) => void = () => undefined,
): LumenAppShellDocumentsContent {
  const localized = mode === 'localized'
  let inventory = folders
  if (mode === 'empty') inventory = []
  if (mode === 'overflow')
    inventory = [
      {
        id: 'overflow',
        label: 'Large document collection',
        initiallyExpanded: true,
        documents: Array.from({ length: 101 }, (_, index) => ({
          id: `document-${index}`,
          title: `Document ${index} with a long title that remains selectable`,
          metadata: 'Fixture metadata',
          wordCount: '812 words',
          blocks,
        })),
      },
    ]
  if (localized)
    inventory = folders.map((folder) => ({
      ...folder,
      label: `Dokumentensammlung für internationale Entwicklungsabteilungen ${folder.label}`,
      documents: folder.documents.map((file) => ({
        ...file,
        title: `Ausführliche technische Dokumentation zur Wiederholungsplanung ${file.title}`,
        metadata: 'Zuletzt bearbeitet am 14. März 2025 von Mara Vogt',
        wordCount: '812 Wörter',
        blocks: [
          {
            id: 'intro',
            kind: 'paragraph',
            text: 'Lange übersetzte Inhalte bleiben im normalen Dokumentfluss lesbar und dürfen weder die Navigation noch die Werkzeugleiste überlagern.',
          },
        ],
      })),
    }))
  return {
    brand: localized ? 'Halden Dokumentation' : 'Halden docs',
    labels: localized ? de : en,
    folders: inventory,
    selectedId: 'webhook',
    status: localized ? 'Gespeichert' : 'Saved',
    statusState: 'saved',
    trashCount: '6',
    formats: ['bold'],
    menu: [
      { id: 'duplicate', icon: 'duplicate', label: localized ? 'Duplizieren' : 'Duplicate' },
      { id: 'move', icon: 'move', label: localized ? 'In Ordner verschieben' : 'Move to folder' },
      { id: 'history', icon: 'history', label: localized ? 'Versionsverlauf' : 'Version history' },
      { id: 'export', icon: 'export', label: localized ? 'Als Markdown exportieren' : 'Export as Markdown' },
      { id: 'trash', icon: 'trash', label: localized ? 'In den Papierkorb verschieben' : 'Move to trash' },
    ],
    moreFormatting: [
      { id: 'list', icon: 'list', label: localized ? de.formats.list : en.formats.list },
      { id: 'quote', icon: 'quote', label: localized ? de.formats.quote : en.formats.quote },
      { id: 'code', icon: 'code', label: localized ? de.formats.code : en.formats.code },
      { id: 'link', icon: 'link', label: localized ? 'Verknüpfung' : 'Link' },
    ],
    onSelect: (id) => report('select', id),
    onTitle: (id) => report('title', id),
    onFormat: (format) => report('format', format),
    onAction: (action, id, child) => report(child ?? action, id),
  }
}
