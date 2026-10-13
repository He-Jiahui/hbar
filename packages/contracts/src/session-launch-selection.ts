import { z } from 'zod'

const branchNameSchema = z.string().trim().min(1).max(1_000)
const localBranchRefSchema = z
  .string()
  .min('refs/heads/'.length + 1)
  .max(1_011)
  .startsWith('refs/heads/')

export const sessionLaunchDerivedBranchNameSchema = z.string().regex(/^hbar\/session-launch\/[0-9a-f]{64}$/)

/** Pure launch selection contract, shared without importing the contracts barrel. */
export const sessionLaunchSelectionSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('shared-current') }),
  z.strictObject({
    mode: z.literal('shared-branch'),
    branch: z.strictObject({
      ref: localBranchRefSchema,
      tipOid: z
        .string()
        .regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i)
        .toLowerCase(),
    }),
  }),
  z.strictObject({
    mode: z.literal('isolated-worktree'),
    branch: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('existing'), name: branchNameSchema }),
      z.strictObject({
        kind: z.literal('new'),
        name: branchNameSchema,
        startPoint: branchNameSchema.optional(),
      }),
      z.strictObject({ kind: z.literal('derived'), baseRef: localBranchRefSchema }),
    ]),
  }),
])

export type SessionLaunchSelection = z.infer<typeof sessionLaunchSelectionSchema>
