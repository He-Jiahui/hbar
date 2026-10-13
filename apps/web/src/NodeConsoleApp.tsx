import { useEffect, useMemo } from 'react'
import { LumenProvider } from '@lumen/app-ui'
import { HbarNodeConsoleEntry } from '@hbar/app-react/node-console'
import type { ShellLocale } from './shell-copy'
import { createNodeConsoleEntry } from './node-console-entry'
import { createWebLumenAppearance, readAppearanceBootstrap } from './appearance'
import { readThemeBootstrap, resolveWebTheme } from './theme'

/** B's standalone surface uses its own device authority and same-origin RPC endpoint. */
export function NodeConsoleApp({ locale }: { readonly locale: ShellLocale }) {
  const mode = resolveWebTheme(
    readThemeBootstrap(window.localStorage),
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  const appearance = createWebLumenAppearance(
    mode,
    readAppearanceBootstrap(window.localStorage),
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const entry = useMemo(
    () => createNodeConsoleEntry({ url: new URL('/rpc', window.location.origin).href, locale }),
    [locale],
  )
  useEffect(() => () => entry.dispose(), [entry])
  return (
    <LumenProvider appearance={appearance} surfaceRole="reading" className="hbar-node-console-shell">
      <HbarNodeConsoleEntry entry={entry.model} labels={entry.labels} />
    </LumenProvider>
  )
}
