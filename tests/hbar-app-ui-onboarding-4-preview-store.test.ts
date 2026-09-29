import { describe, expect, test } from 'bun:test'
import { createOnboarding4PreviewFixture } from '../apps/hbar-app-ui-preview/src/onboarding4PreviewFixtures'
import {
  ONBOARDING4_MAX_TEAM_SIZES,
  ONBOARDING4_MAX_USE_CASES,
  ONBOARDING4_TEAM_SIZE_IDS,
  ONBOARDING4_USE_CASE_IDS,
  createOnboarding4PreviewStore,
} from '../apps/hbar-app-ui-preview/src/onboarding4PreviewStore'

describe('Onboarding 4 preview store', () => {
  test('projects the source-shaped step, six radios, four size buttons, and initial choices', () => {
    const fixture = createOnboarding4PreviewFixture()
    const store = createOnboarding4PreviewStore(fixture.seed)
    const content = fixture.contentFor(store.getState())

    expect(content.step).toEqual({ current: 2, total: 4, label: 'Step 2 of 4' })
    expect(content.labels.heading).toBe('What will you use this for first?')
    expect(content.useCases.map((item) => item.id)).toEqual([...ONBOARDING4_USE_CASE_IDS])
    expect(content.useCases.map((item) => item.checked)).toEqual([false, true, false, false, false, false])
    expect(content.useCases[0]?.accessibleName).toBe(
      'Plan a roadmap Quarterly themes, dated milestones and a view leadership can read.',
    )
    expect(content.selectedUseCaseId).toBe('run-sprints')
    expect(content.teamSizes.map((item) => item.id)).toEqual([...ONBOARDING4_TEAM_SIZE_IDS])
    expect(content.teamSizes.map((item) => item.pressed)).toEqual([false, true, false, false])
    expect(content.selectedTeamSizeId).toBe('2-10')
    expect(content.actions).toEqual({
      backLabel: 'Back',
      continueLabel: 'Continue',
      backEnabled: true,
      continueEnabled: true,
    })
    expect(content.collectionContract).toEqual({
      maxUseCases: 6,
      maxTeamSizes: 4,
      strategy: 'bounded-content-grown',
      sourceNarrowBehavior: 'one-column-with-controls-below-640px-viewport',
      sourceScrollOwner: 'not-captured',
      localNarrowBehavior: 'normal-flow-with-reachable-controls',
      horizontalOverflowEvidence: 'none-at-four-static-widths',
    })
  })

  test('changes the team-size pressed state to Just me while preserving Run sprints', () => {
    const fixture = createOnboarding4PreviewFixture()
    const store = createOnboarding4PreviewStore(fixture.seed)

    expect(store.getState().selectTeamSize('just-me')).toBe(true)
    const content = fixture.contentFor(store.getState())

    expect(content.teamSizes.map((item) => item.pressed)).toEqual([true, false, false, false])
    expect(content.selectedTeamSizeId).toBe('just-me')
    expect(content.selectedUseCaseId).toBe('run-sprints')
    expect(content.useCases.find((item) => item.checked)?.id).toBe('run-sprints')
    expect(store.getState().selectTeamSize('just-me')).toBe(false)
    expect(store.getState().selectTeamSize('unknown')).toBe(false)
  })

  test('keeps use-case changes request-only and records only the exact cached no-op sample', () => {
    const fixture = createOnboarding4PreviewFixture()
    const store = createOnboarding4PreviewStore(fixture.seed)

    expect(store.getState().requestUseCaseSelection('plan-roadmap')).toEqual({
      kind: 'use-case-selection-request',
      useCaseId: 'plan-roadmap',
      resultBehavior: 'typed-request-only-selection-result-unverified',
      cachedSample: 'plan-roadmap-source-no-op',
    })
    expect(store.getState().requestUseCaseSelection('report-delivery')).toEqual({
      kind: 'use-case-selection-request',
      useCaseId: 'report-delivery',
      resultBehavior: 'typed-request-only-selection-result-unverified',
      cachedSample: 'no-source-state-change-captured',
    })
    expect(store.getState().requestUseCaseSelection('run-sprints')).toBeNull()
    expect(fixture.contentFor(store.getState()).selectedUseCaseId).toBe('run-sprints')
  })

  test('keeps Back and Continue as typed requests without faking step navigation', () => {
    const fixture = createOnboarding4PreviewFixture()
    const store = createOnboarding4PreviewStore(fixture.seed)
    store.getState().selectTeamSize('just-me')

    expect(store.getState().requestBack()).toEqual({
      kind: 'back-request',
      fromStepId: 'use-case',
      resultBehavior: 'typed-request-only-navigation-result-unverified',
    })
    expect(store.getState().requestContinue()).toEqual({
      kind: 'continue-request',
      fromStepId: 'use-case',
      useCaseId: 'run-sprints',
      teamSizeId: 'just-me',
      resultBehavior: 'typed-request-only-navigation-result-unverified',
    })
    expect(store.getState().selectedUseCaseId).toBe('run-sprints')
    expect(store.getState().selectedTeamSizeId).toBe('just-me')
  })

  test('handles empty, one-item, six-item, over-capacity, duplicate, and stale IDs', () => {
    const emptyFixture = createOnboarding4PreviewFixture('en', { useCaseOrder: [] })
    const emptyStore = createOnboarding4PreviewStore(emptyFixture.seed)
    const emptyContent = emptyFixture.contentFor(emptyStore.getState())

    expect(emptyContent.useCases).toEqual([])
    expect(emptyContent.labels.emptyUseCasesText).toBe('No use cases are available.')
    expect(emptyContent.selectedUseCaseId).toBeNull()
    expect(emptyStore.getState().requestUseCaseSelection('plan-roadmap')).toBeNull()

    const oneFixture = createOnboarding4PreviewFixture('en', { useCaseOrder: ['plan-roadmap'] })
    const oneStore = createOnboarding4PreviewStore(oneFixture.seed)
    expect(oneFixture.contentFor(oneStore.getState()).useCases).toHaveLength(1)
    expect(oneStore.getState().selectedUseCaseId).toBeNull()

    const cappedStore = createOnboarding4PreviewStore({
      useCaseIds: [
        'plan-roadmap',
        'plan-roadmap',
        'run-sprints',
        'triage-requests',
        'write-things-down',
        'automate-handoffs',
        'report-delivery',
        'unknown-use-case',
      ],
      initialUseCaseId: 'run-sprints',
      teamSizeIds: ['just-me', '2-10', '2-10', '11-50', '50-plus', 'unknown-size'],
      initialTeamSizeId: '2-10',
    })

    expect(cappedStore.getState().useCaseIds).toHaveLength(ONBOARDING4_MAX_USE_CASES)
    expect(cappedStore.getState().useCaseIds).toEqual([...ONBOARDING4_USE_CASE_IDS])
    expect(cappedStore.getState().teamSizeIds).toHaveLength(ONBOARDING4_MAX_TEAM_SIZES)
    expect(cappedStore.getState().teamSizeIds).toEqual([...ONBOARDING4_TEAM_SIZE_IDS])
    expect(cappedStore.getState().requestUseCaseSelection('unknown-use-case')).toBeNull()
    expect(cappedStore.getState().requestUseCaseSelection('removed-use-case')).toBeNull()
    expect(cappedStore.getState().selectTeamSize('unknown-size')).toBe(false)
  })

  test('targets requests by stable use-case ID after the displayed list order changes', () => {
    const fixture = createOnboarding4PreviewFixture('en', {
      useCaseOrder: ['report-delivery', 'run-sprints', 'plan-roadmap'],
    })
    const store = createOnboarding4PreviewStore(fixture.seed)
    const content = fixture.contentFor(store.getState())

    expect(content.useCases.map((item) => item.id)).toEqual(['report-delivery', 'run-sprints', 'plan-roadmap'])
    expect(content.useCases.find((item) => item.checked)?.id).toBe('run-sprints')
    expect(store.getState().requestUseCaseSelection('report-delivery')).toEqual({
      kind: 'use-case-selection-request',
      useCaseId: 'report-delivery',
      resultBehavior: 'typed-request-only-selection-result-unverified',
      cachedSample: 'no-source-state-change-captured',
    })
  })

  test('keeps long German localized option copy intact', () => {
    const longTitle = 'Lieferfähigkeit und teamübergreifende Abläufe ausführlich auswerten'
    const longDescription =
      'Erkennen Sie über mehrere Projekte hinweg Zykluszeit, Durchsatz, Wartephasen und die tatsächlichen Engpässe in der Zusammenarbeit.'
    const fixture = createOnboarding4PreviewFixture('de', {
      useCaseCopy: {
        'report-delivery': {
          title: longTitle,
          description: longDescription,
        },
      },
      teamSizeCopy: {
        'just-me': 'Zunächst nur ich, mit einer späteren Möglichkeit das Team zu erweitern',
      },
    })
    const store = createOnboarding4PreviewStore(fixture.seed)
    const content = fixture.contentFor(store.getState())
    const reportOption = content.useCases.find((item) => item.id === 'report-delivery')

    expect(content.step.label).toBe('Schritt 2 von 4')
    expect(content.labels.teamSizeLegend).toBe('Wie viele Personen werden Teil Ihres Teams?')
    expect(reportOption?.title).toBe(longTitle)
    expect(reportOption?.description).toBe(longDescription)
    expect(reportOption?.accessibleName).toBe(`${longTitle} ${longDescription}`)
    expect(store.getState().selectTeamSize('just-me')).toBe(true)
    expect(fixture.contentFor(store.getState()).teamSizes[0]?.label).toBe(
      'Zunächst nur ich, mit einer späteren Möglichkeit das Team zu erweitern',
    )
  })
})
