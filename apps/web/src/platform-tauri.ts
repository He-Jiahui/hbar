import { invoke } from '@tauri-apps/api/core'
import { pickBackgroundAssetFile, type PlatformAdapter, type ToolWindowEvent, type ToolWindowHandle, type ToolWindowOpenOptions } from './platform.ts'
import { copyText } from './browser-utils'
import type { ThemeProfile } from '@hbar/contracts'
export const desktop: PlatformAdapter = {
  kind: 'desktop',
  connection: () => invoke<{ url: string; token: string }>('connection_info'),
  copy: copyText,
  pickDirectory: () => invoke<string | null>('pick_directory'),
  pickBackgroundAsset: pickBackgroundAssetFile,
  listFonts: () => invoke<string[]>('list_fonts'),
  setWindowEffect: (profile: ThemeProfile) => invoke<{ native: boolean; message?: string }>('set_window_effect', { profile }),
  openToolWindow: async (options: ToolWindowOpenOptions): Promise<ToolWindowHandle> => ({
    windowId: await invoke<string>('open_tool_window', { options }),
  }),
  focusToolWindow: (windowId) => invoke('focus_tool_window', { windowId }),
  closeToolWindow: (windowId) => invoke('close_tool_window', { windowId }),
  onToolWindowEvent: (listener: (event: ToolWindowEvent) => void) => {
    let disposed = false
    let unlisten: (() => void) | undefined
    void import('@tauri-apps/api/event').then(({ listen }) =>
      listen<ToolWindowEvent>('tool-window-event', (event) => {
        if (!disposed) listener(event.payload)
      }).then((dispose) => {
        if (disposed) dispose()
        else unlisten = dispose
      }),
    )
    return () => {
      disposed = true
      unlisten?.()
      unlisten = undefined
    }
  },
}
