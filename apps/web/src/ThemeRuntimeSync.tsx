import { useEffect } from 'react'
import { platform } from './platform'
import { useConnection, useWorkbench } from './stores'
import { applyThemeProfile, handleThemeEvent, mergeThemeContributions, useThemeSettings } from './theme-store'
import { useUIPlugins } from './ui-plugins'

/**
 * Composes the theme view model with the platform adapter. App renders this
 * boundary but does not own theme RPCs or CSS projection details.
 */
export default function ThemeRuntimeSync() {
  const status = useConnection((state) => state.status)
  const connection = useConnection((state) => state.client)
  const activeSession = useWorkbench((state) => state.activeSession)
  const workspaceId = useWorkbench((state) => state.workspaceId)
  const profile = useThemeSettings((state) => state.profile)
  const themes = useUIPlugins((state) => state.themes)
  const backgroundAssets = useUIPlugins((state) => state.backgroundAssets)

  useEffect(() => {
    const effectiveTheme = mergeThemeContributions(profile, themes)
    applyThemeProfile(effectiveTheme)
    const background = effectiveTheme.surface.backgroundAsset
    const pluginBackground = typeof background === 'string' && background.startsWith('plugin/')
      ? (() => {
          const [, owner, ...parts] = background.split('/')
          return owner && parts[0] === 'assets' && parts.length > 1 && (themes.some((theme) => theme.owner === owner) || backgroundAssets.some((asset) => asset.owner === owner))
            ? new URL(`/api/plugins/${encodeURIComponent(owner)}/${parts.join('/')}`, connection?.baseUrl ?? window.location.origin).href
            : null
        })()
      : null
    document.documentElement.style.setProperty(
      '--hbar-background-image',
      background && connection
        ? pluginBackground
          ? `url("${pluginBackground}")`
          : /^[a-f0-9]{64}$/i.test(background)
            ? `url("${connection.artifactUrl(background)}")`
            : 'none'
        : 'none',
    )
    void platform()
      .then((adapter) => adapter.setWindowEffect(effectiveTheme))
      .catch(() => {})
  }, [backgroundAssets, connection, profile, themes])

  useEffect(() => {
    if (status !== 'connected' || !connection) return
    const scope = activeSession ? 'session' : workspaceId ? 'project' : 'global'
    const targetId = activeSession || workspaceId || undefined
    useThemeSettings.getState().setScope(scope, targetId)
    void useThemeSettings.getState().load(connection, scope, targetId)
    return connection.onEvent((event) => handleThemeEvent(event, connection))
  }, [activeSession, connection, status, workspaceId])

  return null
}
