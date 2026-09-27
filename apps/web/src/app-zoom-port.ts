import { getCurrentWebview } from '@tauri-apps/api/webview'
import { WEB_ZOOM_STORAGE_KEY, type WebZoomPort } from './app-zoom'

interface InvokeBridge {
  invoke(command: string, args?: Record<string, unknown>): Promise<unknown>
}

function cssZoom(level: number) {
  document.body.style.zoom = level === 1 ? '' : String(level)
  return 'css' as const
}

export function createBrowserZoomPort(storage: Storage): WebZoomPort {
  return {
    read: () => Promise.resolve(storage.getItem(WEB_ZOOM_STORAGE_KEY)),
    write: (level) => {
      storage.setItem(WEB_ZOOM_STORAGE_KEY, String(level))
      return Promise.resolve()
    },
    apply: (level) => Promise.resolve(cssZoom(level)),
  }
}

/** The verified native main window owns its preference across ephemeral Host ports. */
export function createNativeZoomPort(bridge: InvokeBridge): WebZoomPort {
  let nativeApplied = false
  return {
    read: () => bridge.invoke('read_ui_zoom'),
    async write(level) {
      await bridge.invoke('write_ui_zoom', { zoom: level })
    },
    async apply(level) {
      try {
        await getCurrentWebview().setZoom(level)
        document.body.style.zoom = ''
        nativeApplied = true
        return 'native'
      } catch (reason) {
        // Before any native zoom succeeds, CSS keeps browser/pre-capability
        // builds usable. Once native zoom is active, mixing both would multiply
        // scales; retain the last applied value and report the failure instead.
        if (nativeApplied) throw reason
        return cssZoom(level)
      }
    },
  }
}
