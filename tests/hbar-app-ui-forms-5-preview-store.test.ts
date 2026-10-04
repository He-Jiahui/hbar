import { describe, expect, test } from 'bun:test'
import { createForms5PreviewFixture } from '../apps/hbar-app-ui-preview/src/forms5PreviewFixtures'
import {
  createForms5PreviewStore,
  deriveForms5PasswordRequirements,
  deriveForms5Validation,
} from '../apps/hbar-app-ui-preview/src/forms5PreviewStore'

function itemAt<Item>(items: readonly Item[], index: number): Item {
  const item = items[index]
  if (item === undefined) throw new RangeError(`Missing test item at index ${index}.`)
  return item
}

describe('Forms 5 preview store', () => {
  test('projects the observed blank baseline, defaults, and required-field gate', () => {
    const fixture = createForms5PreviewFixture()
    const store = createForms5PreviewStore(fixture.storeSeed)
    const content = fixture.contentFor(store.getState())

    expect(content.copy.pageTitle).toBe('Provision a workspace')
    expect(content.copy.pageDescription).toBe('Stand up a new tenant for your clinical scheduling account.')
    expect(content.organisationName.value).toBe('')
    expect(content.workspaceAddress.value).toBe('')
    expect(content.workspaceAddress.suffix).toBe('.med-sched.app')
    expect(content.adminEmail.value).toBe('')
    expect(content.password.value).toBe('')
    expect(content.confirmPassword.value).toBe('')
    expect(content.dataRegion.selectedId).toBe('eu-west-dublin')
    expect(content.plan.selectedId).toBe('group')
    expect(content.consent.checked).toBe(false)
    expect(content.createWorkspaceEnabled).toBe(false)
    expect(content.statusText).toBe('Complete every required field to continue.')
    expect(content.workspaceAddress.availability).toBeNull()
    expect(store.getState().requestCreateWorkspace()).toBeNull()
    expect(content.dataRegion.choices.map((choice) => choice.label)).toEqual([
      'EU West, Dublin',
      'EU Central, Frankfurt',
      'UK South, London',
      'US East, Virginia',
    ])
    expect(content.plan.choices.map((choice) => choice.priceLabel)).toEqual(['$49/mo', '$149/mo', '$420/mo'])
  })

  test('derives the observed password rules and matches confirmation', () => {
    const fixture = createForms5PreviewFixture()
    const store = createForms5PreviewStore(fixture.storeSeed)

    expect(deriveForms5PasswordRequirements('short')).toEqual({
      minimumLength: false,
      mixedCase: false,
      number: false,
      symbol: false,
    })
    expect(store.getState().setTextField('password', 'Preview-Only-2026!')).toBe(true)
    expect(store.getState().togglePasswordVisibility()).toBe(true)
    expect(fixture.contentFor(store.getState()).password.visible).toBe(true)
    expect(store.getState().setTextField('confirmPassword', 'Preview-Only-2026?')).toBe(true)
    expect(fixture.contentFor(store.getState()).confirmPassword.matches).toBe(false)
    expect(store.getState().setTextField('confirmPassword', 'Preview-Only-2026!')).toBe(true)

    const requirements = fixture.contentFor(store.getState()).password.requirements
    expect(Object.values(requirements).every(Boolean)).toBe(true)
    expect(store.getState().togglePasswordVisibility()).toBe(false)
    expect(fixture.contentFor(store.getState()).password.visible).toBe(false)
  })

  test('keeps availability host-owned and returns a request without a fake result', () => {
    const fixture = createForms5PreviewFixture()
    const store = createForms5PreviewStore(fixture.storeSeed)
    const state = store.getState()

    expect(state.setTextField('workspaceAddress', 'hbar-preview-lab')).toBe(true)
    expect(state.setAddressAvailability('hbar-preview-lab', 'available')).toBe(true)
    expect(fixture.contentFor(store.getState()).workspaceAddress.availability).toBe('Available')
    expect(state.setAddressAvailability('hbar-preview-lab', 'available')).toBe(false)
    expect(state.setTextField('workspaceAddress', 'Hbar-preview-lab')).toBe(true)
    expect(store.getState().addressAvailability).toBe('unchecked')
    expect(store.getState().addressAvailabilityMessage).toBeNull()
    expect(fixture.contentFor(store.getState()).workspaceAddress.valid).toBe(false)
    expect(state.setAddressAvailability('hbar-preview-lab', 'unavailable')).toBe(false)
    expect(state.setAddressAvailability('Hbar-preview-lab', 'unavailable')).toBe(true)
    expect(fixture.contentFor(store.getState()).workspaceAddress.availability).toBeNull()
    expect(store.getState().requestCreateWorkspace()).toBeNull()
  })

  test('enables creation only after fields, password rules, address, and consent are valid', () => {
    const fixture = createForms5PreviewFixture()
    const store = createForms5PreviewStore(fixture.storeSeed)
    const actions = store.getState()

    actions.setTextField('organisationName', 'Preview Clinic Workspace')
    actions.setTextField('workspaceAddress', 'hbar-preview-lab')
    actions.setTextField('adminEmail', 'preview@example.test')
    actions.setTextField('password', 'Preview-Only-2026!')
    actions.setTextField('confirmPassword', 'Preview-Only-2026!')
    actions.setConsent(true)
    actions.setAddressAvailability('hbar-preview-lab', 'available')

    const content = fixture.contentFor(store.getState())
    expect(content.createWorkspaceEnabled).toBe(true)
    expect(content.statusText).toBe('Everything checks out. You are ready to provision.')
    expect(actions.requestCreateWorkspace()).toEqual({
      ...fixture.storeSeed.initialDraft,
      organisationName: 'Preview Clinic Workspace',
      workspaceAddress: 'hbar-preview-lab',
      adminEmail: 'preview@example.test',
      password: 'Preview-Only-2026!',
      confirmPassword: 'Preview-Only-2026!',
      consentConfirmed: true,
    })
    expect(store.getState().addressAvailability).toBe('available')
  })

  test('updates region and plan by stable IDs and rejects stale choices', () => {
    const fixture = createForms5PreviewFixture()
    const store = createForms5PreviewStore(fixture.storeSeed)

    expect(store.getState().selectRegion('uk-south-london')).toBe(true)
    expect(store.getState().selectRegion('uk-south-london')).toBe(false)
    expect(store.getState().selectRegion('stale-region')).toBe(false)
    expect(store.getState().selectPlan('network')).toBe(true)
    expect(store.getState().selectPlan('stale-plan')).toBe(false)
    const content = fixture.contentFor(store.getState())
    expect(content.dataRegion.selectedId).toBe('uk-south-london')
    expect(itemAt(content.dataRegion.choices, 2).label).toBe('UK South, London')
    expect(content.plan.selectedId).toBe('network')
    expect(itemAt(content.plan.choices, 2).description).toBe('Unlimited sites with SSO and audit logs.')
  })

  test('keeps localized copy and long plan labels host-owned', () => {
    const fixture = createForms5PreviewFixture('de')
    const store = createForms5PreviewStore(fixture.storeSeed)
    const content = fixture.contentFor(store.getState())
    const longPlan = itemAt(content.plan.choices, 2)

    expect(content.copy.pageTitle).toBe('Arbeitsbereich bereitstellen')
    expect(content.copy.workspaceAddressHelper).toBe('Kleinbuchstaben, Ziffern und Bindestriche.')
    expect(longPlan.label).toBe('Gesundheitsnetzwerk für mehrere Standorte')
    expect(longPlan.priceLabel).toBe('420 $/Monat')
    expect(content.listStrategy.kind).toBe('pane-scroll')
  })

  test('rejects duplicate catalogs and unavailable initial selections', () => {
    const fixture = createForms5PreviewFixture()

    expect(() =>
      createForms5PreviewStore({
        ...fixture.storeSeed,
        regions: [itemAt(fixture.storeSeed.regions, 0), itemAt(fixture.storeSeed.regions, 0)],
      }),
    ).toThrow('Region IDs must be unique.')
    expect(() =>
      createForms5PreviewStore({
        ...fixture.storeSeed,
        initialDraft: { ...fixture.storeSeed.initialDraft, planId: 'unknown-plan' },
      }),
    ).toThrow('The initial plan must reference an available option.')
    expect(
      deriveForms5Validation(fixture.storeSeed.initialDraft, 'unchecked', fixture.storeSeed).canCreateWorkspace,
    ).toBe(false)
  })
})
