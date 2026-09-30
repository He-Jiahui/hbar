import { CommandRegistry, CommandError, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { directoryCommands } from '@hbar/contracts/commands'
import type {
  Workspace,
  Session,
  WorkspaceListInput,
  WorkspaceActivityListInput,
  SessionListInput,
  WorkspacePage,
  WorkspaceActivityPage,
  SessionPage,
} from '@hbar/contracts/directory'

export interface DirectoryRepository {
  workspacePage(input: WorkspaceListInput): Promise<WorkspacePage>
  workspaceActivityPage(input: WorkspaceActivityListInput): Promise<WorkspaceActivityPage>
  sessionPage(input: SessionListInput): Promise<SessionPage>
  findWorkspace(id: string): Promise<Workspace | null>
  findSession(id: string): Promise<Session | null>
}

export function createDirectoryQueries(repository: DirectoryRepository) {
  const registry = new CommandRegistry({ execution: 'host' })
  registry.register(directoryCommands['workspace.list'], (input) => repository.workspacePage(input))
  registry.register(directoryCommands['workspace.activity.list'], async (input) => {
    try {
      return await repository.workspaceActivityPage(input)
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
