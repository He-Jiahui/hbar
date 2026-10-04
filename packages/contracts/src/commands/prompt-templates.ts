import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { HbarError, idSchema } from '../index'

export const PROMPT_TEMPLATE_PAGE_SIZE = 50
export const PROMPT_TEMPLATE_MAX_NAME = 160
export const PROMPT_TEMPLATE_MAX_BODY = 200_000
export const PROMPT_TEMPLATE_MAX_VARIABLES = 32

export const promptTemplateVariableSchema = z.strictObject({
  id: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
  label: z.string().trim().min(1).max(160),
  required: z.boolean(),
  defaultValue: z.string().max(20_000).optional(),
})
export const promptTemplateSchema = z.strictObject({
  id: idSchema,
  workspaceId: idSchema,
  name: z.string().trim().min(1).max(PROMPT_TEMPLATE_MAX_NAME),
  description: z.string().max(2_000),
  body: z.string().min(1).max(PROMPT_TEMPLATE_MAX_BODY),
  variables: z.array(promptTemplateVariableSchema).max(PROMPT_TEMPLATE_MAX_VARIABLES),
  revision: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
export const promptTemplatePageSchema = z.strictObject({
  items: z.array(promptTemplateSchema).max(PROMPT_TEMPLATE_PAGE_SIZE),
  nextCursor: z.string().nullable(),
})
export const promptTemplateListInputSchema = z.strictObject({
  workspaceId: idSchema,
  after: z
    .string()
    .regex(/^\d+:\S+$/)
    .nullable()
    .optional(),
  limit: z.number().int().positive().max(PROMPT_TEMPLATE_PAGE_SIZE).default(PROMPT_TEMPLATE_PAGE_SIZE),
})
export const promptTemplateSaveInputSchema = z
  .strictObject({
    workspaceId: idSchema,
    id: idSchema.optional(),
    name: z.string().trim().min(1).max(PROMPT_TEMPLATE_MAX_NAME),
    description: z.string().max(2_000),
    body: z.string().min(1).max(PROMPT_TEMPLATE_MAX_BODY),
    variables: z.array(promptTemplateVariableSchema).max(PROMPT_TEMPLATE_MAX_VARIABLES),
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.id && value.expectedRevision === undefined)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expectedRevision'],
        message: 'expectedRevision is required when updating a template',
      })
    const ids = new Set<string>()
    for (const [index, variable] of value.variables.entries()) {
      if (ids.has(variable.id))
        ctx.addIssue({ code: 'custom', path: ['variables', index, 'id'], message: 'Variable IDs must be unique' })
      ids.add(variable.id)
    }
    for (const match of value.body.matchAll(/{{\s*([A-Za-z][A-Za-z0-9_-]*)\s*}}/g))
      if (!ids.has(match[1] ?? ''))
        ctx.addIssue({ code: 'custom', path: ['body'], message: 'Prompt body contains an undeclared variable' })
  })
export const promptTemplateDeleteInputSchema = z.strictObject({
  workspaceId: idSchema,
  id: idSchema,
  expectedRevision: z.number().int().nonnegative(),
})
export const promptTemplateApplyInputSchema = z.strictObject({
  template: promptTemplateSchema,
  values: z.record(z.string(), z.string().max(20_000)),
})
export const promptTemplateCommands = {
  'promptTemplate.list': defineCommand(
    {
      id: 'promptTemplate.list',
      version: 1,
      owner: 'hbar.prompt-template',
      kind: 'query',
      execution: 'host',
      stateEffect: 'none',
      category: 'prompt.template',
      scope: 'workspace',
      visibility: 'internal',
      titleKey: 'commands.promptTemplate.list.title',
      descriptionKey: 'commands.promptTemplate.list.description',
      surfaces: ['api'],
    },
    promptTemplateListInputSchema,
    promptTemplatePageSchema,
  ),
  'promptTemplate.get': defineCommand(
    {
      id: 'promptTemplate.get',
      version: 1,
      owner: 'hbar.prompt-template',
      kind: 'query',
      execution: 'host',
      stateEffect: 'none',
      category: 'prompt.template',
      scope: 'workspace',
      visibility: 'internal',
      titleKey: 'commands.promptTemplate.get.title',
      descriptionKey: 'commands.promptTemplate.get.description',
      surfaces: ['api'],
    },
    z.strictObject({ id: idSchema }),
    promptTemplateSchema.nullable(),
  ),
  'promptTemplate.save': defineCommand(
    {
      id: 'promptTemplate.save',
      version: 1,
      owner: 'hbar.prompt-template',
      kind: 'command',
      execution: 'host',
      stateEffect: 'persistent',
      category: 'prompt.template',
      scope: 'workspace',
      visibility: 'internal',
      titleKey: 'commands.promptTemplate.save.title',
      descriptionKey: 'commands.promptTemplate.save.description',
      surfaces: ['api'],
      idempotency: 'required',
    },
    promptTemplateSaveInputSchema,
    promptTemplateSchema,
  ),
  'promptTemplate.delete': defineCommand(
    {
      id: 'promptTemplate.delete',
      version: 1,
      owner: 'hbar.prompt-template',
      kind: 'command',
      execution: 'host',
      stateEffect: 'persistent',
      category: 'prompt.template',
      scope: 'workspace',
      visibility: 'internal',
      titleKey: 'commands.promptTemplate.delete.title',
      descriptionKey: 'commands.promptTemplate.delete.description',
      surfaces: ['api'],
      idempotency: 'required',
    },
    promptTemplateDeleteInputSchema,
    z.strictObject({ deleted: z.boolean() }),
  ),
  'promptTemplate.receipt': defineCommand(
    {
      id: 'promptTemplate.receipt',
      version: 1,
      owner: 'hbar.prompt-template',
      kind: 'query',
      execution: 'host',
      stateEffect: 'none',
      category: 'prompt.template',
      scope: 'workspace',
      visibility: 'internal',
      titleKey: 'commands.promptTemplate.receipt.title',
      descriptionKey: 'commands.promptTemplate.receipt.description',
      surfaces: ['api'],
    },
    z.strictObject({
      commandId: z.enum(['promptTemplate.save', 'promptTemplate.delete']),
      input: z.union([promptTemplateSaveInputSchema, promptTemplateDeleteInputSchema]),
      idempotencyKey: z.string().min(1).max(200),
    }),
    z.union([promptTemplateSchema, z.strictObject({ deleted: z.boolean() })]).nullable(),
  ),
}
export type PromptTemplateVariable = z.infer<typeof promptTemplateVariableSchema>
export type PromptTemplate = z.infer<typeof promptTemplateSchema>
export type PromptTemplatePage = z.infer<typeof promptTemplatePageSchema>
export type PromptTemplateListInput = z.infer<typeof promptTemplateListInputSchema>
export type PromptTemplateSaveInput = z.infer<typeof promptTemplateSaveInputSchema>
export type PromptTemplateDeleteInput = z.infer<typeof promptTemplateDeleteInputSchema>

export function renderPromptTemplate(template: PromptTemplate, values: Readonly<Record<string, string>>): string {
  const allowed = new Set(template.variables.map((item) => item.id))
  for (const variable of template.variables) {
    const resolved = values[variable.id]?.trim() || variable.defaultValue?.trim() || ''
    if (variable.required && !resolved)
      throw new HbarError('INVALID_INPUT', `Missing required prompt template variable: ${variable.id}`)
  }
  return template.body.replace(/{{\s*([A-Za-z][A-Za-z0-9_-]*)\s*}}/g, (_match, key: string) => {
    if (!allowed.has(key)) throw new HbarError('INVALID_INPUT', `Undeclared prompt template variable: ${key}`)
    const variable = template.variables.find((item) => item.id === key)
    return values[key]?.trim() || variable?.defaultValue?.trim() || ''
  })
}
