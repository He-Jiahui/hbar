import { z } from 'zod'
import { defineCommand, type CommandMetadataInput } from '@hbar/commands/protocol'
import { idSchema, runFailureSchema, runStatusSchema } from '../index'
import { planStateSchema } from '../plan'
import { usageMetricSchema, usageTotalsSchema } from './usage'

/**
 * The board cursor is tied to the host snapshot revision.  `createdAt` and
 * `runId` form the stable key used to continue a page when several runs have
 * the same timestamp.
 */
export const runBoardCursorSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
  runId: idSchema,
})

export const runBoardInputSchema = z.strictObject({
  workspaceId: idSchema,
  sessionId: idSchema.optional(),
  statuses: z.array(runStatusSchema).max(runStatusSchema.options.length).default([]),
  cursor: runBoardCursorSchema.optional(),
  limit: z.number().int().min(1).max(100).default(40),
})

/** Run fields exposed by the board; the full input payload stays on run.get. */
export const runBoardRunSchema = z.strictObject({
  id: idSchema,
  sessionId: idSchema,
  workspaceName: z.string().max(4_000).nullable(),
  sessionTitle: z.string().max(160).nullable(),
  requestId: idSchema,
  modelId: idSchema,
  status: runStatusSchema,
  createdAt: z.number().int().nonnegative(),
  startedAt: z.number().int().nonnegative().nullable(),
  endedAt: z.number().int().nonnegative().nullable(),
  error: z.string().nullable(),
  failure: runFailureSchema.optional(),
})

export const runBoardUsageSchema = usageTotalsSchema.extend({
  cost: usageMetricSchema,
})

export const runBoardItemSchema = z.strictObject({
  run: runBoardRunSchema,
  workspaceName: z.string().max(4_000).nullable(),
  sessionTitle: z.string().max(160).nullable(),
  plan: planStateSchema.nullable(),
  usage: runBoardUsageSchema.nullable(),
})

export const runBoardPageSchema = z
  .strictObject({
    workspaceId: idSchema,
    sessionId: idSchema.nullable(),
    workspaceName: z.string().max(4_000).nullable(),
    sessionTitle: z.string().max(160).nullable(),
    revision: z.number().int().nonnegative(),
    observedAt: z.number().int().nonnegative(),
    items: z.array(runBoardItemSchema).max(100),
    nextCursor: runBoardCursorSchema.nullable(),
  })
  .superRefine((page, context) => {
    if (page.nextCursor && page.nextCursor.revision !== page.revision) {
      context.addIssue({
        code: 'custom',
        path: ['nextCursor', 'revision'],
        message: 'nextCursor revision must match the page revision',
      })
    }
    const last = page.items.at(-1)?.run
    if (
      page.nextCursor &&
      (!last || page.nextCursor.createdAt !== last.createdAt || page.nextCursor.runId !== last.id)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['nextCursor'],
        message: 'nextCursor must point at the final item in the page',
      })
    }
  })

const metadata = {
  id: 'run.board.list',
  version: 1,
  owner: 'hbar.run-board',
  kind: 'query' as const,
  execution: 'host' as const,
  stateEffect: 'none' as const,
  category: 'monitoring.runs',
  scope: 'workspace' as const,
  titleKey: 'commands.run.board.list.title',
  descriptionKey: 'commands.run.board.list.description',
  surfaces: ['cli', 'tui', 'api', 'palette'],
  cli: { arguments: [] },
} satisfies CommandMetadataInput

export const runBoardCommands = {
  'run.board.list': defineCommand(metadata, runBoardInputSchema, runBoardPageSchema),
}

export type RunBoardCursor = z.output<typeof runBoardCursorSchema>
export type RunBoardInput = z.input<typeof runBoardInputSchema>
export type RunBoardRun = z.output<typeof runBoardRunSchema>
export type RunBoardUsage = z.output<typeof runBoardUsageSchema>
export type RunBoardItem = z.output<typeof runBoardItemSchema>
export type RunBoardPage = z.output<typeof runBoardPageSchema>
