import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema } from '../index'
import { sessionFileTargetSchema } from './files'
import { resourceReferenceSchema, resourceCandidateSchema, RESOURCE_CANDIDATE_LIMIT } from '../resources'

export const resourceResolveInputSchema = z.strictObject({
  workspaceId: idSchema,
  sessionTarget: sessionFileTargetSchema,
  reference: resourceReferenceSchema,
})
export const resourceReadInputSchema = resourceResolveInputSchema.extend({
  candidateId: z.string().regex(/^[a-f0-9]{64}$/),
})
export type ResourceResolveInput = z.output<typeof resourceResolveInputSchema>
export type ResourceReadInput = z.output<typeof resourceReadInputSchema>
const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.resources',
  kind: 'query' as const,
  execution: 'host' as const,
  stateEffect: 'none' as const,
  scope: 'workspace' as const,
  category: 'files.tools',
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as 'api'[],
})
export const resourceCommands = {
  'resource.resolve': defineCommand(
    metadata('resource.resolve'),
    resourceResolveInputSchema,
    z.strictObject({
      candidates: z.array(resourceCandidateSchema).max(RESOURCE_CANDIDATE_LIMIT),
      truncated: z.boolean(),
    }),
  ),
  'resource.text': defineCommand(
    metadata('resource.text'),
    resourceReadInputSchema,
    z.strictObject({ candidate: resourceCandidateSchema, text: z.string().max(2 * 1024 * 1024) }),
  ),
}
