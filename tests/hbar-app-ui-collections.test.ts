import { describe, expect, test } from 'bun:test'
import { selectedItem, uniqueItems } from '../packages/hbar-app-ui/src/collection'
import { getSessionNavigatorCopy } from '../apps/web/src/app-ui-locale'

describe('host-owned collections', () => {
  test('merges duplicate IDs, preserves order, and does not replace stale selection', () => {
    const rows = uniqueItems([
      { id: 'a', value: 'old' },
      { id: 'b', value: 'second' },
      { id: 'a', value: 'new' },
    ])
    expect(rows).toEqual([
      { id: 'a', value: 'new' },
      { id: 'b', value: 'second' },
    ])
    expect(selectedItem(rows, 'removed')).toBeUndefined()
    expect(selectedItem(rows, undefined)).toBeUndefined()
    expect(selectedItem(rows, 'a')?.value).toBe('new')
    expect(uniqueItems([])).toEqual([])
  })
  test('resolves session actions and dates through each supported host locale', () => {
    const english = getSessionNavigatorCopy('en-US', true, false)
    const chinese = getSessionNavigatorCopy('zh-CN', false, true)
    expect(english.labels.archive('Long title')).toBe('Restore Long title')
    expect(chinese.labels.archive('会话')).toBe('归档 会话')
    expect(chinese.labels.empty).toBe('没有匹配会话')
    expect(english.date(0, true)).toContain('Branch')
    expect(chinese.date(0, true)).toContain('分支')
  })
})
