import type { DecisionResult } from '@hbar/contracts/decision'
import type { LayaSample } from './dataset'

export interface Observation {
  sample: LayaSample
  result: DecisionResult
  durationMs: number
}
export function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)] ?? null
}
export function choiceOf(row: Observation): string | undefined {
  if (row.result.status !== 'evaluated') return undefined
  const answer = row.result.answers.decision
  return answer?.type === 'choice' ? answer.choice : undefined
}
export function summarize(rows: Observation[]) {
  const evaluated = rows.filter((row) => choiceOf(row) !== undefined)
  const correct = evaluated.filter((row) => choiceOf(row) === row.sample.expected).length
  const bins = Array.from({ length: 5 }, () => ({ count: 0, correct: 0, confidenceSum: 0 }))
  const confusion = new Map<string, Map<string, number>>()
  let brier = 0
  for (const row of rows) {
    const expected = row.sample.expected
    const predicted = choiceOf(row) ?? 'unavailable'
    const counts = confusion.get(expected) ?? new Map<string, number>()
    confusion.set(expected, counts)
    counts.set(predicted, (counts.get(predicted) ?? 0) + 1)
    if (row.result.status !== 'evaluated') continue
    const answer = row.result.answers.decision
    if (answer?.type !== 'choice') continue
    brier += Object.entries(answer.probabilities).reduce(
      (sum, [key, value]) => sum + (value - (key === expected ? 1 : 0)) ** 2,
      0,
    )
    const bin = bins[Math.min(4, Math.floor(answer.answerConfidence * 5))]
    if (bin) {
      bin.count++
      bin.correct += predicted === expected ? 1 : 0
      bin.confidenceSum += answer.answerConfidence
    }
  }
  const pairs = rows
    .filter((row) => row.sample.order === 'original')
    .flatMap((row) => {
      const reversed = rows.find(
        (candidate) =>
          candidate.sample.groupId === row.sample.groupId &&
          candidate.sample.language === row.sample.language &&
          candidate.sample.long === row.sample.long &&
          candidate.sample.order === 'reversed',
      )
      return reversed ? [{ left: choiceOf(row), right: choiceOf(reversed) }] : []
    })
    .filter((pair) => pair.left !== undefined && pair.right !== undefined)
  return {
    count: rows.length,
    evaluated: evaluated.length,
    correct,
    accuracy: rows.length ? correct / rows.length : null,
    conditionalAccuracy: evaluated.length ? correct / evaluated.length : null,
    baselineAccuracy: rows.length
      ? rows.filter((row) => row.sample.baseline === row.sample.expected).length / rows.length
      : null,
    brier: evaluated.length ? brier / evaluated.length : null,
    ece5: evaluated.length
      ? bins.reduce(
          (sum, bin) =>
            sum +
            (bin.count
              ? (Math.abs(bin.correct / bin.count - bin.confidenceSum / bin.count) * bin.count) / evaluated.length
              : 0),
          0,
        )
      : null,
    orderAgreement: pairs.length ? pairs.filter((pair) => pair.left === pair.right).length / pairs.length : null,
    orderPairs: pairs.length,
    truncated: rows.filter((row) => row.result.metadata.inputTruncated || row.result.metadata.questionsTruncated.length)
      .length,
    latencyP50Ms: percentile(
      rows.map((row) => row.durationMs),
      0.5,
    ),
    latencyP95Ms: percentile(
      rows.map((row) => row.durationMs),
      0.95,
    ),
    confusion: Object.fromEntries([...confusion].map(([expected, counts]) => [expected, Object.fromEntries(counts)])),
  }
}
