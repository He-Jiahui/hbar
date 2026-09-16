import { create } from 'zustand'
import type { ArtifactRef, UserInput } from '@hbar/contracts'
import type { HbarClient } from '@hbar/client'
import {
  acknowledgeComposerDraft,
  client,
  moveComposerDraft,
  openSession,
  refreshCatalog,
  updateComposerDraft,
  useConnection,
  useWorkbench,
} from './stores'
import { newRequestId } from './browser-utils'
import { composerDraftKey, MAX_COMPOSER_ATTACHMENTS } from './composer-draft'

interface ComposerOperation {
  readonly source?: HbarClient
  readonly sending: boolean
  readonly uploading: boolean
  readonly error?: string
}
interface ComposerOperations {
  readonly byTarget: Readonly<Record<string, ComposerOperation>>
}
export const useComposerOperations = create<ComposerOperations>(() => ({ byTarget: {} }))
export function composerTarget(workspaceId: string, sessionId: string): string {
  return JSON.stringify([workspaceId, sessionId])
}
const requestsByConnection = new WeakMap<HbarClient, Map<string, { key: string; requestId: string }>>()
const MAX_OPERATION_TARGETS = 64

function patch(target: string, update: Partial<ComposerOperation>) {
  useComposerOperations.setState((state) => {
    const next = { sending: false, uploading: false, ...state.byTarget[target], ...update }
    const inactive = Object.entries(state.byTarget).filter(
      ([key, value]) => key !== target && !value.sending && !value.uploading,
    )
    const active = Object.entries(state.byTarget).filter(
      ([key, value]) => key !== target && (value.sending || value.uploading),
    )
    return { byTarget: Object.fromEntries([...inactive.slice(-MAX_OPERATION_TARGETS), ...active, [target, next]]) }
  })
}
export function clearComposerError(workspaceId: string, sessionId: string) {
  const target = composerTarget(workspaceId, sessionId)
  useComposerOperations.setState((state) => {
    const value = state.byTarget[target]
    return value
      ? { byTarget: { ...state.byTarget, [target]: { sending: value.sending, uploading: value.uploading } } }
      : state
  })
}

export async function sendComposerInput(options: {
  sessionId: string
  workspaceId: string
  modelId: string
  input: UserInput
}): Promise<boolean> {
  const targetKey = composerTarget(options.workspaceId, options.sessionId)
  const running = useComposerOperations.getState().byTarget[targetKey]
  const connection = client()
  if (running?.source === connection && (running.sending || running.uploading)) return false
  let requests = requestsByConnection.get(connection)
  if (!requests) {
    requests = new Map()
    requestsByConnection.set(connection, requests)
  }
  const activeAtStart = useWorkbench.getState().activeSession
  const current = () => useConnection.getState().client === connection
  const stillSelected = () =>
    current() &&
    useWorkbench.getState().workspaceId === options.workspaceId &&
    useWorkbench.getState().activeSession === activeAtStart
  clearComposerError(options.workspaceId, options.sessionId)
  patch(targetKey, { sending: true, uploading: false, source: connection })
  let resolvedTarget = targetKey
  try {
    let sessionId = options.sessionId
    if (!sessionId) {
      const created = await connection.call('session.create', { workspaceId: options.workspaceId })
      sessionId = created.id
      if (!current()) return false
      moveComposerDraft(undefined, sessionId, options.workspaceId)
      await refreshCatalog()
      if (stillSelected()) await openSession(sessionId)
    }
    if (!current()) return false
    resolvedTarget = composerTarget(options.workspaceId, sessionId)
    patch(resolvedTarget, { sending: true, source: connection })
    const key = JSON.stringify({ sessionId, modelId: options.modelId, input: options.input })
    let request = requests.get(resolvedTarget)
    if (request?.key !== key) {
      request = { key, requestId: newRequestId() }
      requests.set(resolvedTarget, request)
    }
    await connection.call('run.start', {
      sessionId,
      modelId: options.modelId,
      input: options.input,
      requestId: request.requestId,
    })
    requests.delete(resolvedTarget)
    if (!current()) return false
    acknowledgeComposerDraft(sessionId, {
      text: options.input.text,
      images: options.input.images,
      files: options.input.files ?? [],
    })
    return true
  } catch (cause) {
    if (current()) patch(resolvedTarget, { error: cause instanceof Error ? cause.message : String(cause) })
    return false
  } finally {
    if (current()) {
      patch(targetKey, { sending: false })
      patch(resolvedTarget, { sending: false })
    }
  }
}

export async function attachComposerFiles(options: {
  workspaceId: string
  sessionId: string
  files: readonly File[]
  kind: 'image' | 'file'
  limitMessage: string
}): Promise<void> {
  const target = composerTarget(options.workspaceId, options.sessionId)
  const state = useComposerOperations.getState().byTarget[target]
  const connection = client()
  if (state?.source === connection && (state.uploading || state.sending)) return
  const current = () => useConnection.getState().client === connection
  const draft = useWorkbench.getState().drafts[composerDraftKey(options.sessionId, options.workspaceId)]
  const capacity = MAX_COMPOSER_ATTACHMENTS - (draft?.images.length ?? 0) - (draft?.files.length ?? 0)
  if (options.files.length > capacity) {
    patch(target, { error: options.limitMessage, source: connection })
    return
  }
  clearComposerError(options.workspaceId, options.sessionId)
  patch(target, { uploading: true, sending: false, source: connection })
  const images: ArtifactRef[] = [],
    files: ArtifactRef[] = []
  try {
    for (const file of options.files) {
      if (!current()) return
      const artifact = await connection.upload(file)
      if (options.kind === 'image' && artifact.mime.startsWith('image/')) images.push(artifact)
      else files.push(artifact)
    }
  } catch (cause) {
    if (current()) patch(target, { error: cause instanceof Error ? cause.message : String(cause) })
  } finally {
    if (current())
      updateComposerDraft(
        options.sessionId,
        (value) => ({
          images: [...value.images, ...images],
          files: [...value.files, ...files],
        }),
        options.workspaceId,
      )
    if (current()) patch(target, { uploading: false })
  }
}
