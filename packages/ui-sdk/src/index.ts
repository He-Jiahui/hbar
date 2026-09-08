import type * as React from 'react'
import type { ClientTransport } from '@hbar/client'
import type { WireNotification } from '@hbar/contracts'

export interface ClientPanel {
  id: string
  title: string
  placement?: 'left' | 'right' | 'bottom' | 'editor'
  component: React.ComponentType
}
export interface ClientPluginAPI {
  react: typeof React
  client: ClientTransport
  config: Record<string, unknown>
  registerPanel(panel: ClientPanel): () => void
  registerRenderer(language: string, component: React.ComponentType<{ source: string }>): () => void
  onEvent(listener: (event: WireNotification) => void): () => void
  effect(setup: () => void | (() => void)): () => void
}
export interface ClientPlugin {
  apply(api: ClientPluginAPI): void | (() => void) | Promise<void | (() => void)>
}
