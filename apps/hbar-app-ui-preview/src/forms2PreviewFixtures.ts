import {
  deriveForms2Readiness,
  deriveForms2ValidationIssues,
  type Forms2Choice,
  type Forms2PreviewStoreSeed,
  type Forms2PreviewStoreState,
  type Forms2ReadinessItemId,
  type Forms2RequestStatus,
  type Forms2SessionFormat,
  type Forms2ValidationRules,
} from './forms2PreviewStore'

export type Forms2PreviewLocale = 'en' | 'de'

export interface Forms2PreviewCopy {
  readonly pageTitle: string
  readonly pageDescription: string
  readonly sessionHeading: string
  readonly sessionDescription: string
  readonly sessionTitleLabel: string
  readonly sessionTitlePlaceholder: string
  readonly abstractLabel: string
  readonly abstractPlaceholder: string
  readonly abstractRemaining: (remaining: number) => string
  readonly formatLabel: string
  readonly formatGroupLabel: string
  readonly trackLabel: string
  readonly audienceLevelLabel: string
  readonly speakerHeading: string
  readonly speakerDescription: string
  readonly speakerNameLabel: string
  readonly speakerNamePlaceholder: string
  readonly contactAddressLabel: string
  readonly contactAddressPlaceholder: string
  readonly affiliationLabel: string
  readonly affiliationPlaceholder: string
  readonly optionalLabel: string
  readonly roomRequirementsHeading: string
  readonly roomRequirementsDescription: string
  readonly asideHeading: string
  readonly readinessLabel: (ready: number) => string
  readonly readinessSessionTitle: string
  readonly readinessAbstract: string
  readonly readinessContactAddress: string
  readonly readinessRecordingConsent: string
  readonly formatDuration: (formatLabel: string, durationMinutes: number) => string
  readonly recordingConsentLabel: string
  readonly submitLabel: string
  readonly attentionSummary: (count: number) => string
  readonly titleMinimumError: (minimum: number) => string
  readonly abstractMinimumError: (minimum: number, current: number) => string
  readonly contactAddressError: string
  readonly recordingConsentError: string
}

export interface Forms2PreviewField {
  readonly label: string
  readonly value: string
  readonly placeholder: string
  readonly error: string | null
}

export interface Forms2PreviewContent {
  readonly copy: Forms2PreviewCopy
  readonly sessionTitle: Forms2PreviewField
  readonly abstract: Forms2PreviewField & { readonly remainingLabel: string }
  readonly format: {
    readonly selectedId: string
    readonly choices: readonly Forms2SessionFormat[]
  }
  readonly track: {
    readonly label: string
    readonly selectedId: string
    readonly choices: readonly Forms2Choice[]
  }
  readonly audienceLevel: {
    readonly label: string
    readonly selectedId: string
    readonly choices: readonly Forms2Choice[]
  }
  readonly speakerName: Forms2PreviewField
  readonly contactAddress: Forms2PreviewField
  readonly affiliation: Forms2PreviewField
  readonly roomRequirements: {
    readonly choices: readonly { readonly id: string; readonly label: string; readonly checked: boolean }[]
  }
  readonly readiness: {
    readonly ready: number
    readonly label: string
    readonly items: readonly { readonly id: Forms2ReadinessItemId; readonly label: string; readonly ready: boolean }[]
    readonly durationNote: string
  }
  readonly recordingConsent: { readonly checked: boolean; readonly error: string | null }
  readonly attentionSummary: string | null
  readonly requestStatus: Forms2RequestStatus
  readonly listStrategy: { readonly kind: 'content-grown'; readonly note: string }
}

export interface Forms2PreviewFixture {
  readonly locale: Forms2PreviewLocale
  readonly copy: Forms2PreviewCopy
  readonly storeSeed: Forms2PreviewStoreSeed
  readonly contentFor: (state: Forms2PreviewStoreState) => Forms2PreviewContent
}

const sourceFormats: readonly Forms2SessionFormat[] = [
  {
    id: 'conference-talk',
    label: 'Conference talk',
    description: 'Single speaker, main stage',
    durationMinutes: 30,
    icon: 'presentation',
  },
  {
    id: 'hands-on-workshop',
    label: 'Hands-on workshop',
    description: 'Laptops required, capped room',
    durationMinutes: 90,
    icon: 'workshop',
  },
  {
    id: 'lightning-slot',
    label: 'Lightning slot',
    description: 'Back-to-back, no questions',
    durationMinutes: 10,
    icon: 'microphone',
  },
]

const sourceTracks: readonly Forms2Choice[] = [
  { id: 'instrumentation', label: 'Instrumentation' },
  { id: 'field-robotics', label: 'Field robotics' },
  { id: 'signal-processing', label: 'Signal processing' },
  { id: 'open-hardware', label: 'Open hardware' },
]

const sourceAudienceLevels: readonly Forms2Choice[] = [
  { id: 'introductory', label: 'Introductory' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
]

const sourceRoomRequirements = [
  { id: 'hdmi-capture', label: 'HDMI capture from my own laptop', initiallyChecked: true },
  { id: 'audio-playback', label: 'Audio playback through the house system', initiallyChecked: false },
  { id: 'bench-space', label: 'Bench space for hardware demonstration', initiallyChecked: false },
  { id: 'live-captioning', label: 'Live captioning', initiallyChecked: false },
] as const

const sourceValidationRules: Forms2ValidationRules = {
  sessionTitleMinCharacters: 8,
  abstractMinCharacters: 120,
  abstractCounterLimit: 600,
}

function copyFor(locale: Forms2PreviewLocale): Forms2PreviewCopy {
  if (locale === 'de') {
    return {
      pageTitle: 'Sitzung einreichen',
      pageDescription: 'Vorschläge für das Herbstsymposium Instrumentierung schließen am 28. Februar.',
      sessionHeading: 'Die Sitzung',
      sessionDescription: 'So erscheint die Sitzung im Veranstaltungsprogramm.',
      sessionTitleLabel: 'Titel der Sitzung',
      sessionTitlePlaceholder: 'Kalibrierung kostengünstiger Sensoren im Feldeinsatz',
      abstractLabel: 'Zusammenfassung',
      abstractPlaceholder: 'Beschreiben Sie das Problem, Ihre Arbeit und den Nutzen für die Teilnehmenden.',
      abstractRemaining: (remaining) => `${remaining} Zeichen übrig`,
      formatLabel: 'Format',
      formatGroupLabel: 'Sitzungsformat',
      trackLabel: 'Themenbereich',
      audienceLevelLabel: 'Erfahrungsstufe des Publikums',
      speakerHeading: 'Vortragende Person',
      speakerDescription: 'Für die Zeitplanung und das gedruckte Programm.',
      speakerNameLabel: 'Name wie abgedruckt',
      speakerNamePlaceholder: 'Marta Enríquez',
      contactAddressLabel: 'Kontaktadresse',
      contactAddressPlaceholder: 'you@institute.org',
      affiliationLabel: 'Zugehörigkeit',
      affiliationPlaceholder: 'Abteilung, Labor oder Unternehmen',
      optionalLabel: 'Optional',
      roomRequirementsHeading: 'Raumanforderungen',
      roomRequirementsDescription: 'Was das Veranstaltungsteam am Tag der Sitzung benötigt.',
      asideHeading: 'Vor dem Einreichen',
      readinessLabel: (ready) => `${ready} von 4 bereit`,
      readinessSessionTitle: 'Titel der Sitzung',
      readinessAbstract: 'Zusammenfassung',
      readinessContactAddress: 'Kontaktadresse',
      readinessRecordingConsent: 'Einwilligung zur Aufzeichnung',
      formatDuration: (formatLabel, durationMinutes) => `${formatLabel} dauert ${durationMinutes} Minuten`,
      recordingConsentLabel: 'Ich stimme zu, dass die Sitzung aufgezeichnet und im Archiv veröffentlicht wird.',
      submitLabel: 'Vorschlag einreichen',
      attentionSummary: (count) => `${count} Punkte benötigen noch Aufmerksamkeit.`,
      titleMinimumError: (minimum) => `Der Sitzungstitel muss mindestens ${minimum} Zeichen lang sein.`,
      abstractMinimumError: (minimum, current) =>
        `Zusammenfassungen benötigen mindestens ${minimum} Zeichen. Aktuell: ${current}.`,
      contactAddressError: 'Geben Sie eine Adresse an, unter der das Programmkomitee Sie erreichen kann.',
      recordingConsentError: 'Für das Einreichen ist die Einwilligung zur Aufzeichnung erforderlich.',
    }
  }

  return {
    pageTitle: 'Submit a session',
    pageDescription: 'Proposals for the autumn instrumentation symposium close on 28 February.',
    sessionHeading: 'The session',
    sessionDescription: 'What attendees will see on the schedule.',
    sessionTitleLabel: 'Session title',
    sessionTitlePlaceholder: 'Calibrating low-cost sensors in the field',
    abstractLabel: 'Abstract',
    abstractPlaceholder: 'Describe the problem, what you did, and what an attendee will be able to do afterwards.',
    abstractRemaining: (remaining) => `${remaining} left`,
    formatLabel: 'Format',
    formatGroupLabel: 'Session format',
    trackLabel: 'Track',
    audienceLevelLabel: 'Audience level',
    speakerHeading: 'Speaker',
    speakerDescription: 'Used for scheduling and the printed programme.',
    speakerNameLabel: 'Name as printed',
    speakerNamePlaceholder: 'Marta Enríquez',
    contactAddressLabel: 'Contact address',
    contactAddressPlaceholder: 'you@institute.org',
    affiliationLabel: 'Affiliation',
    affiliationPlaceholder: 'Department, lab or company',
    optionalLabel: 'Optional',
    roomRequirementsHeading: 'Room requirements',
    roomRequirementsDescription: 'Tell the venue team what the session needs on the day.',
    asideHeading: 'Before you submit',
    readinessLabel: (ready) => `${ready} of 4 ready`,
    readinessSessionTitle: 'Session title',
    readinessAbstract: 'Abstract',
    readinessContactAddress: 'Contact address',
    readinessRecordingConsent: 'Recording consent',
    formatDuration: (formatLabel, durationMinutes) => `${formatLabel} runs ${durationMinutes} minutes`,
    recordingConsentLabel: 'I agree to the session being recorded and published to the archive.',
    submitLabel: 'Submit proposal',
    attentionSummary: (count) => `${count} items still need attention.`,
    titleMinimumError: (minimum) => `Give the session a title of at least ${minimum} characters.`,
    abstractMinimumError: (minimum, current) => `Abstracts need at least ${minimum} characters. You have ${current}.`,
    contactAddressError: 'Enter an address the programme committee can reply to.',
    recordingConsentError: 'Recording consent is required to submit.',
  }
}

function translateOptions<T extends Forms2Choice>(
  locale: Forms2PreviewLocale,
  options: readonly T[],
  translations: Readonly<Record<string, string>>,
): readonly T[] {
  if (locale === 'en') return options.map((option) => ({ ...option }))
  return options.map((option) => ({ ...option, label: translations[option.id] ?? option.label }))
}

export function createForms2PreviewFixture(locale: Forms2PreviewLocale = 'en'): Forms2PreviewFixture {
  const copy = copyFor(locale)
  const formats = translateOptions(locale, sourceFormats, {
    'conference-talk': 'Konferenzvortrag',
    'hands-on-workshop': 'Praxisworkshop',
    'lightning-slot': 'Kurzvortrag',
  })
  const tracks = translateOptions(locale, sourceTracks, {
    instrumentation: 'Instrumentierung',
    'field-robotics': 'Feldrobotik',
    'signal-processing': 'Signalverarbeitung',
    'open-hardware': 'Offene Hardware',
  })
  const audienceLevels = translateOptions(locale, sourceAudienceLevels, {
    introductory: 'Einführung',
    intermediate: 'Fortgeschrittene Mittelstufe',
    advanced: 'Fortgeschritten',
  })
  const roomRequirements = translateOptions(locale, sourceRoomRequirements, {
    'hdmi-capture': 'HDMI-Aufnahme vom eigenen Laptop',
    'audio-playback': 'Audiowiedergabe über die Hausanlage',
    'bench-space': 'Werkbank für eine Hardwaredemonstration',
    'live-captioning': 'Live-Untertitelung',
  }).map((item, index) => ({ ...item, initiallyChecked: sourceRoomRequirements[index]?.initiallyChecked ?? false }))

  const storeSeed: Forms2PreviewStoreSeed = {
    initialDraft: {
      sessionTitle: '',
      abstract: '',
      formatId: 'conference-talk',
      trackId: 'instrumentation',
      audienceLevelId: 'intermediate',
      speakerName: '',
      contactAddress: '',
      affiliation: '',
      roomRequirementIds: ['hdmi-capture'],
      recordingConsent: false,
    },
    formats,
    tracks,
    audienceLevels,
    roomRequirements,
    validationRules: sourceValidationRules,
  }

  return {
    locale,
    copy,
    storeSeed,
    contentFor: (state) => {
      const readiness = deriveForms2Readiness(state.draft, state.validationRules)
      const issues = deriveForms2ValidationIssues(state.draft, state.validationRules)
      const readyCount = Object.values(readiness).filter(Boolean).length
      const selectedFormat = state.formats.find((format) => format.id === state.draft.formatId)
      if (!selectedFormat) throw new RangeError('The selected session format is unavailable.')

      return {
        copy,
        sessionTitle: {
          label: copy.sessionTitleLabel,
          value: state.draft.sessionTitle,
          placeholder: copy.sessionTitlePlaceholder,
          error:
            state.submitAttempted && issues.sessionTitle
              ? copy.titleMinimumError(state.validationRules.sessionTitleMinCharacters)
              : null,
        },
        abstract: {
          label: copy.abstractLabel,
          value: state.draft.abstract,
          placeholder: copy.abstractPlaceholder,
          remainingLabel: copy.abstractRemaining(
            state.validationRules.abstractCounterLimit - state.draft.abstract.length,
          ),
          error:
            state.submitAttempted && issues.abstract
              ? copy.abstractMinimumError(state.validationRules.abstractMinCharacters, state.draft.abstract.length)
              : null,
        },
        format: { selectedId: state.draft.formatId, choices: state.formats.map((item) => ({ ...item })) },
        track: {
          label: copy.trackLabel,
          selectedId: state.draft.trackId,
          choices: state.tracks.map((item) => ({ ...item })),
        },
        audienceLevel: {
          label: copy.audienceLevelLabel,
          selectedId: state.draft.audienceLevelId,
          choices: state.audienceLevels.map((item) => ({ ...item })),
        },
        speakerName: {
          label: copy.speakerNameLabel,
          value: state.draft.speakerName,
          placeholder: copy.speakerNamePlaceholder,
          error: null,
        },
        contactAddress: {
          label: copy.contactAddressLabel,
          value: state.draft.contactAddress,
          placeholder: copy.contactAddressPlaceholder,
          error: state.submitAttempted && issues.contactAddress ? copy.contactAddressError : null,
        },
        affiliation: {
          label: copy.affiliationLabel,
          value: state.draft.affiliation,
          placeholder: copy.affiliationPlaceholder,
          error: null,
        },
        roomRequirements: {
          choices: state.roomRequirements.map((item) => ({
            id: item.id,
            label: item.label,
            checked: state.draft.roomRequirementIds.includes(item.id),
          })),
        },
        readiness: {
          ready: readyCount,
          label: copy.readinessLabel(readyCount),
          items: [
            { id: 'sessionTitle' as const, label: copy.readinessSessionTitle, ready: readiness.sessionTitle },
            { id: 'abstract' as const, label: copy.readinessAbstract, ready: readiness.abstract },
            {
              id: 'contactAddress' as const,
              label: copy.readinessContactAddress,
              ready: readiness.contactAddress,
            },
            {
              id: 'recordingConsent' as const,
              label: copy.readinessRecordingConsent,
              ready: readiness.recordingConsent,
            },
          ],
          durationNote: copy.formatDuration(selectedFormat.label, selectedFormat.durationMinutes),
        },
        recordingConsent: {
          checked: state.draft.recordingConsent,
          error: state.submitAttempted && issues.recordingConsent ? copy.recordingConsentError : null,
        },
        attentionSummary: state.submitAttempted && readyCount < 4 ? copy.attentionSummary(4 - readyCount) : null,
        requestStatus: state.requestStatus,
        listStrategy: {
          kind: 'content-grown',
          note: 'Session choices and room requirements remain short and content-grown.',
        },
      }
    },
  }
}
