import type { LumenAppShellEditorialContent, LumenEditorialStory, LumenEditorialEvent, LumenEditorialLink } from '@lumen/app-ui/catalog'

export interface EditorialPreviewFixture extends LumenAppShellEditorialContent {
  readonly locale: string
  readonly todayId: string
  readonly inventory: readonly (LumenEditorialStory & { readonly category: string })[]
  readonly agenda: readonly (LumenEditorialEvent & { readonly date: string })[]
  readonly formatMonth: (date: Date) => string
  readonly formatCalendarCaption: (month: string) => string
  readonly formatEmptySchedule: (date: Date) => string
}
export function appShellEditorialFixture(
  mode: string | null,
  onAction: (id: string, value?: string) => void = () => {},
): EditorialPreviewFixture {
  const de = mode === 'localized',
    locale = de ? 'de-DE' : 'en-US'
  const data = [
    ['Harbor tunnel overruns reach $40m', 'Priya Raghunathan', 'Needs edits', 'Aug 12', 'edits'],
    ['Council delays the vacancy tax vote', 'Tomasz Nowak', 'In review', 'Aug 12', 'review'],
    ['The grid contract and winter rates', 'Ari Chen', 'Scheduled', 'Aug 13', 'scheduled'],
    [
      'Inside the ferry terminal rebuild: three years, two contractors and a berth that still does not fit',
      'Lena Ortiz',
      'Drafting',
      ', ',
      'draft',
    ],
    ['Eastside schools reopen Monday', 'Devon Okafor', 'Scheduled', 'Aug 13', 'scheduled'],
    ['The quiet return of the night bus', 'Sofia Martins', 'In review', 'Aug 14', 'review'],
    ['Port authority names its next chief', 'Marcus Lund', 'Scheduled', 'Aug 14', 'scheduled'],
    ['A year on the hearing aid waitlist', 'Priya Raghunathan', 'Drafting', 'Aug 17', 'draft'],
    ['Riverfront market loses half its stalls', 'Jun Park', 'In review', 'Aug 17', 'review'],
    ['The landlord of Fenwick Street', 'Ari Chen', 'Needs edits', 'Aug 19', 'edits'],
    ['Fare evasion fines fall again', 'Tomasz Nowak', 'Scheduled', 'Aug 19', 'scheduled'],
    ['One helicopter, a 40-minute gap', 'Marguerite Oyelaran-Bishop', 'Drafting', 'Aug 21', 'draft'],
    ['Where the city compost actually goes', 'Sofia Martins', 'In review', 'Aug 21', 'review'],
    ['The last dry dock on the north bank', 'Marcus Lund', 'Scheduled', 'Aug 24', 'scheduled'],
    ['Rent arrears cases double', 'Jun Park', 'Drafting', ', ', 'draft'],
    ['A cycle lane that ends in a hedge', 'Devon Okafor', 'Scheduled', 'Aug 27', 'scheduled'],
  ] as const
  const normalStories = data.map(([title, owner, status, publishes, category], index) => ({
    id: `story-${index}`,
    title: de ? `Ausführlicher Bericht zur Stadtentwicklung: ${title}` : title,
    owner,
    status: de
      ? { edits: 'Überarbeitung erforderlich', review: 'In Prüfung', scheduled: 'Geplant', draft: 'Entwurf' }[category]
      : status,
    publishes,
    category,
    tone: category === 'edits' ? ('warning' as const) : ('neutral' as const),
  }))
  const eventData = [
    ['12', 'Aug 12, 4:00 PM', 'Evening briefing send', 'Newsletter'],
    ['13', 'Aug 13, 6:00 AM', 'The grid contract and winter rates', 'Homepage lead'],
    ['13', 'Aug 13, 12:00 PM', 'Eastside schools reopen Monday', 'Local'],
    ['14', 'Aug 14, 6:00 AM', 'Port authority names its next chief', 'Homepage lead'],
    ['17', 'Aug 17, 5:00 PM', 'Print pages lock', 'Sunday edition'],
    ['19', 'Aug 19, 6:00 AM', 'Fare evasion fines fall again', 'Homepage lead'],
    ['21', 'Aug 21, 9:00 AM', 'Weekly desk planning', 'All desks'],
    ['24', 'Aug 24, 6:00 AM', 'The last dry dock on the north bank', 'Homepage lead'],
    ['27', 'Aug 27, 6:00 AM', 'A cycle lane that ends in a hedge', 'Local'],
  ] as const
  const normalAgenda = eventData.map(([day, time, title, detail], index) => ({
    id: `event-${index}`,
    date: `2026-08-${day}`,
    time,
    title: de ? `Redaktionsplanung für die nächste Ausgabe: ${title}` : title,
    detail: de ? 'Stadtredaktion und Veröffentlichung' : detail,
  }))
  const inventory =
    mode === 'empty'
      ? []
      : mode === 'overflow'
        ? Array.from({ length: 101 }, (_, index) => ({
            ...normalStories[index % normalStories.length]!,
            id: `story-${index}`,
          }))
        : normalStories
  const agenda =
    mode === 'empty'
      ? []
      : mode === 'overflow'
        ? Array.from({ length: 101 }, (_, index) => ({
            ...normalAgenda[index % normalAgenda.length]!,
            id: `event-${index}`,
          }))
        : normalAgenda
  const link = (id: string, label: string, icon: LumenEditorialLink['icon'], count?: string): LumenEditorialLink => ({
    id,
    label: de
      ? {
          queue: 'Beitragswarteschlange',
          assignments: 'Arbeitsaufträge',
          copy: 'Textredaktion',
          media: 'Medienbibliothek',
          metro: 'Stadt und Region',
          business: 'Wirtschaft',
          culture: 'Kultur',
          sport: 'Sport',
          investigations: 'Investigative Recherche',
          newsletters: 'Rundbriefe',
          syndication: 'Weiterveröffentlichung',
          audience: 'Zielgruppen',
          saved: 'Mein Ressort',
          late: 'Verspätete Beiträge',
        }[icon]
      : label,
    icon,
    href: '#story-queue',
    ...(count ? { count } : {}),
  })
  const sections = [
    {
      id: 'editorial',
      label: de ? 'Redaktion' : 'Editorial',
      links: [
        link('queue', 'Story queue', 'queue', '16'),
        link('assignments', 'Assignments', 'assignments', '6'),
        link('copy', 'Copy desk', 'copy', '4'),
        link('media', 'Media library', 'media'),
      ],
    },
    {
      id: 'desks',
      label: de ? 'Ressorts' : 'Desks',
      links: [
        link('metro', 'Metro', 'metro'),
        link('business', 'Business', 'business'),
        link('culture', 'Culture', 'culture'),
        link('sport', 'Sport', 'sport'),
        link('investigations', 'Investigations', 'investigations'),
      ],
    },
    {
      id: 'distribution',
      label: de ? 'Veröffentlichung' : 'Distribution',
      links: [
        link('newsletters', 'Newsletters', 'newsletters'),
        link('syndication', 'Syndication', 'syndication'),
        link('audience', 'Audience', 'audience'),
      ],
    },
    {
      id: 'saved',
      label: de ? 'Gespeicherte Ansichten' : 'Saved views',
      links: [link('saved', 'My desk', 'saved'), link('late', 'Late stories', 'late', '2')],
    },
  ]
  const formatMonth = (date: Date) =>
    new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
  return {
    locale,
    todayId: '2026-08-12',
    inventory,
    agenda,
    formatMonth,
    formatCalendarCaption: (month) => (de ? `Veröffentlichungskalender ${month}` : `${month} publishing schedule`),
    formatEmptySchedule: (date) =>
      de
        ? `Keine Termine nach dem ${new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date)}.`
        : `The calendar is clear after ${new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date)}.`,
    brand: { mark: 'N', name: 'Northline', desk: de ? 'Stadtredaktion' : 'City desk' },
    account: {
      initials: 'MO',
      name: 'Marguerite Oyelaran-Bishop',
      role: de ? 'Geschäftsführende Redakteurin' : 'Managing editor',
    },
    labels: de
      ? {
          navigation: 'Hauptnavigation',
          navigationDialog: 'Navigation',
          openNavigation: 'Navigation öffnen',
          closeNavigation: 'Navigation schließen',
          closeOverlay: 'Navigation schließen',
          breadcrumb: 'Navigationspfad',
          section: 'Redaktion',
          title: 'Warteschlange für Veröffentlichungen',
          toggleSchedule: 'Terminübersicht',
          schedule: 'Terminplanung',
          hideSchedule: 'Terminplanung ausblenden',
          create: 'Neuer Beitrag',
          recordsCaption: 'Beiträge vor der Veröffentlichung',
          emptyRecords: 'Keine Beiträge vorhanden',
          emptyNavigation: 'Keine Navigationsziele',
          previousMonth: 'Vorheriger Monat',
          nextMonth: 'Nächster Monat',
          upNext: 'Als Nächstes',
          emptyScheduleTitle: 'Keine Termine geplant',
          emptyScheduleDetail: 'Keine weiteren Termine.',
          today: 'Heute anzeigen',
        }
      : {
          navigation: 'Primary',
          navigationDialog: 'Navigation',
          openNavigation: 'Open navigation',
          closeNavigation: 'Close navigation',
          closeOverlay: 'Close navigation overlay',
          breadcrumb: 'Breadcrumb',
          section: 'Editorial',
          title: 'Story queue',
          toggleSchedule: 'Schedule panel',
          schedule: 'Schedule',
          hideSchedule: 'Hide schedule',
          create: 'New story',
          recordsCaption: 'Stories waiting to be published',
          emptyRecords: 'No stories available',
          emptyNavigation: 'No navigation available',
          previousMonth: 'Previous month',
          nextMonth: 'Next month',
          upNext: 'Up next',
          emptyScheduleTitle: 'Nothing scheduled',
          emptyScheduleDetail: 'The calendar is clear after Aug 12.',
          today: 'Show today',
        },
    sections:
      mode === 'empty'
        ? []
        : mode === 'overflow'
          ? [
              {
                ...sections[0]!,
                links: Array.from({ length: 51 }, (_, index) =>
                  link(`link-${index}`, `Editorial destination ${index + 1}`, 'queue'),
                ),
              },
            ]
          : sections,
    currentLinkId: 'queue',
    onNavigate: (id) => onAction('navigate', id),
    filters: [
      { id: 'all', label: de ? 'Sämtliche Beiträge' : 'All stories' },
      { id: 'review', label: de ? 'Zur redaktionellen Prüfung' : 'In review' },
      { id: 'edits', label: de ? 'Überarbeitung erforderlich' : 'Needs edits' },
    ],
    filterId: 'all',
    onFilter: (id) => onAction('filter', id),
    onCreate: () => onAction('create'),
    columns: de
      ? { story: 'Beitrag', owner: 'Verantwortlich', status: 'Status', publishes: 'Veröffentlichung' }
      : { story: 'Story', owner: 'Owner', status: 'Status', publishes: 'Publishes' },
    stories: inventory,
    events: agenda,
    month: '',
    calendarCaption: '',
    weekdays: [],
    weeks: [],
    selectedDate: '2026-08-12',
    onDate: (id) => onAction('date', id),
    onMonth: (direction) => onAction('month', String(direction)),
    onToday: () => onAction('today'),
    onEvent: (id) => onAction('event', id),
  }
}
