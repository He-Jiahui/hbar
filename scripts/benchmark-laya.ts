import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { cpus, totalmem } from 'node:os'
import { parseArgs } from 'node:util'
import { decisionCheckpointSchema } from '@hbar/contracts/decision'
import type { DecisionCheckpoint, DecisionRequest, DecisionResult } from '@hbar/contracts/decision'
import { LayaDecisionRuntime, layaConfigSchema } from '@hbar/decision-laya'
import { builtinDataset, validateDataset } from './laya-evaluation/dataset'
import type { LayaSample } from './laya-evaluation/dataset'
import { summarize, percentile } from './laya-evaluation/metrics'
import type { Observation } from './laya-evaluation/metrics'

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    'runtime-directory': { type: 'string' },
    checkpoints: { type: 'string', default: 'multilingual,english,typed-decisions' },
    dataset: { type: 'string' },
    output: { type: 'string', default: 'artifacts/laya' },
    device: { type: 'string', default: 'auto' },
  },
})
if (!values['runtime-directory']) throw new Error('--runtime-directory is required')
const samples = values.dataset
  ? validateDataset(
      (await readFile(values.dataset, 'utf8'))
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as unknown),
    )
  : builtinDataset()
const testSamples = samples.filter((sample) => sample.split === 'test')
if (!testSamples.length) throw new Error('Dataset has no held-out test samples')
const checkpoints = (values.checkpoints ?? '').split(',').map((name) => decisionCheckpointSchema.parse(name))
const output = resolve(values.output ?? 'artifacts/laya')
await mkdir(output, { recursive: true })
await writeFile(join(output, 'dataset.jsonl'), samples.map((sample) => JSON.stringify(sample)).join('\n') + '\n')
const controller = new AbortController()
const cancel = () => controller.abort(new Error('Laya benchmark cancelled'))
process.once('SIGINT', cancel)

async function timed(runtime: LayaDecisionRuntime, request: DecisionRequest) {
  const start = performance.now()
  const result = await runtime.evaluate(request, controller.signal)
  return { result, durationMs: performance.now() - start }
}
function requestFor(sample: LayaSample, checkpoint: DecisionCheckpoint): DecisionRequest {
  return { ...sample.request, checkpoint }
}
function memoryMaximum(
  results: DecisionResult[],
  field: 'memoryAllocatedBytes' | 'memoryReservedBytes',
): number | null {
  const numbers = results.flatMap((result) => (result.metadata[field] === null ? [] : [result.metadata[field]]))
  return numbers.length ? Math.max(...numbers) : null
}

const reports = []
let failed = false
try {
  for (const checkpoint of checkpoints) {
    console.log(`Evaluating ${checkpoint}: ${testSamples.length} held-out fixture variants`)
    const config = layaConfigSchema.parse({
      runtimeDirectory: resolve(values['runtime-directory']),
      device: values.device,
      checkpoints: [checkpoint],
      startupTimeoutMs: 300_000,
      requestTimeoutMs: 30_000,
    })
    const runtime = new LayaDecisionRuntime(config)
    try {
      const first = testSamples[0]
      if (!first) throw new Error('Missing first sample')
      const cold = await timed(runtime, requestFor(first, checkpoint))
      if (cold.result.status !== 'evaluated') {
        reports.push({ checkpoint, cold, failure: cold.result })
        failed = true
        continue
      }
      const rows: Observation[] = []
      for (const sample of testSamples) {
        controller.signal.throwIfAborted()
        const value = await timed(runtime, requestFor(sample, checkpoint))
        rows.push({ sample, ...value })
      }
      const concurrent = await Promise.all(
        Array.from({ length: 8 }, () => timed(runtime, requestFor(first, checkpoint))),
      )
      const typedSmoke = await timed(runtime, {
        checkpoint,
        state: 'A required regression test exited 1. The work is not complete.',
        questions: {
          choice: {
            type: 'choice',
            instructions: 'Choose the supported next action.',
            criteria: { inspect: 'Inspect the failed test', complete: 'Mark the goal complete' },
          },
          binary: { type: 'noul', instructions: 'All required regression tests passed.' },
          progress: {
            type: 'score',
            instructions: 'Rate acceptance evidence readiness.',
            criteria: ['Required checks failed', 'Required checks have not been run', 'All required checks passed'],
          },
        },
      })
      const results = rows.map((row) => row.result)
      const report = {
        checkpoint,
        cold,
        overall: summarize(rows),
        byLanguage: Object.fromEntries(
          ['en', 'zh'].map((language) => [language, summarize(rows.filter((row) => row.sample.language === language))]),
        ),
        byDomain: Object.fromEntries(
          [...new Set(testSamples.map((sample) => sample.domain))].map((domain) => [
            domain,
            summarize(rows.filter((row) => row.sample.domain === domain)),
          ]),
        ),
        short: summarize(rows.filter((row) => !row.sample.long)),
        long: summarize(rows.filter((row) => row.sample.long)),
        concurrent: {
          calls: concurrent.length,
          p50Ms: percentile(
            concurrent.map((value) => value.durationMs),
            0.5,
          ),
          p95Ms: percentile(
            concurrent.map((value) => value.durationMs),
            0.95,
          ),
          queueP95Ms: percentile(
            concurrent.map((value) => value.result.metadata.queueMs),
            0.95,
          ),
          failures: concurrent.filter((value) => value.result.status !== 'evaluated').length,
        },
        device: cold.result.metadata.device,
        peakAllocatedBytes: memoryMaximum(results, 'memoryAllocatedBytes'),
        peakReservedBytes: memoryMaximum(results, 'memoryReservedBytes'),
        typedSmoke,
      }
      reports.push(report)
      await writeFile(join(output, `${checkpoint}.jsonl`), rows.map((row) => JSON.stringify(row)).join('\n') + '\n')
      console.log(
        `${checkpoint}: accuracy ${report.overall.accuracy}, hot p50/p95 ${report.overall.latencyP50Ms}/${report.overall.latencyP95Ms} ms`,
      )
      failed ||=
        report.overall.evaluated !== rows.length ||
        typedSmoke.result.status !== 'evaluated' ||
        report.concurrent.failures > 0
    } finally {
      await runtime.dispose()
    }
  }
} finally {
  process.removeListener('SIGINT', cancel)
}
const report = {
  version: 1,
  createdAt: new Date().toISOString(),
  environment: {
    platform: process.platform,
    architecture: process.arch,
    cpu: cpus()[0]?.model ?? 'unknown',
    logicalCores: cpus().length,
    memoryBytes: totalmem(),
    bun: Bun.version,
  },
  methodology: {
    dataset: values.dataset
      ? 'external JSONL'
      : 'synthetic adaptations of hbar rule/test scenarios; not production history',
    splitCounts: Object.fromEntries(
      ['train', 'calibration', 'test'].map((split) => [
        split,
        samples.filter((sample) => sample.split === split).length,
      ]),
    ),
    distinctTestGroups: new Set(testSamples.map((sample) => sample.groupId)).size,
    calibration:
      'Raw answerConfidence only; no fitted calibration or training. All translations and perturbations share one group/split.',
    baseline:
      'Known deterministic rule labels, not measured human/LLM performance; fixture baseline is intentionally 100%.',
    latency:
      'Caller end-to-end wall time; cold includes Python startup/loading and first inference. Hot calls exclude cold. Eight simultaneous callers use one FIFO forward slot.',
    memory: 'PyTorch peak allocated/reserved memory; excludes driver/context overhead. CPU memory is not measured.',
  },
  reports,
}
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
await writeFile(
  join(output, 'report.md'),
  '# Local Laya evaluation\n\n' +
    JSON.stringify(report.methodology, null, 2) +
    '\n\n| Checkpoint | Accuracy | en | zh | Cold ms | Hot p50 ms | Hot p95 ms | ECE | Brier | Order agreement |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n' +
    reports
      .map((entry) =>
        'overall' in entry
          ? `| ${entry.checkpoint} | ${entry.overall.accuracy} | ${entry.byLanguage.en?.accuracy} | ${entry.byLanguage.zh?.accuracy} | ${entry.cold.durationMs.toFixed(1)} | ${entry.overall.latencyP50Ms?.toFixed(1)} | ${entry.overall.latencyP95Ms?.toFixed(1)} | ${entry.overall.ece5} | ${entry.overall.brier} | ${entry.overall.orderAgreement} |`
          : `| ${entry.checkpoint} | ${entry.failure.code} |`,
      )
      .join('\n') +
    '\n\nSee report.json and per-checkpoint JSONL for predictions, failure counts, confusion matrices, truncation, typed-answer smoke, memory and queue measurements.\n',
)
if (failed) process.exitCode = 1
