import { z } from 'zod'
import { workspaceActivitySortSchema } from '@hbar/contracts/directory'

/** The bounded sidebar prefix (200 rows + 20 pin reserves), not a second project roster. */
export const projectOrderSchema = z
  .array(z.string().min(1).max(160))
  .max(220)
  .refine((ids) => new Set(ids).size === ids.length)
export const sidebarOrganizationSchema = z.enum(['project', 'recentProject', 'time'])
export const groupedSidebarOrganizationSchema = z.enum(['project', 'recentProject'])
export const legacySidebarPreferenceSchema = z.strictObject({
  version: z.literal(1),
  organization: sidebarOrganizationSchema,
  previousGroupedOrganization: groupedSidebarOrganizationSchema,
})
export const sidebarPreferenceSchema = z.strictObject({
  version: z.literal(2),
  organization: sidebarOrganizationSchema,
  previousGroupedOrganization: groupedSidebarOrganizationSchema,
  sortBy: workspaceActivitySortSchema,
  projectOrder: projectOrderSchema,
})
export type SidebarPreference = z.output<typeof sidebarPreferenceSchema>

export function sameProjectOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

export function sameSidebarPreference(left: SidebarPreference, right: SidebarPreference): boolean {
  return (
    left.organization === right.organization &&
    left.previousGroupedOrganization === right.previousGroupedOrganization &&
    left.sortBy === right.sortBy &&
    sameProjectOrder(left.projectOrder, right.projectOrder)
  )
}

/** Unranked newly loaded projects keep their Host order after the explicitly moved prefix. */
export function applyManualProjectOrder(ids: readonly string[], order: readonly string[]): string[] {
  const rank = new Map(order.map((id, index) => [id, index]))
  return [...ids].sort((a, b) => (rank.get(a) ?? order.length) - (rank.get(b) ?? order.length))
}

export function moveProjectInOrder(
  ids: readonly string[],
  sourceId: string,
  targetId: string,
  placement: 'before' | 'after',
): string[] {
  if (sourceId === targetId || !ids.includes(sourceId) || !ids.includes(targetId)) return [...ids]
  const result = ids.filter((id) => id !== sourceId)
  result.splice(result.indexOf(targetId) + (placement === 'after' ? 1 : 0), 0, sourceId)
  return result
}
