import { z } from 'zod'

export const nodeOperationIdSchema = z
  .string()
  .min(1)
  .max(330)
  .refine(
    (value) => !Array.from(value).some((character) => character.charCodeAt(0) < 32),
    'Node operation keys cannot contain control characters',
  )
