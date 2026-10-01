import { expect, test } from 'bun:test'
import { workspaceHeaderMenuPosition } from '../packages/app-react/src/workspace-header-sort-menu-model'

test('the measured flyout flips beside its row on a narrow viewport and stays within vertical edges', () => {
  const anchor = { right: 279, top: 362, bottom: 402 }
  const wide = workspaceHeaderMenuPosition(
    anchor,
    { width: 1_440, height: 900, rootFontSize: 16 },
    14.375,
    98,
    'flyout',
  )
  const narrow = workspaceHeaderMenuPosition(
    anchor,
    { width: 320, height: 900, rootFontSize: 16 },
    14.375,
    98,
    'flyout',
  )
  const lowAnchor = workspaceHeaderMenuPosition(
    { ...anchor, top: 850, bottom: 890 },
    { width: 320, height: 900, rootFontSize: 16 },
    14.375,
    98,
    'flyout',
  )

  expect(wide).toEqual({ left: 287, top: 354 })
  expect(narrow).toEqual({ left: 80, top: 354 })
  expect(lowAnchor.top).toBe(792)
})
