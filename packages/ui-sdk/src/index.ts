import type * as React from 'react'
import type { ClientTransport } from '@hbar/client'
import type { ThemeProfile, WireNotification } from '@hbar/contracts'
import type { ToolWindowDescriptor, ToolWindowDock } from '@hbar/contracts'
import type { TerminalCommand } from '@hbar/terminal'

export interface ToolWindowProps {
  panelId: string
  owner: string
  dock: ToolWindowDock
  workspaceId?: string
  sessionId?: string
  windowId?: string
  window?: Window
  document?: Document
}

export interface ClientPanel extends ToolWindowDescriptor {
  component: React.ComponentType<ToolWindowProps>
}

export type ComposerActionGroup = 'session' | 'context' | 'tools' | 'extensions'
export type ComposerActionIcon =
  'target' | 'clipboard-list' | 'gauge' | 'image' | 'file' | 'paperclip' | 'puzzle' | 'wrench'

export interface ComposerActionContext {
  sessionId?: string
  workspaceId?: string
  openFilePicker(options?: { accept?: string; multiple?: boolean }): void
}

export interface ClientTerminalContext {
  sessionId?: string | undefined
  workspaceId?: string | undefined
  writeMarkdown(markdown: string): void
  setInput(value: string): void
}

export interface ClientTerminalCommand extends TerminalCommand {
  execute(context: ClientTerminalContext, args: string[]): void | Promise<void>
}

/** A trusted client-plugin contribution shown in the session composer menu. */
export interface ComposerAction {
  id: string
  label: string
  description?: string
  group: ComposerActionGroup
  icon: ComposerActionIcon
  keywords?: string[]
  requiresSession?: boolean
  disabled?: boolean
  disabledReason?: string
  execute?(context: ComposerActionContext): void | Promise<void>
}

export type RendererSlot = 'markdown' | 'code' | 'patch' | 'git-diff'
export interface RendererSlotOptions {
  id: string
  priority?: number
  languages?: string[]
}
export type RendererComponent = React.ComponentType<{ source: string; language?: string }>
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }
export interface ClientTheme {
  id: string
  title: string
  description?: string
  priority?: number
  tokenOverrides: DeepPartial<ThemeProfile>
}

export interface ClientPluginAPI {
  react: typeof React
  client: ClientTransport
  config: Record<string, unknown>
  registerPanel(panel: ClientPanel): () => void
  registerComposerAction(action: ComposerAction): () => void
  registerTerminalCommand(command: ClientTerminalCommand): () => void
  registerRenderer(language: string, component: React.ComponentType<{ source: string }>): () => void
  registerRendererSlot(slot: RendererSlot, component: RendererComponent, options: RendererSlotOptions): () => void
  registerTheme(theme: ClientTheme): () => void
  onEvent(listener: (event: WireNotification) => void): () => void
  effect(setup: () => void | (() => void)): () => void
}
export interface ClientPlugin {
  apply(api: ClientPluginAPI): void | (() => void) | Promise<void | (() => void)>
}
