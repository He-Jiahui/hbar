import { CommandError, createCommandClient, type CommandRegistry, type CommandContext } from '@hbar/commands'
import { extensionCommands } from '@hbar/contracts/commands/extensions'
import { extensionWorkspaceCommands } from '@hbar/contracts/commands/extension-workspace'
import type { SkillDetail } from '@hbar/contracts/commands/extensions'
import type { StateReader } from './state'
import type {
  ExtensionSkillDetailState,
  ExtensionWorkspaceEntryState,
  PanelSurface,
  PresentationState,
  RuntimeOptions,
  SurfaceState,
} from './types'

const MAX_PHYSICAL_REQUESTS = 8
const REQUEST_TIMEOUT_MS = 30_000
const FILE_PAGE_SIZE = 20

interface ExtensionWorkspaceSummary {
  readonly instanceId: string
  readonly status: 'loading' | 'ready' | 'error'
  readonly pluginCount: number
  readonly skillCount: number
  readonly error: string | null
}

type PendingSummary = ReturnType<typeof Promise.withResolvers<ExtensionWorkspaceSummary>>

interface SkillDetailRequest {
  readonly instanceId: string
  readonly target: PanelSurface
  readonly controller: AbortController
  readonly kind: 'inspect' | 'file'
  readonly skillId: string
  readonly path: string | null
  readonly generation: number
  readonly logical: PendingSummary
  cancelled: boolean
  cancel(reason: string, detach?: boolean): void
}

interface SkillDetailHost {
  readonly local: CommandRegistry
  readonly options: RuntimeOptions
  readonly surfaces: StateReader<SurfaceState>
  readonly presentation: StateReader<PresentationState>
  readonly panel: (instanceId: string) => PanelSurface
  readonly entryFor: (instanceId: string) => ExtensionWorkspaceEntryState
  readonly replace: (entry: ExtensionWorkspaceEntryState) => void
  readonly summary: (entry: ExtensionWorkspaceEntryState) => ExtensionWorkspaceSummary
  readonly isDisposed: () => boolean
}

function pathIsRelative(path: string): boolean {
  if (!path || path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:/.test(path)) return false
  const segments = path.split(/[\\/]/u)
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
}

function commandCode(reason: unknown): string {
  return reason &&
    typeof reason === 'object' &&
    'code' in reason &&
    typeof reason.code === 'string' &&
    /^[A-Z][A-Z0-9_]{0,63}$/.test(reason.code)
    ? reason.code
    : 'EXECUTION_FAILED'
}

function asCommandError(reason: unknown): CommandError {
  if (reason instanceof CommandError) return reason
  return new CommandError(
    commandCode(reason),
    reason instanceof Error ? reason.message : 'Skill detail operation failed',
  )
}

function idleFile(): ExtensionSkillDetailState['file'] {
  return { status: 'idle', file: null, error: null }
}

function filesPage(detail: SkillDetail, page: number): number {
  return Math.min(page, Math.max(0, Math.ceil(detail.files.length / FILE_PAGE_SIZE) - 1))
}

function duplicateFilePaths(detail: SkillDetail): boolean {
  return new Set(detail.files.map((file) => file.path)).size !== detail.files.length
}

export function createExtensionSkillDetails(host: SkillDetailHost) {
  const client = host.options.extensions ? createCommandClient(extensionCommands, host.options.extensions) : null
  const detailGenerations = new Map<string, number>()
  const fileGenerations = new Map<string, number>()
  const detailRequests = new Map<string, SkillDetailRequest>()
  const fileRequests = new Map<string, SkillDetailRequest>()
  const inFlight = new Set<SkillDetailRequest>()
  let revision = 0
  let disposed = false
  const closed = () => disposed || host.isDisposed()

  const nextDetailGeneration = (instanceId: string) => {
    const generation = ++revision
    detailGenerations.set(instanceId, generation)
    return generation
  }
  const nextFileGeneration = (instanceId: string) => {
    const generation = ++revision
    fileGenerations.set(instanceId, generation)
    return generation
  }
  const currentPanel = (instanceId: string, target: PanelSurface) =>
    host.surfaces.getSnapshot().panels[instanceId] === target
  const readEntry = (instanceId: string): ExtensionWorkspaceEntryState | null => {
    try {
      return host.entryFor(instanceId)
    } catch {
      return null
    }
  }
  const inSkillsSection = (instanceId: string, target: PanelSurface) => {
    const panel = host.surfaces.getSnapshot().panels[instanceId]
    const presentation = host.presentation.getSnapshot()
    return (
      panel === target &&
      panel?.panelId === 'settings' &&
      panel.params.section === 'skills' &&
      presentation.page.kind === 'settings' &&
      presentation.page.instanceId === instanceId
    )
  }
  const currentDetail = (request: SkillDetailRequest) => {
    const { instanceId, skillId, target, generation } = request
    const entry = host.surfaces.getSnapshot().panels[instanceId] ? readEntry(instanceId) : null
    return !closed() &&
      !request.cancelled &&
      detailGenerations.get(instanceId) === generation &&
      detailRequests.get(instanceId) === request &&
      inSkillsSection(instanceId, target) &&
      currentPanel(instanceId, target) &&
      entry?.selectedSkillId === skillId &&
      entry.skillDetail?.skillId === skillId
      ? entry
      : null
  }
  const currentFile = (request: SkillDetailRequest) => {
    const { instanceId, skillId, path, target, generation } = request
    const entry = host.surfaces.getSnapshot().panels[instanceId] ? readEntry(instanceId) : null
    return !closed() &&
      !request.cancelled &&
      fileGenerations.get(instanceId) === generation &&
      fileRequests.get(instanceId) === request &&
      inSkillsSection(instanceId, target) &&
      currentPanel(instanceId, target) &&
      entry?.selectedSkillId === skillId &&
      entry.skillDetail?.skillId === skillId &&
      entry.skillDetail.selectedPath === path
      ? entry
      : null
  }
  const updateDetail = (
    entry: ExtensionWorkspaceEntryState,
    value: Partial<ExtensionSkillDetailState> & Pick<ExtensionSkillDetailState, 'skillId'>,
  ): ExtensionWorkspaceEntryState => ({
    ...entry,
    selectedSkillId: value.skillId,
    skillDetail: {
      ...(entry.skillDetail && entry.skillDetail.skillId === value.skillId
        ? entry.skillDetail
        : {
            skillId: value.skillId,
            status: 'loading' as const,
            skill: null,
            error: null,
            view: 'overview' as const,
            filesPage: 0,
            selectedPath: null,
            file: idleFile(),
          }),
      ...value,
    },
  })

  const finish = (request: SkillDetailRequest, reason: unknown): void => {
    if (closed()) return
    const instanceId = request.instanceId
    const map = request.kind === 'inspect' ? detailRequests : fileRequests
    if (map.get(instanceId) !== request) return
    const entry = host.surfaces.getSnapshot().panels[instanceId] ? readEntry(instanceId) : null
    if (!entry) return
    const detail = entry.skillDetail
    if (!detail) return
    if (
      request.kind === 'inspect' &&
      detailGenerations.get(instanceId) === request.generation &&
      detail.skillId === request.skillId &&
      detail.status === 'loading'
    ) {
      host.replace(
        updateDetail(entry, {
          skillId: detail.skillId,
          status: 'error',
          skill: null,
          error: commandCode(reason),
          file: idleFile(),
        }),
      )
    } else if (
      request.kind === 'file' &&
      fileGenerations.get(instanceId) === request.generation &&
      detail.skillId === request.skillId &&
      detail.selectedPath === request.path &&
      detail.file.status === 'loading'
    ) {
      host.replace({
        ...entry,
        skillDetail: { ...detail, file: { status: 'error', file: null, error: commandCode(reason) } },
      })
    }
  }

  const cancelRequest = (request: SkillDetailRequest, reason: string, detach = false) => {
    if (request.cancelled) return
    request.cancelled = true
    const error = new CommandError(reason, 'Skill detail request was interrupted')
    finish(request, error)
    request.logical.reject(error)
    request.controller.abort()
    if (detach) {
      const map = request.kind === 'inspect' ? detailRequests : fileRequests
      if (map.get(request.instanceId) === request) map.delete(request.instanceId)
    }
  }

  const executeInspect = async (
    instanceId: string,
    skillId: string,
    request: SkillDetailRequest,
    logical: PendingSummary,
    parentSignal: AbortSignal,
  ) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const settle = (reason?: unknown, result?: ExtensionWorkspaceSummary) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      parentSignal.removeEventListener('abort', aborted)
      if (reason === undefined && result) logical.resolve(result)
      else logical.reject(asCommandError(reason))
    }
    const aborted = () => {
      cancelRequest(request, 'CANCELLED')
      settle(new CommandError('CANCELLED', 'Skill detail request was cancelled'))
    }
    parentSignal.addEventListener('abort', aborted, { once: true })
    timer = setTimeout(() => {
      cancelRequest(request, 'TIMEOUT')
      settle(new CommandError('TIMEOUT', 'Skill detail request timed out'))
    }, REQUEST_TIMEOUT_MS)
    try {
      if (!client) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Extension commands are unavailable')
      const skill = await client.execute('skill.inspect', { id: skillId }, { signal: request.controller.signal })
      if (request.cancelled) {
        settle(new CommandError('CANCELLED', 'Skill detail request was superseded'))
        return
      }
      const current = currentDetail(request)
      if (!current) {
        settle(new CommandError('CANCELLED', 'Skill detail request was superseded'))
        return
      }
      if (skill && (skill.id !== skillId || skill.path !== current.skills.find((item) => item.id === skillId)?.path))
        throw new CommandError('INVALID_OUTPUT', 'Skill detail belongs to another skill')
      if (skill && (duplicateFilePaths(skill) || skill.files.some((file) => !pathIsRelative(file.path))))
        throw new CommandError('INVALID_OUTPUT', 'Skill detail contains invalid or duplicate file paths')
      if (skill && new TextEncoder().encode(skill.body).byteLength > 262_144)
        throw new CommandError('INVALID_OUTPUT', 'Skill entry exceeds the byte limit')
      const latestDetail = current.skillDetail
      const next: ExtensionWorkspaceEntryState = updateDetail(current, {
        skillId,
        status: skill ? 'ready' : 'missing',
        skill,
        error: null,
        view: latestDetail?.view ?? 'overview',
        filesPage: skill ? filesPage(skill, latestDetail?.filesPage ?? 0) : 0,
        selectedPath:
          skill && latestDetail?.selectedPath && skill.files.some((file) => file.path === latestDetail.selectedPath)
            ? latestDetail.selectedPath
            : null,
        file: idleFile(),
      })
      host.replace(next)
      settle(undefined, host.summary(next))
    } catch (reason) {
      const current = currentDetail(request)
      if (current) {
        const next = updateDetail(current, {
          skillId,
          status: 'error',
          skill: null,
          error: commandCode(reason),
          file: idleFile(),
        })
        host.replace(next)
      }
      settle(reason)
    } finally {
      if (timer) clearTimeout(timer)
      parentSignal.removeEventListener('abort', aborted)
      inFlight.delete(request)
      if (detailRequests.get(instanceId) === request) detailRequests.delete(instanceId)
    }
  }

  const inspect = (
    instanceId: string,
    skillId: string,
    context: CommandContext,
  ): Promise<ExtensionWorkspaceSummary> => {
    const target = host.panel(instanceId)
    if (target.params.section !== 'skills') throw new CommandError('COMMAND_NOT_FOUND', 'Skills are not selected')
    const entry = host.entryFor(instanceId)
    if (!entry.skills.some((skill) => skill.id === skillId))
      throw new CommandError('COMMAND_NOT_FOUND', 'Skill is not available in this list')
    if (entry.skillDetail?.skillId === skillId && entry.skillDetail.status === 'loading')
      return Promise.resolve(host.summary(entry))
    detailRequests.get(instanceId)?.cancel('CANCELLED', true)
    fileRequests.get(instanceId)?.cancel('CANCELLED', true)
    const generation = nextDetailGeneration(instanceId)
    nextFileGeneration(instanceId)
    const previous = entry.skillDetail?.skillId === skillId ? entry.skillDetail : null
    const loading = updateDetail(entry, {
      skillId,
      status: 'loading',
      skill: null,
      error: null,
      view: previous?.view ?? 'overview',
      filesPage: previous?.filesPage ?? 0,
      selectedPath: previous?.selectedPath ?? null,
      file: idleFile(),
    })
    host.replace(loading)
    if (inFlight.size >= MAX_PHYSICAL_REQUESTS) {
      const failed = updateDetail(loading, { skillId, status: 'error', skill: null, error: 'BUSY', file: idleFile() })
      host.replace(failed)
      throw new CommandError('BUSY', 'Skill detail read capacity is exhausted')
    }
    const controller = new AbortController()
    const logical = Promise.withResolvers<ExtensionWorkspaceSummary>()
    const request: SkillDetailRequest = {
      instanceId,
      target,
      controller,
      kind: 'inspect',
      skillId,
      path: null,
      generation,
      logical,
      cancelled: false,
      cancel(reason, detach = false) {
        cancelRequest(request, reason, detach)
      },
    }
    detailRequests.set(instanceId, request)
    inFlight.add(request)
    void executeInspect(instanceId, skillId, request, logical, context.signal)
    return logical.promise
  }

  const executeFile = async (
    instanceId: string,
    skillId: string,
    path: string,
    request: SkillDetailRequest,
    logical: PendingSummary,
    parentSignal: AbortSignal,
  ) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const settle = (reason?: unknown, result?: ExtensionWorkspaceSummary) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      parentSignal.removeEventListener('abort', aborted)
      if (reason === undefined && result) logical.resolve(result)
      else logical.reject(asCommandError(reason))
    }
    const aborted = () => {
      cancelRequest(request, 'CANCELLED')
      settle(new CommandError('CANCELLED', 'Skill file request was cancelled'))
    }
    parentSignal.addEventListener('abort', aborted, { once: true })
    timer = setTimeout(() => {
      cancelRequest(request, 'TIMEOUT')
      settle(new CommandError('TIMEOUT', 'Skill file request timed out'))
    }, REQUEST_TIMEOUT_MS)
    try {
      if (!client) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Extension commands are unavailable')
      const file = await client.execute('skill.file.read', { id: skillId, path }, { signal: request.controller.signal })
      if (request.cancelled) {
        settle(new CommandError('CANCELLED', 'Skill file request was superseded'))
        return
      }
      const current = currentFile(request)
      if (!current) {
        settle(new CommandError('CANCELLED', 'Skill file request was superseded'))
        return
      }
      if (file && (file.id !== skillId || file.path !== path || !pathIsRelative(file.path)))
        throw new CommandError('INVALID_OUTPUT', 'Skill file response belongs to another path')
      if (file && new TextEncoder().encode(file.text).byteLength > 262_144)
        throw new CommandError('INVALID_OUTPUT', 'Skill file exceeds the byte limit')
      const detail = current.skillDetail
      if (!detail) {
        settle(new CommandError('CANCELLED', 'Skill detail request was superseded'))
        return
      }
      const next: ExtensionWorkspaceEntryState = {
        ...current,
        skillDetail: {
          ...detail,
          file: file ? { status: 'ready', file, error: null } : { status: 'missing', file: null, error: null },
        },
      }
      host.replace(next)
      settle(undefined, host.summary(next))
    } catch (reason) {
      const current = currentFile(request)
      if (current && current.skillDetail)
        host.replace({
          ...current,
          skillDetail: { ...current.skillDetail, file: { status: 'error', file: null, error: commandCode(reason) } },
        })
      settle(reason)
    } finally {
      if (timer) clearTimeout(timer)
      parentSignal.removeEventListener('abort', aborted)
      inFlight.delete(request)
      if (fileRequests.get(instanceId) === request) fileRequests.delete(instanceId)
    }
  }

  const openFile = (instanceId: string, path: string, context: CommandContext): Promise<ExtensionWorkspaceSummary> => {
    const target = host.panel(instanceId)
    if (target.params.section !== 'skills') throw new CommandError('COMMAND_NOT_FOUND', 'Skills are not selected')
    const entry = host.entryFor(instanceId)
    const detail = entry.skillDetail
    if (!detail || detail.status !== 'ready' || !detail.skill)
      throw new CommandError('COMMAND_NOT_FOUND', 'Skill details are not ready')
    if (!pathIsRelative(path) || !detail.skill.files.some((file) => file.path === path))
      throw new CommandError('COMMAND_NOT_FOUND', 'Skill file is not available in this detail')
    if (detail.file.status === 'loading' && detail.selectedPath === path) return Promise.resolve(host.summary(entry))
    fileRequests.get(instanceId)?.cancel('CANCELLED', true)
    if (inFlight.size >= MAX_PHYSICAL_REQUESTS) {
      const failed = {
        ...entry,
        skillDetail: { ...detail, selectedPath: path, file: { status: 'error' as const, file: null, error: 'BUSY' } },
      }
      host.replace(failed)
      throw new CommandError('BUSY', 'Skill detail read capacity is exhausted')
    }
    const generation = nextFileGeneration(instanceId)
    const loading: ExtensionWorkspaceEntryState = {
      ...entry,
      skillDetail: { ...detail, selectedPath: path, file: { status: 'loading', file: null, error: null } },
    }
    host.replace(loading)
    const controller = new AbortController()
    const logical = Promise.withResolvers<ExtensionWorkspaceSummary>()
    const request: SkillDetailRequest = {
      instanceId,
      target,
      controller,
      kind: 'file',
      skillId: detail.skill.id,
      path,
      generation,
      logical,
      cancelled: false,
      cancel(reason, detach = false) {
        cancelRequest(request, reason, detach)
      },
    }
    fileRequests.set(instanceId, request)
    inFlight.add(request)
    void executeFile(instanceId, detail.skill.id, path, request, logical, context.signal)
    return logical.promise
  }

  const selectView = (instanceId: string, view: 'overview' | 'files') => {
    const entry = host.entryFor(instanceId)
    if (!entry.skillDetail) throw new CommandError('COMMAND_NOT_FOUND', 'Skill details are not open')
    const next = { ...entry, skillDetail: { ...entry.skillDetail, view } }
    host.replace(next)
    return host.summary(next)
  }

  const setFilesPage = (instanceId: string, page: number) => {
    const entry = host.entryFor(instanceId)
    const detail = entry.skillDetail
    if (!detail) throw new CommandError('COMMAND_NOT_FOUND', 'Skill details are not open')
    const bounded = detail.skill ? filesPage(detail.skill, page) : 0
    const next = { ...entry, skillDetail: { ...detail, filesPage: bounded } }
    host.replace(next)
    return host.summary(next)
  }

  const back = (instanceId: string) => {
    const entry = host.entryFor(instanceId)
    detailRequests.get(instanceId)?.cancel('CANCELLED', true)
    fileRequests.get(instanceId)?.cancel('CANCELLED', true)
    nextDetailGeneration(instanceId)
    nextFileGeneration(instanceId)
    const next = { ...entry, skillDetail: null }
    host.replace(next)
    return host.summary(next)
  }

  const reconcile = (entry: ExtensionWorkspaceEntryState): ExtensionWorkspaceEntryState => {
    const detail = entry.skillDetail
    if (!detail || !entry.selectedSkillId || entry.skills.some((skill) => skill.id === entry.selectedSkillId))
      return entry
    detailRequests.get(entry.instanceId)?.cancel('CANCELLED', true)
    fileRequests.get(entry.instanceId)?.cancel('CANCELLED', true)
    nextDetailGeneration(entry.instanceId)
    nextFileGeneration(entry.instanceId)
    return {
      ...entry,
      skillDetail: { ...detail, status: 'missing', skill: null, error: null, file: idleFile() },
    }
  }

  const invalidate = () => {
    for (const request of [...inFlight]) {
      if (inSkillsSection(request.instanceId, request.target)) continue
      if (request.kind === 'inspect' || request.kind === 'file') request.cancel('CANCELLED', true)
    }
  }

  const drop = (instanceId: string) => {
    detailRequests.get(instanceId)?.cancel('CANCELLED', true)
    fileRequests.get(instanceId)?.cancel('CANCELLED', true)
    nextDetailGeneration(instanceId)
    nextFileGeneration(instanceId)
    detailGenerations.delete(instanceId)
    fileGenerations.delete(instanceId)
  }

  host.local.register(extensionWorkspaceCommands['extensionWorkspace.inspectSkill'], (input, context) =>
    inspect(input.instanceId, input.skillId, context),
  )
  host.local.register(extensionWorkspaceCommands['extensionWorkspace.openSkillFile'], (input, context) =>
    openFile(input.instanceId, input.path, context),
  )
  host.local.register(extensionWorkspaceCommands['extensionWorkspace.selectSkillView'], ({ instanceId, view }) =>
    selectView(instanceId, view),
  )
  host.local.register(extensionWorkspaceCommands['extensionWorkspace.setSkillFilesPage'], ({ instanceId, page }) =>
    setFilesPage(instanceId, page),
  )
  host.local.register(extensionWorkspaceCommands['extensionWorkspace.backSkill'], ({ instanceId }) => back(instanceId))

  return {
    reconcile,
    invalidate,
    drop,
    dispose() {
      disposed = true
      for (const request of [...inFlight]) request.cancel('CANCELLED', true)
      inFlight.clear()
      detailRequests.clear()
      fileRequests.clear()
      detailGenerations.clear()
      fileGenerations.clear()
    },
  }
}
