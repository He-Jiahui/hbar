import type { LumenWindowPlatform } from '@lumen/app-ui'

export type HbarNativeWindowMaterial = 'mica' | 'vibrancy' | 'solid'

export interface HbarNativeWindowContext {
  readonly platform: LumenWindowPlatform
  readonly material: HbarNativeWindowMaterial
}

const materialByPlatform: Readonly<Record<LumenWindowPlatform, readonly HbarNativeWindowMaterial[]>> = {
  windows: ['mica', 'solid'],
  macos: ['vibrancy', 'solid'],
  linux: ['solid'],
}

export function readNativeWindowContext(url: URL): HbarNativeWindowContext | null {
  if (url.searchParams.get('hbar-native') !== '1') return null
  const platform = url.searchParams.get('hbar-platform')
  const material = url.searchParams.get('hbar-material')
  if (platform !== 'windows' && platform !== 'macos' && platform !== 'linux') return null
  if (material !== 'mica' && material !== 'vibrancy' && material !== 'solid') return null
  if (!materialByPlatform[platform].includes(material)) return null
  return { platform, material }
}

export function applyNativeWindowContext(root: HTMLElement, context: HbarNativeWindowContext | null): void {
  if (!context) {
    delete root.dataset.hbarNativePlatform
    delete root.dataset.hbarWindowMaterial
    return
  }
  root.dataset.hbarNativePlatform = context.platform
  root.dataset.hbarWindowMaterial = context.material
}
