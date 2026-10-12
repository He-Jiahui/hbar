import type { HbarPlugin } from '@hbar/plugin-sdk'
import webSearchPlugin from '@hbar/web-search'

/** Web search runs in Kernel in both local and external-plugin compositions. */
export function kernelCapabilityPlugins(_externalPlugins: boolean): readonly HbarPlugin[] {
  return [webSearchPlugin]
}
