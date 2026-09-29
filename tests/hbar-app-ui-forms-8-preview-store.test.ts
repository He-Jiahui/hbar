import { describe, expect, test } from 'bun:test'
import { createForms8PreviewFixture } from '../apps/hbar-app-ui-preview/src/forms8PreviewFixtures'
import { createForms8PreviewStore, type Forms8Condition } from '../apps/hbar-app-ui-preview/src/forms8PreviewStore'

function itemAt<Item>(items: readonly Item[], index: number): Item {
  const item = items[index]
  if (item === undefined) throw new RangeError(`Missing test item at index ${index}.`)
  return item
}

function conditionAt(conditions: readonly Forms8Condition[], id: string): Forms8Condition {
  const condition = conditions.find((item) => item.id === id)
  if (!condition) throw new RangeError(`Missing test condition ${id}.`)
  return condition
}

describe('Forms 8 preview store', () => {
  test('projects the observed default rule with stable condition and action IDs', () => {
    const fixture = createForms8PreviewFixture()
    const store = createForms8PreviewStore(fixture.storeSeed)
    const content = fixture.contentFor(store.getState())

    expect(content.copy.pageTitle).toBe('Inbound pallet routing rule')
    expect(content.copy.pageDescription).toBe('Match arriving pallets, then decide where they go.')
    expect(content.matchMode).toBe('all')
    expect(content.conditions.map((condition) => [condition.id, condition.fieldId, condition.operatorId])).toEqual([
      ['condition-pallet-weight', 'pallet-weight', 'greater-than'],
      ['condition-sku-category', 'sku-category', 'is'],
      ['condition-hazardous-flag', 'hazardous-flag', 'is'],
    ])
    expect(content.conditions.map((condition) => condition.value)).toEqual([
      { kind: 'number', value: '500' },
      { kind: 'choice', optionId: 'frozen' },
      { kind: 'boolean', value: false },
    ])
    expect(content.actions.map((action) => action.id)).toEqual([
      'action-route-to-cold-store',
      'action-notify-cold-chain-lead',
    ])
    expect(content.summary).toBe('When all 3 conditions match, route it to Cold store and notify the cold-chain lead.')
    expect(content.isComplete).toBe(true)
    expect(content.validationMessage).toBeUndefined()
    expect(content.conditionCollection).toEqual({ kind: 'pane-scroll', capacityEvidence: 'not-observed' })
  })

  test('changes the condition operator and value control with the selected field type', () => {
    const fixture = createForms8PreviewFixture()
    const store = createForms8PreviewStore(fixture.storeSeed)
    const actions = store.getState()

    expect(actions.setConditionField('condition-pallet-weight', 'sku-category')).toBe(true)
    let condition = conditionAt(store.getState().conditions, 'condition-pallet-weight')
    expect(condition).toMatchObject({
      id: 'condition-pallet-weight',
      fieldId: 'sku-category',
      operatorId: 'is',
      value: { kind: 'choice', optionId: '' },
    })
    const selectedField = itemAt(store.getState().fields, 2)
    expect(selectedField.operators.map((operator) => operator.id)).toEqual(['is', 'is-not', 'is-any-of'])
    expect(selectedField.options).toMatchObject({
      completeness: 'partial',
      items: [{ id: 'frozen', label: 'Frozen' }],
    })

    expect(actions.setConditionOperator('condition-pallet-weight', 'is-any-of')).toBe(true)
    condition = conditionAt(store.getState().conditions, 'condition-pallet-weight')
    expect(condition.value).toEqual({ kind: 'choice-many', optionIds: [] })
    expect(actions.setConditionValue('condition-pallet-weight', { kind: 'choice-many', optionIds: ['frozen'] })).toBe(
      true,
    )
    expect(actions.setConditionValue('condition-pallet-weight', { kind: 'number', value: '10' })).toBe(false)

    expect(actions.setConditionField('condition-pallet-weight', 'pallet-weight')).toBe(true)
    condition = conditionAt(store.getState().conditions, 'condition-pallet-weight')
    expect(condition).toMatchObject({
      fieldId: 'pallet-weight',
      operatorId: 'equals',
      value: { kind: 'number', value: '' },
    })
    expect(actions.setConditionOperator('condition-pallet-weight', 'between')).toBe(true)
    expect(conditionAt(store.getState().conditions, 'condition-pallet-weight').value).toEqual({
      kind: 'number-range',
      lower: '',
      upper: '',
    })
    expect(actions.setConditionField('condition-pallet-weight', 'unknown-field')).toBe(false)
    expect(actions.setConditionOperator('condition-pallet-weight', 'is-any-of')).toBe(false)
  })

  test('switches Match all/any and derives the visible summary without changing row identities', () => {
    const fixture = createForms8PreviewFixture()
    const store = createForms8PreviewStore(fixture.storeSeed)
    const initialIds = store.getState().conditions.map((condition) => condition.id)
    const actions = store.getState()

    expect(actions.setMatchMode('any')).toBe(true)
    expect(fixture.contentFor(store.getState()).summary).toBe(
      'When any of the 3 conditions match, route it to Cold store and notify the cold-chain lead.',
    )
    expect(store.getState().conditions.map((condition) => condition.id)).toEqual(initialIds)
    expect(actions.setMatchMode('any')).toBe(false)
    expect(actions.setMatchMode('all')).toBe(true)
  })

  test('adds and removes draft conditions by stable ID without asserting a source capacity', () => {
    const fixture = createForms8PreviewFixture()
    const store = createForms8PreviewStore(fixture.storeSeed)
    const actions = store.getState()
    const initialIds = store.getState().conditions.map((condition) => condition.id)

    const firstDraftId = actions.addCondition()
    const secondDraftId = actions.addCondition()
    const thirdDraftId = actions.addCondition()
    expect([firstDraftId, secondDraftId, thirdDraftId]).toEqual([
      'condition-draft-1',
      'condition-draft-2',
      'condition-draft-3',
    ])
    expect(new Set(store.getState().conditions.map((condition) => condition.id)).size).toBe(6)
    expect(conditionAt(store.getState().conditions, firstDraftId)).toMatchObject({
      fieldId: 'pallet-weight',
      operatorId: 'equals',
      value: { kind: 'number', value: '' },
    })
    expect(fixture.contentFor(store.getState())).toMatchObject({
      isComplete: false,
      validationMessage: 'Fill in every condition value',
    })
    expect(actions.setConditionValue(firstDraftId, { kind: 'number', value: '0' })).toBe(true)
    expect(fixture.contentFor(store.getState()).isComplete).toBe(false)
    expect(actions.removeCondition(secondDraftId)).toBe(true)
    expect(actions.removeCondition(thirdDraftId)).toBe(true)
    expect(fixture.contentFor(store.getState())).toMatchObject({ isComplete: true, validationMessage: undefined })

    expect(actions.removeCondition('condition-sku-category')).toBe(true)
    expect(actions.removeCondition('missing-condition')).toBe(false)
    expect(store.getState().conditions.map((condition) => condition.id)).toEqual([
      itemAt(initialIds, 0),
      itemAt(initialIds, 2),
      firstDraftId,
    ])
    expect(store.getState().actions.map((action) => action.id)).toEqual([
      'action-route-to-cold-store',
      'action-notify-cold-chain-lead',
    ])
  })

  test('returns typed Save/Test/Remove requests without inventing remote results', () => {
    const fixture = createForms8PreviewFixture()
    const store = createForms8PreviewStore(fixture.storeSeed)
    const actions = store.getState()
    const saveRequest = actions.requestSaveRule()
    const testRequest = actions.requestTestRule()
    const removeRequest = actions.requestConditionRemoval('condition-hazardous-flag')

    if (saveRequest.kind !== 'save-rule') throw new Error('Save request used the wrong action kind.')
    if (testRequest.kind !== 'test-rule') throw new Error('Test request used the wrong action kind.')
    if (!removeRequest) throw new Error('Expected a condition removal request.')
    expect(saveRequest.kind).toBe('save-rule')
    expect(testRequest.kind).toBe('test-rule')
    expect(removeRequest).toEqual({ kind: 'remove-condition', conditionId: 'condition-hazardous-flag' })
    expect(actions.requestConditionRemoval('missing-condition')).toBeNull()
    expect(saveRequest.draft.matchMode).toBe('all')
    expect(saveRequest.draft.conditions).toHaveLength(3)
    expect(saveRequest.draft.actions.map((action) => action.id)).toEqual([
      'action-route-to-cold-store',
      'action-notify-cold-chain-lead',
    ])
    expect(store.getState().conditions).toHaveLength(3)
    expect(removeRequest.kind).toBe('remove-condition')

    actions.setMatchMode('any')
    actions.removeCondition('condition-hazardous-flag')
    expect(saveRequest.draft.matchMode).toBe('all')
    expect(saveRequest.draft.conditions).toHaveLength(3)
    expect(testRequest.draft.conditions).toHaveLength(3)
    expect(store.getState().conditions).toHaveLength(2)
  })

  test('keeps visible copy host-owned for a non-default locale and long translated text', () => {
    const fixture = createForms8PreviewFixture('de')
    const store = createForms8PreviewStore(fixture.storeSeed)
    const content = fixture.contentFor(store.getState())

    expect(content.copy.whenHeading).toBe('Wenn')
    expect(content.copy.pageDescription.length).toBeGreaterThan(90)
    expect(content.fields.map((field) => field.label)).toContain('SKU-Kategorie')
    expect(content.summary).toBe(
      'Wenn alle 3 Bedingungen zutreffen, es zu Kühllager leiten und die Kühlkettenleitung benachrichtigen.',
    )
    expect(content.copy.fieldPickerLabel(4)).toBe('Feld für Bedingung 4 auswählen')
  })

  test('rejects duplicate IDs and initial field/operator/value mismatches', () => {
    const fixture = createForms8PreviewFixture()
    const seed = fixture.storeSeed
    const firstField = itemAt(seed.fields, 0)
    const firstCondition = itemAt(seed.initialConditions, 0)

    expect(() => createForms8PreviewStore({ ...seed, fields: [...seed.fields, firstField] })).toThrow(
      'Condition field IDs must be unique.',
    )
    expect(() =>
      createForms8PreviewStore({
        ...seed,
        initialConditions: [
          { ...firstCondition, value: { kind: 'choice', optionId: 'frozen' } },
          ...seed.initialConditions.slice(1),
        ],
      }),
    ).toThrow('The initial value for condition condition-pallet-weight does not match its field/operator.')
    expect(() =>
      createForms8PreviewStore({ ...seed, actions: [itemAt(seed.actions, 0), itemAt(seed.actions, 0)] }),
    ).toThrow('Action IDs must be unique.')
  })
})
