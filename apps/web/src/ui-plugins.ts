import * as React from 'react'
import { create } from 'zustand'
import { themeContributionSchema, toolWindowDescriptorSchema, type PluginInfo } from '@hbar/contracts'
import type {
  ClientPanel,
  ClientPlugin,
  ClientTerminalCommand,
  ComposerAction,
  RendererComponent,
  RendererSlot,
  RendererSlotOptions,
  ClientTheme,
  BackgroundAsset,
} from '@hbar/ui-sdk'
import { client, report, useConnection } from './stores'

interface RegisteredPanel extends ClientPanel {
  owner: string
}
interface RegisteredComposerAction extends ComposerAction {
  owner: string
}
interface RegisteredTerminalCommand extends ClientTerminalCommand {
  owner: string
}
export interface RegisteredRendererSlot {
  slot: RendererSlot
  component: RendererComponent
  owner: string
  id: string
  priority: number
  languages: readonly string[]
  supportsStreaming: boolean
  editable: boolean
  fallback?: RendererComponent
}
export interface RegisteredTheme extends ClientTheme {
  owner: string
  id: string
}
export interface RegisteredBackgroundAsset extends BackgroundAsset {
  owner: string
}
export const useUIPlugins = create<{
  panels: RegisteredPanel[]
  composerActions: RegisteredComposerAction[]
  terminalCommands: RegisteredTerminalCommand[]
  renderers: Record<string, React.ComponentType<{ source: string }>>
  rendererSlots: Record<RendererSlot, RegisteredRendererSlot[]>
  themes: RegisteredTheme[]
  backgroundAssets: RegisteredBackgroundAsset[]
}>(() => ({
  panels: [],
  composerActions: [],
  terminalCommands: [],
  renderers: {},
  rendererSlots: { markdown: [], code: [], patch: [], 'git-diff': [] },
  themes: [],
  backgroundAssets: [],
}))
const loaded = new Map<string, { key: string; dispose(): void }>()
let update = Promise.resolve()

export function selectRendererSlot(slot: RendererSlot, language?: string, preferredId?: string): RegisteredRendererSlot | undefined {
  const candidates = useUIPlugins.getState().rendererSlots[slot]
  const matchesLanguage = (renderer: RegisteredRendererSlot) => !renderer.languages.length || (language ? renderer.languages.includes(language) : false)
  if (preferredId && preferredId !== 'builtin') {
    const preferred = candidates.find((renderer) => (renderer.id === preferredId || renderer.id.endsWith(`:${preferredId}`)) && matchesLanguage(renderer))
    if (preferred) return preferred
  }
  return candidates.find(matchesLanguage)
}
export function syncUIPlugins(plugins: PluginInfo[]) {
  update = update
    .then(async () => {
      const active = plugins.filter((plugin) => plugin.status === 'active' && plugin.clientEntry)
      for (const [id, entry] of loaded)
        if (!active.some((p) => p.id === id && `${p.clientEntry}:${JSON.stringify(p.config)}` === entry.key)) {
          entry.dispose()
          loaded.delete(id)
        }
      for (const plugin of active) {
        if (loaded.has(plugin.id)) continue
        const effects: (() => void)[] = []
        let committed = false
        const own = (dispose: () => void) => {
          let active = true
          const once = () => {
            if (active) {
              active = false
              dispose()
            }
          }
          effects.push(once)
          return once
        }
        const dispose = () => {
          for (const effect of effects.reverse()) {
            try {
              effect()
            } catch (error) {
              report(error)
            }
          }
            if (committed)
              useUIPlugins.setState((state) => ({
                ...state,
                themes: state.themes.filter((theme) => theme.owner !== plugin.id),
                backgroundAssets: state.backgroundAssets.filter((asset) => asset.owner !== plugin.id),
              }))
        }
        try {
          const url = new URL(plugin.clientEntry!, useConnection.getState().url).href
          const module = (await import(/* @vite-ignore */ url)) as { default: ClientPlugin }
          if (typeof module.default?.apply !== 'function')
            throw new Error(`${plugin.id}: client entry must export apply(api)`)
          const pendingPanels: RegisteredPanel[] = []
          const pendingComposerActions: RegisteredComposerAction[] = []
          const pendingTerminalCommands: RegisteredTerminalCommand[] = []
          const pendingRenderers: Record<string, React.ComponentType<{ source: string }>> = {}
          const pendingRendererSlots: RegisteredRendererSlot[] = []
          const pendingThemes: RegisteredTheme[] = []
          const pendingBackgroundAssets: RegisteredBackgroundAsset[] = []
          const declaredTheme = plugin.contributes?.theme
          if (declaredTheme) {
            const parsedTheme = themeContributionSchema.parse(declaredTheme)
            pendingThemes.push({
              id: `${plugin.id}:${parsedTheme.id}`,
              title: parsedTheme.title,
              ...(parsedTheme.description ? { description: parsedTheme.description } : {}),
              ...(parsedTheme.preview ? { preview: parsedTheme.preview } : {}),
              priority: parsedTheme.priority ?? 0,
              tokenOverrides: parsedTheme.tokenOverrides as ClientTheme['tokenOverrides'],
              ...(parsedTheme.surfaceEffects ? { surfaceEffects: parsedTheme.surfaceEffects as NonNullable<ClientTheme['surfaceEffects']> } : {}),
              ...(parsedTheme.motion ? { motion: parsedTheme.motion as NonNullable<ClientTheme['motion']> } : {}),
              ...(parsedTheme.backgroundAssets.length ? { backgroundAssets: parsedTheme.backgroundAssets } : {}),
              owner: plugin.id,
            } as RegisteredTheme)
            for (const path of parsedTheme.backgroundAssets) pendingBackgroundAssets.push({ id: `${plugin.id}:${path}`, path, owner: plugin.id })
          }
          const result = await module.default.apply({
            react: React,
            client: client(),
            config: plugin.config,
            registerPanel(panel) {
              const id = `${plugin.id}:${panel.id}`
              if (useUIPlugins.getState().panels.some((p) => p.id === id) || pendingPanels.some((p) => p.id === id))
                throw new Error(`Duplicate panel ${id}`)
              const descriptor = toolWindowDescriptorSchema.parse({
                id: panel.id,
                title: panel.title,
                icon: panel.icon,
                defaultDock: panel.defaultDock,
                allowedDocks: panel.allowedDocks,
                scope: panel.scope,
                canPopout: panel.canPopout,
                closable: panel.closable,
                minSize: panel.minSize,
              })
              const registered = { ...descriptor, id, owner: plugin.id, component: panel.component }
              pendingPanels.push(registered)
              return own(() => {
                if (!committed) {
                  const index = pendingPanels.findIndex((item) => item.id === id)
                  if (index >= 0) pendingPanels.splice(index, 1)
                } else useUIPlugins.setState((state) => ({ panels: state.panels.filter((p) => p.id !== id) }))
              })
            },
            registerComposerAction(action) {
              const id = `${plugin.id}:${action.id}`
              if (
                useUIPlugins.getState().composerActions.some((item) => item.id === id) ||
                pendingComposerActions.some((item) => item.id === id)
              )
                throw new Error(`Duplicate composer action ${id}`)
              pendingComposerActions.push({ ...action, id, owner: plugin.id })
              return own(() => {
                if (!committed) {
                  const index = pendingComposerActions.findIndex((item) => item.id === id)
                  if (index >= 0) pendingComposerActions.splice(index, 1)
                } else
                  useUIPlugins.setState((state) => ({
                    composerActions: state.composerActions.filter((item) => item.id !== id),
                  }))
              })
            },
            registerTerminalCommand(command) {
              const id = command.id
              if (
                useUIPlugins.getState().terminalCommands.some((item) => item.id === id) ||
                pendingTerminalCommands.some((item) => item.id === id)
              )
                throw new Error(`Duplicate terminal command ${id}`)
              const registered = { ...command, id, owner: plugin.id }
              pendingTerminalCommands.push(registered)
              return own(() => {
                if (!committed) {
                  const index = pendingTerminalCommands.findIndex((item) => item.id === id)
                  if (index >= 0) pendingTerminalCommands.splice(index, 1)
                } else
                  useUIPlugins.setState((state) => ({
                    terminalCommands: state.terminalCommands.filter(
                      (item) => item.id !== id || item.owner !== plugin.id,
                    ),
                  }))
              })
            },
            registerRenderer(language, component) {
              if (
                !/^[a-z][a-z0-9-]{0,50}$/.test(language) ||
                ['mermaid', 'chart', 'flow'].includes(language) ||
                useUIPlugins.getState().renderers[language] ||
                pendingRenderers[language]
              )
                throw new Error(`Renderer already exists or is invalid: ${language}`)
              pendingRenderers[language] = component
              return own(() => {
                if (!committed) delete pendingRenderers[language]
                else
                  useUIPlugins.setState((state) => {
                    const renderers = { ...state.renderers }
                    delete renderers[language]
                    return { renderers }
                  })
              })
            },
            registerRendererSlot(slot: RendererSlot, component: RendererComponent, options: RendererSlotOptions) {
              if (!['markdown', 'code', 'patch', 'git-diff'].includes(slot)) throw new Error(`Invalid renderer slot: ${slot}`)
              if (!/^[a-z][a-z0-9._-]{0,95}$/.test(options.id)) throw new Error(`Invalid renderer id: ${options.id}`)
              const id = `${plugin.id}:${options.id}`
              const duplicate = useUIPlugins.getState().rendererSlots[slot].some((item) => item.id === id) || pendingRendererSlots.some((item) => item.id === id)
              if (duplicate) throw new Error(`Duplicate renderer ${id}`)
              const registered: RegisteredRendererSlot = {
                slot,
                component,
                owner: plugin.id,
                id,
                priority: options.priority ?? 0,
                languages: options.languages ? [...options.languages] : [],
                supportsStreaming: options.supportsStreaming ?? false,
                editable: options.editable ?? false,
                ...(options.fallback ? { fallback: options.fallback } : {}),
              }
              pendingRendererSlots.push(registered)
              return own(() => {
                if (!committed) {
                  const index = pendingRendererSlots.findIndex((item) => item.id === id)
                  if (index >= 0) pendingRendererSlots.splice(index, 1)
                } else
                  useUIPlugins.setState((state) => ({
                    rendererSlots: {
                      ...state.rendererSlots,
                      [slot]: state.rendererSlots[slot].filter((item) => item.id !== id),
                    },
                  }))
              })
            },
            registerTheme(theme: ClientTheme) {
              const parsed = themeContributionSchema.parse(theme)
              const id = `${plugin.id}:${parsed.id}`
              if (useUIPlugins.getState().themes.some((item) => item.id === id) || pendingThemes.some((item) => item.id === id))
                throw new Error(`Duplicate theme ${id}`)
              const registered = {
                id,
                title: parsed.title,
                ...(parsed.description ? { description: parsed.description } : {}),
                ...(parsed.preview ? { preview: parsed.preview } : {}),
                priority: parsed.priority ?? 0,
                tokenOverrides: parsed.tokenOverrides as ClientTheme['tokenOverrides'],
                ...(parsed.surfaceEffects ? { surfaceEffects: parsed.surfaceEffects as NonNullable<ClientTheme['surfaceEffects']> } : {}),
                ...(parsed.motion ? { motion: parsed.motion as NonNullable<ClientTheme['motion']> } : {}),
                ...(parsed.backgroundAssets.length ? { backgroundAssets: parsed.backgroundAssets } : {}),
                owner: plugin.id,
              } as RegisteredTheme
              pendingThemes.push(registered)
              return own(() => {
                if (!committed) {
                  const index = pendingThemes.findIndex((item) => item.id === id)
                  if (index >= 0) pendingThemes.splice(index, 1)
                } else useUIPlugins.setState((state) => ({ themes: state.themes.filter((item) => item.id !== id) }))
              })
            },
            registerBackgroundAsset(asset: BackgroundAsset) {
              if (!/^[a-z][a-z0-9._-]{0,95}$/.test(asset.id)) throw new Error(`Invalid background asset id: ${asset.id}`)
              if (!/^assets\/(?!.*\.\.)(?:[a-zA-Z0-9._-]+\/)*[a-zA-Z0-9._-]+$/.test(asset.path)) throw new Error(`Invalid background asset path: ${asset.path}`)
              const id = `${plugin.id}:${asset.id}`
              if (useUIPlugins.getState().backgroundAssets.some((item) => item.id === id) || pendingBackgroundAssets.some((item) => item.id === id)) throw new Error(`Duplicate background asset ${id}`)
              const registered: RegisteredBackgroundAsset = { ...asset, id, owner: plugin.id }
              pendingBackgroundAssets.push(registered)
              return own(() => {
                if (!committed) {
                  const index = pendingBackgroundAssets.findIndex((item) => item.id === id)
                  if (index >= 0) pendingBackgroundAssets.splice(index, 1)
                } else useUIPlugins.setState((state) => ({ backgroundAssets: state.backgroundAssets.filter((item) => item.id !== id) }))
              })
            },
            onEvent: (listener) => own(client().onEvent(listener)),
            effect(setup) {
              const cleanup = setup()
              return own(() => cleanup?.())
            },
          })
          if (result) own(result)
          committed = true
          useUIPlugins.setState((state) => ({
            panels: [...state.panels, ...pendingPanels],
            composerActions: [...state.composerActions, ...pendingComposerActions],
            terminalCommands: [...state.terminalCommands, ...pendingTerminalCommands],
            renderers: { ...state.renderers, ...pendingRenderers },
            rendererSlots: pendingRendererSlots.reduce(
              (slots, renderer) => ({
                ...slots,
                [renderer.slot]: [...slots[renderer.slot], renderer].sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id)),
              }),
              state.rendererSlots,
            ),
            themes: [...state.themes, ...pendingThemes].sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0) || left.id.localeCompare(right.id)),
            backgroundAssets: [...state.backgroundAssets, ...pendingBackgroundAssets].sort((left, right) => left.id.localeCompare(right.id)),
          }))
          loaded.set(plugin.id, { key: `${plugin.clientEntry}:${JSON.stringify(plugin.config)}`, dispose })
        } catch (error) {
          dispose()
          report(error)
        }
      }
    })
    .catch(report)
  return update
}
