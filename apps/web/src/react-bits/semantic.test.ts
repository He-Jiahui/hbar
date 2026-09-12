import { expect, test } from 'bun:test'
import { statusLabel, statusLabels } from './semantic'

test('semantic status badges expose stable user-facing labels', () => {
  expect(statusLabel('running')).toBe('运行中')
  expect(statusLabel('waiting')).toBe('等待确认')
  expect(Object.keys(statusLabels)).toHaveLength(7)
})
