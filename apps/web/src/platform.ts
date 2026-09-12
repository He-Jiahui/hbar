import { copyText } from './browser-utils'
import type { ThemeProfile } from '@hbar/contracts'
export type ToolWindowOpenOptions = {
  windowId: string
  title: string
  url: string
  width?: number
  height?: number
}
export type ToolWindowEvent = { type: 'closed'; windowId: string }
export type ToolWindowHandle = { windowId: string }
export interface PlatformAdapter {
  kind: 'web' | 'desktop'
  connection(): Promise<{ url: string; token?: string }>
  copy(text: string): Promise<void>
  pickDirectory(): Promise<string | null>
  listFonts(): Promise<string[]>
  setWindowEffect(profile: ThemeProfile): Promise<{ native: boolean; message?: string }>
  openToolWindow(options: ToolWindowOpenOptions): Promise<ToolWindowHandle | null>
  focusToolWindow(windowId: string): Promise<void>
  closeToolWindow(windowId: string): Promise<void>
  onToolWindowEvent(listener: (event: ToolWindowEvent) => void): () => void
}

function developmentConnection(): { url: string; token: string } | undefined {
  if (location.hostname !== '127.0.0.1' && location.hostname !== 'localhost') return undefined
  const params = new URLSearchParams(location.search)
  const url = params.get('hbarHost')
  const token = params.get('hbarToken')
  if (!url || !token) return undefined
  const clean = new URL(location.href)
  clean.searchParams.delete('hbarHost')
  clean.searchParams.delete('hbarToken')
  history.replaceState(null, '', `${clean.pathname}${clean.search}${clean.hash}`)
  return { url, token }
}

const devConnection = developmentConnection()
const web: PlatformAdapter = {
  kind: 'web',
  connection: async () => devConnection ?? { url: location.origin },
  copy: copyText,
  pickDirectory: async () => null,
  listFonts: async () => {
    const localFontWindow = window as Window & { queryLocalFonts?: () => Promise<Array<{ family: string }>> }
    try {
      const fonts = localFontWindow.queryLocalFonts ? await localFontWindow.queryLocalFonts() : []
      const families = [...new Set(fonts.map((font) => font.family).filter(Boolean))]
      if (families.length) return families.sort((left, right) => left.localeCompare(right))
    } catch {
      // Local Font Access is permission-gated; use portable system fallbacks below.
    }
    return ['system-ui', 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', 'Noto Sans', 'Arial', 'sans-serif']
  },
  setWindowEffect: async () => ({ native: false, message: '当前浏览器使用 CSS 模糊回退。' }),
  openToolWindow: async (options) => {
    const url = new URL(options.url, location.href)
    url.searchParams.set('hbarWindow', '1')
    url.searchParams.set('windowId', options.windowId)
    const popup = window.open(url, `hbar-tool-window-${options.windowId}`, `popup,width=${options.width ?? 920},height=${options.height ?? 720}`)
    if (!popup) return null
    return { windowId: options.windowId }
  },
  focusToolWindow: async () => undefined,
  closeToolWindow: async () => undefined,
  onToolWindowEvent: () => () => undefined,
}
export async function platform(): Promise<PlatformAdapter> {
  if ('__TAURI_INTERNALS__' in window) return (await import('./platform-tauri.ts')).desktop
  return web
}
