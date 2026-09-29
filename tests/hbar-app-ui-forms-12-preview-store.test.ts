import { describe, expect, test } from 'bun:test'
import {
  FORMS12_CONSENT_IDS,
  FORMS12_FIELD_IDS_BY_SECTION,
  FORMS12_SECTION_IDS,
  FORMS12_STEP_IDS,
  createForms12PreviewStore,
} from '../apps/hbar-app-ui-preview/src/forms12PreviewStore'
import {
  FORMS12_INITIAL_PREMIUM_SNAPSHOT,
  FORMS12_INITIAL_REVIEW_FIELDS,
  FORMS12_SOURCE_EVIDENCE,
  createForms12PreviewFixture,
} from '../apps/hbar-app-ui-preview/src/forms12PreviewFixtures'

function createStore() {
  return createForms12PreviewStore({
    reviewFields: FORMS12_INITIAL_REVIEW_FIELDS,
    premium: FORMS12_INITIAL_PREMIUM_SNAPSHOT,
  })
}

describe('Forms 12 preview store', () => {
  test('projects the four-step quote review and host-owned GBP premium snapshot', () => {
    const fixture = createForms12PreviewFixture()
    const store = createStore()
    const content = fixture.contentFor(store.getState())

    expect(FORMS12_STEP_IDS).toEqual(['business', 'coverage', 'property', 'review'])
    expect(content.steps.map(({ id }) => id)).toEqual([...FORMS12_STEP_IDS])
    expect(content.steps.map(({ status }) => status)).toEqual(['complete', 'complete', 'complete', 'current'])
    expect(content.stepperContract).toEqual({
      structure: 'four-item-list',
      navigationControlEvidence: 'no-stepper-control-observed',
    })

    expect(content.sections.map(({ id }) => id)).toEqual([...FORMS12_SECTION_IDS])
    expect(content.sections).toHaveLength(4)
    expect(content.sections[0]?.rows).toEqual([
      { fieldId: 'legal-business-name', label: 'Legal name', value: 'Copperline Joinery Ltd' },
      { fieldId: 'industry', label: 'Industry', value: 'Construction' },
      { fieldId: 'employee-count', label: 'Employees', value: '18' },
    ])
    expect(content.sections[3]?.rows.map(({ fieldId }) => fieldId)).toEqual(['named-contact', 'email', 'phone'])
    expect(content.sections.every(({ editing }) => !editing)).toBe(true)

    expect(content.premium.currency).toBe('GBP')
    expect(content.premium.lines.map(({ formattedAmount }) => formattedAmount)).toEqual([
      '£3,410.00',
      '£1,010.00',
      '-£331.50',
    ])
    expect(content.premium.annualTotal).toEqual({
      label: 'Annual total',
      amountMinorUnits: 408850,
      formattedAmount: '£4,088.50',
    })
    expect(content.premium.recalculationEvidence).toBe('static-source-values-only-edited-result-unobserved')
    expect(content.consents.map(({ id, checked }) => ({ id, checked }))).toEqual(
      FORMS12_CONSENT_IDS.map((id) => ({ id, checked: false })),
    )
    expect(content.requestBoundQuote).toMatchObject({
      label: 'Request bound quote',
      disabled: true,
      enabledStateEvidence: 'static-initial-disabled; post-consent-state-unverified',
      resultBehavior: 'typed-host-request-only-source-result-unobserved',
    })
    expect(content.collectionContract).toEqual({
      sectionCount: 4,
      narrowFlow: 'local-natural-document-flow-source-scroll-owner-unverified',
      horizontalOverflowEvidence: 'static-cache-none-at-all-four-viewports',
    })
    expect(content.evidence).toEqual(FORMS12_SOURCE_EVIDENCE)
    expect(store.getState().premium).toEqual(FORMS12_INITIAL_PREMIUM_SNAPSHOT)
  })

  test('Edit creates only a local section draft and does not rewrite review or premium values', () => {
    const fixture = createForms12PreviewFixture()
    const store = createStore()
    const actions = store.getState()

    expect(actions.beginSectionEdit('business-details')).toBe(true)
    expect(store.getState().editingSectionId).toBe('business-details')
    expect(store.getState().editDraft).toEqual(FORMS12_INITIAL_REVIEW_FIELDS)
    expect(actions.beginSectionEdit('coverage')).toBe(false)
    expect(actions.setDraftFieldValue('legal-business-name', 'Copperline Joinery Group Ltd')).toBe(true)
    expect(actions.setDraftFieldValue('employee-count', '24')).toBe(true)

    const content = fixture.contentFor(store.getState())
    expect(content.sections[0]).toMatchObject({
      id: 'business-details',
      editing: true,
      editDisabled: false,
      editorEvidence: 'business-edit-cached-other-sections-unobserved',
    })
    expect(content.sections[0]?.editorFields).toEqual([
      {
        fieldId: 'legal-business-name',
        label: 'Legal business name',
        value: 'Copperline Joinery Group Ltd',
        controlKind: 'textbox',
      },
      {
        fieldId: 'industry',
        label: 'Industry',
        value: 'Construction',
        controlKind: 'combobox',
      },
      {
        fieldId: 'employee-count',
        label: 'Number of employees',
        value: '24',
        controlKind: 'spinbutton',
      },
    ])
    expect(content.sections[0]?.rows[0]?.value).toBe('Copperline Joinery Ltd')
    expect(content.sections.slice(1).every(({ editDisabled }) => editDisabled)).toBe(true)
    expect(content.premium).toEqual(fixture.contentFor(createStore().getState()).premium)
    expect(store.getState().reviewFields).toEqual(FORMS12_INITIAL_REVIEW_FIELDS)
  })

  test('Cancel and Save return typed requests without committing or exiting edit mode', () => {
    const store = createStore()
    const actions = store.getState()

    expect(actions.requestCancelSectionEdit('business-details')).toBeNull()
    expect(actions.requestSaveSection('business-details')).toBeNull()
    expect(actions.beginSectionEdit('business-details')).toBe(true)
    expect(actions.setDraftFieldValue('industry', 'Manufacturing')).toBe(true)

    const saveRequest = actions.requestSaveSection('business-details')
    expect(saveRequest).toEqual({
      kind: 'save-section-request',
      section: {
        sectionId: 'business-details',
        values: {
          'legal-business-name': 'Copperline Joinery Ltd',
          industry: 'Manufacturing',
          'employee-count': '18',
        },
      },
      resultBehavior: 'typed-host-request-only-source-result-unobserved',
    })
    const cancelRequest = actions.requestCancelSectionEdit('business-details')
    expect(cancelRequest).toEqual({
      kind: 'cancel-section-edit-request',
      sectionId: 'business-details',
      resultBehavior: 'typed-host-request-only-source-result-unobserved',
    })
    expect(actions.requestSaveSection('coverage')).toBeNull()
    expect(store.getState().editingSectionId).toBe('business-details')
    expect(store.getState().reviewFields.industry).toBe('Construction')
    expect(store.getState().editDraft?.industry).toBe('Manufacturing')
    expect(store.getState().premium).toEqual(FORMS12_INITIAL_PREMIUM_SNAPSHOT)
  })

  test('consent changes stay local and bound-quote requests carry a snapshot without success state', () => {
    const store = createStore()
    const actions = store.getState()

    expect(actions.setConsentChecked('information-accuracy', true)).toBe(true)
    expect(actions.setConsentChecked('information-accuracy', true)).toBe(false)
    expect(actions.setConsentChecked('unknown-consent', true)).toBe(false)
    expect(store.getState().consents).toEqual({
      'information-accuracy': true,
      'policy-terms': false,
    })

    const request = actions.requestBoundQuote()
    expect(request).toEqual({
      kind: 'request-bound-quote',
      reviewFields: FORMS12_INITIAL_REVIEW_FIELDS,
      consents: { 'information-accuracy': true, 'policy-terms': false },
      premium: FORMS12_INITIAL_PREMIUM_SNAPSHOT,
      resultBehavior: 'typed-host-request-only-source-result-unobserved',
    })
    expect('success' in request).toBe(false)
    expect(store.getState().consents['information-accuracy']).toBe(true)
  })

  test('rejects invalid section, field, consent, and stale section IDs', () => {
    const store = createStore()
    const actions = store.getState()

    expect(actions.beginSectionEdit('unknown-section')).toBe(false)
    expect(actions.setDraftFieldValue('unknown-field', 'value')).toBe(false)
    expect(actions.setDraftFieldValue('industry', 'Manufacturing')).toBe(false)
    expect(actions.setConsentChecked('unknown-consent', true)).toBe(false)
    expect(actions.requestSaveSection('unknown-section')).toBeNull()
    expect(actions.requestCancelSectionEdit('unknown-section')).toBeNull()

    expect(actions.beginSectionEdit('coverage')).toBe(true)
    expect(actions.setDraftFieldValue('legal-business-name', 'Not part of coverage')).toBe(false)
    expect(actions.setDraftFieldValue('cover-types', 'Public liability')).toBe(true)
    expect(actions.requestSaveSection('business-details')).toBeNull()
    expect(FORMS12_FIELD_IDS_BY_SECTION.coverage).toEqual(['cover-types', 'aggregate-limit'])
  })

  test('preserves long host copy and draft data without truncation', () => {
    const fixture = createForms12PreviewFixture('de')
    const store = createStore()
    const actions = store.getState()
    const longBusinessName = 'Unternehmensbezeichnung-'.repeat(24)

    expect(fixture.copy.sectionTitles['property-location'].length).toBeGreaterThan(10)
    expect(fixture.copy.consentLabels['information-accuracy'].length).toBeGreaterThan(60)
    expect(actions.beginSectionEdit('business-details')).toBe(true)
    expect(actions.setDraftFieldValue('legal-business-name', longBusinessName)).toBe(true)

    const content = fixture.contentFor(store.getState())
    expect(content.sections[0]?.editorFields[0]?.value).toBe(longBusinessName)
    expect(content.sections[0]?.editorFields[0]?.value).toHaveLength(longBusinessName.length)
    expect(content.steps.map(({ label }) => label)).toEqual([
      'Unternehmen',
      'Versicherungsschutz',
      'Immobilie',
      'Überprüfung',
    ])
  })

  test('keeps premium as the host-owned GBP snapshot after draft edits', () => {
    const fixture = createForms12PreviewFixture()
    const store = createStore()
    const actions = store.getState()
    const initialPremium = fixture.contentFor(store.getState()).premium

    expect(actions.beginSectionEdit('business-details')).toBe(true)
    expect(actions.setDraftFieldValue('employee-count', '180')).toBe(true)
    expect(fixture.contentFor(store.getState()).premium).toEqual(initialPremium)
    expect(fixture.contentFor(store.getState()).premium.annualTotal.formattedAmount).toBe('£4,088.50')
    expect(fixture.contentFor(store.getState()).premium.recalculationEvidence).toBe(
      'static-source-values-only-edited-result-unobserved',
    )
  })
})
