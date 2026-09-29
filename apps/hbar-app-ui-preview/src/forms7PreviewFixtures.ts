import {
  FORMS7_ATTACHMENT_LIMIT,
  FORMS7_REQUIRED_FIELD_COUNT,
  FORMS7_SUMMARY_CHARACTER_BUDGET,
  type Forms7Attachment,
  type Forms7Choice,
  type Forms7FundingTier,
  type Forms7PreviewStoreSeed,
  type Forms7PreviewStoreState,
} from './forms7PreviewStore'

export type Forms7PreviewLocale = 'en' | 'de'

export interface Forms7PreviewCopy {
  readonly pageTitle: string
  readonly pageDescription: string
  readonly requiredMarker: string
  readonly projectTitleLabel: string
  readonly projectTitlePlaceholder: string
  readonly organizationLabel: string
  readonly organizationPlaceholder: string
  readonly contactEmailLabel: string
  readonly contactEmailPlaceholder: string
  readonly focusAreaLabel: string
  readonly focusAreaPlaceholder: string
  readonly disciplineTagsLabel: string
  readonly disciplineTagsPlaceholder: string
  readonly disciplineTagsHelper: string
  readonly fundingTierLabel: string
  readonly projectSummaryLabel: string
  readonly projectSummaryPlaceholder: string
  readonly projectSummaryHelper: string
  readonly supportingDocumentsLabel: string
  readonly dropzoneLabel: string
  readonly attachmentsHelper: string
  readonly chooseFilesLabel: string
  readonly removeAttachmentLabel: (fileName: string) => string
  readonly removeTagLabel: (tagName: string) => string
  readonly consentLabel: string
  readonly saveDraftLabel: string
  readonly submitApplicationLabel: string
  readonly formatPercent: (value: number) => string
  readonly formatRequiredCompletion: (completed: number, total: number) => string
  readonly formatCharactersRemaining: (remaining: number) => string
}

export interface Forms7PreviewContent {
  readonly copy: Forms7PreviewCopy
  readonly draft: Forms7PreviewStoreState['draft']
  readonly focusAreas: readonly Forms7Choice[]
  readonly fundingTiers: readonly Forms7FundingTier[]
  readonly attachments: readonly Forms7Attachment[]
  readonly progress: {
    readonly percent: number
    readonly completedRequiredFields: number
    readonly totalRequiredFields: number
    readonly percentLabel: string
    readonly completionLabel: string
    readonly summaryCharactersRemaining: number
    readonly summaryCharactersRemainingLabel: string
  }
  readonly submitDisabled: boolean
  readonly attachmentList: {
    readonly kind: 'content-grown'
    readonly maximumCount: number
  }
}

export interface Forms7PreviewFixture {
  readonly locale: Forms7PreviewLocale
  readonly copy: Forms7PreviewCopy
  readonly storeSeed: Forms7PreviewStoreSeed
  readonly contentFor: (state: Forms7PreviewStoreState) => Forms7PreviewContent
}

const focusAreaIds = ['visual-arts', 'performing-arts', 'music-sound', 'literary-arts', 'community-media'] as const

const fundingTierIds = ['seed-grant', 'project-grant', 'residency-grant'] as const

function itemAt<Item>(items: readonly Item[], index: number): Item {
  const item = items[index]
  if (item === undefined) throw new RangeError(`Missing Forms 7 catalog item at index ${index}.`)
  return item
}

function copyFor(locale: Forms7PreviewLocale): Forms7PreviewCopy {
  if (locale === 'de') {
    return {
      pageTitle: 'Antrag für den Fonds zur Förderung gemeinnütziger Kunst- und Kulturprojekte in der Region',
      pageDescription: 'Erzählen Sie uns von Ihrem Projekt und der Unterstützung, die Sie benötigen.',
      requiredMarker: '*',
      projectTitleLabel: 'Projekttitel',
      projectTitlePlaceholder: 'Ein kurzer, einprägsamer Name',
      organizationLabel: 'Organisation oder Künstler:in',
      organizationPlaceholder: 'Wer den Antrag stellt',
      contactEmailLabel: 'Kontakt-E-Mail',
      contactEmailPlaceholder: 'sie@beispiel.org',
      focusAreaLabel: 'Schwerpunkt',
      focusAreaPlaceholder: 'Schwerpunkt auswählen',
      disciplineTagsLabel: 'Disziplinen',
      disciplineTagsPlaceholder: 'Tag eingeben und Enter drücken',
      disciplineTagsHelper: 'Mit Enter hinzufügen, mit Backspace den letzten Tag entfernen.',
      fundingTierLabel: 'Förderstufe',
      projectSummaryLabel: 'Projektbeschreibung',
      projectSummaryPlaceholder: 'Beschreiben Sie das Vorhaben, die Zielgruppe und den Förderbedarf.',
      projectSummaryHelper: 'Das Auswahlgremium liest diesen Abschnitt zuerst.',
      supportingDocumentsLabel: 'Unterlagen zur Unterstützung',
      dropzoneLabel: 'Dateien hier ablegen, um sie anzuhängen',
      attachmentsHelper: 'Budgets, Arbeitsproben oder Empfehlungsschreiben, bis zu 5 Dateien.',
      chooseFilesLabel: 'Dateien auswählen',
      removeAttachmentLabel: (fileName) => `${fileName} entfernen`,
      removeTagLabel: (tagName) => `${tagName} entfernen`,
      consentLabel:
        'Ich bestätige, dass die Angaben korrekt sind und ich berechtigt bin, den Antrag im Namen der Organisation einzureichen.',
      saveDraftLabel: 'Entwurf speichern',
      submitApplicationLabel: 'Antrag einreichen',
      formatPercent: (value) => `${value} %`,
      formatRequiredCompletion: (completed, total) => `${completed} von ${total} Pflichtfeldern ausgefüllt`,
      formatCharactersRemaining: (remaining) => `${remaining} Zeichen übrig`,
    }
  }

  return {
    pageTitle: 'Community arts fund application',
    pageDescription: 'Tell us about your project and the support you need.',
    requiredMarker: '*',
    projectTitleLabel: 'Project title',
    projectTitlePlaceholder: 'A short, memorable name',
    organizationLabel: 'Organization or artist',
    organizationPlaceholder: 'Who is applying',
    contactEmailLabel: 'Contact email',
    contactEmailPlaceholder: 'you@example.org',
    focusAreaLabel: 'Focus area',
    focusAreaPlaceholder: 'Select a focus area',
    disciplineTagsLabel: 'Discipline tags',
    disciplineTagsPlaceholder: 'Add a tag and press Enter',
    disciplineTagsHelper: 'Press Enter to add, Backspace to remove the last tag.',
    fundingTierLabel: 'Funding tier',
    projectSummaryLabel: 'Project summary',
    projectSummaryPlaceholder: 'Describe the work, who it reaches, and what the funding covers.',
    projectSummaryHelper: 'A panel reads this first.',
    supportingDocumentsLabel: 'Supporting documents',
    dropzoneLabel: 'Drag files here to attach',
    attachmentsHelper: 'Budgets, work samples or letters of support, up to 5 files.',
    chooseFilesLabel: 'Choose files',
    removeAttachmentLabel: (fileName) => `Remove ${fileName}`,
    removeTagLabel: (tagName) => `Remove ${tagName}`,
    consentLabel:
      'I confirm the information here is accurate and I am authorized to apply on behalf of the organization.',
    saveDraftLabel: 'Save draft',
    submitApplicationLabel: 'Submit application',
    formatPercent: (value) => `${value}%`,
    formatRequiredCompletion: (completed, total) => `${completed} of ${total} required fields complete`,
    formatCharactersRemaining: (remaining) => `${remaining} left`,
  }
}

function catalogsFor(locale: Forms7PreviewLocale): {
  readonly focusAreas: readonly Forms7Choice[]
  readonly fundingTiers: readonly Forms7FundingTier[]
} {
  const focusLabels =
    locale === 'de'
      ? ['Bildende Kunst', 'Darstellende Kunst', 'Musik und Klang', 'Literatur', 'Community-Medien']
      : ['Visual arts', 'Performing arts', 'Music and sound', 'Literary arts', 'Community media']
  const fundingCopy: readonly (readonly [string, string, string])[] =
    locale === 'de'
      ? [
          ['Startförderung', 'Frühe Vorhaben und Prototypen', '2.500 $'],
          ['Projektförderung', 'Eine vollständige Spielzeit oder Produktionsreihe', '10.000 $'],
          ['Residenzförderung', 'Ein geförderter Atelieraufenthalt', '25.000 $'],
        ]
      : [
          ['Seed grant', 'Early-stage work and prototypes', '$2,500'],
          ['Project grant', 'A full season or production run', '$10,000'],
          ['Residency grant', 'A funded studio placement', '$25,000'],
        ]

  return {
    focusAreas: focusAreaIds.map((id, index) => ({ id, label: itemAt(focusLabels, index) })),
    fundingTiers: fundingTierIds.map((id, index) => {
      const [label, description, amountLabel] = itemAt(fundingCopy, index)
      return { id, label, description, amountLabel }
    }),
  }
}

const initialAttachments: readonly Forms7Attachment[] = [
  { id: 'project-budget-2026', fileName: 'project-budget-2026.pdf', sizeLabel: '180 KB' },
  { id: 'community-letters-of-support', fileName: 'community-letters-of-support.pdf', sizeLabel: '940 KB' },
]

export function createForms7PreviewFixture(locale: Forms7PreviewLocale = 'en'): Forms7PreviewFixture {
  const copy = copyFor(locale)
  const catalogs = catalogsFor(locale)
  const storeSeed: Forms7PreviewStoreSeed = {
    initialDraft: {
      projectTitle: '',
      organization: '',
      contactEmail: '',
      focusAreaId: '',
      tagInput: '',
      tags: [],
      fundingTierId: '',
      summary: '',
      consentChecked: false,
    },
    focusAreas: catalogs.focusAreas,
    fundingTiers: catalogs.fundingTiers,
    attachments: initialAttachments,
    submitDisabled: true,
  }

  return {
    locale,
    copy,
    storeSeed,
    contentFor: (state) => {
      // Only summary text and consent have cached completion-state observations.
      // The remaining field validation/readiness rules are intentionally unmodeled.
      const completedRequiredFields = Number(state.draft.summary.length > 0) + Number(state.draft.consentChecked)
      const percent = Math.round((completedRequiredFields / FORMS7_REQUIRED_FIELD_COUNT) * 100)
      const summaryCharactersRemaining = FORMS7_SUMMARY_CHARACTER_BUDGET - state.draft.summary.length
      return {
        copy,
        draft: state.draft,
        focusAreas: state.focusAreas,
        fundingTiers: state.fundingTiers,
        attachments: state.attachments,
        progress: {
          percent,
          completedRequiredFields,
          totalRequiredFields: FORMS7_REQUIRED_FIELD_COUNT,
          percentLabel: copy.formatPercent(percent),
          completionLabel: copy.formatRequiredCompletion(completedRequiredFields, FORMS7_REQUIRED_FIELD_COUNT),
          summaryCharactersRemaining,
          summaryCharactersRemainingLabel: copy.formatCharactersRemaining(summaryCharactersRemaining),
        },
        submitDisabled: state.submitDisabled,
        attachmentList: { kind: 'content-grown', maximumCount: FORMS7_ATTACHMENT_LIMIT },
      }
    },
  }
}
