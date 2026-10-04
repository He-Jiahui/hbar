import { expect, test } from 'bun:test'
import { fileSearchFocusIndex } from '../packages/app-react/src/file-search-focus'

test('input navigation starts with the first result, never a synthetic active index', () => {
  expect(fileSearchFocusIndex('ArrowDown', 2, null)).toBe(0)
  expect(fileSearchFocusIndex('ArrowUp', 2, null)).toBe(0)
  expect(fileSearchFocusIndex('Home', 2, null)).toBe(0)
  expect(fileSearchFocusIndex('End', 2, null)).toBe(1)
})

test('native row navigation is bounded and handles single or changed result sets', () => {
  expect(fileSearchFocusIndex('ArrowDown', 2, 0)).toBe(1)
  expect(fileSearchFocusIndex('ArrowDown', 2, 1)).toBe(1)
  expect(fileSearchFocusIndex('ArrowUp', 2, 1)).toBe(0)
  expect(fileSearchFocusIndex('ArrowUp', 2, 0)).toBe(0)
  expect(fileSearchFocusIndex('Home', 2, 1)).toBe(0)
  expect(fileSearchFocusIndex('End', 2, 0)).toBe(1)
  expect(fileSearchFocusIndex('ArrowDown', 1, 5)).toBe(0)
  expect(fileSearchFocusIndex('ArrowUp', 1, -1)).toBe(0)
  expect(fileSearchFocusIndex('End', 100, 0)).toBe(99)
})

test('empty lists and unrelated keys leave native editing and button activation alone', () => {
  for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) expect(fileSearchFocusIndex(key, 0, null)).toBeNull()
  for (const key of ['Enter', ' ', 'Escape', 'Tab', 'a']) expect(fileSearchFocusIndex(key, 2, 0)).toBeNull()
})
