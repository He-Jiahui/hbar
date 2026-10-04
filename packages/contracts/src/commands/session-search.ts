import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema } from '../index'

const time = z.number().int().nonnegative()
const sessionIdentity = {
  sessionId: idSchema,
  workspaceId: idSchema,
  title: z.string().max(160),
  workspaceName: z.string().max(4000),
  updatedAt: time,
}

export const sessionRecentInputSchema = z.strictObject({ limit: z.number().int().min(1).max(8).default(8) })
export const sessionRecentItemSchema = z.strictObject(sessionIdentity)
export const sessionRecentPageSchema = z.strictObject({ items: z.array(sessionRecentItemSchema).max(8) })

export const sessionSearchInputSchema = z.strictObject({
  query: z.string().trim().min(1).max(160),
  limit: z.number().int().min(1).max(50).default(50),
  matchesPerSession: z.number().int().min(1).max(3).default(3),
})
export const sessionSearchMatchSchema = z.strictObject({
  messageId: idSchema,
  role: z.enum(['user', 'assistant']),
  snippet: z.strictObject({
    before: z.string().max(160),
    hit: z.string().min(1).max(160),
    after: z.string().max(160),
  }),
})
export const sessionSearchItemSchema = z.strictObject({
  ...sessionIdentity,
  matchCount: z.number().int().positive().max(999),
  matchCountCapped: z.boolean(),
  matches: z.array(sessionSearchMatchSchema).min(1).max(3),
})
export const sessionSearchPageSchema = z.strictObject({
  items: z.array(sessionSearchItemSchema).max(50),
  truncated: z.boolean(),
  incompleteReason: z.enum(['indexing', 'scan_cap']).nullable(),
})

export type SessionRecentInput = z.input<typeof sessionRecentInputSchema>
export type SessionRecentPage = z.output<typeof sessionRecentPageSchema>
export type SessionSearchInput = z.input<typeof sessionSearchInputSchema>
export type SessionSearchPage = z.output<typeof sessionSearchPageSchema>

const metadata = (id: 'session.recent' | 'session.search') => ({
  id,
  version: 1,
  owner: 'hbar.session-search',
  kind: 'query' as const,
  execution: 'host' as const,
  stateEffect: 'none' as const,
  category: 'workspace.search',
  scope: 'global' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as ('api' | 'palette' | 'cli' | 'tui')[],
  maxConcurrent: 2,
  timeoutMs: 10_000,
})

export const sessionSearchCommands = {
  'session.recent': defineCommand(metadata('session.recent'), sessionRecentInputSchema, sessionRecentPageSchema),
  'session.search': defineCommand(metadata('session.search'), sessionSearchInputSchema, sessionSearchPageSchema),
}
