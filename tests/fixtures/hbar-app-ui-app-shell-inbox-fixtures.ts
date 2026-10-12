import type { LumenAppShellInboxContent, LumenInboxConversation } from '@lumen/app-ui/catalog'

export interface InboxPreviewRecord extends LumenInboxConversation {
  readonly assigned: boolean
  readonly escalated: boolean
}
export interface InboxPreviewFixture extends LumenAppShellInboxContent {
  readonly inventory: readonly InboxPreviewRecord[]
  readonly formatCount: (count: number) => string
}
const records: readonly InboxPreviewRecord[] = [
  {
    id: 'priya',
    sender: 'Priya Raghunathan',
    subject:
      'Bulk import of 12,400 supplier records keeps failing at the validation step after the March schema change',
    preview:
      'We ran the import again last night and it stopped at 3,180 records. Every rejected row has a value in secondary_contact.',
    time: '09:24',
    email: 'priya.raghunathan@lumenfield-logistics.example',
    date: '14 Mar 2025, 09:24',
    recipient: 'To Portway support',
    unread: false,
    starred: false,
    assigned: true,
    escalated: false,
    paragraphs: [
      'We ran the March supplier import last night and it stopped at 3,180 of 12,400 records. The job never fails outright, it sits at the validation step until the two-hour timeout and then reports a partial write.',
      'Every record it rejects has a value in the secondary_contact column. The same rows imported cleanly on 6 March, so I think this is related to the schema change you shipped on the 11th.',
      'I have attached the export we are using, trimmed to the first 500 rows so you can reproduce it without waiting for the full file. The shape is unchanged from the one we agreed at onboarding.',
      'Two questions. Is secondary_contact still accepted, and if it has moved, is there a mapping we should apply before the next run? We have another 9,000 records queued behind this one.',
      'For context on urgency: the queued records cover the four new depots we open on 24 March, and none of those suppliers can be dispatched against until they exist in Portway. Our planners are currently holding the lane assignments in a spreadsheet.',
      'If the fix has to wait for a release, a temporary import path that skips validation on that one column would unblock us. We can clean the data afterwards, and I would rather do that than keep the depots on manual entry for another week.',
      'The Rotterdam team needs them in place before Monday, so if a call today is faster than email I can make time from 14:00 onwards.',
    ],
    attachments: [
      {
        id: 'supplier-sample',
        name: 'supplier-import-sample-500.csv',
        size: '2.4 MB',
        downloadLabel: 'Download supplier-import-sample-500.csv',
      },
    ],
  },
  {
    id: 'daniel',
    sender: 'Daniel Okonkwo',
    subject: "Rate card for the Rotterdam lane is showing last quarter's prices",
    preview:
      'Our dispatchers are quoting from a card that expired on 28 February. Nothing changed on our side, so I suspect the sync.',
    time: '08:51',
    email: 'daniel.okonkwo@brightsea-freight.example',
    date: '14 Mar 2025, 08:51',
    recipient: 'To Portway support',
    unread: true,
    starred: false,
    assigned: false,
    escalated: false,
    paragraphs: [
      'Our dispatchers are quoting the Rotterdam to Duisburg lane from a rate card that expired on 28 February. Nothing changed on our side, so I suspect the nightly sync is not picking up the new card.',
      'The customer-facing quote tool shows the correct prices, which is the confusing part. It is only the dispatch board that is behind.',
      'We can work around it for a day or two by quoting manually, but I would rather not have twelve people copying numbers out of a spreadsheet.',
    ],
    attachments: [],
  },
  {
    id: 'marta',
    sender: 'Marta Lindqvist',
    subject: 'Two drivers cannot sign in after the SSO migration',
    preview:
      'Both accounts were created before we moved to Okta. They get sent back to the login screen with no error message.',
    time: 'Yesterday',
    email: 'm.lindqvist@nordkust.example',
    date: '13 Mar 2025, 16:07',
    recipient: 'To Portway support',
    unread: true,
    starred: false,
    assigned: true,
    escalated: false,
    paragraphs: [
      "Two of our drivers cannot sign in to the mobile app after Tuesday's SSO migration. Both accounts were created before we moved to Okta.",
      'They get sent back to the login screen with no error message, which makes it hard for them to tell us what went wrong. Everyone else on the same team signs in fine.',
      'I have their employee numbers if that helps you find the accounts. Let me know what you need and I will get it to you today.',
    ],
    attachments: [],
  },
  {
    id: 'kenji',
    sender: 'Kenji Watanabe',
    subject: 'Webhook retries are arriving out of order',
    preview:
      'We are seeing shipment.updated land before shipment.created for about one delivery in fifty. Our queue handles it, but the ordering guarantee in the docs says this should not happen.',
    time: 'Yesterday',
    email: 'k.watanabe@harborline.example',
    date: '13 Mar 2025, 11:42',
    recipient: 'To Portway support',
    unread: true,
    starred: false,
    assigned: false,
    escalated: false,
    paragraphs: [
      'We are seeing shipment.updated arrive before shipment.created for roughly one delivery in fifty. Our queue tolerates it, but the ordering guarantee in your documentation says this should not happen.',
      'It started around the same time we increased our endpoint timeout from two to five seconds, so it may be on our side. I would like to rule out the retry logic first.',
      'Is there a way to see the delivery attempts for a single event without opening a ticket each time?',
    ],
    attachments: [],
  },
  {
    id: 'aisha',
    sender: 'Aisha Bello',
    subject: 'Read-only access for our finance team',
    preview:
      'Four people in finance need to see invoices and settlement reports without being able to change a shipment.',
    time: 'Mon',
    email: 'aisha.bello@sahelgroup.example',
    date: '11 Mar 2025, 14:15',
    recipient: 'To Portway support',
    unread: true,
    starred: false,
    assigned: true,
    escalated: false,
    paragraphs: [
      'Four people in our finance team need to see invoices and settlement reports without being able to change a shipment or a rate.',
      'The viewer role looks close, but it also hides the settlement export, which is the one thing they actually need.',
      'Is there a way to grant the export on its own, or should we be looking at a custom role?',
    ],
    attachments: [],
  },
  {
    id: 'tomas',
    sender: 'Tomás Ferreira',
    subject: 'Signed carrier agreement',
    preview: '-',
    time: 'Mon',
    email: 'tomas.ferreira@atlanticoport.example',
    date: '11 Mar 2025, 09:03',
    recipient: 'To Portway support',
    unread: true,
    starred: false,
    assigned: false,
    escalated: false,
    paragraphs: [
      'Attached is the countersigned carrier agreement for the 2025 season. No changes from the draft you sent on 4 March.',
    ],
    attachments: [
      {
        id: 'agreement',
        name: 'carrier-agreement-2025-signed.pdf',
        size: '812 KB',
        downloadLabel: 'Download carrier-agreement-2025-signed.pdf',
      },
    ],
  },
  {
    id: 'hannah',
    sender: 'Hannah Weiss',
    subject: 'Customs documents missing from the Genoa shipment',
    preview:
      'Container GNOA-77412 arrived without the packing list attached in the portal. The paper copy travelled with the driver.',
    time: '12 Mar',
    email: 'h.weiss@genoa-forwarding.example',
    date: '12 Mar 2025, 08:30',
    recipient: 'To Portway support',
    unread: true,
    starred: false,
    assigned: false,
    escalated: false,
    paragraphs: [
      'Container GNOA-77412 arrived without the packing list attached in the portal. The paper copy travelled with the driver, so nothing was held up, but our broker needs the digital version for the file.',
      'The upload shows as complete in the shipment timeline, which is why nobody noticed until the container was already on the water.',
      'Can you check whether the document was stored and simply not linked?',
    ],
    attachments: [],
  },
  {
    id: 'oliver',
    sender: 'Oliver Grant',
    subject: 'Invoice 2025-0418 was charged twice',
    preview:
      'Both charges cleared on 10 March for £4,280.00. Our bank shows two separate authorisations, not a pending and a capture.',
    time: '11 Mar',
    email: 'oliver.grant@meadowbank.example',
    date: '11 Mar 2025, 17:48',
    recipient: 'To Portway support',
    unread: true,
    starred: false,
    assigned: false,
    escalated: false,
    paragraphs: [
      'Invoice 2025-0418 was charged twice. Both charges cleared on 10 March for £4,280.00, and our bank shows two separate authorisations rather than a pending and a capture.',
      'I have the reference numbers for both if you need them. A refund of the duplicate would be ideal, but a credit against the April invoice works as well.',
    ],
    attachments: [],
  },
  {
    id: 'sofia',
    sender: 'Sofia Marchetti',
    subject: 'Filter the dispatch board by trailer type',
    preview:
      'We run reefers and dry vans out of the same yard and the planners scroll past most of the board to find the right one.',
    time: '9 Mar',
    email: 's.marchetti@viadria.example',
    date: '9 Mar 2025, 10:12',
    recipient: 'To Portway support',
    unread: true,
    starred: false,
    assigned: false,
    escalated: false,
    paragraphs: [
      'We run reefers and dry vans out of the same yard, and the planners scroll past most of the board to find the right trailer.',
      'A filter on trailer type would save each of them a few minutes every hour. Saved views would be even better, but the filter alone would be enough.',
      'Not urgent. I wanted to get it in front of you before the next planning cycle.',
    ],
    attachments: [],
  },
]
export function appShellInboxFixture(
  mode: string | null = null,
  report: (action: string, value?: string) => void = () => {},
): InboxPreviewFixture {
  const localized = mode === 'localized'
  const inventory =
    mode === 'empty'
      ? []
      : mode === 'overflow'
        ? Array.from({ length: 101 }, (_, i) => ({ ...records[i % records.length]!, id: `message-${i}` }))
        : records
  return {
    brand: { mark: 'P', name: 'Portway' },
    account: {
      initials: 'IR',
      name: 'Iris Renner',
      role: localized ? 'Leitung Kundendienst' : 'Support lead',
      label: localized ? 'Iris Renner, Leitung Kundendienst' : 'Iris Renner, support lead',
    },
    labels: localized
      ? {
          mailboxes: 'Postfächer',
          openMailboxes: 'Postfächer öffnen',
          closeMailboxes: 'Postfächer schließen',
          closeOverlay: 'Postfachüberlagerung schließen',
          title: 'Gemeinsamer Kundendiensteingang',
          sort: 'Unterhaltungen sortieren',
          compose: 'Antwort verfassen',
          search: 'Unterhaltungen durchsuchen',
          filters: 'Unterhaltungen filtern',
          conversations: 'Unterhaltungen',
          unread: 'Ungelesen',
          back: 'Zurück zu Unterhaltungen',
          reply: 'Antworten',
          star: 'Unterhaltung markieren',
          unstar: 'Markierung entfernen',
          archive: 'Archivieren',
          delete: 'Löschen',
          more: 'Weitere Aktionen',
          attachment: 'Anhang',
          emptyTitle: 'Keine passenden Unterhaltungen',
          emptyDetail: 'In diesem Postfach entspricht keine Unterhaltung der aktuellen Suche und dem Filter.',
          clear: 'Filter zurücksetzen',
          emptyReader: 'Wählen Sie eine Unterhaltung aus',
          emptyMailboxes: 'Keine Postfächer',
        }
      : {
          mailboxes: 'Mailboxes',
          openMailboxes: 'Open mailboxes',
          closeMailboxes: 'Close mailboxes',
          closeOverlay: 'Close mailboxes overlay',
          title: 'Inbox',
          sort: 'Sort conversations',
          compose: 'Compose a reply',
          search: 'Search conversations',
          filters: 'Filter conversations',
          conversations: 'Conversations',
          unread: 'Unread',
          back: 'Back to conversations',
          reply: 'Reply',
          star: 'Star this conversation',
          unstar: 'Remove star',
          archive: 'Archive',
          delete: 'Delete',
          more: 'More actions',
          attachment: 'Attachment',
          emptyTitle: 'No conversations match',
          emptyDetail: 'Nothing in this mailbox matches the current search and filter.',
          clear: 'Clear filters',
          emptyReader: 'Select a conversation',
          emptyMailboxes: 'No mailboxes',
        },
    mailboxes:
      mode === 'empty'
        ? []
        : mode === 'overflow'
          ? Array.from({ length: 21 }, (_, i) => ({
              id: `mailbox-${i}`,
              label: `Mailbox ${i + 1}`,
              icon: 'inbox' as const,
            }))
          : [
              { id: 'inbox', label: localized ? 'Posteingang' : 'Inbox', icon: 'inbox' },
              { id: 'mentions', label: localized ? 'Erwähnungen' : 'Mentions', icon: 'mentions', unread: true },
              { id: 'snoozed', label: localized ? 'Zurückgestellt' : 'Snoozed', icon: 'snoozed' },
              { id: 'sent', label: localized ? 'Gesendet' : 'Sent', icon: 'sent' },
              { id: 'archive', label: localized ? 'Archiv' : 'Archive', icon: 'archive' },
            ],
    mailboxId: 'inbox',
    filters: [
      { id: 'all', label: localized ? 'Alle' : 'All' },
      { id: 'unread', label: localized ? 'Ungelesen' : 'Unread' },
      { id: 'assigned', label: localized ? 'Zugewiesen' : 'Assigned' },
      { id: 'escalated', label: localized ? 'Eskaliert' : 'Escalated' },
    ],
    filterId: 'all',
    query: '',
    count: String(inventory.length),
    inventory: localized
      ? inventory.map((item) => ({
          ...item,
          subject: `Ausführliche Rückfrage zur internationalen Lieferantenverwaltung: ${item.subject}`,
          recipient: 'An den Portway-Kundendienst',
          paragraphs: [
            'Die aktuelle Datenübertragung benötigt eine sorgfältige Prüfung durch unser Kundendienstteam. Bitte berücksichtigen Sie die zusätzlichen Angaben zur Lieferantenverwaltung und zur Wiederherstellung des vollständigen Datenbestands.',
          ],
          attachments: item.attachments.map((file) => ({
            ...file,
            downloadLabel: `Datei herunterladen: ${file.name}`,
          })),
        }))
      : inventory,
    conversations: inventory,
    selected: inventory[0] ?? null,
    menu: [
      { id: 'unread', icon: 'unread', label: localized ? 'Als ungelesen markieren' : 'Mark as unread' },
      { id: 'snooze', icon: 'snooze', label: localized ? 'Bis Montag zurückstellen' : 'Snooze until Monday' },
      { id: 'assign', icon: 'assign', label: localized ? 'Teammitglied zuweisen' : 'Assign to a teammate' },
      { id: 'mute', icon: 'mute', label: localized ? 'Absender stummschalten' : 'Mute this sender' },
    ],
    formatCount: (count) => new Intl.NumberFormat(localized ? 'de' : 'en').format(count),
    onFilter: (id) => report('filter', id),
    onQuery: (query) => report('query', query),
    onClear: () => report('clear'),
    onSelect: (id) => report('select', id),
    onStar: (id) => report('star', id),
    onMailbox: (id) => report('mailbox', id),
    onAction: (action, id, childId) => report(action, [id, childId].filter((value) => value !== undefined).join(':')),
  }
}
