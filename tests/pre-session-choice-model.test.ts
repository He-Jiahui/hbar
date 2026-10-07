import { expect, test } from 'bun:test'
import {
  groupPreSessionChoices,
  visiblePreSessionChoices,
  type HbarPreSessionChoice,
} from '../packages/app-react/src/pre-session-choice-model'

test('pre-session model choices group by provider while ordinary choices remain ungrouped', () => {
  const items: HbarPreSessionChoice[] = [
    { id: 'a-1', label: 'Model A', group: { id: 'provider-a', label: 'Provider A' } },
    { id: 'a-2', label: 'Model B', group: { id: 'provider-a', label: 'Provider A' } },
    { id: 'b-1', label: 'Model C', group: { id: 'provider-b', label: 'Provider B' } },
  ]

  expect(groupPreSessionChoices(items)).toEqual([
    { key: 'group:provider-a', label: 'Provider A', items: items.slice(0, 2) },
    { key: 'group:provider-b', label: 'Provider B', items: items.slice(2) },
  ])
  expect(groupPreSessionChoices([{ id: 'workspace', label: 'Workspace' }])).toEqual([
    { key: 'ungrouped', label: null, items: [{ id: 'workspace', label: 'Workspace' }] },
  ])
})

test('pre-session model search includes host model IDs without rendering search text', () => {
  const model: HbarPreSessionChoice = {
    id: 'provider-a/sonnet-latest',
    label: 'Sonnet',
    detail: 'Reasoning supported',
    searchText: 'claude-3-7-sonnet-20250219',
    triggerLabel: 'Provider A · Sonnet',
    group: { id: 'provider-a', label: 'Provider A' },
  }

  expect(visiblePreSessionChoices([model], 'claude-3-7-sonnet-20250219', 60).rows).toEqual([model])
  expect(model.label).toBe('Sonnet')
})

test('pre-session choices keep a selected off-page row visible within the current page bound', () => {
  const items = Array.from({ length: 61 }, (_, index) => ({
    id: `model-${index}`,
    label: `Model ${index}`,
    searchText: `model-${index}`,
  }))

  const page = visiblePreSessionChoices(items, '', 60, 'model-60')
  expect(page.rows).toHaveLength(60)
  expect(page.rows[0]?.id).toBe('model-60')
  expect(page.remaining).toBe(1)
  expect(visiblePreSessionChoices(items, 'model-60', 60).rows).toEqual([items[60]!])
})
