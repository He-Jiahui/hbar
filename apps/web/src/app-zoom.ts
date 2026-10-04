import { createStore, type StoreApi } from 'zustand/vanilla'

export const WEB_ZOOM_STORAGE_KEY = 'hbar:web:zoom'
export const DEFAULT_WEB_ZOOM = 1
export const MIN_WEB_ZOOM = 0.5
export const MAX_WEB_ZOOM = 2

export type WebZoomAction = 'in' | 'out' | 'reset'
export interface WebZoomPort {
  read(): Promise<unknown>
  write(level: number): Promise<void>
  apply(level: number): Promise<'native' | 'css'>
}
export interface WebZoomState {
  readonly level: number
  readonly mode: 'native' | 'css' | null
  readonly status: 'loading' | 'ready' | 'applying' | 'saved' | 'read-error' | 'save-error' | 'apply-error'
  readonly error: string | null
}
export interface WebZoomController {
  readonly store: StoreApi<WebZoomState>
  readonly initialize: () => Promise<void>
  readonly select: (level: number) => Promise<void>
  readonly persist: () => Promise<void>
  readonly refresh: () => Promise<void>
}

function errorCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'ZOOM_UNAVAILABLE'
}

export function normalizeWebZoom(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_WEB_ZOOM
  return Math.round(Math.min(MAX_WEB_ZOOM, Math.max(MIN_WEB_ZOOM, value)) * 100) / 100
}

export function readWebZoom(value: unknown): number | null {
  if (value === null) return DEFAULT_WEB_ZOOM
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) return null
  const number = Number(value)
  return Number.isFinite(number) && number >= MIN_WEB_ZOOM && number <= MAX_WEB_ZOOM ? normalizeWebZoom(number) : null
}

export function nextWebZoom(current: number, action: WebZoomAction): number {
  if (action === 'reset') return DEFAULT_WEB_ZOOM
  return normalizeWebZoom(current + (action === 'in' ? 0.1 : -0.1))
}

export function webZoomKeyboardAction(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'isComposing' | 'keyCode'>,
  platform: string,
): WebZoomAction | null {
  if (event.altKey || event.isComposing || event.keyCode === 229) return null
  const primary = /mac/i.test(platform) ? event.metaKey : event.ctrlKey
  if (!primary) return null
  if (event.key === '+' || event.key === '=' || event.code === 'Equal' || event.code === 'NumpadAdd') return 'in'
  if (event.key === '-' || event.code === 'Minus' || event.code === 'NumpadSubtract') return 'out'
  if (event.key === '0' || event.code === 'Digit0' || event.code === 'Numpad0') return 'reset'
  return null
}

/** One device-local zoom owner; asynchronous reads and writes cannot publish an older selection. */
export function createWebZoomController(port: WebZoomPort): WebZoomController {
  const store = createStore<WebZoomState>(() => ({
    level: DEFAULT_WEB_ZOOM,
    mode: null,
    status: 'loading',
    error: null,
  }))
  let generation = 0
  let appliedLevel = DEFAULT_WEB_ZOOM
  let appliedMode: WebZoomState['mode'] = null
  let tail = Promise.resolve()
  const queue = (task: () => Promise<void>) => {
    const pending = tail.catch(() => undefined).then(task)
    tail = pending.catch(() => undefined)
    return pending
  }
  const refresh = () => {
    const own = ++generation
    store.setState({ status: 'loading', error: null })
    return queue(async () => {
      try {
        const raw = await port.read()
        if (own !== generation) return
        const level = readWebZoom(raw)
        if (level === null) throw { code: 'INVALID_PREFERENCE' }
        const mode = await port.apply(level)
        appliedLevel = level
        appliedMode = mode
        if (own === generation) store.setState({ level, mode, status: 'ready', error: null })
      } catch (reason) {
        if (own !== generation) return
        const error = errorCode(reason)
        try {
          const mode = await port.apply(DEFAULT_WEB_ZOOM)
          appliedLevel = DEFAULT_WEB_ZOOM
          appliedMode = mode
          if (own === generation) store.setState({ level: DEFAULT_WEB_ZOOM, mode, status: 'read-error', error })
        } catch (applyReason) {
          if (own === generation) store.setState({ status: 'apply-error', error: errorCode(applyReason) })
        }
      }
    })
  }
  const persist = () => {
    const own = generation
    const level = store.getState().level
    return queue(async () => {
      if (own !== generation) return
      try {
        await port.write(level)
        if (own === generation) store.setState({ status: 'saved', error: null })
      } catch (reason) {
        if (own === generation) store.setState({ status: 'save-error', error: errorCode(reason) })
      }
    })
  }
  return {
    store,
    initialize: refresh,
    refresh,
    persist,
    select(level) {
      const next = normalizeWebZoom(level)
      const own = ++generation
      store.setState({ level: next, status: 'applying', error: null })
      return queue(async () => {
        if (own !== generation) return
        try {
          const mode = await port.apply(next)
          appliedLevel = next
          appliedMode = mode
          if (own !== generation) return
          store.setState({ mode })
          try {
            await port.write(next)
            if (own === generation) store.setState({ status: 'saved', error: null })
          } catch (reason) {
            if (own === generation) store.setState({ status: 'save-error', error: errorCode(reason) })
          }
        } catch (reason) {
          if (own === generation)
            store.setState({ level: appliedLevel, mode: appliedMode, status: 'apply-error', error: errorCode(reason) })
        }
      })
    },
  }
}
