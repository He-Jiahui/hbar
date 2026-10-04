import { describe, expect, test } from 'bun:test'
import {
  ONBOARDING1_TIMEZONE_IDS,
  createOnboarding1PreviewStore,
} from '../apps/hbar-app-ui-preview/src/onboarding1PreviewStore'
import {
  ONBOARDING1_SOURCE_EVIDENCE,
  createOnboarding1PreviewFixture,
} from '../apps/hbar-app-ui-preview/src/onboarding1PreviewFixtures'

describe('Onboarding 1 preview store', () => {
  test('projects the captured profile form, four timezones, and initial directory preview', () => {
    const fixture = createOnboarding1PreviewFixture()
    const store = createOnboarding1PreviewStore(fixture.initialDraft)
    const content = fixture.contentFor(store.getState())

    expect(content.copy.title).toBe('Set up your profile')
    expect(content.copy.introduction).toBe('Add the details teammates will see across the workspace.')
    expect(content.copy.photoRequirements).toBe('PNG or JPG, at least 400 × 400 px, up to 10 MB.')
    expect(content.form).toMatchObject({
      fullName: { value: 'Sam Rivera', requiredMarker: '*', placeholder: 'Your name' },
      jobTitle: { value: 'Product Engineer', placeholder: 'What you do' },
      timezone: { selectedId: 'berlin', placeholder: 'Select a timezone' },
      productUpdatesOptIn: true,
    })
    expect(content.form.timezone.options.map((option) => option.id)).toEqual([...ONBOARDING1_TIMEZONE_IDS])
    expect(content.form.timezone.options.map((option) => option.label)).toEqual([
      'Lisbon (GMT+0)',
      'Berlin (GMT+1)',
      'New York (GMT−5)',
      'Singapore (GMT+8)',
    ])
    expect(content.photoUpload).toEqual({
      acceptedFormatLabels: ['PNG', 'JPG'],
      minimumWidthPx: 400,
      minimumHeightPx: 400,
      maximumFileSizeMegabytes: 10,
      requestOutcomeEvidence: 'typed-host-request-only',
    })
    expect(content.continue).toEqual({
      enabledInCapturedDefault: true,
      emptyFieldGate: 'not-captured',
      outcomeEvidence: 'typed-host-request-only',
    })
    expect(content.directoryPreview).toMatchObject({
      title: 'Directory preview',
      avatarInitials: 'SR',
      fullName: 'Sam Rivera',
      jobTitle: 'Product Engineer',
      timezone: { label: 'Timezone', value: 'Berlin', valueEvidence: 'captured-default' },
      updates: {
        label: 'Updates',
        optedIn: true,
        value: 'Subscribed',
        valueEvidence: 'captured-subscribed-default',
      },
      postEditProjectionEvidence: 'inferred-from-live-preview-description; not-paired-in-cache',
    })
  })

  test('accepts observed profile edits and the captured timezone-placeholder selection', () => {
    const fixture = createOnboarding1PreviewFixture()
    const store = createOnboarding1PreviewStore(fixture.initialDraft)
    const actions = store.getState()

    expect(actions.setFullName('audit sample')).toBe(true)
    expect(actions.setFullName('audit sample')).toBe(false)
    expect(actions.setTimezoneId('')).toBe(true)
    expect(actions.setTimezoneId(null)).toBe(false)
    expect(actions.setTimezoneId('unknown-zone')).toBe(false)
    expect(actions.setProductUpdatesOptIn(false)).toBe(true)
    expect(actions.setProductUpdatesOptIn(false)).toBe(false)

    const content = fixture.contentFor(store.getState())
    expect(content.form.fullName.value).toBe('audit sample')
    expect(content.form.timezone.selectedId).toBeNull()
    expect(content.form.productUpdatesOptIn).toBe(false)
    expect(content.directoryPreview).toMatchObject({
      fullName: 'audit sample',
      avatarInitials: 'AS',
      timezone: { value: null, valueEvidence: 'not-captured' },
      updates: {
        optedIn: false,
        value: null,
        valueEvidence: 'unchecked-preview-not-captured',
      },
      postEditProjectionEvidence: 'inferred-from-live-preview-description; not-paired-in-cache',
    })
  })

  test('keeps job title editable without claiming a cached after-state', () => {
    const fixture = createOnboarding1PreviewFixture()
    const store = createOnboarding1PreviewStore(fixture.initialDraft)

    expect(store.getState().setJobTitle('Design systems lead')).toBe(true)
    expect(fixture.contentFor(store.getState()).form.jobTitle.value).toBe('Design systems lead')
    expect(ONBOARDING1_SOURCE_EVIDENCE.unverifiedBehavior).toContain('job-title fill result and empty-field validation')
  })

  test('returns typed photo and continue requests without changing state or inventing completion', () => {
    const fixture = createOnboarding1PreviewFixture()
    const store = createOnboarding1PreviewStore(fixture.initialDraft)
    const actions = store.getState()
    const continueRequest = actions.requestContinue()

    expect(actions.requestPhotoSelection()).toEqual({ kind: 'request-photo-selection' })
    expect(continueRequest).toEqual({ kind: 'continue-profile', draft: fixture.initialDraft })
    expect(store.getState().draft).toEqual(fixture.initialDraft)

    if (continueRequest.kind !== 'continue-profile') {
      throw new Error('Expected a typed continue-profile request.')
    }
    actions.setFullName('Later edit')
    expect(continueRequest.draft.fullName).toBe('Sam Rivera')
    expect(store.getState().draft.fullName).toBe('Later edit')
  })

  test('uses host-owned translated copy and accepts a deliberately long test label', () => {
    const longLabel = 'Vollständiger Name für alle Teammitglieder dieses Arbeitsbereichs'
    const fixture = createOnboarding1PreviewFixture('de', { fullNameLabel: longLabel })
    const store = createOnboarding1PreviewStore(fixture.initialDraft)
    const content = fixture.contentFor(store.getState())

    expect(fixture.locale).toBe('de')
    expect(content.localeEvidence).toBe('source-copy-english-only; german-is-test-fixture-copy')
    expect(content.copy.title).toBe('Profil einrichten')
    expect(content.copy.fullNameLabel).toBe(longLabel)
    expect(content.copy.continueLabel).toBe('Weiter')
  })

  test('records same-hash legacy evidence, narrow reachability, and the uncaptured scroll owner', () => {
    const fixture = createOnboarding1PreviewFixture()
    const content = fixture.contentFor(createOnboarding1PreviewStore(fixture.initialDraft).getState())
    const evidence = content.evidence

    expect(evidence.currentStaticCache.sourceHash).toBe(
      '2d34fb8f19ec4c1e4934800f987b1f426aea8446c744372cc4b4a1ef1b665a4a',
    )
    expect(evidence.sameHashInteractionCache.sourceHash).toBe(evidence.currentStaticCache.sourceHash)
    expect(evidence.currentStaticCache.protocolEvidence).toBe('legacy-schema-v1; captureProtocolVersion-not-present')
    expect(evidence.sameHashInteractionCache.capturedView).toEqual({
      theme: 'dark',
      viewport: 'mobile',
    })
    expect(evidence.staticViews.viewports.stress).toMatchObject({
      width: 286,
      height: 640,
      directoryPreviewVisible: false,
      horizontalOverflow: false,
      truncatedTextCount: 0,
      continueVisible: true,
    })
    expect(evidence.staticViews.scrollOwner).toBe('not-recorded; cached JSON has no scroll metrics')
    expect(evidence.liveSource.usedAsCurrentStrictEvidence).toBe(false)
    expect(evidence.unverifiedBehavior).toContain('Continue outcome beyond the captured unchanged Profile form')
  })
})
