import { z } from 'zod'
import description from './navigation-layout.json'

const schema = z.object({
  sidebar: z
    .object({
      minimum: z.number().positive(),
      maximum: z.number().positive(),
      initial: z.number().positive(),
      keyboardStep: z.number().positive(),
    })
    .refine((value) => value.minimum <= value.initial && value.initial <= value.maximum),
  mobileViewportWidth: z.number().positive(),
})

export const navigationLayout = schema.parse(description)
export function normalizeSidebarWidth(value: unknown): number {
  const { minimum, maximum, initial } = navigationLayout.sidebar
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, Math.round(value)))
    : initial
}
