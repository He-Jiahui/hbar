import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import {
  runFileChangesTargetSchema,
  runFileChangesPageSchema,
  runFileChangeDiffSchema,
  runChangePathSchema,
  RUN_CHANGE_PAGE_SIZE,
} from '../run-file-changes'

const metadata = (id: string, kind: 'query' | 'command') => ({
  id,
  version: 1,
  owner: 'hbar.files',
  kind,
  execution: 'host' as const,
  stateEffect: kind === 'query' ? ('none' as const) : ('persistent' as const),
  category: 'run.changes',
  scope: 'session' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api', 'cli', 'tui'] as ('api' | 'cli' | 'tui')[],
})
export const runFileChangesCommands = {
  'run.fileChanges': defineCommand(
    metadata('run.fileChanges', 'query'),
    runFileChangesTargetSchema.extend({
      after: runChangePathSchema.optional(),
      limit: z.number().int().min(1).max(RUN_CHANGE_PAGE_SIZE).default(RUN_CHANGE_PAGE_SIZE),
    }),
    runFileChangesPageSchema,
  ),
  'run.fileChangeDiff': defineCommand(
    metadata('run.fileChangeDiff', 'query'),
    runFileChangesTargetSchema.extend({ path: runChangePathSchema, offset: z.number().int().nonnegative().default(0) }),
    runFileChangeDiffSchema,
  ),
  'run.undoFileChanges': defineCommand(
    metadata('run.undoFileChanges', 'command'),
    runFileChangesTargetSchema,
    runFileChangesPageSchema,
  ),
}
export type RunFileChangesInput = z.input<(typeof runFileChangesCommands)['run.fileChanges']['input']>
