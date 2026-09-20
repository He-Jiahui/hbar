import { expect, test } from 'bun:test'
import { readNativeWindowContext } from '../apps/web/src/native-window'

test('native window context accepts only supported platform and material pairs', () => {
  expect(
    readNativeWindowContext(new URL('http://127.0.0.1:4317/?hbar-native=1&hbar-platform=windows&hbar-material=mica')),
  ).toEqual({ platform: 'windows', material: 'mica' })
  expect(
    readNativeWindowContext(new URL('http://127.0.0.1:4317/?hbar-native=1&hbar-platform=macos&hbar-material=vibrancy')),
  ).toEqual({ platform: 'macos', material: 'vibrancy' })
  expect(
    readNativeWindowContext(new URL('http://127.0.0.1:4317/?hbar-native=1&hbar-platform=linux&hbar-material=solid')),
  ).toEqual({ platform: 'linux', material: 'solid' })
  expect(
    readNativeWindowContext(new URL('http://127.0.0.1:4317/?hbar-native=1&hbar-platform=linux&hbar-material=mica')),
  ).toBeNull()
  expect(readNativeWindowContext(new URL('http://127.0.0.1:4317/'))).toBeNull()
})
