import { describe, expect, test } from 'bun:test'
import {
  createOnboarding6PreviewFixture,
  ONBOARDING6_SOURCE_EVIDENCE,
} from '../apps/hbar-app-ui-preview/src/onboarding6PreviewFixtures'
import {
  createOnboarding6PreviewStore,
  ONBOARDING6_SUMMARY_IDS,
} from '../apps/hbar-app-ui-preview/src/onboarding6PreviewStore'

describe('Onboarding 6 preview store', () => {
  test('projects four stable source summary rows, copy, decorative mark, and distinct CTAs', () => {
    const fixture = createOnboarding6PreviewFixture()
    const store = createOnboarding6PreviewStore(fixture.seed)
    const content = fixture.contentFor(store.getState())

    expect(content.labels.title).toBe('Your workspace is ready')
    expect(content.labels.description).toBe(
      "We've set everything up from your answers. All of it is editable from workspace settings.",
    )
    expect(content.summaryRows).toEqual([
      { id: 'workspace', label: 'Workspace', value: 'Northwind' },
      { id: 'members-invited', label: 'Members invited', value: '4' },
      { id: 'starter-template', label: 'Starter template', value: 'Sprint board' },
      { id: 'plan', label: 'Plan', value: 'Team trial, 14 days' },
    ])
    expect(content.labels.openWorkspace).toBe('Open workspace')
    expect(content.labels.takeTour).toBe('Take the two-minute tour')
    expect(content.labels.inboxNote).toBe('A copy of your setup summary is in your inbox.')
    expect(content.completionMark).toEqual({
      kind: 'checkmark',
      semanticRole: 'decorative-success',
      ariaHidden: true,
      accessibleName: null,
    })
    expect(content.summaryRows.map((row) => row.id)).toEqual([...ONBOARDING6_SUMMARY_IDS])
  })

  test('emits separate request-only CTA intents without navigating or changing summary data', () => {
    const fixture = createOnboarding6PreviewFixture()
    const store = createOnboarding6PreviewStore(fixture.seed)
    const originalValues = store.getState().summaryValues

    expect(store.getState().requestOpenWorkspace()).toEqual({
      kind: 'open-workspace-request',
      resultBehavior: 'workspace-navigation-unverified',
    })
    expect(store.getState().requestTakeTour()).toEqual({
      kind: 'take-tour-request',
      resultBehavior: 'tour-navigation-unverified',
    })
    expect(store.getState().summaryValues).toEqual(originalValues)
    expect(fixture.contentFor(store.getState()).summaryRows.map((row) => row.value)).toEqual([
      'Northwind',
      '4',
      'Sprint board',
      'Team trial, 14 days',
    ])
  })

  test('records the interaction-cache no-op and leaves unobserved outcomes unverified', () => {
    const evidence = ONBOARDING6_SOURCE_EVIDENCE.sameTargetHashInteractionCache

    expect(evidence.openWorkspaceSample).toEqual({
      actions: ['hover', 'focus', 'click', 'press-enter', 'press-space'],
      result: 'source-no-op',
      sourceChanged: false,
      localChanged: false,
      axBeforeAfter: 'identical-in-captured-click-snapshots',
    })
    expect(evidence.unverified).toEqual({
      takeTourAction: 'not-sampled',
      openWorkspaceNavigationOutsideFrame: 'not-observed',
      inboxDelivery: 'not-observed',
      scrollOwner: 'not-captured',
    })
    expect(evidence.sourceHash).toBe(ONBOARDING6_SOURCE_EVIDENCE.staticCache.sourceHash)
    expect(evidence.sourceDirectoryHashMatchesStatic).toBe(false)
  })

  test('keeps all four summary values and long German copy in content-grown flow without inventing a limit', () => {
    const fixture = createOnboarding6PreviewFixture('de-long')
    const content = fixture.contentFor(createOnboarding6PreviewStore(fixture.seed).getState())

    expect(content.locale).toBe('de-long')
    expect(content.summaryRows).toHaveLength(4)
    expect(content.summaryContract).toEqual({
      observedRowCount: 4,
      maximumRowCount: 'not-observed',
      layout: 'content-grown-normal-flow',
      sourceHorizontalOverflow: false,
      sourceStressTruncatedTextCount: 0,
      sourceScrollOwner: 'not-captured',
    })
    expect(content.labels.title.length).toBeGreaterThan(80)
    expect(content.labels.description.length).toBeGreaterThan(100)
    expect(content.labels.openWorkspace.length).toBeGreaterThan(50)
    expect(content.summaryRows[0]?.value.length).toBeGreaterThan(40)
    expect(content.summaryRows[2]?.value.length).toBeGreaterThan(50)
    expect(content.summaryRows.map((row) => row.id)).toEqual([...ONBOARDING6_SUMMARY_IDS])
  })
})
