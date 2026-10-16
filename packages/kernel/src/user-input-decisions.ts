import { userInputResponseSchema, type UserInputRequest, type UserInputResponse } from '@hbar/contracts'

export type RecommendedInputDecision =
  | { readonly kind: 'recommended'; readonly response: UserInputResponse }
  | { readonly kind: 'human'; readonly reason: 'secret' | 'fact' | 'authorization' | 'recommendation_required' }

/** Automation can choose a declared preference; it cannot invent user facts, credentials or authorization. */
export function recommendedInputDecision(request: UserInputRequest): RecommendedInputDecision {
  for (const question of request.questions) {
    if (question.isSecret) return { kind: 'human', reason: 'secret' }
    if (question.purpose === 'authorization') return { kind: 'human', reason: 'authorization' }
    if (question.purpose !== 'decision') return { kind: 'human', reason: 'fact' }
  }
  const answers: UserInputResponse['answers'] = {}
  for (const question of request.questions) {
    const recommended = (question.options ?? []).filter((option) => option.recommended)
    const choice = recommended[0]
    if (recommended.length !== 1 || !choice) return { kind: 'human', reason: 'recommendation_required' }
    answers[question.id] = { answers: [choice.label] }
  }
  return { kind: 'recommended', response: userInputResponseSchema.parse({ answers }) }
}
