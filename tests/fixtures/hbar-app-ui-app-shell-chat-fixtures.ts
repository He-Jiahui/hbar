import type { LumenAppShellChatContent, LumenShellChatThread } from '@lumen/app-ui/catalog'

const threads: readonly LumenShellChatThread[] = [
  {
    id: 'quarterly',
    label: 'Quarterly revenue summary',
    icon: 'file',
    messages: [
      { id: 'quarterly-user', role: 'user', text: 'Summarise the quarterly revenue by region.' },
      { id: 'quarterly-assistant', role: 'assistant', text: 'Revenue increased across the three reporting regions.' },
    ],
  },
  {
    id: 'refactor',
    label: 'Refactor auth middleware',
    icon: 'code',
    messages: [
      { id: 'refactor-user', role: 'user', text: 'The session refresh runs on every request. Can it be cheaper?' },
      {
        id: 'refactor-assistant',
        role: 'assistant',
        text: 'Yes. Refresh only when the token is inside its last five minutes, and keep the decoded claims on the request so downstream handlers stop re-parsing. That takes the common path from one network call to none.',
      },
    ],
  },
  {
    id: 'lisbon',
    label: 'Lisbon trip itinerary',
    icon: 'map',
    messages: [
      { id: 'lisbon-user', role: 'user', text: 'Plan a weekend itinerary for Lisbon.' },
      {
        id: 'lisbon-assistant',
        role: 'assistant',
        text: 'Spend the first day in Alfama and the second along the river.',
      },
    ],
  },
  {
    id: 'launch',
    label: 'Launch checklist draft',
    icon: 'checklist',
    messages: [
      { id: 'launch-user', role: 'user', text: 'Draft a launch checklist.' },
      {
        id: 'launch-assistant',
        role: 'assistant',
        text: 'Confirm owners, release gates, monitoring and rollback first.',
      },
    ],
  },
  {
    id: 'vector',
    label: 'Explain vector search',
    icon: 'search',
    messages: [
      { id: 'vector-user', role: 'user', text: 'How does vector search work?' },
      {
        id: 'vector-assistant',
        role: 'assistant',
        text: 'It finds nearby embeddings instead of requiring exact keyword matches.',
      },
    ],
  },
  {
    id: 'sql',
    label: 'Optimise a slow SQL query',
    icon: 'database',
    messages: [
      { id: 'sql-user', role: 'user', text: 'Optimise this slow SQL query.' },
      {
        id: 'sql-assistant',
        role: 'assistant',
        text: 'Inspect the query plan and add an index for the selective filter.',
      },
    ],
  },
]
export function appShellChatFixture(
  mode: string | null = null,
  report: (action: string, value?: string) => void = () => {},
): LumenAppShellChatContent {
  const de = mode === 'localized'
  const baseThreads =
    mode === 'empty'
      ? []
      : mode === 'one'
        ? threads.slice(0, 1)
        : mode === 'boundary' || mode === 'overflow'
          ? Array.from({ length: mode === 'boundary' ? 100 : 101 }, (_, index) => ({
              ...threads[index % threads.length]!,
              id: `thread-${index}`,
              label: `${threads[index % threads.length]!.label} ${index}`,
            }))
          : threads
  return {
    labels: de
      ? {
          brand: 'Halden',
          brandMark: 'H',
          newChat: 'Neuer Chat',
          model: 'Modell',
          pinned: 'Angeheftet',
          recent: 'Zuletzt',
          quickActions: 'Schnellaktionen',
          accountInitials: 'HA',
          accountName: 'Assistent',
          accountStatus: 'Online, antwortet sofort',
          pinnedModel: 'Atlas 4',
          pinnedCount: '12 Nachrichten',
          welcomeTitle: 'Wie kann ich helfen?',
          welcomeDetail: 'Beginne zu schreiben oder wähle einen Vorschlag.',
          messagePlaceholder: 'Nachricht an Halden',
          disclaimer: 'Halden kann Fehler machen. Prüfe wichtige Informationen.',
          collapseSidebar: 'Seitenleiste einklappen',
          expandSidebar: 'Seitenleiste ausklappen',
          openNavigation: 'Navigation öffnen',
          closeNavigation: 'Navigation schließen',
          closeOverlay: 'Navigationsüberlagerung schließen',
          chooseModel: 'Modell auswählen',
          share: 'Chat teilen',
          attach: 'Anhang hinzufügen',
          search: 'Suchen',
          dictate: 'Diktieren',
          send: 'Nachricht senden',
        }
      : {
          brand: 'Halden',
          brandMark: 'H',
          newChat: 'New chat',
          model: 'Model',
          pinned: 'Pinned',
          recent: 'Recent',
          quickActions: 'Quick actions',
          accountInitials: 'HA',
          accountName: 'Assistant',
          accountStatus: 'Online, replies instantly',
          pinnedModel: 'Atlas 4',
          pinnedCount: '12 messages',
          welcomeTitle: 'How can I help?',
          welcomeDetail: 'Start typing, or pick one of these to get going.',
          messagePlaceholder: 'Message Halden',
          disclaimer: 'Halden can make mistakes. Check anything important.',
          collapseSidebar: 'Collapse sidebar',
          expandSidebar: 'Expand sidebar',
          openNavigation: 'Open navigation',
          closeNavigation: 'Close navigation',
          closeOverlay: 'Close navigation overlay',
          chooseModel: 'Choose a model',
          share: 'Share chat',
          attach: 'Add an attachment',
          search: 'Search',
          dictate: 'Dictate',
          send: 'Send message',
        },
    models: [
      {
        id: 'atlas',
        label: 'Atlas 4',
        description: de ? 'Für anspruchsvolle Fragen' : 'Best for hard reasoning',
        icon: 'spark',
      },
      { id: 'wren', label: 'Wren', description: de ? 'Schnell für Entwürfe' : 'Fast, good for drafts', icon: 'globe' },
      { id: 'orbit', label: 'Orbit', description: de ? 'Lange Dokumente' : 'Long documents', icon: 'database' },
    ],
    selectedModelId: 'atlas',
    pinnedThreadId: baseThreads.some((item) => item.id === 'quarterly') ? 'quarterly' : null,
    threads: baseThreads,
    selectedThreadId: null,
    draft: '',
    quickActions: [
      { id: 'favourites', label: de ? 'Favoriten' : 'Favourites', icon: 'star', count: '2' },
      { id: 'templates', label: de ? 'Vorlagen' : 'Templates', icon: 'file', count: '5' },
      { id: 'history', label: de ? 'Verlauf' : 'History', icon: 'history' },
      { id: 'clear', label: de ? 'Verlauf löschen' : 'Clear history', icon: 'trash' },
    ],
    suggestions: [
      { id: 'email', label: de ? 'Eine E-Mail entwerfen' : 'Draft an email', icon: 'mail' },
      { id: 'summarise', label: de ? 'Datei zusammenfassen' : 'Summarise a file', icon: 'file' },
      { id: 'function', label: de ? 'Funktion schreiben' : 'Write a function', icon: 'code' },
      { id: 'trip', label: de ? 'Reise planen' : 'Plan a trip', icon: 'map' },
    ],
    onModel: (id) => report('model', id),
    onThread: (id) => report('thread', id ?? ''),
    onDraft: (value) => report('draft', value),
    onAction: (action, value) => report(action, value),
  }
}
