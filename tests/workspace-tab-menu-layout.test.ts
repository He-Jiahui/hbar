import { expect, test } from 'bun:test'
import { workspaceTabMenuPosition } from '../packages/app-react/src/workspace-tab-menu-layout'

test('tab menu reclamps the original anchor to the current viewport without losing pane height', () => {
  const wide = workspaceTabMenuPosition({ left: 1370, bottom: 48 }, { width: 1440, height: 900, rem: 16 })
  const narrow = workspaceTabMenuPosition({ left: 325, bottom: 102 }, { width: 390, height: 844, rem: 16 })
  expect(wide).toEqual({ left: 1144, top: 52, availableHeight: 840 })
  expect(narrow).toEqual({ left: 94, top: 106, availableHeight: 730 })
  expect(narrow.left + 288).toBeLessThanOrEqual(390 - 8)
  expect(narrow.top + narrow.availableHeight).toBeLessThanOrEqual(844 - 8)
})

test('clipped and larger-font anchors keep the menu within the real remaining height', () => {
  expect(workspaceTabMenuPosition({ left: -50, bottom: 800 }, { width: 320, height: 300, rem: 16 })).toEqual({
    left: 8,
    top: 292,
    availableHeight: 0,
  })
  const enlarged = workspaceTabMenuPosition({ left: 360, bottom: 60 }, { width: 390, height: 844, rem: 20 })
  expect(enlarged).toEqual({ left: 20, top: 65, availableHeight: 769 })
})
