import { invoke } from '@tauri-apps/api/core'
import type { PlatformAdapter } from './platform.ts'
import { copyText } from './browser-utils'
export const desktop: PlatformAdapter = {
  kind: 'desktop',
  connection: () => invoke<{ url: string; token: string }>('connection_info'),
  copy: copyText,
}
