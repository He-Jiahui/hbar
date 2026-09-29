import { describe, expect, test } from 'bun:test'
import {
  FORMS11_DEFAULT_DESCRIPTION_COUNTER_LIMIT,
  FORMS11_ENVIRONMENT_KIND_IDS,
  FORMS11_REGION_IDS,
  createForms11PreviewStore,
  deriveForms11DraftValidity,
  deriveForms11Slug,
} from '../apps/hbar-app-ui-preview/src/forms11PreviewStore'
import {
  FORMS11_SOURCE_EVIDENCE,
  createForms11PreviewFixture,
} from '../apps/hbar-app-ui-preview/src/forms11PreviewFixtures'

describe('Forms 11 preview store', () => {
  test('projects the cached default dialog and keeps unobserved catalogs partial', () => {
    const fixture = createForms11PreviewFixture()
    const store = createForms11PreviewStore()
    const content = fixture.contentFor(store.getState())

    expect(content.copy.dialogTitle).toBe('New environment')
    expect(content.copy.dialogDescription).toBe('Provision an isolated place to deploy your app.')
    expect(content.environmentKind.selectedId).toBe('preview')
    expect(content.environmentKind.options.map((option) => option.id)).toEqual([...FORMS11_ENVIRONMENT_KIND_IDS])
    expect(content.environmentKind.options[0]).toEqual({
      id: 'preview',
      label: 'Preview',
      description: 'Created for each pull request and removed on merge. Best for reviewing changes in isolation.',
    })
    expect(content.environmentKind.options.slice(1).every((option) => option.description === null)).toBe(true)
    expect(content.name).toMatchObject({
      value: '',
      required: true,
      placeholder: 'e.g. Release candidate',
      slug: 'your-environment',
      deployTarget: 'Deploys to your-environment.yourapp.dev',
      hasRequiredValue: false,
      createEnabled: false,
      createGateEvidence: 'inferred-from-required-marker-and-cached-enabled-state',
      slugProjectionEvidence: 'single-space-containing-name-sample',
      slugAvailability: 'unobserved',
    })
    expect(content.region).toMatchObject({
      selectedId: 'us-east-n-virginia',
      optionCatalogEvidence: 'captured-open-menu-four-options',
    })
    expect(content.region.options.map((option) => option.id)).toEqual([...FORMS11_REGION_IDS])
    expect(content.region.options.map((option) => option.label)).toEqual([
      'US East (N. Virginia)',
      'US West (Oregon)',
      'Europe (Ireland)',
      'Asia Pacific (Sydney)',
    ])
    expect(content.copyVariables).toEqual({
      selectedId: 'none',
      options: [{ id: 'none', label: 'Start with no variables' }],
      catalogCompleteness: 'partial',
      catalogEvidence: 'default-only-source-menu-not-captured',
    })
    expect(content.autoDeployOnPush).toBe(true)
    expect(content.description).toEqual({
      value: '',
      characterCount: 0,
      counterLimit: 160,
      counterLabel: '0 / 160',
      overflowBehaviorEvidence: 'counter-visible-overflow-not-captured',
    })
    expect(content.actions).toEqual({
      createEnabled: false,
      createOutcome: 'typed-host-request-only',
      cancelOutcome: 'typed-host-request-only',
      closeOutcome: 'typed-host-request-only',
    })
    expect(store.getState().requestCreate()).toBeNull()
  })

  test('projects the cached name-to-slug response and returns an immutable create request only', () => {
    const fixture = createForms11PreviewFixture()
    const store = createForms11PreviewStore()
    const actions = store.getState()

    expect(actions.setName('audit sample')).toBe(true)
    const content = fixture.contentFor(store.getState())
    expect(content.name).toMatchObject({
      value: 'audit sample',
      slug: 'audit-sample',
      deployTarget: 'Deploys to audit-sample.yourapp.dev',
      hasRequiredValue: true,
      createEnabled: true,
      createGateEvidence: 'inferred-from-required-marker-and-cached-enabled-state',
      slugProjectionEvidence: 'single-space-containing-name-sample',
      slugAvailability: 'unobserved',
    })

    const request = actions.requestCreate()
    expect(request).toEqual({
      kind: 'create-environment',
      draft: {
        environmentKindId: 'preview',
        name: 'audit sample',
        regionId: 'us-east-n-virginia',
        copyVariablesFromId: 'none',
        autoDeployOnPush: true,
        description: '',
      },
    })
    expect(content.actions.createOutcome).toBe('typed-host-request-only')

    if (request?.kind !== 'create-environment') throw new Error('Expected a create-environment request.')
    actions.setName('Next environment')
    expect(request.draft.name).toBe('audit sample')
    expect(store.getState().draft.name).toBe('Next environment')
  })

  test('updates typed kind and auto-deploy choices without inventing unobserved kind-specific copy', () => {
    const fixture = createForms11PreviewFixture()
    const store = createForms11PreviewStore()
    const actions = store.getState()

    expect(actions.selectEnvironmentKind('staging')).toBe(true)
    expect(fixture.contentFor(store.getState()).environmentKind).toMatchObject({
      selectedId: 'staging',
      selectedDescription: null,
      alternateDescriptionEvidence: 'not-captured',
    })
    expect(actions.selectEnvironmentKind('unknown')).toBe(false)
    expect(actions.setAutoDeployOnPush(false)).toBe(true)
    expect(fixture.contentFor(store.getState()).autoDeployOnPush).toBe(false)
    expect(actions.setAutoDeployOnPush(false)).toBe(false)
    expect(actions.selectEnvironmentKind('production')).toBe(true)
    expect(fixture.contentFor(store.getState()).environmentKind.selectedDescription).toBeNull()
  })

  test('accepts only captured region IDs and leaves unobserved variable-source options partial', () => {
    const fixture = createForms11PreviewFixture()
    const store = createForms11PreviewStore()
    const actions = store.getState()

    expect(actions.setRegion('europe-ireland')).toBe(true)
    expect(fixture.contentFor(store.getState()).region.selectedId).toBe('europe-ireland')
    expect(actions.setRegion('moon-base')).toBe(false)
    expect(actions.setCopyVariablesFrom('')).toBe(false)
    expect(actions.setCopyVariablesFrom('environment:env-42')).toBe(true)
    expect(fixture.contentFor(store.getState()).copyVariables).toMatchObject({
      selectedId: 'environment:env-42',
      options: [{ id: 'none', label: 'Start with no variables' }],
      catalogCompleteness: 'partial',
      catalogEvidence: 'default-only-source-menu-not-captured',
    })
  })

  test('derives the advertised description counter without assuming overflow truncation', () => {
    const fixture = createForms11PreviewFixture()
    const store = createForms11PreviewStore()
    const actions = store.getState()
    const sampleDescription = 'audit sample'
    const overLimitDescription = 'x'.repeat(FORMS11_DEFAULT_DESCRIPTION_COUNTER_LIMIT + 1)

    expect(actions.setDescription(sampleDescription)).toBe(true)
    expect(fixture.contentFor(store.getState()).description).toMatchObject({
      value: sampleDescription,
      characterCount: 12,
      counterLimit: 160,
      counterLabel: '12 / 160',
    })
    expect(actions.setDescription(overLimitDescription)).toBe(true)
    expect(fixture.contentFor(store.getState()).description).toMatchObject({
      value: overLimitDescription,
      characterCount: 161,
      counterLabel: '161 / 160',
      overflowBehaviorEvidence: 'counter-visible-overflow-not-captured',
    })
    actions.setName('Description case')
    expect(store.getState().requestCreate()).toMatchObject({ kind: 'create-environment' })
  })

  test('keeps Cancel and Close as host requests with no fabricated dialog outcome', () => {
    const store = createForms11PreviewStore()
    const actions = store.getState()
    actions.setName('Review build')
    const before = store.getState().draft

    expect(actions.requestCancel()).toEqual({ kind: 'cancel' })
    expect(actions.requestClose()).toEqual({ kind: 'close' })
    expect(store.getState().draft).toEqual(before)
  })

  test('provides host-owned localized copy without treating German strings as source evidence', () => {
    const fixture = createForms11PreviewFixture('de')
    const store = createForms11PreviewStore()
    const content = fixture.contentFor(store.getState())

    expect(fixture.locale).toBe('de')
    expect(fixture.localeEvidence).toBe('english-from-cache; non-english-fixture-copy-not-source-verified')
    expect(content.copy.dialogTitle).toBe('Neue Umgebung')
    expect(content.copy.environmentKindLabels.production).toBe('Produktion')
    expect(content.copy.deployTarget('audit-sample')).toBe('Bereitstellung unter audit-sample.yourapp.dev')
    expect(content.copy.descriptionCounter(12, 160)).toBe('12 / 160')
  })

  test('records same-source-hash legacy caches and narrow-flow evidence without labeling them a fresh audit', () => {
    const content = createForms11PreviewFixture().contentFor(createForms11PreviewStore().getState())

    expect(content.evidence).toEqual(FORMS11_SOURCE_EVIDENCE)
    expect(content.evidence.currentStaticCache.sourceHash).toBe(
      '8293f15254c41900462f4217db84609b14706c77b3d5acbbce1db0e34a0023d2',
    )
    expect(content.evidence.sameHashInteractionCache.sourceHash).toBe(content.evidence.currentStaticCache.sourceHash)
    expect(content.evidence.sameHashInteractionCache.captureProtocol).toBe('legacy-unversioned')
    expect(content.evidence.olderInteractionCache.matchesCurrentStaticHash).toBe(false)
    expect(content.evidence.staticViews.light.stress).toMatchObject({
      width: 222,
      horizontalOverflow: false,
      truncatedTextCount: 2,
    })
    expect(content.evidence.staticViews.narrowFlowEvidence).toBe(
      'stress-capture-has-truncated-content-scroll-owner-not-captured',
    )
    expect(content.evidence.liveSource).toEqual({
      browserToolStatus: 'url-inaccessible',
      usedAsCurrentStrictEvidence: false,
    })
  })

  test('derives only a local slug candidate and requires non-empty input for the request gate', () => {
    const store = createForms11PreviewStore()

    expect(deriveForms11Slug('  Audit sample  ')).toBe('audit-sample')
    expect(deriveForms11DraftValidity(store.getState().draft)).toMatchObject({
      normalizedSlug: '',
      hasRequiredName: false,
      canRequestCreate: false,
    })
    expect(store.getState().setName('   ')).toBe(true)
    expect(store.getState().requestCreate()).toBeNull()
    expect(store.getState().setName('Release candidate')).toBe(true)
    expect(store.getState().requestCreate()).toMatchObject({
      kind: 'create-environment',
      draft: { name: 'Release candidate' },
    })
  })
})
