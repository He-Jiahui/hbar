import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  compileKeyedList,
  createKeyedList,
  moveKeyedListItem,
  removeKeyedListItem,
  resetKeyedListItem,
  setKeyedListItem,
} from '@hbar/schema-core'
import { HbarSchemaList, type HbarSchemaListLabels } from '@hbar/schema-react'

const schema = compileKeyedList({
  id: 'provider-list',
  version: 1,
  labelKey: 'i18n:settings.providers',
  component: 'List',
  element: 'ProviderDialog',
  keyField: 'providerId',
  itemSchemaId: 'hbar.provider@1',
  maxItems: 3,
})
const labels: HbarSchemaListLabels = {
  resolve: () => 'Providers',
  empty: 'No providers',
  add: 'Add provider',
  edit: (item) => `Edit ${String(item.name)}`,
  remove: (item) => `Remove ${String(item.name)}`,
  moveUp: (item) => `Move ${String(item.name)} up`,
  moveDown: (item) => `Move ${String(item.name)} down`,
  reset: (item) => `Reset ${String(item.name)}`,
  itemLabel: (item) => String(item.name),
}

test('keyed list state preserves stable IDs through add, update, move, remove, and reset', () => {
  let state = createKeyedList(schema, [
    { providerId: 'alpha', name: 'Alpha' },
    { providerId: 'beta', name: 'Beta' },
  ])
  state = setKeyedListItem(schema, state, { providerId: 'alpha', name: 'Alpha updated' })
  state = setKeyedListItem(schema, state, { providerId: 'gamma', name: 'Gamma' })
  state = moveKeyedListItem(schema, state, 'gamma', 'alpha')
  state = removeKeyedListItem(schema, state, 'beta')
  expect(state.order).toEqual(['gamma', 'alpha'])
  expect(state.dirtyItems).toEqual(['gamma', 'alpha'])
  expect(state.removedItems).toEqual(['beta'])
  expect(state.orderDirty).toBe(true)
  state = resetKeyedListItem(schema, state, 'alpha')
  expect(state.draft.find((item) => item.providerId === 'alpha')?.name).toBe('Alpha')
  state = setKeyedListItem(schema, state, { providerId: 'delta', name: 'Delta' })
  expect(() => setKeyedListItem(schema, state, { providerId: 'epsilon', name: 'Epsilon' })).toThrow('capacity')
})

test('schema list renders bounded host-owned content and emits no implementation commands', () => {
  const state = createKeyedList(schema, [
    { providerId: 'alpha', name: 'Alpha' },
    { providerId: 'beta', name: 'Beta' },
  ])
  const html = renderToStaticMarkup(
    <HbarSchemaList schema={schema} state={state} labels={labels} onIntent={() => {}} />,
  )
  expect(html).toContain('Providers')
  expect(html).toContain('Alpha')
  expect(html).toContain('Edit Alpha')
  expect(html).toContain('Move Beta up')
  expect(html).toContain('Remove Alpha')
  expect(html).not.toContain('provider.save')
})
