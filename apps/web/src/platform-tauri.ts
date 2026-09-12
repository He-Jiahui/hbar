import { invoke } from '@tauri-apps/api/core'
import type { PlatformAdapter } from './platform.ts'
import { copyText } from './browser-utils'
import type { ThemeProfile } from '@hbar/contracts'
export const desktop: PlatformAdapter = {
  kind: 'desktop',
  connection: () => invoke<{ url: string; token: string }>('connection_info'),
  copy: copyText,
  pickDirectory: () => invoke<string | null>('pick_directory'),
  listFonts: () => invoke<string[]>('list_fonts'),
  setWindowEffect: (profile: ThemeProfile) => invoke<{ native: boolean; message?: string }>('set_window_effect', { profile }),
}
