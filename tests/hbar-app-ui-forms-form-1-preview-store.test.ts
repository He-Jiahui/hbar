import { describe, expect, test } from 'bun:test'
import { createFormsForm1PreviewFixture } from '../apps/hbar-app-ui-preview/src/formsForm1PreviewFixtures'
import { createFormsForm1PreviewStore } from '../apps/hbar-app-ui-preview/src/formsForm1PreviewStore'

function itemAt<Item>(items: readonly Item[], index: number): Item {
  const item = items[index]
  if (item === undefined) throw new RangeError(`Missing test item at index ${index}.`)
  return item
}

describe('Forms Form 1 preview store', () => {
  test('projects the verified filed baseline and ten-field completion meter', () => {
    const fixture = createFormsForm1PreviewFixture()
    const store = createFormsForm1PreviewStore(fixture.storeSeed)
    const initial = fixture.contentFor(store.getState())

    expect(initial.completion).toEqual({ percent: 100, label: '100%' })
    expect(initial.surveyTitle.value).toBe('Halcyon Bank autumn sampling')
    expect(initial.stationCode.value).toBe('HB-14')
    expect(initial.deployment.value).toBe('2026-09-14')
    expect(initial.recovery.value).toBe('2026-09-27')
    expect(initial.dailyStart.value).toBe('06:30')
    expect(initial.methods.selected.map((method) => method.id)).toEqual(['benthic-cores', 'water-column'])
    expect(initial.methods.suggestions.map((method) => method.id)).toEqual(['sediment-traps'])
    expect(initial.footer.message).toBe('Cruise plan matches the filed version.')
    expect(initial.footer.saveButtonLabel).toBe('Saved')
    expect(store.getState().methodListStrategy).toBe('content-grown')

    expect(store.getState().setTextField('stationCode', '')).toBe(true)
    expect(store.getState().completionPercent).toBe(90)
    expect(fixture.contentFor(store.getState()).footer.message).toBe('Unsaved changes to the cruise plan.')
    expect(store.getState().setTextField('stationCode', 'HB-14')).toBe(true)
    expect(store.getState().completionPercent).toBe(100)
    expect(store.getState().dirty).toBe(false)
  })

  test('supports empty, one, source-sized, and test-only extended method collections', () => {
    const fixture = createFormsForm1PreviewFixture()
    const store = createFormsForm1PreviewStore(fixture.storeSeed)

    expect(store.getState().removeMethod('benthic-cores')).toBe(true)
    expect(store.getState().draft.methodIds).toEqual(['water-column'])
    expect(store.getState().removeMethod('water-column')).toBe(true)
    expect(store.getState().draft.methodIds).toEqual([])
    expect(store.getState().completionPercent).toBe(90)
    expect(fixture.contentFor(store.getState()).methods.selected).toEqual([])
    expect(store.getState().addMethod('sediment-traps')).toBe(true)
    expect(store.getState().draft.methodIds).toEqual(['sediment-traps'])
    expect(store.getState().addMethod('sediment-traps')).toBe(false)
    expect(store.getState().addMethod('unknown-method')).toBe(false)
    const extendedSeed = {
      ...fixture.storeSeed,
      methods: [...fixture.storeSeed.methods, { id: 'test-only-fourth', label: 'Test-only method' }],
    }
    const extendedStore = createFormsForm1PreviewStore({
      ...extendedSeed,
      initialDraft: { ...extendedSeed.initialDraft, methodIds: ['benthic-cores'] },
    })
    expect(extendedStore.getState().addMethod('water-column')).toBe(true)
    expect(extendedStore.getState().addMethod('sediment-traps')).toBe(true)
    expect(extendedStore.getState().addMethod('test-only-fourth')).toBe(true)
    expect(extendedStore.getState().draft.methodIds).toEqual([
      'benthic-cores',
      'water-column',
      'sediment-traps',
      'test-only-fourth',
    ])
    expect(extendedStore.getState().methodListStrategy).toBe('content-grown')
    expect(store.getState().revert()).toBe(true)
    expect(store.getState().draft.methodIds).toEqual(['benthic-cores', 'water-column'])
  })

  test('changes crew, data-release, embargo, photo, and time within one revertible draft', () => {
    const fixture = createFormsForm1PreviewFixture()
    const store = createFormsForm1PreviewStore(fixture.storeSeed)

    expect(store.getState().selectLeadCrew('estuary-monitoring-team')).toBe(true)
    expect(store.getState().selectLeadCrew('missing-crew')).toBe(false)
    expect(store.getState().selectDataRelease('open-data-portal')).toBe(true)
    expect(store.getState().setHoldForTwelveMonths(false)).toBe(true)
    expect(store.getState().setDailyStart('07:15')).toBe(true)
    expect(store.getState().removeStationPhoto()).toBe(true)
    expect(store.getState().dirty).toBe(true)

    const changed = fixture.contentFor(store.getState())
    expect(changed.leadCrew.selectedId).toBe('estuary-monitoring-team')
    expect(changed.dataRelease.selectedId).toBe('open-data-portal')
    expect(changed.embargo.checked).toBe(false)
    expect(changed.dailyStart.value).toBe('07:15')
    expect(changed.stationPhoto.initials).toBeUndefined()
    expect(store.getState().revert()).toBe(true)

    const restored = fixture.contentFor(store.getState())
    expect(restored.leadCrew.selectedId).toBe('coastal-survey-team')
    expect(restored.dataRelease.selectedId).toBe('institute-and-partners')
    expect(restored.embargo.checked).toBe(true)
    expect(restored.dailyStart.value).toBe('06:30')
    expect(restored.stationPhoto.initials).toBe('HB')
    expect(store.getState().revert()).toBe(false)
  })

  test('keeps save host-owned and does not claim remote success', () => {
    const fixture = createFormsForm1PreviewFixture()
    const store = createFormsForm1PreviewStore(fixture.storeSeed)

    expect(store.getState().requestSave()).toBeNull()
    expect(store.getState().setTextField('surveyTitle', 'Revised cruise plan')).toBe(true)
    const request = store.getState().requestSave()
    expect(request?.surveyTitle).toBe('Revised cruise plan')
    expect(store.getState().dirty).toBe(true)
    expect(fixture.contentFor(store.getState()).footer.saveButtonLabel).toBe('Save plan')
    expect(store.getState().requestSave()?.surveyTitle).toBe('Revised cruise plan')
  })

  test('keeps long translated labels intact and rejects duplicate or stale option IDs', () => {
    const german = createFormsForm1PreviewFixture('de')
    const store = createFormsForm1PreviewStore(german.storeSeed)
    const content = german.contentFor(store.getState())
    const longCrew = itemAt(content.leadCrew.choices, 2)

    expect(longCrew.label).toBe('Höhenprofil-Team für ökologische Transekterhebungen')
    expect(content.copy.pageTitle).toBe('Umfrageeinsatz planen')
    expect(content.listStrategy.kind).toBe('content-grown')
    expect(store.getState().selectDataRelease('stale-option')).toBe(false)
    expect(() =>
      createFormsForm1PreviewStore({
        ...german.storeSeed,
        methods: [itemAt(german.storeSeed.methods, 0), itemAt(german.storeSeed.methods, 0)],
      }),
    ).toThrow('Method IDs must be unique.')
    expect(() =>
      createFormsForm1PreviewStore({
        ...german.storeSeed,
        initialDraft: { ...german.storeSeed.initialDraft, leadCrewId: 'stale-crew' },
      }),
    ).toThrow('The initial lead crew selection must reference an available option.')
  })
})
