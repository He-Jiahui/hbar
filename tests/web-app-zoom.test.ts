import { expect, test } from 'bun:test'
import {
  createWebZoomController,
  nextWebZoom,
  normalizeWebZoom,
  readWebZoom,
  webZoomKeyboardAction,
  type WebZoomPort,
} from '../apps/web/src/app-zoom'

test('zoom range, stored values and cross-platform shortcuts match the visible control', () => {
  expect(normalizeWebZoom(0.1)).toBe(0.5)
  expect(normalizeWebZoom(3)).toBe(2)
  expect(normalizeWebZoom(Number.NaN)).toBe(1)
  expect(readWebZoom(null)).toBe(1)
  expect(readWebZoom('1.25')).toBe(1.25)
  expect(readWebZoom('')).toBeNull()
  expect(readWebZoom('2.1')).toBeNull()
  expect(nextWebZoom(1.95, 'in')).toBe(2)
  expect(nextWebZoom(0.55, 'out')).toBe(0.5)
  expect(nextWebZoom(1.27, 'reset')).toBe(1)
  const event = (input: Partial<Parameters<typeof webZoomKeyboardAction>[0]>) => ({
    key: '=',
    code: 'Equal',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    isComposing: false,
    keyCode: 0,
    ...input,
  })
  expect(webZoomKeyboardAction(event({}), 'Win32')).toBe('in')
  expect(webZoomKeyboardAction(event({ key: '-', code: 'Minus' }), 'Win32')).toBe('out')
  expect(webZoomKeyboardAction(event({ key: '0', code: 'Digit0' }), 'Win32')).toBe('reset')
  expect(webZoomKeyboardAction(event({ ctrlKey: false, metaKey: true }), 'MacIntel')).toBe('in')
  expect(webZoomKeyboardAction(event({ altKey: true }), 'Win32')).toBeNull()
  expect(webZoomKeyboardAction(event({ isComposing: true }), 'Win32')).toBeNull()
})

test('zoom reads and writes one device preference without claiming a failed save persisted', async () => {
  let stored: unknown = 1.25
  let failWrite = false
  const applied: number[] = []
  const port: WebZoomPort = {
    read: async () => stored,
    async write(level) {
      if (failWrite) throw { code: 'STORAGE_UNAVAILABLE' }
      stored = level
    },
    async apply(level) {
      applied.push(level)
      return 'native'
    },
  }
  const controller = createWebZoomController(port)
  await controller.initialize()
  expect(controller.store.getState()).toMatchObject({ level: 1.25, status: 'ready', mode: 'native' })
  failWrite = true
  await controller.select(1.5)
  expect(controller.store.getState()).toMatchObject({ level: 1.5, status: 'save-error' })
  expect(stored).toBe(1.25)
  failWrite = false
  await controller.persist()
  expect(controller.store.getState()).toMatchObject({ level: 1.5, status: 'saved' })
  expect(stored).toBe(1.5)
  expect(applied).toEqual([1.25, 1.5])
})

test('invalid and failed reads keep a usable 100% view with an explicit retry', async () => {
  let stored: unknown = 'broken'
  const controller = createWebZoomController({
    read: async () => stored,
    write: async () => {},
    apply: async () => 'css',
  })
  await controller.initialize()
  expect(controller.store.getState()).toMatchObject({ level: 1, status: 'read-error', error: 'INVALID_PREFERENCE' })
  stored = 0.75
  await controller.refresh()
  expect(controller.store.getState()).toMatchObject({ level: 0.75, status: 'ready' })
})

test('a zoom application failure retains the last rendered level and does not persist a false choice', async () => {
  const writes: number[] = []
  const controller = createWebZoomController({
    read: async () => 1.1,
    write: async (level) => {
      writes.push(level)
    },
    async apply(level) {
      if (level === 1.5) throw { code: 'NATIVE_ZOOM_UNAVAILABLE' }
      return 'native'
    },
  })
  await controller.initialize()
  await controller.select(1.5)
  expect(controller.store.getState()).toMatchObject({
    level: 1.1,
    mode: 'native',
    status: 'apply-error',
    error: 'NATIVE_ZOOM_UNAVAILABLE',
  })
  expect(writes).toEqual([])
})

test('rapid zoom changes settle to the newest level and never persist a superseded value', async () => {
  const first = Promise.withResolvers<void>()
  const applied: number[] = []
  const written: number[] = []
  const controller = createWebZoomController({
    read: async () => null,
    write: async (level) => {
      written.push(level)
    },
    async apply(level) {
      applied.push(level)
      if (level === 1.1) await first.promise
      return 'css'
    },
  })
  await controller.initialize()
  const older = controller.select(1.1)
  await Promise.resolve()
  const newer = controller.select(1.2)
  first.resolve()
  await Promise.all([older, newer])
  expect(controller.store.getState()).toMatchObject({ level: 1.2, status: 'saved' })
  expect(applied.at(-1)).toBe(1.2)
  expect(written).toEqual([1.2])
})
