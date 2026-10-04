import {
  FORMS10_HIGHLIGHT_IDS,
  FORMS10_LEGACY_FOLLOW_UP_COUNTER_LIMIT,
  FORMS10_MATRIX_CRITERION_IDS,
  FORMS10_MATRIX_RATING_IDS,
  FORMS10_NPS_SCORE_VALUES,
  deriveForms10Progress,
  type Forms10HighlightId,
  type Forms10MatrixCriterionId,
  type Forms10MatrixRatingId,
  type Forms10NpsScore,
  type Forms10PreviewStoreState,
} from './forms10PreviewStore'

export type Forms10PreviewLocale = 'en' | 'de'

export const FORMS10_SOURCE_EVIDENCE = {
  currentStaticCache: {
    cacheId: 'full-static-v10',
    sourceHash: '5336fea7167db5eeef5b278cad9d59d18401c8ea31c52d4d672db2c49ed45ef3',
    capturedInitialQuestionCount: 7,
  },
  sameHashInteractionCache: {
    cacheId: 'full-interactions-v4',
    sourceHash: '5336fea7167db5eeef5b278cad9d59d18401c8ea31c52d4d672db2c49ed45ef3',
    usefulStateChangeSamples: 0,
    protocolEvidence: 'legacy-unversioned',
  },
  olderInteractionCache: {
    cacheId: 'full-interactions-v3',
    sourceHash: '0790928ea6b74a41b30c79a0d3fcc7e6b5b2ba3b8fa263121dfdf5b3371140bb',
    matchesCurrentStaticHash: false,
  },
} as const

export interface Forms10PropertyOption {
  readonly id: string
  readonly label: string
}

export interface Forms10PreviewCopy {
  readonly pageTitle: string
  readonly pageDescription: string
  readonly answeredCount: (answered: number, total: number) => string
  readonly questionsRemaining: (remaining: number) => string
  readonly requiredMarker: string
  readonly propertyLabel: string
  readonly propertyPlaceholder: string
  readonly reservationReferenceLabel: string
  readonly reservationReferencePlaceholder: string
  readonly reservationReferenceHelper: string
  readonly recommendationLabel: string
  readonly recommendationLowEndpoint: string
  readonly recommendationHighEndpoint: string
  readonly npsOptionLabel: (score: number) => string
  readonly matrixHeading: string
  readonly matrixCriterionLabels: Readonly<Record<Forms10MatrixCriterionId, string>>
  readonly matrixRatingLabels: Readonly<Record<Forms10MatrixRatingId, string>>
  readonly matrixOptionLabel: (criterion: string, rating: string) => string
  readonly highlightsHeading: string
  readonly highlightLabels: Readonly<Record<Forms10HighlightId, string>>
  readonly conditionalFollowUpLabel: string
  readonly conditionalFollowUpPlaceholder: string
  readonly conditionalFollowUpRequiredHelper: string
  readonly followUpCharacterCount: (count: number, limit: number) => string
  readonly submitLabel: string
}

export interface Forms10MatrixCriterionContent {
  readonly id: Forms10MatrixCriterionId
  readonly label: string
  readonly selectedRatingId: Forms10MatrixRatingId | null
}

export interface Forms10HighlightContent {
  readonly id: Forms10HighlightId
  readonly label: string
  readonly selected: boolean
}

export interface Forms10PreviewContent {
  readonly copy: Forms10PreviewCopy
  readonly propertyId: string | null
  readonly propertyCatalog: {
    readonly completeness: 'partial'
    readonly evidence: 'older-interaction-cache-hash-mismatch'
    readonly items: readonly Forms10PropertyOption[]
  }
  readonly reservationReference: string
  readonly npsScore: Forms10NpsScore | null
  readonly npsOptions: readonly Forms10NpsScore[]
  readonly matrixCriteria: readonly Forms10MatrixCriterionContent[]
  readonly matrixRatingIds: readonly Forms10MatrixRatingId[]
  readonly highlights: readonly Forms10HighlightContent[]
  readonly selectedHighlightIds: readonly Forms10HighlightId[]
  readonly followUp: {
    readonly visible: boolean
    readonly required: boolean
    readonly value: string
    readonly characterCount: number
    readonly counterLimit: number
    readonly atOrBelowCounterDisplay: boolean
    readonly evidence: 'older-interaction-cache-hash-mismatch'
    readonly counterLimitEvidence: 'older-interaction-cache-hash-mismatch'
    readonly overCounterBehaviorEvidence: 'not-observed-local-count-only'
    readonly hiddenDraftBehaviorEvidence: 'local-retention-not-source-observed'
  }
  readonly progress: {
    readonly answered: number
    readonly total: number
    readonly remaining: number
    readonly label: string
    readonly complete: boolean
    readonly completionRuleEvidence: 'local-derived-required-answer-model'
    readonly dynamicQuestionCountEvidence: 'older-interaction-cache-hash-mismatch'
  }
  readonly submit: {
    readonly disabled: boolean
    readonly resultBehavior: 'typed-host-request-only'
    readonly enabledStateEvidence: 'inferred-from-completion; source-enabled-state-unobserved'
  }
  readonly collectionContract: {
    readonly kind: 'content-grown'
    readonly matrixCriterionCount: 4
    readonly highlightOptionCount: 6
    readonly highlightExclusivity: 'not-observed-no-exclusive-rule-applied'
    readonly narrowScrollOwner: 'not-captured'
    readonly matrixNarrowOverflow: 'local-horizontal-accessibility-scroll-source-owner-not-captured'
  }
  readonly evidence: typeof FORMS10_SOURCE_EVIDENCE
}

export interface Forms10PreviewFixture {
  readonly locale: Forms10PreviewLocale
  readonly copy: Forms10PreviewCopy
  readonly propertyOptions: readonly Forms10PropertyOption[]
  readonly contentFor: (state: Forms10PreviewStoreState) => Forms10PreviewContent
}

const PROPERTY_OPTIONS_FROM_OLDER_CACHE: readonly Forms10PropertyOption[] = [
  { id: 'harbour-court-bristol', label: 'Harbour Court, Bristol' },
  { id: 'the-old-mill-bath', label: 'The Old Mill, Bath' },
  { id: 'west-quay-falmouth', label: 'West Quay, Falmouth' },
  { id: 'granary-house-york', label: 'Granary House, York' },
]

function copyFor(locale: Forms10PreviewLocale): Forms10PreviewCopy {
  if (locale === 'de') {
    return {
      pageTitle: 'Wie war Ihr Aufenthalt?',
      pageDescription:
        'Beantworten Sie einige Fragen zu Ihrem letzten Besuch, damit unser Team Ihren Aufenthalt besser verstehen und die nächsten Schritte nachvollziehen kann.',
      answeredCount: (answered, total) => answered + ' / ' + total + ' beantwortet',
      questionsRemaining: (remaining) =>
        remaining === 1 ? 'Noch 1 Frage offen.' : 'Noch ' + remaining + ' Fragen offen.',
      requiredMarker: '*',
      propertyLabel: 'Besuchte Unterkunft',
      propertyPlaceholder: 'Unterkunft auswählen',
      reservationReferenceLabel: 'Reservierungsnummer',
      reservationReferencePlaceholder: 'z. B. HC-48213',
      reservationReferenceHelper: 'Optional. Sie finden die Nummer in Ihrer Buchungsbestätigung.',
      recommendationLabel: 'Wie wahrscheinlich ist es, dass Sie uns weiterempfehlen?',
      recommendationLowEndpoint: '0: Würde ich nicht empfehlen',
      recommendationHighEndpoint: '10: Würde ich empfehlen',
      npsOptionLabel: (score) => score + ' von 10',
      matrixHeading: 'Bewerten Sie Folgendes',
      matrixCriterionLabels: {
        'room-cleanliness': 'Das Zimmer war sauber und gepflegt',
        'check-in-flow': 'Check-in und Check-out verliefen reibungslos',
        'staff-helpfulness': 'Das Personal war aufmerksam und hilfsbereit',
        breakfast: 'Das Frühstück entsprach Ihren Erwartungen',
      },
      matrixRatingLabels: {
        poor: 'Schlecht',
        fair: 'Mäßig',
        good: 'Gut',
        'very-good': 'Sehr gut',
        excellent: 'Ausgezeichnet',
      },
      matrixOptionLabel: (criterion, rating) => criterion + ': ' + rating,
      highlightsHeading: 'Was ist Ihnen besonders aufgefallen?',
      highlightLabels: {
        location: 'Die Lage',
        housekeeping: 'Die Zimmerreinigung',
        'front-desk-team': 'Das Rezeptionsteam',
        breakfast: 'Das Frühstück',
        'value-for-money': 'Das Preis-Leistungs-Verhältnis',
        'nothing-in-particular': 'Nichts Besonderes',
      },
      conditionalFollowUpLabel: 'Was hätte Ihren Aufenthalt verbessert?',
      conditionalFollowUpPlaceholder: 'Teilen Sie uns mit, was nicht gut lief.',
      conditionalFollowUpRequiredHelper: 'Erforderlich, weil Sie 6 oder weniger gewählt haben.',
      followUpCharacterCount: (count, limit) => count + ' / ' + limit + ' Zeichen',
      submitLabel: 'Feedback senden',
    }
  }

  return {
    pageTitle: 'How was your stay',
    pageDescription: 'A few questions about your recent visit.',
    answeredCount: (answered, total) => answered + ' / ' + total + ' answered',
    questionsRemaining: (remaining) => (remaining === 1 ? '1 question left.' : remaining + ' questions left.'),
    requiredMarker: '*',
    propertyLabel: 'Property visited',
    propertyPlaceholder: 'Select a property',
    reservationReferenceLabel: 'Reservation reference',
    reservationReferencePlaceholder: 'e.g. HC-48213',
    reservationReferenceHelper: 'Optional. Found on your booking email.',
    recommendationLabel: 'How likely are you to recommend us to a friend',
    recommendationLowEndpoint: '0: Would not recommend',
    recommendationHighEndpoint: '10: Would recommend',
    npsOptionLabel: (score) => score + ' out of 10',
    matrixHeading: 'Rate the following',
    matrixCriterionLabels: {
      'room-cleanliness': 'The room was clean and well kept',
      'check-in-flow': 'Check-in and check-out were smooth',
      'staff-helpfulness': 'Staff were attentive and helpful',
      breakfast: 'Breakfast met your expectations',
    },
    matrixRatingLabels: {
      poor: 'Poor',
      fair: 'Fair',
      good: 'Good',
      'very-good': 'Very good',
      excellent: 'Excellent',
    },
    matrixOptionLabel: (criterion, rating) => criterion + ': ' + rating,
    highlightsHeading: 'What stood out',
    highlightLabels: {
      location: 'The location',
      housekeeping: 'Housekeeping',
      'front-desk-team': 'The front desk team',
      breakfast: 'Breakfast',
      'value-for-money': 'Value for money',
      'nothing-in-particular': 'Nothing in particular',
    },
    conditionalFollowUpLabel: 'What would have made your stay better',
    conditionalFollowUpPlaceholder: 'Tell us what fell short so we can put it right.',
    conditionalFollowUpRequiredHelper: 'Required because you scored 6 or below.',
    followUpCharacterCount: (count, limit) => count + ' / ' + limit,
    submitLabel: 'Submit feedback',
  }
}

export function createForms10PreviewFixture(locale: Forms10PreviewLocale = 'en'): Forms10PreviewFixture {
  const copy = copyFor(locale)
  const propertyOptions = PROPERTY_OPTIONS_FROM_OLDER_CACHE.map((item) => ({ ...item }))

  return {
    locale,
    copy,
    propertyOptions,
    contentFor: (state) => {
      const draft = state.draft
      const progress = deriveForms10Progress(draft)
      return {
        copy,
        propertyId: draft.propertyId,
        propertyCatalog: {
          completeness: 'partial',
          evidence: 'older-interaction-cache-hash-mismatch',
          items: propertyOptions,
        },
        reservationReference: draft.reservationReference,
        npsScore: draft.npsScore,
        npsOptions: [...FORMS10_NPS_SCORE_VALUES],
        matrixCriteria: FORMS10_MATRIX_CRITERION_IDS.map((id) => ({
          id,
          label: copy.matrixCriterionLabels[id],
          selectedRatingId: draft.matrixAnswers[id],
        })),
        matrixRatingIds: [...FORMS10_MATRIX_RATING_IDS],
        highlights: FORMS10_HIGHLIGHT_IDS.map((id) => ({
          id,
          label: copy.highlightLabels[id],
          selected: draft.highlightIds.includes(id),
        })),
        selectedHighlightIds: draft.highlightIds,
        followUp: {
          visible: progress.followUpRequired,
          required: progress.followUpRequired,
          value: draft.conditionalFollowUpText,
          characterCount: draft.conditionalFollowUpText.length,
          counterLimit: FORMS10_LEGACY_FOLLOW_UP_COUNTER_LIMIT,
          atOrBelowCounterDisplay: progress.followUpAtOrBelowCounterDisplay,
          evidence: 'older-interaction-cache-hash-mismatch',
          counterLimitEvidence: 'older-interaction-cache-hash-mismatch',
          overCounterBehaviorEvidence: 'not-observed-local-count-only',
          hiddenDraftBehaviorEvidence: 'local-retention-not-source-observed',
        },
        progress: {
          answered: progress.answeredQuestionCount,
          total: progress.totalQuestionCount,
          remaining: progress.remainingQuestionCount,
          label: copy.answeredCount(progress.answeredQuestionCount, progress.totalQuestionCount),
          complete: progress.isComplete,
          completionRuleEvidence: 'local-derived-required-answer-model',
          dynamicQuestionCountEvidence: 'older-interaction-cache-hash-mismatch',
        },
        submit: {
          disabled: !progress.isComplete,
          resultBehavior: 'typed-host-request-only',
          enabledStateEvidence: 'inferred-from-completion; source-enabled-state-unobserved',
        },
        collectionContract: {
          kind: 'content-grown',
          matrixCriterionCount: FORMS10_MATRIX_CRITERION_IDS.length,
          highlightOptionCount: FORMS10_HIGHLIGHT_IDS.length,
          highlightExclusivity: 'not-observed-no-exclusive-rule-applied',
          narrowScrollOwner: 'not-captured',
          matrixNarrowOverflow: 'local-horizontal-accessibility-scroll-source-owner-not-captured',
        },
        evidence: FORMS10_SOURCE_EVIDENCE,
      }
    },
  }
}
