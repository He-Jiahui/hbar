import type { FormsForm1PreviewStoreSeed, FormsForm1PreviewStoreState } from './formsForm1PreviewStore'

export type FormsForm1PreviewLocale = 'en' | 'de'

export interface FormsForm1PreviewCopy {
  readonly pageTitle: string
  readonly description: string
  readonly progressLabel: (percent: number) => string
  readonly surveyTitleLabel: string
  readonly stationCodeLabel: string
  readonly stationCodeHelp: string
  readonly vesselLabel: string
  readonly deploymentLabel: string
  readonly deploymentHelp: string
  readonly recoveryLabel: string
  readonly dailyStartLabel: string
  readonly methodsLabel: string
  readonly methodInputLabel: string
  readonly methodInputPlaceholder: string
  readonly suggestedLabel: string
  readonly methodRemoveLabel: (methodLabel: string) => string
  readonly leadCrewLabel: string
  readonly dataReleaseLabel: string
  readonly embargoRowLabel: string
  readonly embargoLabel: string
  readonly photoLabel: string
  readonly photoRemoveLabel: string
  readonly cleanMessage: string
  readonly dirtyMessage: string
  readonly revertLabel: string
  readonly saveLabel: string
  readonly savedLabel: string
}

export interface FormsForm1PreviewField {
  readonly label: string
  readonly value: string
  readonly helper?: string | undefined
}

export interface FormsForm1PreviewContent {
  readonly copy: FormsForm1PreviewCopy
  readonly surveyTitle: FormsForm1PreviewField
  readonly stationCode: FormsForm1PreviewField
  readonly vessel: FormsForm1PreviewField
  readonly deployment: FormsForm1PreviewField
  readonly recovery: FormsForm1PreviewField
  readonly dailyStart: FormsForm1PreviewField
  readonly completion: {
    readonly percent: number
    readonly label: string
  }
  readonly methods: {
    readonly label: string
    readonly inputLabel: string
    readonly inputPlaceholder: string
    readonly query: string
    readonly selected: readonly { readonly id: string; readonly label: string; readonly removeLabel: string }[]
    readonly suggestionsLabel: string
    readonly suggestions: readonly { readonly id: string; readonly label: string }[]
  }
  readonly leadCrew: {
    readonly label: string
    readonly selectedId: string
    readonly choices: readonly { readonly id: string; readonly label: string }[]
  }
  readonly dataRelease: {
    readonly label: string
    readonly selectedId: string
    readonly choices: readonly { readonly id: string; readonly label: string }[]
  }
  readonly embargo: {
    readonly label: string
    readonly checked: boolean
  }
  readonly stationPhoto: {
    readonly label: string
    readonly initials: string | undefined
    readonly removeLabel: string
  }
  readonly footer: {
    readonly message: string
    readonly dirty: boolean
    readonly revertLabel: string
    readonly saveButtonLabel: string
  }
  readonly listStrategy: {
    readonly kind: 'content-grown'
    readonly note: string
  }
}

export interface FormsForm1PreviewFixture {
  readonly locale: FormsForm1PreviewLocale
  readonly copy: FormsForm1PreviewCopy
  readonly storeSeed: FormsForm1PreviewStoreSeed
  readonly contentFor: (state: FormsForm1PreviewStoreState) => FormsForm1PreviewContent
}

const sourceMethods = [
  { id: 'benthic-cores', label: 'Benthic cores' },
  { id: 'water-column', label: 'Water column' },
  { id: 'sediment-traps', label: 'Sediment traps' },
] as const

const sourceLeadCrews = [
  { id: 'coastal-survey-team', label: 'Coastal survey team' },
  { id: 'estuary-monitoring-team', label: 'Estuary monitoring team' },
  { id: 'upland-transect-team', label: 'Upland transect team' },
] as const

const sourceDataReleaseOptions = [
  { id: 'institute-only', label: 'Institute only' },
  { id: 'institute-and-partners', label: 'Institute and partners' },
  { id: 'open-data-portal', label: 'Open data portal' },
] as const

function copyFor(locale: FormsForm1PreviewLocale): FormsForm1PreviewCopy {
  if (locale === 'de') {
    return {
      pageTitle: 'Umfrageeinsatz planen',
      description: 'Station, Schiff und Probenzeitraum für den wissenschaftlichen Forschungsplan.',
      progressLabel: (percent) => `${percent}%`,
      surveyTitleLabel: 'Titel des Umfrageeinsatzes',
      stationCodeLabel: 'Registrierter Stationscode',
      stationCodeHelp: 'Referenz aus dem offiziellen Stationsregister für diese Erhebung.',
      vesselLabel: 'Forschungsschiff',
      deploymentLabel: 'Beginn des Einsatzes',
      deploymentHelp: 'Erster Tag, an dem die Ausrüstung ins Wasser gebracht wird.',
      recoveryLabel: 'Ende des Einsatzes',
      dailyStartLabel: 'Täglicher Startzeitpunkt',
      methodsLabel: 'Probenahmemethoden',
      methodInputLabel: 'Probenahmemethode hinzufügen',
      methodInputPlaceholder: 'Methode auswählen oder eingeben',
      suggestedLabel: 'Vorgeschlagene Methode',
      methodRemoveLabel: (methodLabel) => `${methodLabel} aus der Auswahl entfernen`,
      leadCrewLabel: 'Verantwortliches Küstenüberwachungsteam',
      dataReleaseLabel: 'Freigabe der erhobenen Forschungsdaten',
      embargoRowLabel: 'Sperrfrist',
      embargoLabel: 'Ergebnisse für zwölf Monate zurückhalten',
      photoLabel: 'Foto der Station',
      photoRemoveLabel: 'Entfernen',
      cleanMessage: 'Der Forschungsplan entspricht der gespeicherten Version.',
      dirtyMessage: 'Änderungen am Forschungsplan sind noch nicht gespeichert.',
      revertLabel: 'Änderungen verwerfen',
      saveLabel: 'Forschungsplan speichern',
      savedLabel: 'Gespeichert',
    }
  }

  return {
    pageTitle: 'Survey deployment',
    description: 'Station, vessel and sampling window for the cruise plan.',
    progressLabel: (percent) => `${percent}%`,
    surveyTitleLabel: 'Survey title',
    stationCodeLabel: 'Station code',
    stationCodeHelp: 'Grid reference from the standing station register.',
    vesselLabel: 'Vessel',
    deploymentLabel: 'Deployment',
    deploymentHelp: 'First day gear enters the water.',
    recoveryLabel: 'Recovery',
    dailyStartLabel: 'Daily start',
    methodsLabel: 'Methods',
    methodInputLabel: 'Add a sampling method',
    methodInputPlaceholder: 'Add a sampling method',
    suggestedLabel: 'Suggested',
    methodRemoveLabel: (methodLabel) => `Remove ${methodLabel}`,
    leadCrewLabel: 'Lead crew',
    dataReleaseLabel: 'Data release',
    embargoRowLabel: 'Embargo',
    embargoLabel: 'Hold results for twelve months',
    photoLabel: 'Station photo',
    photoRemoveLabel: 'Remove',
    cleanMessage: 'Cruise plan matches the filed version.',
    dirtyMessage: 'Unsaved changes to the cruise plan.',
    revertLabel: 'Revert',
    saveLabel: 'Save plan',
    savedLabel: 'Saved',
  }
}

function optionLabels(
  locale: FormsForm1PreviewLocale,
  source: readonly { readonly id: string; readonly label: string }[],
): readonly { readonly id: string; readonly label: string }[] {
  if (locale === 'en') return source
  const translations: Readonly<Record<string, string>> = {
    'benthic-cores': 'Bodenkerne',
    'water-column': 'Wassersäule',
    'sediment-traps': 'Sedimentfallen',
    'coastal-survey-team': 'Küstenüberwachungsteam',
    'estuary-monitoring-team': 'Ästuar-Monitoringteam',
    'upland-transect-team': 'Höhenprofil-Team für ökologische Transekterhebungen',
    'institute-only': 'Nur das Institut',
    'institute-and-partners': 'Institut und Kooperationspartner',
    'open-data-portal': 'Öffentliches Forschungsdatenportal',
  }
  return source.map((choice) => ({ id: choice.id, label: translations[choice.id] ?? choice.label }))
}

export function createFormsForm1PreviewFixture(locale: FormsForm1PreviewLocale = 'en'): FormsForm1PreviewFixture {
  const copy = copyFor(locale)
  const methods = optionLabels(locale, sourceMethods)
  const leadCrews = optionLabels(locale, sourceLeadCrews)
  const dataReleaseOptions = optionLabels(locale, sourceDataReleaseOptions)
  const storeSeed: FormsForm1PreviewStoreSeed = {
    initialDraft: {
      surveyTitle: 'Halcyon Bank autumn sampling',
      stationCode: 'HB-14',
      vessel: 'RV Silverling',
      deployment: '2026-09-14',
      recovery: '2026-09-27',
      dailyStart: '06:30',
      methodIds: ['benthic-cores', 'water-column'],
      leadCrewId: 'coastal-survey-team',
      dataReleaseId: 'institute-and-partners',
      holdForTwelveMonths: true,
      stationPhoto: { id: 'station-photo', initials: 'HB' },
    },
    methods,
    leadCrews,
    dataReleaseOptions,
    methodListStrategy: 'content-grown',
  }

  return {
    locale,
    copy,
    storeSeed,
    contentFor: (state) => {
      const methodById = new Map(state.methods.map((method) => [method.id, method]))
      const selectedIds = new Set(state.draft.methodIds)
      const selected = state.draft.methodIds.flatMap((id) => {
        const method = methodById.get(id)
        return method ? [{ id, label: method.label, removeLabel: copy.methodRemoveLabel(method.label) }] : []
      })
      const suggestions = state.methods.filter((method) => !selectedIds.has(method.id)).map((method) => ({ ...method }))

      return {
        copy,
        surveyTitle: { label: copy.surveyTitleLabel, value: state.draft.surveyTitle },
        stationCode: {
          label: copy.stationCodeLabel,
          value: state.draft.stationCode,
          helper: copy.stationCodeHelp,
        },
        vessel: { label: copy.vesselLabel, value: state.draft.vessel },
        deployment: {
          label: copy.deploymentLabel,
          value: state.draft.deployment,
          helper: copy.deploymentHelp,
        },
        recovery: { label: copy.recoveryLabel, value: state.draft.recovery },
        dailyStart: { label: copy.dailyStartLabel, value: state.draft.dailyStart },
        completion: {
          percent: state.completionPercent,
          label: copy.progressLabel(state.completionPercent),
        },
        methods: {
          label: copy.methodsLabel,
          inputLabel: copy.methodInputLabel,
          inputPlaceholder: copy.methodInputPlaceholder,
          query: state.methodQuery,
          selected,
          suggestionsLabel: copy.suggestedLabel,
          suggestions,
        },
        leadCrew: {
          label: copy.leadCrewLabel,
          selectedId: state.draft.leadCrewId,
          choices: state.leadCrews.map((choice) => ({ ...choice })),
        },
        dataRelease: {
          label: copy.dataReleaseLabel,
          selectedId: state.draft.dataReleaseId,
          choices: state.dataReleaseOptions.map((choice) => ({ ...choice })),
        },
        embargo: {
          rowLabel: copy.embargoRowLabel,
          label: copy.embargoLabel,
          checked: state.draft.holdForTwelveMonths,
        },
        stationPhoto: {
          label: copy.photoLabel,
          initials: state.draft.stationPhoto?.initials,
          removeLabel: copy.photoRemoveLabel,
        },
        footer: {
          message: state.dirty ? copy.dirtyMessage : copy.cleanMessage,
          dirty: state.dirty,
          revertLabel: copy.revertLabel,
          saveButtonLabel: state.dirty ? copy.saveLabel : copy.savedLabel,
        },
        listStrategy: {
          kind: state.methodListStrategy,
          note: 'The short method-token list remains content-grown in normal flow.',
        },
      }
    },
  }
}
