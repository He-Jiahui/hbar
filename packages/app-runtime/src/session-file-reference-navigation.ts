import { CommandError, createCommandClient, type CommandRegistry, type ExecuteOptions } from '@hbar/commands'
import { z } from 'zod'
import { fileWorkspaceCommands } from '@hbar/contracts/commands/file-workspace'
import type { StateReader } from './state'
import { canonicalFilePath } from './file-workspace-documents'
import { sessionToolCommands } from './session-tools'
import type {
  FileWorkspaceState,
  NavigationState,
  PresentationState,
  SessionTimelineState,
  SurfaceState,
} from './types'
import type { WorkspaceTabsState } from './workspace-tabs-runtime'

const MESSAGE_FILES_COMMAND = fileWorkspaceCommands['messageFiles.open']
const MAX_WAIT_MS = 12_000

type MessageFilesInput = z.output<typeof MESSAGE_FILES_COMMAND.input>

export const sessionFileReferenceCommands = {
  'messageFiles.open': MESSAGE_FILES_COMMAND,
}

export interface SessionFileReferenceNavigationOptions {
  readonly navigation: StateReader<NavigationState>
  readonly tabs: StateReader<WorkspaceTabsState>
  readonly timeline: StateReader<SessionTimelineState>
  readonly surfaces: StateReader<SurfaceState>
  readonly presentation: StateReader<PresentationState>
  readonly files: StateReader<FileWorkspaceState>
  readonly isDisposed: () => boolean
  readonly onSubscriberError: (reason: unknown) => void
}

interface ActiveIntent {
  readonly id: number
  readonly input: MessageFilesInput
  readonly controller: AbortController
  readonly mode: 'dock' | 'workbench'
  instanceId?: string
  activeTabId: string | null
  cancelReason?: CommandError
}

function commandCode(reason: unknown): string {
  const candidate = reason && typeof reason === 'object' && 'code' in reason ? reason.code : null
  return typeof candidate === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(candidate) ? candidate : 'EXECUTION_FAILED'
}

function commandError(reason: unknown, fallback = 'Message file navigation failed'): CommandError {
  return reason instanceof CommandError ? reason : new CommandError(commandCode(reason), fallback)
}

function sameNavigation(left: NavigationState, input: MessageFilesInput): boolean {
  return left.status === 'idle' && left.workspaceId === input.workspaceId && left.sessionId === input.sessionId
}

function sameSourceTab(tabs: WorkspaceTabsState, input: MessageFilesInput): boolean {
  const source = tabs.items.find(
    (item) => item.kind === 'session' && item.id === input.sessionId && item.workspaceId === input.workspaceId,
  )
  return (source?.instanceKey ?? null) === input.sourceTabInstanceKey
}

function sameMessage(timeline: SessionTimelineState, input: MessageFilesInput): boolean {
  return (
    timeline.status === 'ready' &&
    timeline.sessionId === input.sessionId &&
    timeline.messages.some((message) => message.sessionId === input.sessionId && message.id === input.messageId)
  )
}

function samePanel(surfaces: SurfaceState, instanceId: string, input: MessageFilesInput): boolean {
  const panel = surfaces.panels[instanceId]
  return Boolean(
    panel &&
    panel.panelId === 'files' &&
    panel.workspaceId === input.workspaceId &&
    panel.sessionId === input.sessionId,
  )
}

function workbenchFor(
  tabs: WorkspaceTabsState,
  surfaces: SurfaceState,
  input: MessageFilesInput,
): Extract<WorkspaceTabsState['items'][number], { kind: 'workbench' }> | undefined {
  return tabs.items.find(
    (item): item is Extract<WorkspaceTabsState['items'][number], { kind: 'workbench' }> =>
      item.kind === 'workbench' &&
      item.sourceSessionId === input.sessionId &&
      item.workspaceId === input.workspaceId &&
      surfaces.panels[item.panelInstanceId]?.panelId === 'files',
  )
}

function sameEntry(files: FileWorkspaceState, instanceId: string, input: MessageFilesInput): boolean {
  const entry = files.entries[instanceId]
  return Boolean(entry && entry.workspaceId === input.workspaceId && entry.sourceSessionId === input.sessionId)
}

function raceAbort<Value>(operation: Promise<Value>, signal: AbortSignal): Promise<Value> {
  if (signal.aborted) return Promise.reject(new CommandError('CANCELLED', 'Message file navigation was cancelled'))
  let onAbort: (() => void) | undefined
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new CommandError('CANCELLED', 'Message file navigation was cancelled'))
    signal.addEventListener('abort', onAbort, { once: true })
  })
  return Promise.race([operation, aborted]).finally(() => {
    if (onAbort) signal.removeEventListener('abort', onAbort)
  })
}

function validateReferencePath(rawPath: string): string {
  const normalized = rawPath.replaceAll('\\', '/')
  if (
    rawPath.length > 4000 ||
    [...rawPath].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
    normalized.split('/').includes('..') ||
    /^[a-z][a-z0-9+.-]*:/i.test(normalized) ||
    normalized.startsWith('~')
  )
    throw new CommandError('INVALID_INPUT', 'Message file references require a workspace-relative path')
  return canonicalFilePath(rawPath)
}

/** Client-only coordination from a message reference to the current Session Files view. */
export function createSessionFileReferenceNavigation(
  local: CommandRegistry,
  options: SessionFileReferenceNavigationOptions,
) {
  const sessionTools = createCommandClient(sessionToolCommands, local)
  const fileWorkspace = createCommandClient(fileWorkspaceCommands, local)
  let disposed = false
  let nextIntent = 0
  let active: ActiveIntent | null = null

  const cancel = (reason = new CommandError('SOURCE_CHANGED', 'The message file target changed')) => {
    if (active) {
      active.cancelReason = reason
      active.controller.abort()
    }
    active = null
  }

  const fence = (intent: ActiveIntent, instanceId?: string): void => {
    if (disposed || options.isDisposed() || active?.id !== intent.id)
      throw new CommandError('SOURCE_CHANGED', 'The message file target changed')
    if (!sameNavigation(options.navigation.getSnapshot(), intent.input))
      throw new CommandError('SOURCE_CHANGED', 'The source Session changed')
    if (!sameSourceTab(options.tabs.getSnapshot(), intent.input))
      throw new CommandError('SOURCE_CHANGED', 'The source Session tab changed')
    if (!sameMessage(options.timeline.getSnapshot(), intent.input))
      throw new CommandError('SOURCE_CHANGED', 'The source message is no longer available')
    if (instanceId !== undefined && !samePanel(options.surfaces.getSnapshot(), instanceId, intent.input))
      throw new CommandError('TARGET_CHANGED', 'The Files panel target changed')
    if (
      intent.mode === 'workbench' &&
      intent.instanceId !== undefined &&
      options.tabs.getSnapshot().activeId !== intent.activeTabId
    )
      throw new CommandError('SOURCE_CHANGED', 'The Files view is no longer selected')
    if (instanceId !== undefined) {
      const presentation = options.presentation.getSnapshot()
      if (
        presentation.page.kind !== 'session' ||
        presentation.modalInstanceId !== null ||
        (intent.mode === 'dock' && presentation.toolInstanceId !== instanceId)
      )
        throw new CommandError('TARGET_CHANGED', 'The Files view is no longer visible')
    }
  }

  const waitForReadyEntry = async (intent: ActiveIntent, instanceId: string): Promise<void> => {
    const current = options.files.getSnapshot().entries[instanceId]
    if (current && current.status !== 'loading' && current.sessionTarget?.sessionId === intent.input.sessionId) return
    await raceAbort(
      new Promise<void>((resolve, reject) => {
        let done = false
        let unsubscribe: () => void = () => undefined
        const signal = intent.controller.signal
        const finish = (reason?: unknown) => {
          if (done) return
          done = true
          unsubscribe()
          signal.removeEventListener('abort', abort)
          reason ? reject(reason) : resolve()
        }
        const check = () => {
          try {
            fence(intent, instanceId)
            const entry = options.files.getSnapshot().entries[instanceId]
            if (entry && entry.status !== 'loading' && entry.sessionTarget?.sessionId === intent.input.sessionId)
              finish()
          } catch (reason) {
            finish(reason)
          }
        }
        const abort = () => finish(new CommandError('CANCELLED', 'Message file navigation was cancelled'))
        unsubscribe = options.files.subscribe(check)
        signal.addEventListener('abort', abort, { once: true })
        check()
      }),
      intent.controller.signal,
    )
  }

  const open = async (
    input: MessageFilesInput,
    execution: ExecuteOptions,
  ): Promise<{ readonly instanceId: string; readonly previewId: string; readonly path: string }> => {
    if (disposed || options.isDisposed()) throw new CommandError('DISPOSED', 'Runtime is disposed')
    const path = validateReferencePath(input.path)
    cancel()
    const controller = new AbortController()
    const existingWorkbench = workbenchFor(options.tabs.getSnapshot(), options.surfaces.getSnapshot(), input)
    const intent: ActiveIntent = {
      id: ++nextIntent,
      input,
      controller,
      mode: existingWorkbench ? 'workbench' : 'dock',
      activeTabId: existingWorkbench?.id ?? options.tabs.getSnapshot().activeId,
    }
    active = intent
    const deadline = setTimeout(() => {
      if (active?.id === intent.id) cancel(new CommandError('TIMEOUT', 'Message file navigation timed out'))
    }, MAX_WAIT_MS)
    const abortFromExecution = () => {
      if (active?.id === intent.id) cancel(new CommandError('CANCELLED', 'Message file navigation was cancelled'))
    }
    if (execution.signal?.aborted) abortFromExecution()
    else execution.signal?.addEventListener('abort', abortFromExecution, { once: true })
    try {
      fence(intent)
      let instanceId: string
      if (existingWorkbench) {
        if (options.tabs.getSnapshot().activeId !== existingWorkbench.id)
          await raceAbort(
            local.execute('workspaceTabs.select', { id: existingWorkbench.id }, { signal: controller.signal }),
            controller.signal,
          )
        instanceId = existingWorkbench.panelInstanceId
      } else {
        const opened = await raceAbort(
          sessionTools.execute(
            'sessionTools.open',
            {
              panelId: 'files',
              workspaceId: input.workspaceId,
              sessionId: input.sessionId,
              sourceTabInstanceKey: input.sourceTabInstanceKey,
            },
            { signal: controller.signal },
          ),
          controller.signal,
        )
        instanceId = opened.instanceId
      }
      intent.instanceId = instanceId
      fence(intent, instanceId)
      let entry = options.files.getSnapshot().entries[instanceId]
      if (
        !sameEntry(options.files.getSnapshot(), instanceId, input) ||
        !entry ||
        entry.status === 'error' ||
        entry.sessionTarget?.sessionId !== input.sessionId
      ) {
        await raceAbort(
          fileWorkspace.execute(
            'fileWorkspace.refresh',
            { instanceId, preservePreview: true, sourceSessionId: input.sessionId },
            { signal: controller.signal },
          ),
          controller.signal,
        )
      } else if (entry.status === 'loading') {
        await waitForReadyEntry(intent, instanceId)
      }
      fence(intent, instanceId)
      entry = options.files.getSnapshot().entries[instanceId]
      if (!entry || entry.workspaceId !== input.workspaceId || entry.sourceSessionId !== input.sessionId)
        throw new CommandError('TARGET_CHANGED', 'The Files panel target changed')
      await raceAbort(
        fileWorkspace.execute(
          'fileWorkspace.openEntry',
          {
            instanceId,
            workspaceId: input.workspaceId,
            path,
            directory: false,
            preservePreview: true,
            sourceSessionId: input.sessionId,
            ...(entry?.sessionTarget ? { sessionTarget: entry.sessionTarget } : {}),
            ...(input.line === undefined
              ? {}
              : { reveal: { line: input.line, ...(input.column === undefined ? {} : { column: input.column }) } }),
          },
          { signal: controller.signal },
        ),
        controller.signal,
      )
      fence(intent, instanceId)
      const latest = options.files.getSnapshot().entries[instanceId]
      const previewId = latest?.activePreviewId
      const preview = previewId ? latest?.previews.find((candidate) => candidate.id === previewId) : undefined
      if (!latest || !previewId || preview?.kind !== 'document' || preview.path !== path)
        throw new CommandError('RESULT_UNKNOWN', 'The opened file preview was not confirmed')
      return { instanceId, previewId, path }
    } catch (reason) {
      throw intent.cancelReason ?? commandError(reason)
    } finally {
      clearTimeout(deadline)
      execution.signal?.removeEventListener('abort', abortFromExecution)
      if (active?.id === intent.id) {
        active = null
      }
    }
  }

  local.register(fileWorkspaceCommands['messageFiles.open'], (input, execution) => open(input, execution))

  const cancelOnSourceChange = () => {
    const intent = active
    if (!intent) return
    try {
      if (!sameNavigation(options.navigation.getSnapshot(), intent.input)) return cancel()
      if (!sameSourceTab(options.tabs.getSnapshot(), intent.input)) return cancel()
      if (intent.instanceId !== undefined) {
        try {
          fence(intent, intent.instanceId)
        } catch (reason) {
          return cancel(commandError(reason, 'The Files view target changed'))
        }
      }
    } catch (reason) {
      options.onSubscriberError(reason)
      cancel()
    }
  }
  const unsubscribeNavigation = options.navigation.subscribe(cancelOnSourceChange)
  const unsubscribeTabs = options.tabs.subscribe(cancelOnSourceChange)
  const unsubscribePresentation = options.presentation.subscribe(cancelOnSourceChange)
  const unsubscribeSurfaces = options.surfaces.subscribe(cancelOnSourceChange)

  return {
    dispose() {
      if (disposed) return
      disposed = true
      cancel()
      unsubscribeNavigation()
      unsubscribeTabs()
      unsubscribePresentation()
      unsubscribeSurfaces()
    },
  }
}
