import { describe, expect, test } from 'bun:test'
import {
  FORMS10_LEGACY_FOLLOW_UP_COUNTER_LIMIT,
  FORMS10_MATRIX_CRITERION_IDS,
  FORMS10_MATRIX_RATING_IDS,
  FORMS10_NPS_SCORE_VALUES,
  createForms10PreviewStore,
  deriveForms10Progress,
} from '../apps/hbar-app-ui-preview/src/forms10PreviewStore'
import {
  FORMS10_SOURCE_EVIDENCE,
  createForms10PreviewFixture,
} from '../apps/hbar-app-ui-preview/src/forms10PreviewFixtures'

describe('Forms 10 preview store', () => {
  test('projects the source-shaped empty survey and marks Submit disabled initially', () => {
    const fixture = createForms10PreviewFixture()
    const store = createForms10PreviewStore()
    const content = fixture.contentFor(store.getState())

    expect(content.copy.pageTitle).toBe('How was your stay')
    expect(content.copy.pageDescription).toBe('A few questions about your recent visit.')
    expect(content.propertyId).toBeNull()
    expect(content.propertyCatalog.completeness).toBe('partial')
    expect(content.propertyCatalog.evidence).toBe('older-interaction-cache-hash-mismatch')
    expect(content.reservationReference).toBe('')
    expect(content.npsScore).toBeNull()
    expect(content.npsOptions).toEqual([...FORMS10_NPS_SCORE_VALUES])
    expect(content.matrixCriteria).toHaveLength(4)
    expect(content.matrixCriteria.every((criterion) => criterion.selectedRatingId === null)).toBe(true)
    expect(content.matrixRatingIds).toEqual([...FORMS10_MATRIX_RATING_IDS])
    expect(content.highlights).toHaveLength(6)
    expect(content.highlights.every((option) => !option.selected)).toBe(true)
    expect(content.followUp).toMatchObject({
      visible: false,
      required: false,
      value: '',
      characterCount: 0,
      counterLimit: 300,
      atOrBelowCounterDisplay: true,
      evidence: 'older-interaction-cache-hash-mismatch',
      counterLimitEvidence: 'older-interaction-cache-hash-mismatch',
      overCounterBehaviorEvidence: 'not-observed-local-count-only',
      hiddenDraftBehaviorEvidence: 'local-retention-not-source-observed',
    })
    expect(content.progress).toMatchObject({
      answered: 0,
      total: 7,
      remaining: 7,
      label: '0 / 7 answered',
      complete: false,
      dynamicQuestionCountEvidence: 'older-interaction-cache-hash-mismatch',
    })
    expect(content.submit).toEqual({
      disabled: true,
      resultBehavior: 'typed-host-request-only',
      enabledStateEvidence: 'inferred-from-completion; source-enabled-state-unobserved',
    })
    expect(store.getState().requestSubmit()).toBeNull()
    expect(content.collectionContract).toEqual({
      kind: 'content-grown',
      matrixCriterionCount: 4,
      highlightOptionCount: 6,
      highlightExclusivity: 'not-observed-no-exclusive-rule-applied',
      narrowScrollOwner: 'not-captured',
      matrixNarrowOverflow: 'local-horizontal-accessibility-scroll-source-owner-not-captured',
    })
  })

  test('derives the older-cache low-score branch and dynamic denominator with evidence labels', () => {
    const fixture = createForms10PreviewFixture()
    const store = createForms10PreviewStore()
    const actions = store.getState()

    expect(actions.setNpsScore(6)).toBe(true)
    let content = fixture.contentFor(store.getState())
    expect(content.progress).toMatchObject({
      answered: 1,
      total: 8,
      remaining: 7,
      label: '1 / 8 answered',
      dynamicQuestionCountEvidence: 'older-interaction-cache-hash-mismatch',
    })
    expect(content.followUp).toMatchObject({
      visible: true,
      required: true,
      characterCount: 0,
      counterLimit: 300,
    })
    expect(content.copy.followUpCharacterCount(0, 300)).toBe('0 / 300')

    expect(actions.setConditionalFollowUpText('The room was not ready on arrival.')).toBe(true)
    content = fixture.contentFor(store.getState())
    expect(content.followUp.characterCount).toBe('The room was not ready on arrival.'.length)
    expect(content.progress.answered).toBe(2)
    expect(content.progress.total).toBe(8)
    expect(content.copy.conditionalFollowUpRequiredHelper).toBe('Required because you scored 6 or below.')
    expect(store.getState().requestSubmit()).toBeNull()

    expect(actions.setNpsScore(7)).toBe(true)
    content = fixture.contentFor(store.getState())
    expect(content.followUp.visible).toBe(false)
    expect(content.progress.total).toBe(7)
    expect(content.progress.answered).toBe(1)
    expect(content.followUp.value).toBe('The room was not ready on arrival.')
    expect(actions.setNpsScore(6)).toBe(true)
    expect(fixture.contentFor(store.getState()).progress.total).toBe(8)
    expect(actions.setNpsScore(11)).toBe(false)
    expect(actions.setNpsScore(5.5)).toBe(false)
  })

  test('counts the optional reference separately and derives the four matrix and six checkbox answers', () => {
    const fixture = createForms10PreviewFixture()
    const store = createForms10PreviewStore()
    const actions = store.getState()

    expect(actions.setReservationReference('HC-48213')).toBe(true)
    expect(fixture.contentFor(store.getState()).progress.answered).toBe(0)
    expect(actions.setPropertyId('harbour-court-bristol')).toBe(true)
    expect(actions.setNpsScore(10)).toBe(true)
    for (const criterionId of FORMS10_MATRIX_CRITERION_IDS) {
      expect(actions.setMatrixRating(criterionId, 'good')).toBe(true)
    }
    expect(actions.setHighlightSelected('location', true)).toBe(true)
    expect(fixture.contentFor(store.getState()).progress).toMatchObject({
      answered: 7,
      total: 7,
      remaining: 0,
      complete: true,
    })
    expect(fixture.contentFor(store.getState()).highlights.find((item) => item.id === 'location')?.selected).toBe(true)
    expect(fixture.contentFor(store.getState()).matrixCriteria.map((item) => item.selectedRatingId)).toEqual([
      'good',
      'good',
      'good',
      'good',
    ])
  })

  test('exposes the 300-character counter without truncating host draft text past its boundary', () => {
    const fixture = createForms10PreviewFixture()
    const store = createForms10PreviewStore()
    const actions = store.getState()
    const atLimit = 'x'.repeat(FORMS10_LEGACY_FOLLOW_UP_COUNTER_LIMIT)

    actions.setNpsScore(0)
    expect(actions.setConditionalFollowUpText(atLimit)).toBe(true)
    let content = fixture.contentFor(store.getState())
    expect(content.followUp.characterCount).toBe(300)
    expect(content.followUp.atOrBelowCounterDisplay).toBe(true)
    expect(content.copy.followUpCharacterCount(content.followUp.characterCount, content.followUp.counterLimit)).toBe(
      '300 / 300',
    )
    expect(content.progress.answered).toBe(2)

    expect(actions.setConditionalFollowUpText(atLimit + 'y')).toBe(true)
    content = fixture.contentFor(store.getState())
    expect(content.followUp.value).toHaveLength(301)
    expect(content.followUp.characterCount).toBe(301)
    expect(content.followUp.atOrBelowCounterDisplay).toBe(false)
    expect(content.copy.followUpCharacterCount(301, 300)).toBe('301 / 300')
    expect(content.progress.answered).toBe(1)
    expect(content.progress.complete).toBe(false)
    expect(content.evidence.olderInteractionCache.matchesCurrentStaticHash).toBe(false)
  })

  test('validates stale matrix/highlight IDs while preserving the partial property catalog boundary', () => {
    const fixture = createForms10PreviewFixture()
    const store = createForms10PreviewStore()
    const actions = store.getState()

    expect(actions.setMatrixRating('unknown-criterion', 'good')).toBe(false)
    expect(actions.setMatrixRating('room-cleanliness', 'unknown-rating')).toBe(false)
    expect(actions.setHighlightSelected('unknown-highlight', true)).toBe(false)
    expect(actions.setMatrixRating('room-cleanliness', 'poor')).toBe(true)
    expect(actions.setMatrixRating('room-cleanliness', 'poor')).toBe(false)
    expect(actions.setHighlightSelected('location', true)).toBe(true)
    expect(actions.setHighlightSelected('location', true)).toBe(false)
    expect(actions.setHighlightSelected('nothing-in-particular', true)).toBe(true)
    expect(fixture.contentFor(store.getState()).selectedHighlightIds).toEqual(['location', 'nothing-in-particular'])

    expect(actions.setPropertyId('unlisted-property-id')).toBe(true)
    expect(fixture.contentFor(store.getState()).propertyCatalog.items).toHaveLength(4)
    expect(fixture.contentFor(store.getState()).propertyCatalog.completeness).toBe('partial')
    expect(actions.setPropertyId('  ')).toBe(false)
  })

  test('returns an immutable typed submit request only after the local required-answer model is complete', () => {
    const fixture = createForms10PreviewFixture()
    const store = createForms10PreviewStore()
    const actions = store.getState()

    expect(actions.requestSubmit()).toBeNull()
    actions.setPropertyId('harbour-court-bristol')
    actions.setNpsScore(8)
    for (const criterionId of FORMS10_MATRIX_CRITERION_IDS) {
      actions.setMatrixRating(criterionId, 'excellent')
    }
    actions.setHighlightSelected('location', true)

    const request = actions.requestSubmit()
    expect(request).toMatchObject({
      kind: 'submit-survey',
      draft: {
        propertyId: 'harbour-court-bristol',
        npsScore: 8,
        highlightIds: ['location'],
      },
    })
    if (!request) throw new Error('Expected a typed submit request.')
    actions.setPropertyId('the-old-mill-bath')
    expect(request.draft.propertyId).toBe('harbour-court-bristol')
    expect(store.getState().draft.propertyId).toBe('the-old-mill-bath')
    expect(deriveForms10Progress(store.getState().draft).isComplete).toBe(true)
    expect(fixture.contentFor(store.getState()).submit.resultBehavior).toBe('typed-host-request-only')
  })

  test('supplies localized host-owned copy and a deliberately long translation', () => {
    const fixture = createForms10PreviewFixture('de')
    const store = createForms10PreviewStore()
    const content = fixture.contentFor(store.getState())

    expect(content.copy.pageTitle).toBe('Wie war Ihr Aufenthalt?')
    expect(content.copy.pageDescription.length).toBeGreaterThan(100)
    expect(content.copy.answeredCount(1, 8)).toBe('1 / 8 beantwortet')
    expect(content.copy.questionsRemaining(3)).toBe('Noch 3 Fragen offen.')
    expect(content.copy.matrixCriterionLabels['room-cleanliness']).toBe('Das Zimmer war sauber und gepflegt')
    expect(content.copy.matrixRatingLabels['very-good']).toBe('Sehr gut')
    expect(content.copy.matrixOptionLabel('Das Zimmer war sauber und gepflegt', 'Schlecht')).toBe(
      'Das Zimmer war sauber und gepflegt: Schlecht',
    )
    expect(content.copy.highlightLabels['nothing-in-particular']).toBe('Nichts Besonderes')
    expect(content.propertyCatalog.items).toHaveLength(4)
    expect(content.progress.total).toBe(7)
  })

  test('records the evidence scope without presenting the old interaction hash as current-source proof', () => {
    const fixture = createForms10PreviewFixture()
    const content = fixture.contentFor(createForms10PreviewStore().getState())

    expect(content.evidence).toEqual(FORMS10_SOURCE_EVIDENCE)
    expect(content.evidence.currentStaticCache.sourceHash).toBe(
      '5336fea7167db5eeef5b278cad9d59d18401c8ea31c52d4d672db2c49ed45ef3',
    )
    expect(content.evidence.olderInteractionCache.matchesCurrentStaticHash).toBe(false)
    expect(content.evidence.sameHashInteractionCache.usefulStateChangeSamples).toBe(0)
    expect(content.progress.dynamicQuestionCountEvidence).toBe('older-interaction-cache-hash-mismatch')
    expect(content.followUp.evidence).toBe('older-interaction-cache-hash-mismatch')
  })
})
