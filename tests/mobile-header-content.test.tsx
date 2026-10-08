import { expect, test } from 'bun:test'
import {
  projectMobileHeaderMenuSections,
  type HbarMobileHeaderMenuItem,
} from '../packages/app-react/src/mobile-header-menu'
import { getShellCopy } from '../apps/web/src/shell-copy'

const row = (id: string, order = 0): HbarMobileHeaderMenuItem => ({ id, order, label: id, onActivate: () => {} })
test('mobile sections retain source-owned capacity and stable ordered targets in both locales', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const label = getShellCopy(locale).session.tools.label.repeat(8)
    for (const count of [0, 1, 7, 32, 33]) {
      const items = Array.from({ length: count }, (_, i) => row(`owned-${i}`, count - i))
      const projected = projectMobileHeaderMenuSections([{ id: 'tabs', order: 1, label, items }])
      expect(projected).toHaveLength(count === 0 ? 0 : 1)
      expect(projected[0]?.items.length ?? 0).toBe(count)
      if (count) {
        expect(projected[0]?.label).toBe(label)
        expect(projected[0]?.items[0]?.id).toBe(`owned-${count - 1}`)
        expect(projected[0]?.items.at(-1)?.id).toBe('owned-0')
      }
    }
  }
})
test('merged registrations remove every ambiguous ID without changing surviving callbacks', () => {
  const original = row('original', 2)
  const projection = projectMobileHeaderMenuSections([
    { id: 'tools', order: 2, label: 'owned', items: [row('duplicate'), original] },
    { id: 'tools', order: 2, label: 'owned', items: [row('duplicate'), row('first', 1)] },
    { id: 'empty', order: 0, label: 'owned', items: [] },
  ])
  expect(projection).toHaveLength(1)
  expect(projection[0]?.items.map((item) => item.id)).toEqual(['first', 'original'])
  expect(projection[0]?.items.at(-1)).toBe(original)
  expect(projection[0]?.items.at(-1)?.onActivate).toBe(original.onActivate)
})
