import { z } from 'zod'
import { decisionAnswerSchema } from '@hbar/contracts/decision'
import type { DecisionAnswer, DecisionQuestion, ParsedDecisionRequest } from '@hbar/contracts/decision'
import { DecisionBackendError } from './backend'

const optionNames = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const probability = z.number().finite().min(0).max(1)
const rawAnswerSchema = z.object({
  type: z.enum(['choice', 'score']),
  confidence: probability,
  answer_confidence: probability,
  probabilities: z.record(z.string(), probability),
  choice: z.string().optional(),
  score: z.number().finite().optional(),
})
const responseSchema = z.object({
  answers: z.record(z.string(), rawAnswerSchema),
  routing: z.object({ model: z.string() }),
  hbar_input: z.object({
    state_truncated: z.boolean(),
    questions_truncated: z.array(z.string()).max(16),
    device: z.string().min(1).max(80).nullable().default(null),
    memory_allocated_bytes: z.number().int().nonnegative().nullable().default(null),
    memory_reserved_bytes: z.number().int().nonnegative().nullable().default(null),
  }),
})

export function wireQuestions(request: ParsedDecisionRequest): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(request.questions).map(([id, question]): [string, unknown] => {
      if (question.type === 'score') return [id, question]
      const descriptions =
        question.type === 'choice'
          ? Object.values(question.criteria)
          : [
              'The answer to the question is affirmative; the condition is supported by the supplied evidence.',
              'The answer to the question is negative; the condition is not supported by the supplied evidence.',
            ]
      return [
        id,
        {
          type: 'choice',
          instructions: question.instructions,
          criteria: Object.fromEntries(
            descriptions.map((text, index): [string, string] => [optionNames[index] ?? invalid(), text]),
          ),
        },
      ]
    }),
  )
}

function invalid(): never {
  throw new DecisionBackendError('INVALID_RESPONSE', 'Laya returned inconsistent question answers or probabilities')
}

function keysMatch(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && actual.every((key) => expected.includes(key))
}

function decode(question: DecisionQuestion, raw: z.infer<typeof rawAnswerSchema>): DecisionAnswer {
  const labels =
    question.type === 'choice'
      ? Object.keys(question.criteria)
      : question.type === 'score'
        ? question.criteria.map((_, index) => String(index))
        : ['A', 'B']
  const wireLabels = question.type === 'score' ? labels : optionNames.slice(0, labels.length)
  if (!keysMatch(Object.keys(raw.probabilities), wireLabels)) invalid()
  const values = wireLabels.map((key) => raw.probabilities[key] ?? invalid())
  const sum = values.reduce((total, value) => total + value, 0)
  const max = Math.max(...values)
  if (Math.abs(sum - 1) > 0.002 || Math.abs(raw.answer_confidence - max) > 0.002) invalid()
  const common = { confidence: raw.confidence, answerConfidence: raw.answer_confidence }
  if (question.type === 'score') {
    const expected = values.reduce((total, value, index) => total + value * index, 0)
    if (raw.type !== 'score' || raw.score === undefined || Math.abs(raw.score - expected) > 0.005) invalid()
    return decisionAnswerSchema.parse({
      type: 'score',
      score: raw.score,
      probabilities: values,
      legend: question.criteria,
      ...common,
    })
  }
  if (raw.type !== 'choice' || raw.choice === undefined || !wireLabels.includes(raw.choice)) invalid()
  if (Math.abs((raw.probabilities[raw.choice] ?? invalid()) - max) > 0.001) invalid()
  if (question.type === 'noul')
    return decisionAnswerSchema.parse({ type: 'noul', value: raw.choice === 'A', probability: values[0], ...common })
  const index = wireLabels.indexOf(raw.choice)
  return decisionAnswerSchema.parse({
    type: 'choice',
    choice: labels[index],
    probabilities: Object.fromEntries(labels.map((key, i) => [key, values[i]])),
    ...common,
  })
}

export function decodeAnswers(
  request: ParsedDecisionRequest,
  value: unknown,
): {
  answers: Record<string, DecisionAnswer>
  inputTruncated: boolean
  questionsTruncated: string[]
  device: string | null
  memoryAllocatedBytes: number | null
  memoryReservedBytes: number | null
} {
  const parsed = responseSchema.safeParse(value)
  if (
    !parsed.success ||
    parsed.data.routing.model !== request.checkpoint ||
    !keysMatch(Object.keys(parsed.data.answers), Object.keys(request.questions))
  )
    invalid()
  if (parsed.data.hbar_input.questions_truncated.some((id) => !Object.hasOwn(request.questions, id))) invalid()
  return {
    answers: Object.fromEntries(
      Object.entries(request.questions).map(([id, question]) => [
        id,
        decode(question, parsed.data.answers[id] ?? invalid()),
      ]),
    ),
    inputTruncated: parsed.data.hbar_input.state_truncated,
    questionsTruncated: parsed.data.hbar_input.questions_truncated,
    device: parsed.data.hbar_input.device,
    memoryAllocatedBytes: parsed.data.hbar_input.memory_allocated_bytes,
    memoryReservedBytes: parsed.data.hbar_input.memory_reserved_bytes,
  }
}
