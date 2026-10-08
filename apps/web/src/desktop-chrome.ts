import { createStore, type StoreApi } from 'zustand/vanilla'
import { desktopChromeCopySchema, type DesktopChromeCopy } from '@hbar/contracts'
import { desktopChromeCopy } from './desktop-chrome-copy'
import { readNativeInvokeBridge } from './native-invoke'
import type { WebLanguageController } from './language'
import type { ShellLocale } from './shell-copy'

export interface DesktopChromePort {
  readonly isAvailable: boolean
  readonly apply: (copy: DesktopChromeCopy) => Promise<void>
}
export function createDesktopChromePort(scope: unknown, native: boolean): DesktopChromePort {
  const bridge = native ? readNativeInvokeBridge(scope) : null
  return {
    isAvailable: bridge !== null,
    async apply(copy) {
      if (!bridge) throw new Error('DESKTOP_CHROME_UNAVAILABLE')
      const request = desktopChromeCopySchema.parse(copy)
      const receipt = desktopChromeCopySchema.parse(await bridge.invoke('set_desktop_chrome_copy', { copy: request }))
      if (
        request.windowTitle !== receipt.windowTitle ||
        request.trayTooltip !== receipt.trayTooltip ||
        request.trayOpen !== receipt.trayOpen ||
        request.trayExit !== receipt.trayExit ||
        request.closeConfirmation.title !== receipt.closeConfirmation.title ||
        request.closeConfirmation.message !== receipt.closeConfirmation.message
      )
        throw new Error('DESKTOP_CHROME_RECEIPT_MISMATCH')
    },
  }
}
export interface DesktopChromeState {
  readonly locale: ShellLocale | null
  readonly appliedLocale: ShellLocale | null
  readonly status: 'unavailable' | 'idle' | 'pending' | 'synced' | 'error'
}
export interface DesktopChromeController {
  readonly store: StoreApi<DesktopChromeState>
  readonly select: (locale: ShellLocale) => void
  readonly retry: () => void
  readonly dispose: () => void
}

/** One in-flight replace command and one latest locale; failure never starts a retry by itself. */
export function createDesktopChromeController(port: DesktopChromePort): DesktopChromeController {
  const store = createStore<DesktopChromeState>(() => ({
    locale: null,
    appliedLocale: null,
    status: port.isAvailable ? 'idle' : 'unavailable',
  }))
  let disposed = false
  let running = false
  let generation = 0
  const drain = async () => {
    running = true
    while (!disposed) {
      const attempt = generation
      const locale = store.getState().locale
      if (!locale) break
      try {
        await port.apply(desktopChromeCopy(locale))
        if (disposed) break
        store.setState({ appliedLocale: locale, status: attempt === generation ? 'synced' : 'pending' })
      } catch {
        if (disposed) break
        if (attempt === generation) {
          store.setState({ status: 'error' })
          break
        }
      }
      if (attempt === generation) break
    }
    running = false
  }
  const start = () => {
    if (disposed || !port.isAvailable || running || !store.getState().locale) return
    void drain()
  }
  return {
    store,
    select(locale) {
      if (disposed || !port.isAvailable || store.getState().locale === locale) return
      generation++
      store.setState({ locale, status: 'pending' })
      start()
    },
    retry() {
      if (disposed || store.getState().status !== 'error') return
      generation++
      store.setState({ status: 'pending' })
      start()
    },
    dispose() {
      disposed = true
    },
  }
}

export function bindDesktopChromeLanguage(
  controller: DesktopChromeController,
  language: WebLanguageController,
): () => void {
  controller.select(language.store.getState().locale)
  return language.store.subscribe((state) => controller.select(state.locale))
}
