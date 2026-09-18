import { CommandRegistry, CommandError, createCommandClient } from '@hbar/commands'
import { directoryCommands } from '@hbar/contracts/commands'
import type {
  Workspace,
  Session,
  WorkspaceListInput,
  SessionListInput,
  WorkspacePage,
  SessionPage,
} from '@hbar/contracts/directory'

export interface DirectoryRepository {
  workspacePage(input: WorkspaceListInput): Promise<WorkspacePage>
  sessionPage(input: SessionListInput): Promise<SessionPage>
  findWorkspace(id: string): Promise<Workspace | null>
  findSession(id: string): Promise<Session | null>
}

export function createDirectoryQueries(repository: DirectoryRepository) {
  const registry = new CommandRegistry({ execution: 'host' })
  registry.register(directoryCommands['workspace.list'], (input) => repository.workspacePage(input))
  registry.register(directoryCommands['workspace.get'], ({ workspaceId }) => repository.findWorkspace(workspaceId))
  registry.register(directoryCommands['session.get'], ({ sessionId }) => repository.findSession(sessionId))
  registry.register(directoryCommands['session.list'], async (input) => {
    if (!(await repository.findWorkspace(input.workspaceId)))
      throw new CommandError('WORKSPACE_NOT_FOUND', 'Workspace not found')
    return repository.sessionPage(input)
  })
  return { ...createCommandClient(directoryCommands, registry), dispose: () => registry.dispose() }
}
