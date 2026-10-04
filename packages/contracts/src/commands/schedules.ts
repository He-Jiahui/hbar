import { z } from 'zod'
import { defineCommand, type CommandMetadataInput } from '@hbar/commands/protocol'

const id = z.string().min(1).max(160)
const input = z.string().max(1_000_000)
const target = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('new-session') }),
  z.object({ mode: z.literal('existing-session'), sessionId: id }),
])
const scheduleSpec = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('once'), at: z.number().int().nonnegative() }),
  z.object({
    kind: z.literal('daily'),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  }),
  z.object({
    kind: z.literal('weekly'),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  }),
  z.object({ kind: z.literal('cron'), expression: z.string().min(1).max(128) }),
])
export const scheduleDefinitionSchema = z.strictObject({
  id,
  workspaceId: id,
  name: z.string().min(1).max(200),
  input,
  modelId: id,
  timezone: z.string().min(1).max(80),
  target,
  spec: scheduleSpec,
  enabled: z.boolean(),
  revision: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
export type ScheduleDefinition = z.output<typeof scheduleDefinitionSchema>
export const scheduleOccurrenceSchema = z.strictObject({
  id,
  scheduleId: id,
  dueAt: z.number().int().nonnegative(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled', 'unknown']),
  sessionId: id.nullable(),
  runId: id.nullable(),
  attempt: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(1).max(200),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  error: z.string().nullable(),
})
export type ScheduleOccurrence = z.output<typeof scheduleOccurrenceSchema>
export const scheduleListInputSchema = z.strictObject({
  workspaceId: id,
  after: z.string().max(200).nullable().optional(),
  limit: z.number().int().min(1).max(100).default(50),
})
export const schedulePageSchema = z.strictObject({
  items: z.array(scheduleDefinitionSchema).max(100),
  next: z.string().nullable(),
  revision: z.number().int().nonnegative(),
})
export const scheduleGetInputSchema = z.strictObject({ scheduleId: id })
export const scheduleCreateInputSchema = z.strictObject({
  workspaceId: id,
  name: z.string().min(1).max(200),
  input,
  modelId: id,
  timezone: z.string().min(1).max(80),
  target,
  spec: scheduleSpec,
})
export const scheduleUpdateInputSchema = scheduleCreateInputSchema.extend({
  scheduleId: id,
  expectedRevision: z.number().int().nonnegative(),
  enabled: z.boolean().optional(),
})
export const scheduleDeleteInputSchema = z.strictObject({
  scheduleId: id,
  expectedRevision: z.number().int().nonnegative(),
})
export const schedulePreviewInputSchema = z.strictObject({
  spec: scheduleSpec,
  timezone: z.string().min(1).max(80),
  from: z.number().int().nonnegative().optional(),
})
export const schedulePreviewSchema = z.strictObject({
  occurrences: z.array(z.number().int().nonnegative()).min(1).max(5),
  timezone: z.string(),
})
export const scheduleOccurrenceListInputSchema = z.strictObject({
  scheduleId: id,
  after: z.string().max(200).nullable().optional(),
  limit: z.number().int().min(1).max(100).default(50),
})
export const scheduleOccurrencePageSchema = z.strictObject({
  items: z.array(scheduleOccurrenceSchema).max(100),
  next: z.string().nullable(),
})
export type ScheduleCreateInput = z.output<typeof scheduleCreateInputSchema>
export type ScheduleUpdateInput = z.output<typeof scheduleUpdateInputSchema>
export type SchedulePreviewInput = z.output<typeof schedulePreviewInputSchema>
export type ScheduleListInput = z.input<typeof scheduleListInputSchema>
export type ScheduleGetInput = z.input<typeof scheduleGetInputSchema>
export type ScheduleOccurrenceListInput = z.input<typeof scheduleOccurrenceListInputSchema>

const meta = {
  version: 1,
  owner: 'hbar.schedule',
  execution: 'host',
  category: 'workspace.session',
  scope: 'workspace',
  surfaces: ['api', 'palette'],
} satisfies Partial<CommandMetadataInput>
export const scheduleCommands = {
  'schedule.receipt': defineCommand(
    {
      ...meta,
      id: 'schedule.receipt',
      kind: 'query',
      stateEffect: 'none',
      titleKey: 'commands.schedule.receipt.title',
      descriptionKey: 'commands.schedule.receipt.description',
    },
    z.strictObject({
      commandId: z.enum(['schedule.create', 'schedule.update', 'schedule.delete']),
      input: z.union([scheduleCreateInputSchema, scheduleUpdateInputSchema, scheduleDeleteInputSchema]),
      idempotencyKey: z.string().min(1).max(200),
    }),
    z
      .union([scheduleDefinitionSchema, z.strictObject({ scheduleId: id, revision: z.number().int().nonnegative() })])
      .nullable(),
  ),
  'schedule.list': defineCommand(
    {
      ...meta,
      id: 'schedule.list',
      kind: 'query',
      stateEffect: 'none',
      titleKey: 'commands.schedule.list.title',
      descriptionKey: 'commands.schedule.list.description',
    },
    scheduleListInputSchema,
    schedulePageSchema,
  ),
  'schedule.get': defineCommand(
    {
      ...meta,
      id: 'schedule.get',
      kind: 'query',
      stateEffect: 'none',
      titleKey: 'commands.schedule.get.title',
      descriptionKey: 'commands.schedule.get.description',
    },
    scheduleGetInputSchema,
    scheduleDefinitionSchema.nullable(),
  ),
  'schedule.create': defineCommand(
    {
      ...meta,
      id: 'schedule.create',
      kind: 'command',
      stateEffect: 'persistent',
      idempotency: 'required',
      titleKey: 'commands.schedule.create.title',
      descriptionKey: 'commands.schedule.create.description',
    },
    scheduleCreateInputSchema,
    scheduleDefinitionSchema,
  ),
  'schedule.update': defineCommand(
    {
      ...meta,
      id: 'schedule.update',
      kind: 'command',
      stateEffect: 'persistent',
      idempotency: 'required',
      titleKey: 'commands.schedule.update.title',
      descriptionKey: 'commands.schedule.update.description',
    },
    scheduleUpdateInputSchema,
    scheduleDefinitionSchema,
  ),
  'schedule.delete': defineCommand(
    {
      ...meta,
      id: 'schedule.delete',
      kind: 'command',
      stateEffect: 'persistent',
      idempotency: 'required',
      titleKey: 'commands.schedule.delete.title',
      descriptionKey: 'commands.schedule.delete.description',
    },
    scheduleDeleteInputSchema,
    z.strictObject({ scheduleId: id, revision: z.number().int().nonnegative() }),
  ),
  'schedule.preview': defineCommand(
    {
      ...meta,
      id: 'schedule.preview',
      kind: 'query',
      stateEffect: 'none',
      titleKey: 'commands.schedule.preview.title',
      descriptionKey: 'commands.schedule.preview.description',
    },
    schedulePreviewInputSchema,
    schedulePreviewSchema,
  ),
  'schedule.occurrences': defineCommand(
    {
      ...meta,
      id: 'schedule.occurrences',
      kind: 'query',
      stateEffect: 'none',
      titleKey: 'commands.schedule.occurrences.title',
      descriptionKey: 'commands.schedule.occurrences.description',
    },
    scheduleOccurrenceListInputSchema,
    scheduleOccurrencePageSchema,
  ),
}
