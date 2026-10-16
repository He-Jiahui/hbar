import { z } from 'zod'

export const toolPathArgumentSchema = z.strictObject({
  field: z.string().min(1).max(128),
  fieldPath: z.array(z.string().min(1).max(128)).min(1).max(16).optional(),
  access: z.enum(['read', 'write']),
})
export interface ToolPathArgument {
  readonly field: string
  /** Explicit JSON keys. Omission keeps field as a literal top-level key, including dots. */
  readonly fieldPath?: readonly string[] | undefined
  readonly access: 'read' | 'write'
}

/** Read data properties only; a declaration cannot follow prototypes or invoke getters. */
export function toolArgumentValue(args: Readonly<Record<string, unknown>>, argument: ToolPathArgument): unknown {
  const path = argument.fieldPath ?? [argument.field]
  if (!path.length || path.length > 16) return undefined
  let value: unknown = args
  for (const key of path) {
    if (!key.length || key.length > 128) return undefined
    if (value === null || typeof value !== 'object') return undefined
    const property = Object.getOwnPropertyDescriptor(value, key)
    if (!property || !('value' in property)) return undefined
    value = property.value
  }
  return value
}
