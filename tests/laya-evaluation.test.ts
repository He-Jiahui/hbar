import { expect, test } from 'bun:test'
import { decisionResultSchema } from '@hbar/contracts/decision'
import { builtinDataset, validateDataset } from '../scripts/laya-evaluation/dataset'
import { percentile, summarize } from '../scripts/laya-evaluation/metrics'

test('dataset keeps related variants together and rejects train/test leakage and invalid labels', () => {
  const samples = builtinDataset()
  expect(new Set(samples.map((sample) => sample.groupId)).size).toBe(20)
  expect(samples).toHaveLength(100)
  const first = samples[0]
  if (!first) throw new Error('Missing sample')
  expect(() => validateDataset([first, { ...first, id: 'other', split: 'train' }])).toThrow('leaks group')
  expect(() => validateDataset([{ ...first, expected: 'absent' }])).toThrow('Unknown expected')
  expect(() => validateDataset([{ ...first, expected: 'toString' }])).toThrow('Unknown expected')
  expect(() => validateDataset([{ ...first, baseline: 'constructor' }])).toThrow('Unknown expected')
  expect(samples.every((sample) => sample.split === 'test')).toBe(true)
})

function response(choice = 'small') {
  return decisionResultSchema.parse({
    status: 'evaluated',
    answers: {
      decision: {
        type: 'choice',
        choice,
        probabilities: Object.fromEntries([
          [choice, 0.8],
          ['capable', 0.2],
        ]),
        confidence: 0.2,
        answerConfidence: 0.8,
      },
    },
    metadata: {
      evaluationId: 'test',
      provider: 'test',
      runtimeVersion: '1',
      checkpoint: 'multilingual',
      modelRevision: null,
      profile: { id: 'test', version: '1' },
      schemaHash: 'a'.repeat(64),
      stateHash: 'b'.repeat(64),
      startedAt: 0,
      elapsedMs: 1,
      queueMs: 0,
      calibration: 'uncalibrated',
      inputTruncated: false,
      questionsTruncated: [],
      device: null,
      memoryAllocatedBytes: null,
      memoryReservedBytes: null,
    },
  })
}

test('accuracy, multiclass Brier, ECE and percentiles are computed from known labelled outcomes', () => {
  const samples = builtinDataset()
  const first = samples[0]
  const second = samples[1]
  if (!first || !second) throw new Error('Missing samples')
  const result = response()
  const metrics = summarize([
    { sample: first, result, durationMs: 10 },
    { sample: { ...second, expected: 'capable', baseline: 'capable' }, result, durationMs: 20 },
  ])
  expect(metrics.accuracy).toBe(0.5)
  expect(metrics.baselineAccuracy).toBe(1)
  expect(metrics.brier).toBeCloseTo(0.68)
  expect(metrics.ece5).toBeCloseTo(0.3)
  expect(metrics.latencyP95Ms).toBe(20)
  expect(percentile([], 0.5)).toBeNull()
})

test('labels matching inherited object names retain their real confusion counts', () => {
  const first = builtinDataset()[0]
  if (!first) throw new Error('Missing sample')
  const [sample] = validateDataset([
    {
      ...first,
      expected: 'constructor',
      baseline: 'constructor',
      request: {
        ...first.request,
        questions: {
          decision: {
            type: 'choice',
            instructions: 'Choose the supported action',
            criteria: { constructor: 'Construct the verified result', capable: 'Ask for more evidence' },
          },
        },
      },
    },
  ])
  if (!sample) throw new Error('Missing parsed sample')
  const metrics = summarize([{ sample, result: response('constructor'), durationMs: 1 }])
  expect(metrics.accuracy).toBe(1)
  expect(Object.hasOwn(metrics.confusion, 'constructor')).toBe(true)
  const counts = Object.entries(metrics.confusion).find(([key]) => key === 'constructor')?.[1]
  expect(counts).toEqual(Object.fromEntries([['constructor', 1]]))
})
