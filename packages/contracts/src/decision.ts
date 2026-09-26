import { z } from 'zod'

export const DECISION_MAX_STATE_BYTES = 32_768
export const DECISION_MAX_QUESTIONS = 16
export const DECISION_MAX_OPTIONS = 8

const name = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/)
const instructions = z.string().min(1).max(1_000)
const description = z.string().min(1).max(500)
const probability = z.number().finite().min(0).max(1)
const probabilities = z.record(name, probability)

export const decisionCheckpointSchema = z.enum(['multilingual', 'english', 'typed-decisions'])
export const decisionQuestionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('choice'),
    instructions,
    criteria: z
      .record(name, description)
      .refine(
        (value) => Object.keys(value).length >= 2 && Object.keys(value).length <= DECISION_MAX_OPTIONS,
        `A choice requires 2–${DECISION_MAX_OPTIONS} options`,
      ),
  }),
  z.strictObject({
    type: z.literal('score'),
    instructions,
    criteria: z.array(description).min(2).max(DECISION_MAX_OPTIONS),
  }),
  z.strictObject({ type: z.literal('noul'), instructions }),
])

export const decisionRequestSchema = z.strictObject({
  state: z
    .union([z.string().min(1), z.record(z.string().max(100), z.json())])
    .refine(
      (value) => new TextEncoder().encode(JSON.stringify(value)).length <= DECISION_MAX_STATE_BYTES,
      `Decision state exceeds ${DECISION_MAX_STATE_BYTES} UTF-8 bytes`,
    ),
  questions: z
    .record(name, decisionQuestionSchema)
    .refine(
      (value) => Object.keys(value).length >= 1 && Object.keys(value).length <= DECISION_MAX_QUESTIONS,
      `An evaluation requires 1–${DECISION_MAX_QUESTIONS} questions`,
    ),
  checkpoint: decisionCheckpointSchema.default('multilingual'),
  profile: z.strictObject({ id: name, version: z.string().min(1).max(80) }).default({ id: 'generic', version: '1' }),
})

const answerFields = {
  /** Upstream distribution concentration; it is not an accuracy probability. */
  confidence: probability,
  /** Highest option probability, still uncalibrated until a held-out domain evaluation. */
  answerConfidence: probability,
}
export const decisionAnswerSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('choice'), choice: name, probabilities, ...answerFields }),
  z.strictObject({
    type: z.literal('score'),
    score: z
      .number()
      .finite()
      .min(0)
      .max(DECISION_MAX_OPTIONS - 1),
    probabilities: z.array(probability).min(2).max(DECISION_MAX_OPTIONS),
    legend: z.array(description).min(2).max(DECISION_MAX_OPTIONS),
    ...answerFields,
  }),
  z.strictObject({ type: z.literal('noul'), value: z.boolean(), probability, ...answerFields }),
])

export const decisionFailureCodeSchema = z.enum([
  'INVALID_INPUT',
  'NOT_CONFIGURED',
  'MISSING_DEPENDENCY',
  'MISSING_MODEL',
  'STARTUP_TIMEOUT',
  'QUEUE_FULL',
  'REQUEST_TIMEOUT',
  'PROCESS_EXIT',
  'INVALID_RESPONSE',
  'DISPOSED',
  'CANCELLED',
  'INFERENCE_FAILED',
  'RECORDING_FAILED',
])
export const decisionMetadataSchema = z.strictObject({
  evaluationId: z.string().min(1).max(100),
  provider: z.string().min(1).max(100),
  runtimeVersion: z.string().min(1).max(80),
  checkpoint: decisionCheckpointSchema,
  modelRevision: z.string().min(1).max(100).nullable(),
  profile: z.strictObject({ id: name, version: z.string().min(1).max(80) }),
  schemaHash: z.string().regex(/^[a-f0-9]{64}$/),
  stateHash: z.string().regex(/^[a-f0-9]{64}$/),
  startedAt: z.number().int().nonnegative(),
  elapsedMs: z.number().finite().nonnegative(),
  queueMs: z.number().finite().nonnegative(),
  calibration: z.literal('uncalibrated'),
  inputTruncated: z.boolean(),
  questionsTruncated: z.array(name).max(DECISION_MAX_QUESTIONS),
  device: z.string().min(1).max(80).nullable(),
  memoryAllocatedBytes: z.number().int().nonnegative().nullable(),
  memoryReservedBytes: z.number().int().nonnegative().nullable(),
})
export const decisionResultSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('evaluated'),
    answers: z.record(name, decisionAnswerSchema),
    metadata: decisionMetadataSchema,
  }),
  z.strictObject({
    status: z.literal('unavailable'),
    code: decisionFailureCodeSchema,
    message: z.string().max(500),
    metadata: decisionMetadataSchema,
  }),
  z.strictObject({
    status: z.literal('cancelled'),
    code: z.literal('CANCELLED'),
    message: z.string().max(500),
    metadata: decisionMetadataSchema,
  }),
])

export type DecisionRequest = z.input<typeof decisionRequestSchema>
export type ParsedDecisionRequest = z.output<typeof decisionRequestSchema>
export type DecisionQuestion = z.infer<typeof decisionQuestionSchema>
export type DecisionAnswer = z.infer<typeof decisionAnswerSchema>
export type DecisionResult = z.infer<typeof decisionResultSchema>
export type DecisionMetadata = z.infer<typeof decisionMetadataSchema>
export type DecisionCheckpoint = z.infer<typeof decisionCheckpointSchema>
export type DecisionFailureCode = z.infer<typeof decisionFailureCodeSchema>
