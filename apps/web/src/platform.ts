import { copyText } from './browser-utils'
export interface PlatformAdapter {
  kind: 'web' | 'desktop'
  connection(): Promise<{ url: string; token?: string }>
  copy(text: string): Promise<void>
  pickDirectory(): Promise<string | null>
}
const web: PlatformAdapter = {
  kind: 'web',
  connection: async () => ({ url: location.origin }),
  copy: copyText,
  pickDirectory: async () => null,
}
export async function platform(): Promise<PlatformAdapter> {
  if ('__TAURI_INTERNALS__' in window) return (await import('./platform-tauri.ts')).desktop
  return web
}
