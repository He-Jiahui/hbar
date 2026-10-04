import type {
  Forms4ChoiceProperty,
  Forms4DateProperty,
  Forms4PreviewStoreState,
  Forms4Property,
  Forms4TextProperty,
} from './forms4PreviewStore'

export type Forms4PreviewLocale = 'en' | 'de'

export interface Forms4PreviewBadge {
  readonly label: string
  readonly tone: 'neutral' | 'danger'
}

export interface Forms4PreviewCopy {
  readonly pageTitle: string
  readonly pageDescription: string
  readonly badges: readonly Forms4PreviewBadge[]
  readonly addNoteLabel: string
  readonly editPropertyLabel: (propertyLabel: string) => string
  readonly savePropertyLabel: (propertyLabel: string) => string
  readonly cancelLabel: string
  readonly conditionTrackingLabel: string
  readonly telemetryEnabledLabel: string
  readonly manualChecksLabel: string
  readonly nextServiceDueLabel: string
  readonly calculatedLabel: string
}

export interface Forms4PreviewContent {
  readonly copy: Forms4PreviewCopy
  readonly properties: readonly Forms4Property[]
  readonly editing: Forms4PreviewStoreState['editing']
  readonly conditionTrackingEnabled: boolean
  readonly conditionTrackingValue: string
  readonly nextServiceDue: { readonly value: string; readonly calculatedLabel: string }
  readonly listStrategy: { readonly kind: 'content-grown'; readonly sourcePropertyCount: 9 }
}

export interface Forms4PreviewFixture {
  readonly locale: Forms4PreviewLocale
  readonly copy: Forms4PreviewCopy
  readonly storeSeed: {
    readonly properties: readonly Forms4Property[]
    readonly conditionTrackingEnabled: boolean
  }
  readonly contentFor: (state: Forms4PreviewStoreState) => Forms4PreviewContent
}

function sourceProperties(locale: Forms4PreviewLocale): readonly Forms4Property[] {
  const textProperties: readonly Forms4TextProperty[] = [
    {
      id: 'assetTag',
      kind: 'text',
      label: locale === 'de' ? 'Anlagenkennzeichen' : 'Asset tag',
      value: 'EQ-20841',
      valueLabel: 'EQ-20841',
      icon: 'asset-tag',
    },
    {
      id: 'model',
      kind: 'text',
      label: locale === 'de' ? 'Modell' : 'Model',
      value: 'Atlas HG-40 compressor',
      valueLabel: 'Atlas HG-40 compressor',
      icon: 'model',
    },
    {
      id: 'site',
      kind: 'text',
      label: locale === 'de' ? 'Standort' : 'Site',
      value: 'Riverside plant',
      valueLabel: locale === 'de' ? 'Werk Riverside' : 'Riverside plant',
      icon: 'site',
    },
    {
      id: 'bayLocation',
      kind: 'text',
      label: locale === 'de' ? 'Hallenposition' : 'Bay location',
      value: 'Bay C, rack 14',
      valueLabel: locale === 'de' ? 'Halle C, Regal 14' : 'Bay C, rack 14',
      icon: 'bay-location',
    },
    {
      id: 'custodian',
      kind: 'text',
      label: locale === 'de' ? 'Verantwortlich' : 'Custodian',
      value: 'Priya Nandakumar',
      valueLabel: 'Priya Nandakumar',
      icon: 'custodian',
    },
  ]

  const dateProperties: readonly Forms4DateProperty[] = [
    {
      id: 'warrantyEnds',
      kind: 'date',
      label: locale === 'de' ? 'Garantie endet' : 'Warranty ends',
      value: '2026-05-30',
      valueLabel: locale === 'de' ? '30. Mai 2026' : '30 May 2026',
      icon: 'warranty',
    },
    {
      id: 'lastServiced',
      kind: 'date',
      label: locale === 'de' ? 'Zuletzt gewartet' : 'Last serviced',
      value: '2026-06-18',
      valueLabel: locale === 'de' ? '18. Juni 2026' : '18 Jun 2026',
      icon: 'last-serviced',
    },
  ]

  const choiceProperties: readonly Forms4ChoiceProperty[] = [
    {
      id: 'condition',
      kind: 'choice',
      label: locale === 'de' ? 'Zustand' : 'Condition',
      value: 'serviceable',
      valueLabel: locale === 'de' ? 'Einsatzfähig' : 'Serviceable',
      icon: 'condition',
      choices: [
        { id: 'excellent', label: locale === 'de' ? 'Ausgezeichnet' : 'Excellent' },
        { id: 'serviceable', label: locale === 'de' ? 'Einsatzfähig' : 'Serviceable' },
        { id: 'needs-repair', label: locale === 'de' ? 'Reparatur erforderlich' : 'Needs repair' },
        { id: 'out-of-service', label: locale === 'de' ? 'Außer Betrieb' : 'Out of service' },
      ],
    },
    {
      id: 'serviceInterval',
      kind: 'choice',
      label: locale === 'de' ? 'Wartungsintervall' : 'Service interval',
      value: '90-days',
      valueLabel: locale === 'de' ? 'Alle 90 Tage' : 'Every 90 days',
      icon: 'service-interval',
      choices: [
        { id: '30-days', label: locale === 'de' ? 'Alle 30 Tage' : 'Every 30 days' },
        { id: '90-days', label: locale === 'de' ? 'Alle 90 Tage' : 'Every 90 days' },
        { id: '180-days', label: locale === 'de' ? 'Alle 180 Tage' : 'Every 180 days' },
        { id: '365-days', label: locale === 'de' ? 'Alle 365 Tage' : 'Every 365 days' },
      ],
    },
  ]

  return [
    textProperties[0],
    textProperties[1],
    textProperties[2],
    textProperties[3],
    choiceProperties[0],
    textProperties[4],
    dateProperties[0],
    dateProperties[1],
    choiceProperties[1],
  ].filter((property): property is Forms4Property => property !== undefined)
}

function copyFor(locale: Forms4PreviewLocale): Forms4PreviewCopy {
  const german = locale === 'de'
  return {
    pageTitle: german ? 'Anlagenakte' : 'Equipment record',
    pageDescription: german
      ? 'Klicken Sie auf eine Zeile, um sie zu bearbeiten. Jede Änderung wird einzeln gespeichert; es gibt keine Speicherleiste.'
      : 'Click a row to edit it. Each change saves on its own, there is no save bar.',
    badges: [
      { label: german ? 'Anlage' : 'Fixed asset', tone: 'neutral' },
      { label: german ? 'Wartung' : 'Maintenance', tone: 'neutral' },
      { label: german ? 'Garantie abgelaufen' : 'Warranty expired', tone: 'danger' },
    ],
    addNoteLabel: german ? 'Notiz hinzufügen' : 'Add note',
    editPropertyLabel: (propertyLabel) =>
      german ? `${propertyLabel} bearbeiten` : `Edit ${propertyLabel}`,
    savePropertyLabel: (propertyLabel) =>
      german ? `${propertyLabel} speichern` : `Save ${propertyLabel}`,
    cancelLabel: german ? 'Abbrechen' : 'Cancel',
    conditionTrackingLabel: german ? 'Zustandsüberwachung' : 'Condition tracking',
    telemetryEnabledLabel: german ? 'Sensor-Telemetrie aktiv' : 'Sensor telemetry on',
    manualChecksLabel: german ? 'Manuelle Prüfungen' : 'Manual checks only',
    nextServiceDueLabel: german ? 'Nächste Wartung fällig' : 'Next service due',
    calculatedLabel: german ? 'Berechnet' : 'Calculated',
  }
}

export function createForms4PreviewFixture(
  locale: Forms4PreviewLocale = 'en',
  properties: readonly Forms4Property[] = sourceProperties(locale),
): Forms4PreviewFixture {
  const copy = copyFor(locale)
  const storeSeed = { properties, conditionTrackingEnabled: true }
  return {
    locale,
    copy,
    storeSeed,
    contentFor: (state) => ({
      copy,
      properties: state.properties,
      editing: state.editing,
      conditionTrackingEnabled: state.conditionTrackingEnabled,
      conditionTrackingValue: state.conditionTrackingEnabled
        ? copy.telemetryEnabledLabel
        : copy.manualChecksLabel,
      nextServiceDue: {
        value: locale === 'de' ? '16. Sep. 2026' : '16 Sep 2026',
        calculatedLabel: copy.calculatedLabel,
      },
      listStrategy: { kind: 'content-grown', sourcePropertyCount: 9 },
    }),
  }
}
