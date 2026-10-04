import { z } from 'zod'
import { defineCommand, type CommandMetadataInput } from '@hbar/commands/protocol'
import {
  BUILTIN_SANDBOX_PROFILE_IDS,
  SANDBOX_MAX_PROFILES,
  resolvedSandboxProfileSchema,
  sandboxProfileDeleteInputSchema,
  sandboxProfileIdSchema,
  sandboxProfileSaveInputSchema,
  sandboxProfileSchema,
} from '../sandbox'

export const sandboxProfileSummarySchema = z.strictObject({
  id: sandboxProfileIdSchema,
  builtin: z.boolean(),
  name: z.string().min(1).max(160),
  description: z.string().max(2_000),
  extends: sandboxProfileIdSchema.nullable(),
  revision: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
export const sandboxProfileListSchema = z.strictObject({
  items: z.array(sandboxProfileSummarySchema).max(SANDBOX_MAX_PROFILES + BUILTIN_SANDBOX_PROFILE_IDS.length),
})
/** A stored profile whose chain cannot be resolved stays readable so it can be repaired. */
export const sandboxProfileDetailSchema = z.strictObject({
  profile: sandboxProfileSchema,
  resolved: resolvedSandboxProfileSchema.nullable(),
  resolveError: z.strictObject({ code: z.string().min(1).max(80), message: z.string().max(2_000) }).nullable(),
})
const deleteResultSchema = z.strictObject({ deleted: z.boolean() })

function metadata(id: string, kind: 'command' | 'query'): CommandMetadataInput {
  return {
    id,
    version: 1,
    owner: 'hbar.sandbox',
    kind,
    execution: 'host',
    stateEffect: kind === 'query' ? 'none' : 'persistent',
    category: 'run.approval',
    scope: 'global',
    visibility: 'internal',
    titleKey: `commands.${id}.title`,
    descriptionKey: `commands.${id}.description`,
    surfaces: ['api'],
    ...(kind === 'command' ? { idempotency: 'required' as const } : {}),
  }
}

export const sandboxCommands = {
  'sandbox.list': defineCommand(metadata('sandbox.list', 'query'), z.strictObject({}), sandboxProfileListSchema),
  'sandbox.get': defineCommand(
    metadata('sandbox.get', 'query'),
    z.strictObject({ id: sandboxProfileIdSchema }),
    sandboxProfileDetailSchema.nullable(),
  ),
  'sandbox.save': defineCommand(
    metadata('sandbox.save', 'command'),
    sandboxProfileSaveInputSchema,
    sandboxProfileSchema,
  ),
  'sandbox.delete': defineCommand(
    metadata('sandbox.delete', 'command'),
    sandboxProfileDeleteInputSchema,
    deleteResultSchema,
  ),
  'sandbox.receipt': defineCommand(
    metadata('sandbox.receipt', 'query'),
    z.strictObject({
      commandId: z.enum(['sandbox.save', 'sandbox.delete']),
      input: z.union([sandboxProfileSaveInputSchema, sandboxProfileDeleteInputSchema]),
      idempotencyKey: z.string().min(1).max(200),
    }),
    z.union([sandboxProfileSchema, deleteResultSchema]).nullable(),
  ),
}

export type SandboxProfileSummary = z.infer<typeof sandboxProfileSummarySchema>
export type SandboxProfileList = z.infer<typeof sandboxProfileListSchema>
export type SandboxProfileDetail = z.infer<typeof sandboxProfileDetailSchema>
