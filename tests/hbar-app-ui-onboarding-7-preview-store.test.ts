import { describe, expect, test } from 'bun:test'
import {
  createOnboarding7PreviewFixture,
  ONBOARDING7_SOURCE_EVIDENCE,
} from '../apps/hbar-app-ui-preview/src/onboarding7PreviewFixtures'
import {
  createOnboarding7PreviewStore,
  ONBOARDING7_REGION_IDS,
} from '../apps/hbar-app-ui-preview/src/onboarding7PreviewStore'

describe('Onboarding 7 preview store', () => {
  test('projects the source form defaults, host copy, and three stable region choices', () => {
    const fixture = createOnboarding7PreviewFixture()
    const store = createOnboarding7PreviewStore(fixture.seed)
    const content = fixture.contentFor(store.getState())

    expect(content.labels).toEqual({
      title: 'Create your workspace',
      description: 'This is the container for your projects, documents and members.',
      workspaceName: 'Workspace name',
      workspaceNamePlaceholder: 'Acme',
      workspaceUrl: 'Workspace URL',
      workspaceUrlPlaceholder: 'workspace',
      memberReachHint: 'Members will reach it at northwind.app/northwind',
      dataRegion: 'Data region',
      regionPermanentHint: 'Region is permanent once the workspace is created.',
      privateWorkspace: 'Private workspace',
      privateWorkspaceDescription: 'Only invited members can find or join it.',
      back: 'Back',
      continue: 'Continue',
    })
    expect(content.workspaceName).toBe('Northwind')
    expect(content.slug).toBe('northwind')
    expect(content.urlPrefix).toBe('northwind.app/')
    expect(content.regionId).toBe('eu-central')
    expect(content.privateWorkspace).toBe(true)
    expect(content.regionOptions).toEqual([
      { id: 'us-east', label: 'United States (us-east)' },
      { id: 'eu-central', label: 'Europe (eu-central)' },
      { id: 'ap-southeast', label: 'Asia Pacific (ap-southeast)' },
    ])
    expect(content.regionOptions.map((option) => option.id)).toEqual([...ONBOARDING7_REGION_IDS])
    expect(new Set(content.regionOptions.map((option) => option.id)).size).toBe(3)
  })

  test('updates workspace name as an unbounded draft without coupling slug or URL copy', () => {
    const fixture = createOnboarding7PreviewFixture()
    const store = createOnboarding7PreviewStore(fixture.seed)
    const longName = 'Gemeinsam genutzter Arbeitsbereich '.repeat(30)

    store.getState().updateWorkspaceName('audit sample')
    expect(store.getState().workspaceName).toBe('audit sample')
    expect(store.getState().slug).toBe('northwind')
    expect(store.getState().urlPrefix).toBe('northwind.app/')

    store.getState().updateWorkspaceName(longName)
    expect(store.getState().workspaceName).toBe(longName)
    expect(store.getState().workspaceName.length).toBeGreaterThan(500)
  })

  test('selects only known region IDs and rejects an invalid option without changing state', () => {
    const fixture = createOnboarding7PreviewFixture()
    const store = createOnboarding7PreviewStore(fixture.seed)

    expect(store.getState().selectRegion('us-east')).toBe(true)
    expect(store.getState().regionId).toBe('us-east')
    expect(store.getState().selectRegion('unknown-region')).toBe(false)
    expect(store.getState().regionId).toBe('us-east')
    expect(store.getState().selectRegion('ap-southeast')).toBe(true)
    expect(store.getState().regionId).toBe('ap-southeast')
  })

  test('updates the private-workspace switch independently of the other form values', () => {
    const fixture = createOnboarding7PreviewFixture()
    const store = createOnboarding7PreviewStore(fixture.seed)

    store.getState().setPrivateWorkspace(false)
    expect(store.getState().privateWorkspace).toBe(false)
    expect(store.getState().workspaceName).toBe('Northwind')
    expect(store.getState().regionId).toBe('eu-central')

    store.getState().setPrivateWorkspace(true)
    expect(store.getState().privateWorkspace).toBe(true)
  })

  test('keeps slug derivation and Back/Continue outcomes as typed requests only', () => {
    const fixture = createOnboarding7PreviewFixture()
    const store = createOnboarding7PreviewStore(fixture.seed)
    const memberReachHint = fixture.contentFor(store.getState()).labels.memberReachHint

    expect(store.getState().requestSlugChange('northwind-team')).toEqual({
      kind: 'slug-change-request',
      value: 'northwind-team',
      resultBehavior: 'slug-preview-derivation-unverified',
    })
    expect(store.getState().requestBack()).toEqual({
      kind: 'back-request',
      resultBehavior: 'navigation-unverified',
    })
    expect(store.getState().requestContinue()).toEqual({
      kind: 'continue-request',
      resultBehavior: 'continue-or-workspace-creation-unverified',
    })
    expect(store.getState().slug).toBe('northwind')
    expect(fixture.contentFor(store.getState()).labels.memberReachHint).toBe(memberReachHint)
  })

  test('provides German long-copy fixtures without asserting an unobserved region cap or stepper scope', () => {
    const fixture = createOnboarding7PreviewFixture('de-long')
    const content = fixture.contentFor(createOnboarding7PreviewStore(fixture.seed).getState())

    expect(content.locale).toBe('de-long')
    expect(content.labels.title.length).toBeGreaterThan(80)
    expect(content.labels.description.length).toBeGreaterThan(100)
    expect(content.labels.privateWorkspaceDescription.length).toBeGreaterThan(80)
    expect(content.regionOptions.every((option) => option.label.length > 20)).toBe(true)
    expect(content.sourceBoundary).toEqual({
      regionCountObserved: 3,
      maximumRegionCount: 'not-tested',
      contentLayout: 'content-grown-normal-flow',
      scrollOwner: 'not-captured',
      slugChange: 'typed-request-only-derived-preview-unverified',
      stepper: 'context-visible-form-ax-scope-ambiguous',
    })
    expect(ONBOARDING7_SOURCE_EVIDENCE.staticCache.stepperScope).toEqual({
      contextImageVisible: true,
      formAxRootIncludesStepper: false,
      status: 'scope-ambiguous',
      contextLabels: ['Account', 'Workspace', 'Team', 'Finish'],
      contextCurrentStepId: 'workspace',
    })
  })

  test('records matching page hashes but separate capture inventories and comparator omissions', () => {
    const staticEvidence = ONBOARDING7_SOURCE_EVIDENCE.staticCache
    const interactionEvidence = ONBOARDING7_SOURCE_EVIDENCE.sameTargetHashInteractionCache

    expect(staticEvidence.sourceStatus).toBe(200)
    expect(interactionEvidence.targetSourceHashMatchesStatic).toBe(true)
    expect(interactionEvidence.sourceHash).toBe(staticEvidence.sourceHash)
    expect(interactionEvidence.sourceDirectoryHashMatchesStatic).toBe(false)
    expect(interactionEvidence.interactionReportHasImplementationHash).toBe(false)
    expect(interactionEvidence.interactionReportHasExplicitProtocol).toBe(false)
    expect(interactionEvidence.selectedSamples.workspaceNameFill).toMatchObject({
      before: 'Northwind',
      after: 'audit sample',
      sourceAxChanged: true,
      reportSummary: 'source-no-op',
    })
    expect(interactionEvidence.selectedSamples.dataRegionSelection).toMatchObject({
      beforeSelectedId: 'eu-central',
      afterSelectedId: 'us-east',
      sourceAxChanged: true,
      reportSummary: 'source-no-op',
    })
    expect(interactionEvidence.selectedSamples.privateWorkspaceToggle).toMatchObject({
      beforeChecked: true,
      afterChecked: false,
      sourceAxChanged: true,
      reportSummary: 'source-no-op',
    })
    expect(interactionEvidence.unverified).toEqual({
      slugEdit: 'not-sampled',
      derivedUrlAfterSlugEdit: 'not-observed',
      backNavigation: 'not-verified',
      continueOrWorkspaceCreationResult: 'not-verified',
    })
  })
})
