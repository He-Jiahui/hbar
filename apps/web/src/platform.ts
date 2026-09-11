import { copyText } from './browser-utils'
export interface PlatformAdapter {
  kind: 'web' | 'desktop'
  connection(): Promise<{ url: string; token?: string }>
  copy(text: string): Promise<void>
  pickDirectory(): Promise<string | null>
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
}
export async function platform(): Promise<PlatformAdapter> {
  if ('__TAURI_INTERNALS__' in window) return (await import('./platform-tauri.ts')).desktop
  return web
}
