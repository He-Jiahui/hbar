import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema, sessionEventSchema } from '../index'
import { sessionSchema, workspaceSchema } from '../state/directory'

const metadata = (id: string, kind: 'command' | 'query', scope: 'global' | 'workspace' | 'session') => ({
  id,
  version: 1,
  owner: 'hbar.workspace-session',
  kind,
  execution: 'host' as const,
  stateEffect: kind === 'query' ? ('none' as const) : ('persistent' as const),
  category: 'workspace.session',
  scope,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['cli', 'tui', 'api', 'palette'] as ('cli' | 'tui' | 'api' | 'palette')[],
})

export const sessionExportPageSchema = z.strictObject({
  events: z.array(sessionEventSchema).max(500),
  cursor: z.number().int().nonnegative(),
  nextCursor: z.number().int().positive().nullable(),
})

export const workspaceSessionCommands = {
  'workspace.create': defineCommand(
    {
      ...metadata('workspace.create', 'command', 'global'),
      cli: { arguments: [{ field: 'path', type: 'string', position: 0 }] },
    },
    z.strictObject({ path: z.string().min(1).max(4_000) }),
    workspaceSchema,
  ),
  'session.create': defineCommand(
    {
      ...metadata('session.create', 'command', 'workspace'),
      idempotency: 'required',
      cli: {
        arguments: [
          { field: 'title', type: 'string', position: 0, flag: 'title' },
          { field: 'workspaceId', type: 'string', flag: 'workspace' },
        ],
      },
    },
    z.strictObject({ workspaceId: idSchema, title: z.string().trim().min(1).max(160).optional() }),
    sessionSchema,
  ),
  'session.rename': defineCommand(
    {
      ...metadata('session.rename', 'command', 'session'),
      cli: {
        arguments: [
          { field: 'title', type: 'string', position: 0, flag: 'title' },
          { field: 'sessionId', type: 'string', flag: 'session' },
        ],
      },
    },
    z.strictObject({ sessionId: idSchema, title: z.string().trim().min(1).max(160) }),
    sessionSchema,
  ),
  'session.archive': defineCommand(
    {
      ...metadata('session.archive', 'command', 'session'),
      cli: {
        arguments: [
          { field: 'archived', type: 'boolean', position: 0 },
          { field: 'sessionId', type: 'string', flag: 'session' },
        ],
      },
    },
    z.strictObject({ sessionId: idSchema, archived: z.boolean().default(true) }),
    sessionSchema,
  ),
  'session.fork': defineCommand(
    {
      ...metadata('session.fork', 'command', 'session'),
      idempotency: 'required',
      cli: {
        arguments: [
          { field: 'sessionId', type: 'string', flag: 'session' },
          { field: 'atSeq', type: 'number', flag: 'at-seq' },
        ],
      },
    },
    z.strictObject({ sessionId: idSchema, atSeq: z.number().int().positive().optional() }),
    sessionSchema,
  ),
  'session.export': defineCommand(
    {
      ...metadata('session.export', 'query', 'session'),
      cli: {
        arguments: [
          { field: 'sessionId', type: 'string', flag: 'session' },
          { field: 'after', type: 'number', flag: 'after' },
          { field: 'limit', type: 'number', flag: 'limit' },
        ],
      },
    },
    z.strictObject({
      sessionId: idSchema,
      after: z.number().int().nonnegative().default(0),
      limit: z.number().int().min(1).max(500).default(500),
    }),
    sessionExportPageSchema,
  ),
}
