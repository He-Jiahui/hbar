import { expect, test } from 'bun:test'
import { sessionToolsMenuPosition } from '../packages/app-react/src/session-tools-menu-model'

test('secondary tool overlay follows its trigger without leaving the desktop or narrow viewport', () => {
  expect(sessionToolsMenuPosition({ right: 1424, bottom: 104 }, { width: 1440, height: 960, rem: 16 })).toEqual({
    left: 1120,
    top: 108,
    availableHeight: 842,
  })
  const narrow = sessionToolsMenuPosition({ right: 375, bottom: 210 }, { width: 390, height: 900, rem: 16 })
  expect(narrow.left).toBe(71)
  expect(narrow.left + 19 * 16).toBeLessThanOrEqual(380)
  expect(narrow.top + narrow.availableHeight).toBe(890)
  const small = sessionToolsMenuPosition({ right: 200, bottom: 480 }, { width: 240, height: 500, rem: 20 })
  expect(small.left).toBe(12.5)
  expect(small.availableHeight).toBeGreaterThanOrEqual(0)
})
