import { CommandRegistry, CommandError, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { directoryCommands } from '@hbar/contracts/commands'
import type {
  Workspace,
  Session,
  WorkspaceListInput,
  WorkspaceActivityListInput,
  SessionActivityListInput,
  SessionListInput,
  WorkspacePage,
  WorkspaceActivityPage,
  SessionActivityPage,
  SessionPage,
} from '@hbar/contracts/directory'
import type {
  SessionActivityGlobalListInput,
  SessionActivityGlobalPage,
  WorkspaceSidebarListInput,
  WorkspaceSidebarPage,
  SessionSidebarPage,
  SessionExecutionGetInput,
  SessionExecutionSnapshot,
  SessionAgentChildrenInput,
  SessionAgentChildrenPage,
  SessionAgentAncestors,
} from '@hbar/contracts/sidebar-directory'

export interface DirectoryRepository {
  workspacePage(input: WorkspaceListInput): Promise<WorkspacePage>
  workspaceSidebarPage(input: WorkspaceSidebarListInput): Promise<WorkspaceSidebarPage>
  globalSessionActivityPage(input: SessionActivityGlobalListInput): Promise<SessionActivityGlobalPage>
  sessionExecutionSnapshot(input: SessionExecutionGetInput): Promise<SessionExecutionSnapshot>
  workspaceActivityPage(input: WorkspaceActivityListInput): Promise<WorkspaceActivityPage>
  sessionActivityPage(input: SessionActivityListInput): Promise<SessionActivityPage>
  sidebarSessionActivityPage(input: SessionActivityListInput): Promise<SessionSidebarPage>
  sessionAgentChildren(input: SessionAgentChildrenInput): Promise<SessionAgentChildrenPage>
  sessionAgentAncestors(sessionId: string): Promise<SessionAgentAncestors>
  sessionPage(input: SessionListInput): Promise<SessionPage>
  findWorkspace(id: string): Promise<Workspace | null>
  findSession(id: string): Promise<Session | null>
}

export function createDirectoryQueries(repository: DirectoryRepository) {
  const registry = new CommandRegistry({ execution: 'host' })
  registry.register(directoryCommands['session.agentChildren.list'], async (input) => {
    try {
      return await repository.sessionAgentChildren(input)
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  })
  registry.register(directoryCommands['session.agentAncestors.get'], async ({ sessionId }) => {
    try {
      return await repository.sessionAgentAncestors(sessionId)
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  })
  registry.register(directoryCommands['workspace.list'], (input) => repository.workspacePage(input))
  registry.register(directoryCommands['workspace.sidebar.list'], async (input) => {
    try {
      return await repository.workspaceSidebarPage(input)
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  })
  registry.register(directoryCommands['session.activity.global.list'], async (input) => {
    try {
      return await repository.globalSessionActivityPage(input)
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  })
  registry.register(directoryCommands['session.execution.get'], async (input) => {
    try {
      return await repository.sessionExecutionSnapshot(input)
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  })
  registry.register(directoryCommands['workspace.activity.list'], async (input) => {
    try {
      return await repository.workspaceActivityPage(input)
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  })
  registry.register(directoryCommands['session.activity.list'], async (input) => {
    if (!(await repository.findWorkspace(input.workspaceId)))
      throw new CommandError('WORKSPACE_NOT_FOUND', 'Workspace not found')
    try {
      return await repository.sessionActivityPage(input)
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  })
  registry.register(directoryCommands['session.sidebar.list'], async (input) => {
    if (!(await repository.findWorkspace(input.workspaceId)))
      throw new CommandError('WORKSPACE_NOT_FOUND', 'Workspace not found')
    try {
      return await repository.sidebarSessionActivityPage(input)
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  })
  registry.register(directoryCommands['workspace.get'], ({ workspaceId }) => repository.findWorkspace(workspaceId))
  registry.register(directoryCommands['session.get'], ({ sessionId }) => repository.findSession(sessionId))
  registry.register(directoryCommands['session.list'], async (input) => {
    if (!(await repository.findWorkspace(input.workspaceId)))
      throw new CommandError('WORKSPACE_NOT_FOUND', 'Workspace not found')
    return repository.sessionPage(input)
  })
  return {
    ...createCommandClient(directoryCommands, registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}
