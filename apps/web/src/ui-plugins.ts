import * as React from 'react'
import { create } from 'zustand'
import type { PluginInfo } from '@hbar/contracts'
import type { ClientPanel, ComposerAction, ClientPlugin } from '@hbar/ui-sdk'
import { client, report, useConnection } from './stores'

interface RegisteredPanel extends ClientPanel {
  owner: string
}
interface RegisteredComposerAction extends ComposerAction {
  owner: string
}
export const useUIPlugins = create<{
  panels: RegisteredPanel[]
  composerActions: RegisteredComposerAction[]
  renderers: Record<string, React.ComponentType<{ source: string }>>
}>(() => ({ panels: [], composerActions: [], renderers: {} }))
const loaded = new Map<string, { key: string; dispose(): void }>()
let update = Promise.resolve()
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
        }
        try {
          const url = new URL(plugin.clientEntry!, useConnection.getState().url).href
          const module = (await import(/* @vite-ignore */ url)) as { default: ClientPlugin }
          if (typeof module.default?.apply !== 'function')
            throw new Error(`${plugin.id}: client entry must export apply(api)`)
          const result = await module.default.apply({
            react: React,
            client: client(),
            config: plugin.config,
            registerPanel(panel) {
              const id = `${plugin.id}:${panel.id}`
              if (useUIPlugins.getState().panels.some((p) => p.id === id)) throw new Error(`Duplicate panel ${id}`)
              useUIPlugins.setState((state) => ({ panels: [...state.panels, { ...panel, id, owner: plugin.id }] }))
              return own(() => useUIPlugins.setState((state) => ({ panels: state.panels.filter((p) => p.id !== id) })))
            },
            registerComposerAction(action) {
              const id = `${plugin.id}:${action.id}`
              if (useUIPlugins.getState().composerActions.some((item) => item.id === id))
                throw new Error(`Duplicate composer action ${id}`)
              useUIPlugins.setState((state) => ({
                composerActions: [...state.composerActions, { ...action, id, owner: plugin.id }],
              }))
              return own(() =>
                useUIPlugins.setState((state) => ({
                  composerActions: state.composerActions.filter((item) => item.id !== id),
                })),
              )
            },
            registerRenderer(language, component) {
              if (
                !/^[a-z][a-z0-9-]{0,50}$/.test(language) ||
                ['mermaid', 'chart', 'flow'].includes(language) ||
                useUIPlugins.getState().renderers[language]
              )
                throw new Error(`Renderer already exists or is invalid: ${language}`)
              useUIPlugins.setState((state) => ({ renderers: { ...state.renderers, [language]: component } }))
              return own(() =>
                useUIPlugins.setState((state) => {
                  const renderers = { ...state.renderers }
                  delete renderers[language]
                  return { renderers }
                }),
              )
            },
            onEvent: (listener) => own(client().onEvent(listener)),
            effect(setup) {
              const cleanup = setup()
              return own(() => cleanup?.())
            },
          })
          if (result) own(result)
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
