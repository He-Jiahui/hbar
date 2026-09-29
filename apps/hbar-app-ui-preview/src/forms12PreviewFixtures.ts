import {
  FORMS12_CONSENT_IDS,
  FORMS12_FIELD_IDS_BY_SECTION,
  FORMS12_PREMIUM_LINE_IDS,
  FORMS12_SECTION_IDS,
  FORMS12_STEP_IDS,
  type Forms12ConsentId,
  type Forms12FieldId,
  type Forms12PreviewStoreState,
  type Forms12PremiumLineId,
  type Forms12SectionId,
  type Forms12StepId,
} from './forms12PreviewStore'

export type Forms12PreviewLocale = 'en' | 'de'
export type Forms12EditorControlKind = 'textbox' | 'combobox' | 'spinbutton' | 'not-observed'
export type Forms12StepStatus = 'complete' | 'current' | 'upcoming'

export const FORMS12_SOURCE_EVIDENCE = {
  liveSource: {
    url: 'https://pro.reactbits.dev/docs/app-ui/forms/forms-12',
    status: 'unavailable-in-current-inspection',
    note: 'Browserless web open failed; no fresh source capture or replay was performed.',
  },
  staticCache: {
    cacheId: 'full-static-v9',
    generatedAt: '2026-09-23T00:35:35.423Z',
    sourceDirectoryHash: '1002db29123f63e0e0720879face71a82368b826bda86dcdbfe0e63396401ffd',
    sourceHash: '4434587bef024bb8048a3da8db49fbdf684e151e82fc4b1f4985a62a3ab1d863',
    sourceStatus: 200,
  },
  sameHashInteractionCache: {
    cacheId: 'full-interactions-v4',
    generatedAt: '2026-09-23T03:53:20.579Z',
    sourceDirectoryHash: '541173c8626322c7e7f1ee394249d862197bd60648bad30e3f37d42a60ce809a',
    sourceHash: '4434587bef024bb8048a3da8db49fbdf684e151e82fc4b1f4985a62a3ab1d863',
    schemaVersion: 1,
    protocol: 'no-explicit-protocol-field',
    evidence: {
      edit: 'Enter-and-Space-on-business-edit-captured-edit-fields-cancel-and-save-controls',
      consent: 'first-checkbox-checked-in-source-after-snapshot-comparator-did-not-detect-state',
      pointerEdit: 'click-capture-failed-overlay-interception',
      cancelSaveResult: 'not-captured',
      premiumRecalculation: 'not-captured',
      boundQuoteResult: 'not-activated-in-source-cache',
    },
  },
  olderInteractionCache: {
    cacheIds: ['full-interactions-v2', 'full-interactions-v3'],
    sourceHash: '6786812116596deb369fb6c311b8c2925a5871e05d0179ac5ce4b3bf5ca6dcee',
    matchesStaticHash: false,
  },
} as const

export const FORMS12_INITIAL_REVIEW_FIELDS = {
  'legal-business-name': 'Copperline Joinery Ltd',
  industry: 'Construction',
  'employee-count': '18',
  'cover-types': 'Public liability, Employers liability, Business interruption',
  'aggregate-limit': '£2,000,000',
  'primary-address': '14 Wharf Road, Manchester M1 2AB',
  territory: 'United Kingdom',
  'cover-start-date': '1 September 2026',
  'named-contact': 'Rebecca Nolan',
  email: 'rebecca@copperline.co.uk',
  phone: '+44 161 496 0208',
} as const

export const FORMS12_INITIAL_PREMIUM_SNAPSHOT = {
  currency: 'GBP',
  lines: [
    { id: 'base-premium', amountMinorUnits: 341000, formattedAmount: '£3,410.00' },
    { id: 'coverage-adjustments', amountMinorUnits: 101000, formattedAmount: '£1,010.00' },
    { id: 'multi-cover-discount', amountMinorUnits: -33150, formattedAmount: '-£331.50' },
  ],
  annualTotalMinorUnits: 408850,
  formattedAnnualTotal: '£4,088.50',
  recalculationEvidence: 'static-source-values-only-edited-result-unobserved',
} as const

const EDITOR_CONTROL_KIND: Readonly<Record<Forms12FieldId, Forms12EditorControlKind>> = {
  'legal-business-name': 'textbox',
  industry: 'combobox',
  'employee-count': 'spinbutton',
  'cover-types': 'not-observed',
  'aggregate-limit': 'not-observed',
  'primary-address': 'not-observed',
  territory: 'not-observed',
  'cover-start-date': 'not-observed',
  'named-contact': 'not-observed',
  email: 'not-observed',
  phone: 'not-observed',
}

export interface Forms12PreviewCopy {
  readonly stepLabels: Readonly<Record<Forms12StepId, string>>
  readonly sectionTitles: Readonly<Record<Forms12SectionId, string>>
  readonly summaryFieldLabels: Readonly<Record<Forms12FieldId, string>>
  readonly editorFieldLabels: Readonly<Record<Forms12FieldId, string>>
  readonly edit: string
  readonly cancel: string
  readonly saveSection: string
  readonly premiumHeading: string
  readonly premiumDescription: string
  readonly premiumLineLabels: Readonly<Record<Forms12PremiumLineId, string>>
  readonly annualTotal: string
  readonly consentLabels: Readonly<Record<Forms12ConsentId, string>>
  readonly requestBoundQuote: string
}

export interface Forms12PreviewStep {
  readonly id: Forms12StepId
  readonly label: string
  readonly status: Forms12StepStatus
}

export interface Forms12PreviewRow {
  readonly fieldId: Forms12FieldId
  readonly label: string
  readonly value: string
}

export interface Forms12PreviewEditorField {
  readonly fieldId: Forms12FieldId
  readonly label: string
  readonly value: string
  readonly controlKind: Forms12EditorControlKind
}

export interface Forms12PreviewSection {
  readonly id: Forms12SectionId
  readonly title: string
  readonly editLabel: string
  readonly editDisabled: boolean
  readonly editing: boolean
  readonly rows: readonly Forms12PreviewRow[]
  readonly editorFields: readonly Forms12PreviewEditorField[]
  readonly cancelLabel: string
  readonly saveLabel: string
  readonly editorEvidence: 'business-edit-cached-other-sections-unobserved'
}

export interface Forms12PreviewConsent {
  readonly id: Forms12ConsentId
  readonly label: string
  readonly checked: boolean
}

export interface Forms12PreviewContent {
  readonly locale: Forms12PreviewLocale
  readonly steps: readonly Forms12PreviewStep[]
  readonly stepperContract: {
    readonly structure: 'four-item-list'
    readonly navigationControlEvidence: 'no-stepper-control-observed'
  }
  readonly sections: readonly Forms12PreviewSection[]
  readonly premium: {
    readonly heading: string
    readonly description: string
    readonly lines: readonly {
      readonly id: Forms12PremiumLineId
      readonly label: string
      readonly amountMinorUnits: number
      readonly formattedAmount: string
    }[]
    readonly annualTotal: {
      readonly label: string
      readonly amountMinorUnits: number
      readonly formattedAmount: string
    }
    readonly currency: 'GBP'
    readonly recalculationEvidence: 'static-source-values-only-edited-result-unobserved'
  }
  readonly consents: readonly Forms12PreviewConsent[]
  readonly requestBoundQuote: {
    readonly label: string
    readonly disabled: true
    readonly enabledStateEvidence: 'static-initial-disabled; post-consent-state-unverified'
    readonly resultBehavior: 'typed-host-request-only-source-result-unobserved'
  }
  readonly collectionContract: {
    readonly sectionCount: 4
    readonly narrowFlow: 'local-natural-document-flow-source-scroll-owner-unverified'
    readonly horizontalOverflowEvidence: 'static-cache-none-at-all-four-viewports'
  }
  readonly evidence: typeof FORMS12_SOURCE_EVIDENCE
}

export interface Forms12PreviewFixture {
  readonly locale: Forms12PreviewLocale
  readonly copy: Forms12PreviewCopy
  readonly contentFor: (state: Forms12PreviewStoreState) => Forms12PreviewContent
}

function copyFor(locale: Forms12PreviewLocale): Forms12PreviewCopy {
  if (locale === 'de') {
    return {
      stepLabels: {
        business: 'Unternehmen',
        coverage: 'Versicherungsschutz',
        property: 'Immobilie',
        review: 'Überprüfung',
      },
      sectionTitles: {
        'business-details': 'Unternehmensdaten',
        coverage: 'Versicherungsschutz',
        'property-location': 'Immobilie und Standort',
        contact: 'Kontakt',
      },
      summaryFieldLabels: {
        'legal-business-name': 'Rechtlicher Unternehmensname',
        industry: 'Branche',
        'employee-count': 'Mitarbeitende',
        'cover-types': 'Versicherungsumfang',
        'aggregate-limit': 'Gesamtdeckungssumme',
        'primary-address': 'Hauptadresse',
        territory: 'Gebiet',
        'cover-start-date': 'Versicherungsbeginn',
        'named-contact': 'Kontaktperson',
        email: 'E-Mail',
        phone: 'Telefon',
      },
      editorFieldLabels: {
        'legal-business-name': 'Rechtlicher Unternehmensname',
        industry: 'Branche',
        'employee-count': 'Anzahl der Mitarbeitenden',
        'cover-types': 'Versicherungsumfang',
        'aggregate-limit': 'Gesamtdeckungssumme',
        'primary-address': 'Hauptadresse',
        territory: 'Gebiet',
        'cover-start-date': 'Versicherungsbeginn',
        'named-contact': 'Kontaktperson',
        email: 'E-Mail-Adresse',
        phone: 'Telefonnummer',
      },
      edit: 'Bearbeiten',
      cancel: 'Abbrechen',
      saveSection: 'Abschnitt speichern',
      premiumHeading: 'Prämie',
      premiumDescription: 'Wird anhand Ihrer Auswahl neu berechnet.',
      premiumLineLabels: {
        'base-premium': 'Grundprämie',
        'coverage-adjustments': 'Anpassungen des Versicherungsschutzes',
        'multi-cover-discount': 'Mehrfachversicherungsrabatt (7,5 %)',
      },
      annualTotal: 'Jahressumme',
      consentLabels: {
        'information-accuracy': 'Ich bestätige, dass die oben genannten Angaben nach bestem Wissen korrekt sind.',
        'policy-terms': 'Ich akzeptiere die Versicherungsbedingungen und die Sachverhaltsdarstellung.',
      },
      requestBoundQuote: 'Verbindliches Angebot anfordern',
    }
  }

  return {
    stepLabels: {
      business: 'Business',
      coverage: 'Coverage',
      property: 'Property',
      review: 'Review',
    },
    sectionTitles: {
      'business-details': 'Business details',
      coverage: 'Coverage',
      'property-location': 'Property and location',
      contact: 'Contact',
    },
    summaryFieldLabels: {
      'legal-business-name': 'Legal name',
      industry: 'Industry',
      'employee-count': 'Employees',
      'cover-types': 'Covers',
      'aggregate-limit': 'Aggregate limit',
      'primary-address': 'Primary address',
      territory: 'Territory',
      'cover-start-date': 'Cover start date',
      'named-contact': 'Named contact',
      email: 'Email',
      phone: 'Phone',
    },
    editorFieldLabels: {
      'legal-business-name': 'Legal business name',
      industry: 'Industry',
      'employee-count': 'Number of employees',
      'cover-types': 'Covers',
      'aggregate-limit': 'Aggregate limit',
      'primary-address': 'Primary address',
      territory: 'Territory',
      'cover-start-date': 'Cover start date',
      'named-contact': 'Named contact',
      email: 'Email',
      phone: 'Phone',
    },
    edit: 'Edit',
    cancel: 'Cancel',
    saveSection: 'Save section',
    premiumHeading: 'Premium',
    premiumDescription: 'Recalculated from your selections.',
    premiumLineLabels: {
      'base-premium': 'Base premium',
      'coverage-adjustments': 'Coverage adjustments',
      'multi-cover-discount': 'Multi-cover discount (7.5%)',
    },
    annualTotal: 'Annual total',
    consentLabels: {
      'information-accuracy': 'I confirm the information above is accurate to the best of my knowledge.',
      'policy-terms': 'I accept the policy terms and the statement of fact.',
    },
    requestBoundQuote: 'Request bound quote',
  }
}

function stepStatus(stepId: Forms12StepId): Forms12StepStatus {
  return stepId === 'review' ? 'current' : 'complete'
}

export function createForms12PreviewFixture(locale: Forms12PreviewLocale = 'en'): Forms12PreviewFixture {
  const copy = copyFor(locale)

  return {
    locale,
    copy,
    contentFor: (state) => {
      const sections = FORMS12_SECTION_IDS.map((sectionId) => {
        const editing = state.editingSectionId === sectionId
        const fieldIds = FORMS12_FIELD_IDS_BY_SECTION[sectionId]
        return {
          id: sectionId,
          title: copy.sectionTitles[sectionId],
          editLabel: copy.edit,
          editDisabled: state.editingSectionId !== null && !editing,
          editing,
          rows: fieldIds.map((fieldId) => ({
            fieldId,
            label: copy.summaryFieldLabels[fieldId],
            value: state.reviewFields[fieldId],
          })),
          editorFields:
            editing && state.editDraft
              ? fieldIds.map((fieldId) => ({
                  fieldId,
                  label: copy.editorFieldLabels[fieldId],
                  value: state.editDraft![fieldId],
                  controlKind: EDITOR_CONTROL_KIND[fieldId],
                }))
              : [],
          cancelLabel: copy.cancel,
          saveLabel: copy.saveSection,
          editorEvidence: 'business-edit-cached-other-sections-unobserved' as const,
        }
      })

      return {
        locale,
        steps: FORMS12_STEP_IDS.map((id) => ({
          id,
          label: copy.stepLabels[id],
          status: stepStatus(id),
        })),
        stepperContract: {
          structure: 'four-item-list',
          navigationControlEvidence: 'no-stepper-control-observed',
        },
        sections,
        premium: {
          heading: copy.premiumHeading,
          description: copy.premiumDescription,
          lines: FORMS12_PREMIUM_LINE_IDS.map((id) => {
            const snapshot = state.premium.lines.find((line) => line.id === id)
            return {
              id,
              label: copy.premiumLineLabels[id],
              amountMinorUnits: snapshot?.amountMinorUnits ?? 0,
              formattedAmount: snapshot?.formattedAmount ?? '',
            }
          }),
          annualTotal: {
            label: copy.annualTotal,
            amountMinorUnits: state.premium.annualTotalMinorUnits,
            formattedAmount: state.premium.formattedAnnualTotal,
          },
          currency: state.premium.currency,
          recalculationEvidence: state.premium.recalculationEvidence,
        },
        consents: FORMS12_CONSENT_IDS.map((id) => ({
          id,
          label: copy.consentLabels[id],
          checked: state.consents[id],
        })),
        requestBoundQuote: {
          label: copy.requestBoundQuote,
          disabled: true,
          enabledStateEvidence: 'static-initial-disabled; post-consent-state-unverified',
          resultBehavior: 'typed-host-request-only-source-result-unobserved',
        },
        collectionContract: {
          sectionCount: FORMS12_SECTION_IDS.length,
          narrowFlow: 'local-natural-document-flow-source-scroll-owner-unverified',
          horizontalOverflowEvidence: 'static-cache-none-at-all-four-viewports',
        },
        evidence: FORMS12_SOURCE_EVIDENCE,
      }
    },
  }
}
