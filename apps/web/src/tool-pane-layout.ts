import { useLayoutEffect, useRef, useState } from 'react'
import { CommandError } from '@hbar/commands'
import type { ClientLayoutState, createAppRuntime } from '@hbar/app-runtime'
import { normalizeShellLayout, withSidebarWidth, withToolPaneWidth, type ShellLayoutDescription } from './shell-layout'

export interface ToolPaneLayoutPort {
  readonly read: () => ClientLayoutState
  readonly commit: (
    description: ShellLayoutDescription,
    expectedRevision: number,
  ) => Promise<{ readonly persisted: boolean }>
}

/** The existing layout owner serializes and CAS-checks writes; only the preferred width changes. */
export async function saveToolPaneWidth(port: ToolPaneLayoutPort, widthRem: number): Promise<void> {
  return savePaneWidth(port, widthRem, withToolPaneWidth)
}

export async function saveSidebarWidth(port: ToolPaneLayoutPort, widthRem: number): Promise<void> {
  return savePaneWidth(port, widthRem, withSidebarWidth)
}

async function savePaneWidth(
  port: ToolPaneLayoutPort,
  widthRem: number,
  update: (layout: ShellLayoutDescription, widthRem: number) => ShellLayoutDescription,
): Promise<void> {
  const current = port.read()
  if (current.status !== 'ready' || current.restoreError)
    throw new CommandError('PERSISTENCE_RESTORE_FAILED', 'Read the saved layout before changing its width')
  const description = update(normalizeShellLayout(current.description), widthRem)
  const result = await port.commit(description, current.revision)
  if (!result.persisted)
    throw new CommandError(
      'PERSISTENCE_UNAVAILABLE',
      'The width applies locally but could not be saved for this device',
    )
}

type ResizeReceipt =
  | { readonly status: 'idle' }
  | { readonly status: 'saving'; readonly target: string; readonly widthRem: number }
  | { readonly status: 'failed'; readonly target: string; readonly widthRem: number; readonly code: string }

/** Transient interaction feedback only; the canonical layout remains in the runtime store. */
export function useToolPaneLayout(
  runtime: ReturnType<typeof createAppRuntime>,
  target: string,
  persistenceReady: boolean,
  layout: ClientLayoutState,
) {
  return usePaneLayout(runtime, target, persistenceReady, layout, saveToolPaneWidth)
}

export function useSidebarLayout(
  runtime: ReturnType<typeof createAppRuntime>,
  target: string,
  persistenceReady: boolean,
  layout: ClientLayoutState,
) {
  return usePaneLayout(runtime, target, persistenceReady, layout, saveSidebarWidth)
}

function usePaneLayout(
  runtime: ReturnType<typeof createAppRuntime>,
  target: string,
  persistenceReady: boolean,
  layout: ClientLayoutState,
  save: (port: ToolPaneLayoutPort, widthRem: number) => Promise<void>,
) {
  const [receipt, setReceipt] = useState<ResizeReceipt>({ status: 'idle' })
  const owner = useRef({ runtime, target, save })
  owner.current = { runtime, target, save }
  const generation = useRef(0)
  const pending = useRef(false)
  useLayoutEffect(() => {
    generation.current += 1
    pending.current = false
    setReceipt({ status: 'idle' })
    return () => {
      generation.current += 1
    }
  }, [runtime])
  const commit = async (widthRem: number): Promise<void> => {
    if (owner.current.runtime !== runtime || owner.current.target !== target || owner.current.save !== save)
      throw new CommandError('COMMAND_CONFLICT', 'The original pane is no longer the active resize owner')
    if (pending.current) throw new CommandError('BUSY', 'A width change is already being saved')
    if (!persistenceReady) throw new CommandError('PERSISTENCE_UNAVAILABLE', 'Device layout preferences are not ready')
    const version = ++generation.current
    pending.current = true
    setReceipt({ status: 'saving', target, widthRem })
    try {
      await save(
        {
          read: runtime.view.state.layout.getSnapshot,
          commit: (description, expectedRevision) =>
            runtime.view.commands.execute('layout.commit', { description, expectedRevision }),
        },
        widthRem,
      )
      if (generation.current === version) setReceipt({ status: 'idle' })
    } catch (reason) {
      if (generation.current === version)
        setReceipt({
          status: 'failed',
          target,
          widthRem,
          code: reason instanceof CommandError ? reason.code : 'PERSISTENCE_FAILED',
        })
      throw reason
    } finally {
      if (generation.current === version) pending.current = false
    }
  }
  return {
    disabled: !persistenceReady || layout.status !== 'ready' || !!layout.restoreError || receipt.status === 'saving',
    receipt: receipt.status !== 'idle' && receipt.target !== target ? ({ status: 'idle' } as const) : receipt,
    commit,
  }
}
