import { describe, expect, test } from 'bun:test'
import { createForms4PreviewFixture } from '../apps/hbar-app-ui-preview/src/forms4PreviewFixtures'
import { createForms4PreviewStore, type Forms4Property } from '../apps/hbar-app-ui-preview/src/forms4PreviewStore'

function findProperty(properties: readonly Forms4Property[], id: Forms4Property['id']): Forms4Property {
  const property = properties.find((candidate) => candidate.id === id)
  if (!property) throw new RangeError(`Missing property ${id}.`)
  return property
}

describe('Application UI Forms 4 preview store', () => {
  test('projects the authorized equipment-record baseline and bounded list contract', () => {
    const fixture = createForms4PreviewFixture()
    const store = createForms4PreviewStore(fixture.storeSeed)
    const content = fixture.contentFor(store.getState())

    expect(content.copy.pageTitle).toBe('Equipment record')
    expect(content.copy.pageDescription).toBe(
      'Click a row to edit it. Each change saves on its own, there is no save bar.',
    )
    expect(content.copy.badges.map((badge) => badge.label)).toEqual([
      'Fixed asset',
      'Maintenance',
      'Warranty expired',
    ])
    expect(content.properties).toHaveLength(9)
    expect(findProperty(content.properties, 'assetTag').valueLabel).toBe('EQ-20841')
    expect(findProperty(content.properties, 'model').valueLabel).toBe('Atlas HG-40 compressor')
    expect(findProperty(content.properties, 'warrantyEnds').valueLabel).toBe('30 May 2026')
    expect(content.nextServiceDue).toEqual({ value: '16 Sep 2026', calculatedLabel: 'Calculated' })
    expect(content.listStrategy).toEqual({ kind: 'content-grown', sourcePropertyCount: 9 })
  })

  test('keeps text editing host-owned and cancel discards only the active draft', () => {
    const fixture = createForms4PreviewFixture()
    const store = createForms4PreviewStore(fixture.storeSeed)

    expect(store.getState().beginEdit('assetTag')).toBe(true)
    expect(store.getState().editing).toEqual({ propertyId: 'assetTag', value: 'EQ-20841' })
    expect(store.getState().updateEditValue('EQ-20842')).toBe(true)
    expect(store.getState().requestSave()).toEqual({ propertyId: 'assetTag', value: 'EQ-20842' })
    expect(store.getState().lastSaveRequest).toEqual({ propertyId: 'assetTag', value: 'EQ-20842' })
    expect(findProperty(store.getState().properties, 'assetTag').value).toBe('EQ-20841')
    expect(store.getState().cancelEdit()).toBe(true)
    expect(store.getState().editing).toBeNull()
    expect(findProperty(store.getState().properties, 'assetTag').value).toBe('EQ-20841')
  })

  test('exposes only observed choices and preserves the selected draft until host confirmation', () => {
    const fixture = createForms4PreviewFixture()
    const store = createForms4PreviewStore(fixture.storeSeed)
    const condition = findProperty(store.getState().properties, 'condition')
    const interval = findProperty(store.getState().properties, 'serviceInterval')

    expect(condition.kind).toBe('choice')
    if (condition.kind !== 'choice') throw new Error('Condition must be a choice property.')
    expect(condition.choices.map((choice) => choice.label)).toEqual([
      'Excellent',
      'Serviceable',
      'Needs repair',
      'Out of service',
    ])
    expect(interval.kind).toBe('choice')
    if (interval.kind !== 'choice') throw new Error('Service interval must be a choice property.')
    expect(interval.choices.map((choice) => choice.label)).toEqual([
      'Every 30 days',
      'Every 90 days',
      'Every 180 days',
      'Every 365 days',
    ])

    expect(store.getState().beginEdit('condition')).toBe(true)
    expect(store.getState().updateEditValue('needs-repair')).toBe(true)
    expect(store.getState().requestSave()).toEqual({ propertyId: 'condition', value: 'needs-repair' })
    expect(findProperty(store.getState().properties, 'condition').value).toBe('serviceable')
    expect(store.getState().cancelEdit()).toBe(true)

    expect(store.getState().beginEdit('warrantyEnds')).toBe(true)
    expect(store.getState().editing).toEqual({ propertyId: 'warrantyEnds', value: '2026-05-30' })
    expect(store.getState().cancelEdit()).toBe(true)
  })

  test('projects the reversible condition-tracking state without changing calculated source data', () => {
    const fixture = createForms4PreviewFixture()
    const store = createForms4PreviewStore(fixture.storeSeed)

    expect(fixture.contentFor(store.getState()).conditionTrackingValue).toBe('Sensor telemetry on')
    expect(store.getState().setConditionTracking(false)).toBe(true)
    expect(fixture.contentFor(store.getState()).conditionTrackingValue).toBe('Manual checks only')
    expect(fixture.contentFor(store.getState()).nextServiceDue.value).toBe('16 Sep 2026')
    expect(store.getState().setConditionTracking(false)).toBe(false)
    expect(store.getState().setConditionTracking(true)).toBe(true)
    expect(fixture.contentFor(store.getState()).conditionTrackingValue).toBe('Sensor telemetry on')
  })

  test('localizes host-owned content and validates the source-bounded property collection', () => {
    const german = createForms4PreviewFixture('de')
    const germanStore = createForms4PreviewStore(german.storeSeed)
    const translatedContent = german.contentFor(germanStore.getState())

    expect(translatedContent.copy.pageTitle).toBe('Anlagenakte')
    expect(translatedContent.copy.editPropertyLabel('Garantie endet')).toBe('Garantie endet bearbeiten')
    expect(findProperty(translatedContent.properties, 'warrantyEnds').valueLabel).toBe('30. Mai 2026')

    const longLabel = 'Verantwortliche Person und technische Instandhaltungskoordination'.repeat(2)
    const oneProperty = { ...findProperty(german.storeSeed.properties, 'custodian'), label: longLabel }
    const oneItemFixture = createForms4PreviewFixture('de', [oneProperty])
    const oneItemStore = createForms4PreviewStore(oneItemFixture.storeSeed)
    expect(oneItemFixture.contentFor(oneItemStore.getState()).properties).toHaveLength(1)
    expect(oneItemFixture.contentFor(oneItemStore.getState()).properties[0]?.label).toBe(longLabel)

    const emptyFixture = createForms4PreviewFixture('en', [])
    expect(createForms4PreviewStore(emptyFixture.storeSeed).getState().properties).toEqual([])

    expect(() =>
      createForms4PreviewStore({
        ...german.storeSeed,
        properties: [
          ...german.storeSeed.properties,
          findProperty(german.storeSeed.properties, 'assetTag'),
        ],
      }),
    ).toThrow('Equipment property IDs must be unique.')
    const condition = findProperty(german.storeSeed.properties, 'condition')
    if (condition.kind !== 'choice') throw new Error('Condition must be a choice property.')
    expect(() =>
      createForms4PreviewStore({
        ...german.storeSeed,
        properties: [{ ...condition, value: 'unobserved-condition' }],
      }),
    ).toThrow('The selected condition value must reference an available choice.')
  })
})
