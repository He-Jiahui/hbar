import { z } from 'zod'

/** Stable client page sections; old performance, usage and Git selections remain valid. */
export const statusWorkspaceSectionSchema = z.enum(['dashboard', 'runs', 'usage', 'diagnostics', 'git'])
export type StatusWorkspaceSection = z.output<typeof statusWorkspaceSectionSchema>
