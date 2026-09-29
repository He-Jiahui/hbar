import { describe, expect, test } from 'bun:test'
import { createOnboarding2PreviewFixture } from '../apps/hbar-app-ui-preview/src/onboarding2PreviewFixtures'
import { createOnboarding2PreviewStore } from '../apps/hbar-app-ui-preview/src/onboarding2PreviewStore'

describe('Onboarding 2 preview store', () => {
  test('projects the source-shaped Profile initial state and six stable step IDs', () => {
    const fixture = createOnboarding2PreviewFixture()
    const store = createOnboarding2PreviewStore(fixture.seed)
    const content = fixture.contentFor(store.getState())

    expect(content.currentStepId).toBe('profile')
    expect(content.narrowProgressText).toBe('Step 1 of 6')
    expect(content.steps.map((step) => step.id)).toEqual(['profile', 'role', 'source', 'workspace', 'goals', 'invite'])
    expect(content.steps.map((step) => step.status)).toEqual([
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
    ])
    expect(content.profileForm?.fields).toEqual([
      {
        id: 'full-name',
        label: 'Full name',
        placeholder: 'Your name',
        value: 'Sam Rivera',
      },
      {
        id: 'job-title',
        label: 'Job title',
        placeholder: 'What you do',
        value: 'Product Lead',
      },
    ])
    expect(content.roleForm).toBeNull()
    expect(content.collectionContract).toEqual({
      stepCount: 6,
      strategy: 'bounded-content-grown',
      narrowRail: 'hidden-with-step-counter',
      sourceScrollOwner: 'not-captured',
      horizontalOverflowEvidence: 'none-at-four-static-widths',
    })
  })

  test('keeps host-edited Profile values in the local draft without an unobserved length cap', () => {
    const fixture = createOnboarding2PreviewFixture()
    const store = createOnboarding2PreviewStore(fixture.seed)
    const longName = 'A'.repeat(2_048)

    expect(store.getState().setProfileFieldValue('full-name', longName)).toBe(true)
    expect(store.getState().profileDraft.fullName).toBe(longName)
    expect(store.getState().setProfileFieldValue('job-title', 'Product designer')).toBe(true)
    expect(store.getState().profileDraft.jobTitle).toBe('Product designer')
    expect(store.getState().setProfileFieldValue('job-title', 'Product designer')).toBe(false)
  })

  test('continues once from Profile to Role with Product selected and four source options', () => {
    const fixture = createOnboarding2PreviewFixture()
    const store = createOnboarding2PreviewStore(fixture.seed)

    expect(store.getState().continueProfile()).toBe(true)
    const content = fixture.contentFor(store.getState())

    expect(content.currentStepId).toBe('role')
    expect(content.narrowProgressText).toBe('Step 2 of 6')
    expect(content.steps.map((step) => step.status)).toEqual([
      'complete',
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
    ])
    expect(content.profileForm).toBeNull()
    expect(content.roleForm).toEqual({
      heading: 'What do you work on?',
      description: 'We use this to pick the starter views you land on.',
      groupLabel: 'Role',
      options: [
        { id: 'engineering', label: 'Engineering', selected: false },
        { id: 'design', label: 'Design', selected: false },
        { id: 'product', label: 'Product', selected: true },
        { id: 'operations', label: 'Operations', selected: false },
      ],
      backLabel: 'Back',
      continueLabel: 'Continue',
    })
    expect(store.getState().continueProfile()).toBe(false)
    expect(store.getState().currentStepId).toBe('role')
  })

  test('keeps Back, role changes, and navigation beyond observed steps request-only', () => {
    const fixture = createOnboarding2PreviewFixture()
    const store = createOnboarding2PreviewStore(fixture.seed)
    store.getState().continueProfile()

    expect(store.getState().requestRoleSelection('engineering')).toEqual({
      kind: 'role-selection-request',
      roleId: 'engineering',
      resultBehavior: 'typed-request-only-source-result-unobserved',
    })
    expect(store.getState().requestBack()).toEqual({
      kind: 'back-request',
      fromStepId: 'role',
      resultBehavior: 'typed-request-only-source-result-unobserved',
    })
    expect(store.getState().requestStepNavigation('invite')).toEqual({
      kind: 'step-navigation-request',
      targetStepId: 'invite',
      resultBehavior: 'typed-request-only-source-result-unobserved',
    })
    expect(store.getState().currentStepId).toBe('role')
    expect(store.getState().selectedRoleId).toBe('product')
  })

  test('rejects invalid IDs and actions from a stale step', () => {
    const fixture = createOnboarding2PreviewFixture()
    const store = createOnboarding2PreviewStore(fixture.seed)

    expect(store.getState().requestStepNavigation('unknown')).toBeNull()
    expect(store.getState().requestRoleSelection('unknown')).toBeNull()
    expect(store.getState().requestBack()).toBeNull()
    expect(store.getState().setProfileFieldValue('full-name', 'Updated name')).toBe(true)
    store.getState().continueProfile()
    expect(store.getState().setProfileFieldValue('full-name', 'Late profile edit')).toBe(false)
    expect(store.getState().requestStepNavigation('role')).toBeNull()
  })

  test('supports localized host copy and a long translation without truncating the six-step list', () => {
    const longDescription =
      'Wir verwenden diese Angabe, um die passenden Startansichten für Ihr Team sorgfältig und verständlich vorzubereiten.'
    const fixture = createOnboarding2PreviewFixture('de', { roleDescription: longDescription })
    const store = createOnboarding2PreviewStore(fixture.seed)

    expect(fixture.copy.progressText(1, 6)).toBe('Schritt 1 von 6')
    expect(fixture.contentFor(store.getState()).roleForm).toBeNull()
    store.getState().continueProfile()
    const roleContent = fixture.contentFor(store.getState()).roleForm

    expect(fixture.contentFor(store.getState()).steps).toHaveLength(6)
    expect(fixture.contentFor(store.getState()).steps.map((step) => step.id)).toHaveLength(
      new Set(fixture.contentFor(store.getState()).steps.map((step) => step.id)).size,
    )
    expect(roleContent?.description).toBe(longDescription)
    expect(roleContent?.options).toHaveLength(4)
    expect(roleContent?.options.find((option) => option.selected)?.id).toBe('product')
  })
})
