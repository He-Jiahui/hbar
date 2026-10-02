import { HbarError } from '@hbar/contracts'
import {
  promptTemplateSchema,
  promptTemplateSaveInputSchema,
  type PromptTemplate,
  type PromptTemplateSaveInput,
  type PromptTemplateDeleteInput,
} from '@hbar/contracts/commands/prompt-templates'

export interface PromptTemplateStoragePort {
  list(input: {
    workspaceId: string
    after?: string | null
    limit: number
  }): Promise<{ items: PromptTemplate[]; nextCursor: string | null }>
  get(id: string): Promise<PromptTemplate | null>
  save(input: PromptTemplateSaveInput, identity?: { actorId: string; idempotencyKey: string }): Promise<PromptTemplate>
  delete(
    input: PromptTemplateDeleteInput,
    identity?: { actorId: string; idempotencyKey: string },
  ): Promise<{ deleted: boolean }>
  receipt?(
    commandId: 'promptTemplate.save' | 'promptTemplate.delete',
    input: PromptTemplateSaveInput | PromptTemplateDeleteInput,
    identity: { actorId: string; idempotencyKey: string },
  ): Promise<unknown | null>
}

export function createPromptTemplateService(port: PromptTemplateStoragePort) {
  return {
    list: (input: { workspaceId: string; after?: string | null; limit: number }) => port.list(input),
    get: (id: string) => port.get(id),
    save: async (raw: PromptTemplateSaveInput, identity?: { actorId: string; idempotencyKey: string }) => {
      const input = promptTemplateSaveInputSchema.parse(raw)
      const duplicate = input.variables.some(
        (item, index) => input.variables.findIndex((candidate) => candidate.id === item.id) !== index,
      )
      if (duplicate) throw new HbarError('INVALID_INPUT', 'Prompt template variables must be unique')
      const template = await port.save(input, identity)
      return promptTemplateSchema.parse(template)
    },
    delete: (input: PromptTemplateDeleteInput, identity?: { actorId: string; idempotencyKey: string }) =>
      port.delete(input, identity),
    receipt: (
      commandId: 'promptTemplate.save' | 'promptTemplate.delete',
      input: PromptTemplateSaveInput | PromptTemplateDeleteInput,
      identity: { actorId: string; idempotencyKey: string },
    ) => port.receipt?.(commandId, input, identity) ?? Promise.resolve(null),
  }
}
