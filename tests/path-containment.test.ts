import { expect, test } from 'bun:test'
import { isPathWithin } from '@hbar/contracts/path-containment'

test('resolved path containment keeps case siblings distinct and protected aliases restricted', () => {
  for (const [root, child, alias, sibling, separator] of [
    ['/srv/Repo', '/srv/Repo/file', '/srv/repo/file', '/srv/Repository/file', '/'],
    ['Z:\\Repo', 'Z:\\Repo\\file', 'Z:\\repo\\file', 'Z:\\Repository\\file', '\\'],
    [
      '\\\\server\\share\\Repo',
      '\\\\server\\share\\Repo\\file',
      '\\\\SERVER\\SHARE\\repo\\file',
      '\\\\server\\share\\Repository\\file',
      '\\',
    ],
  ] as const) {
    expect(isPathWithin(root, child, { separator, caseInsensitive: false })).toBe(true)
    expect(isPathWithin(root, alias, { separator, caseInsensitive: false })).toBe(false)
    expect(isPathWithin(root, alias, { separator, caseInsensitive: true })).toBe(true)
    expect(isPathWithin(root, sibling, { separator, caseInsensitive: true })).toBe(false)
  }
  expect(isPathWithin('/', '/tmp/file', { separator: '/', caseInsensitive: false })).toBe(true)
  expect(isPathWithin('Z:\\', 'Z:\\file', { separator: '\\', caseInsensitive: false })).toBe(true)
  expect(isPathWithin('', '/tmp/file', { separator: '/', caseInsensitive: false })).toBe(false)
})
