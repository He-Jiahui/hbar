import type * as React from 'react'
import type { ClientTransport } from '@hbar/client'
import type { WireNotification } from '@hbar/contracts'
import type { TerminalCommand } from '@hbar/terminal'

export interface ClientPanel {
  id: string
  title: string
  placement?: 'left' | 'right' | 'bottom' | 'editor'
  component: React.ComponentType
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

export interface ClientPluginAPI {
  react: typeof React
  client: ClientTransport
  config: Record<string, unknown>
  registerPanel(panel: ClientPanel): () => void
  registerComposerAction(action: ComposerAction): () => void
  registerTerminalCommand(command: ClientTerminalCommand): () => void
  registerRenderer(language: string, component: React.ComponentType<{ source: string }>): () => void
  onEvent(listener: (event: WireNotification) => void): () => void
  effect(setup: () => void | (() => void)): () => void
}
export interface ClientPlugin {
  apply(api: ClientPluginAPI): void | (() => void) | Promise<void | (() => void)>
}
