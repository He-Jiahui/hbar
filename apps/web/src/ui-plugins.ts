import * as React from 'react'
import { create } from 'zustand'
import type { PluginInfo } from '@hbar/contracts'
import type { ClientPanel, ClientPlugin, ClientTerminalCommand, ComposerAction } from '@hbar/ui-sdk'
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
export const useUIPlugins = create<{
  panels: RegisteredPanel[]
  composerActions: RegisteredComposerAction[]
  terminalCommands: RegisteredTerminalCommand[]
  renderers: Record<string, React.ComponentType<{ source: string }>>
}>(() => ({ panels: [], composerActions: [], terminalCommands: [], renderers: {} }))
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
        const pendingPanels: RegisteredPanel[] = []
        const pendingComposerActions: RegisteredComposerAction[] = []
        const pendingTerminalCommands: RegisteredTerminalCommand[] = []
        const pendingRenderers: Record<string, React.ComponentType<{ source: string }>> = {}
        let committed = false
        const result = await module.default.apply({
          react: React,
          client: client(),
          config: plugin.config,
          registerPanel(panel) {
            const id = `${plugin.id}:${panel.id}`
            if (
              useUIPlugins.getState().panels.some((p) => p.id === id) ||
              pendingPanels.some((p) => p.id === id)
            )
              throw new Error(`Duplicate panel ${id}`)
            const registered = { ...panel, id, owner: plugin.id }
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
                  terminalCommands: state.terminalCommands.filter((item) => item.id !== id || item.owner !== plugin.id),
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
