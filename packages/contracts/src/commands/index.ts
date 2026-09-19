import { z } from 'zod'
import { budgetEditorCommands } from './budget-editor'
import { surfaceCommands } from './surfaces'
import { draftCommands } from './draft'
import { runCommands } from './run'
import { interactionCommands } from './interaction'
import { modelCommands } from './models'
import { usageCommands } from './usage'
import { interactionDraftCommands } from './interaction-draft'
import { settingsEditorCommands } from './settings-editor'
import { providerEditorCommands } from './provider-editor'
import { configurationCommands } from './configuration'
import { commandPaletteCommands } from './command-palette'
import { fileWorkspaceCommands } from './file-workspace'
import { agentWorkspaceCommands } from './agent-workspace'
import { goalPlanWorkspaceCommands } from './goal-plan-workspace'
import { extensionWorkspaceCommands } from './extension-workspace'
import { statusWorkspaceCommands } from './status-workspace'
import { clientPersistenceCommands } from './client-persistence'
import { terminalApplicationCommands } from './terminal-application'
import { defineCommand, type CommandMetadataInput } from '@hbar/commands/protocol'
import {
  workspaceSchema,
  sessionSchema,
  workspaceListInputSchema,
  workspaceGetInputSchema,
  sessionListInputSchema,
  sessionGetInputSchema,
  workspacePageSchema,
  sessionPageSchema,
} from '../state/directory'

const base = {
  version: 1,
  owner: 'hbar.core',
  kind: 'query',
  execution: 'host',
  stateEffect: 'none',
  category: 'workspace.session',
  scope: 'global',
  surfaces: ['cli', 'tui', 'api', 'palette'],
} satisfies Partial<CommandMetadataInput>
function query(id: string): CommandMetadataInput {
  return { ...base, id, titleKey: `commands.${id}.title`, descriptionKey: `commands.${id}.description` }
}
export const directoryCommands = {
  'workspace.list': defineCommand(
    {
      ...query('workspace.list'),
      cli: {
        arguments: [
          { field: 'after', type: 'string', flag: 'after' },
          { field: 'limit', type: 'number', flag: 'limit' },
        ],
      },
    },
    workspaceListInputSchema,
    workspacePageSchema,
  ),
  'workspace.get': defineCommand(
    {
      ...query('workspace.get'),
      cli: { arguments: [{ field: 'workspaceId', type: 'string', position: 0, flag: 'workspace' }] },
    },
    workspaceGetInputSchema,
    workspaceSchema.nullable(),
  ),
  'session.list': defineCommand(
    {
      ...query('session.list'),
      scope: 'workspace',
      cli: {
        arguments: [
          { field: 'workspaceId', type: 'string', flag: 'workspace' },
          { field: 'after', type: 'string', flag: 'after' },
          { field: 'title', type: 'string', flag: 'title' },
          { field: 'includeArchived', type: 'boolean', flag: 'archived' },
          { field: 'limit', type: 'number', flag: 'limit' },
        ],
      },
    },
    sessionListInputSchema,
    sessionPageSchema,
  ),
  'session.get': defineCommand(
    {
      ...query('session.get'),
      scope: 'session',
      cli: { arguments: [{ field: 'sessionId', type: 'string', position: 0, flag: 'session' }] },
    },
    sessionGetInputSchema,
    sessionSchema.nullable(),
  ),
}

const selectionSchema = z.strictObject({
  workspaceId: z.string().min(1).max(160).nullable(),
  sessionId: z.string().min(1).max(160).nullable(),
})
export const setSessionInputSchema = z
  .strictObject({
    session: z.string().min(1).max(160).optional(),
    sessionId: z.string().min(1).max(160).optional(),
    sessionName: z.string().min(1).max(160).optional(),
    workspaceId: z.string().min(1).max(160).optional(),
  })
  .refine(
    (value) => [value.session, value.sessionId, value.sessionName].filter((item) => item !== undefined).length === 1,
    { message: 'Provide exactly one session selector' },
  )

export const navigationCommands = {
  'app.createSession': defineCommand(
    {
      ...query('app.createSession'),
      kind: 'command',
      execution: 'client',
      stateEffect: 'application',
      scope: 'workspace',
      category: 'workspace.session',
      cli: {
        arguments: [
          { field: 'title', type: 'string', position: 0, flag: 'title' },
          { field: 'workspaceId', type: 'string', flag: 'workspace' },
        ],
      },
    },
    z.strictObject({ workspaceId: z.string().min(1).max(160), title: z.string().trim().min(1).max(160).optional() }),
    sessionSchema,
  ),
  'workspace.open': defineCommand(
    {
      ...query('workspace.open'),
      kind: 'command',
      execution: 'client',
      stateEffect: 'application',
      scope: 'client',
      category: 'workspace.session',
      cli: { arguments: [{ field: 'path', type: 'string', position: 0 }] },
    },
    z.strictObject({ path: z.string().trim().min(1).max(4_000) }),
    workspaceSchema,
  ),
  'app.setWorkspace': defineCommand(
    {
      ...query('app.setWorkspace'),
      kind: 'command',
      execution: 'client',
      stateEffect: 'application',
      scope: 'client',
      category: 'app.navigation',
      cli: { arguments: [{ field: 'workspaceId', type: 'string', position: 0, flag: 'workspace' }] },
    },
    workspaceGetInputSchema,
    selectionSchema,
  ),
  'app.setSession': defineCommand(
    {
      ...query('app.setSession'),
      kind: 'command',
      execution: 'client',
      stateEffect: 'application',
      scope: 'client',
      category: 'app.navigation',
      cli: {
        arguments: [
          { field: 'session', type: 'string', position: 0 },
          { field: 'sessionId', type: 'string', flag: 'session' },
          { field: 'sessionName', type: 'string', flag: 'name' },
          { field: 'workspaceId', type: 'string', flag: 'workspace' },
        ],
      },
    },
    setSessionInputSchema,
    selectionSchema,
  ),
}
export { surfaceCommands } from './surfaces'
export { draftCommands } from './draft'
export { runCommands } from './run'
export { interactionCommands } from './interaction'
export { modelCommands } from './models'
export { usageCommands } from './usage'
export { interactionDraftCommands } from './interaction-draft'
export { settingsEditorCommands } from './settings-editor'
export { providerEditorCommands } from './provider-editor'
export { commandPaletteCommands } from './command-palette'
export { fileWorkspaceCommands } from './file-workspace'
export { agentWorkspaceCommands } from './agent-workspace'
export { goalPlanWorkspaceCommands } from './goal-plan-workspace'
export { extensionWorkspaceCommands } from './extension-workspace'
export { statusWorkspaceCommands } from './status-workspace'
export { clientPersistenceCommands } from './client-persistence'
export { terminalApplicationCommands } from './terminal-application'
export const applicationCommands = {
  ...directoryCommands,
  ...navigationCommands,
  ...budgetEditorCommands,
  ...surfaceCommands,
  ...draftCommands,
  ...runCommands,
  ...interactionCommands,
  ...modelCommands,
  ...usageCommands,
  ...interactionDraftCommands,
  ...settingsEditorCommands,
  ...providerEditorCommands,
  ...configurationCommands,
  ...commandPaletteCommands,
  ...fileWorkspaceCommands,
  ...agentWorkspaceCommands,
  ...goalPlanWorkspaceCommands,
  ...extensionWorkspaceCommands,
  ...statusWorkspaceCommands,
  ...clientPersistenceCommands,
  ...terminalApplicationCommands,
}
