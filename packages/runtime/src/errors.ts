import { z } from 'zod'

const domainErrorSchema = z.object({
  name: z.enum(['HbarError', 'CommandError']), code: z.string().regex(/^[A-Z][A-Z0-9_.-]{0,127}$/), message: z.string(),
})
/** Immutable bundles have distinct constructors. Validate the public error data instead of class identity. */
export function runtimeDomainError(error: unknown): { code: string; message: string } | null {
  const parsed = error instanceof Error ? domainErrorSchema.safeParse(error) : null
  return parsed?.success ? { code: parsed.data.code, message: parsed.data.message.slice(0, 1_600) } : null
}
