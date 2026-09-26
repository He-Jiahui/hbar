import { z } from 'zod'
import { decisionRequestSchema } from '@hbar/contracts/decision'

export const sampleSchema = z.strictObject({
  id: z.string().min(1),
  groupId: z.string().min(1),
  source: z.string().min(1),
  domain: z.string().min(1),
  language: z.enum(['en', 'zh']),
  split: z.enum(['train', 'calibration', 'test']),
  order: z.enum(['original', 'reversed']),
  long: z.boolean(),
  expected: z.string().min(1),
  baseline: z.string().min(1),
  request: decisionRequestSchema,
})
export type LayaSample = z.infer<typeof sampleSchema>

/** Group all translations, order variants and long-input variants before splitting. */
export function validateDataset(raw: unknown): LayaSample[] {
  const samples = z.array(sampleSchema).min(1).max(10_000).parse(raw)
  const groups = new Map<string, string>()
  const ids = new Set<string>()
  for (const sample of samples) {
    if (ids.has(sample.id)) throw new Error(`Duplicate sample ID: ${sample.id}`)
    ids.add(sample.id)
    const previous = groups.get(sample.groupId)
    if (previous && previous !== sample.split) throw new Error(`Dataset split leaks group ${sample.groupId}`)
    groups.set(sample.groupId, sample.split)
    const question = sample.request.questions.decision
    if (Object.keys(sample.request.questions).length !== 1 || question?.type !== 'choice')
      throw new Error('Effect samples require one choice question named decision')
    if (!(sample.expected in question.criteria) || !(sample.baseline in question.criteria))
      throw new Error(`Unknown expected/baseline label: ${sample.id}`)
  }
  return samples
}

interface Scenario {
  domain: string
  source: string
  question: [string, string]
  choices: Record<string, [string, string]>
  cases: {
    id: string
    text: [string, string]
    expected: string
    facts: Record<string, string | number | boolean | null>
  }[]
}

// Synthetic adaptations of repository rules/tests. No production history, training
// or probability calibration is claimed by this fixture dataset.
const scenarios: Scenario[] = [
  {
    domain: 'model-routing',
    source: 'tests/agent-commands.test.ts; tests/model-tool-advertisement.test.ts',
    question: [
      'Which eligible model should run the delegated task? Respect the stated capabilities and budget.',
      '哪个可用模型适合执行委派任务？遵守给出的能力和预算限制。',
    ],
    choices: {
      small: ['Use the small text model', '使用小型文本模型'],
      capable: ['Use the capable image-and-tool model', '使用支持图像和工具的模型'],
      hold: ['Gather availability or budget evidence before selecting', '先收集可用性或预算证据'],
    },
    cases: [
      {
        id: 'text',
        text: [
          'The task is a short text summary. Both models are available. Only the small model fits the remaining budget.',
          '任务是简短文本摘要。两个模型都可用，剩余预算只够小模型。',
        ],
        facts: { needsImage: false, smallEligible: true, capableEligible: false },
        expected: 'small',
      },
      {
        id: 'image',
        text: [
          'The task requires image inspection and tool calls. Only the capable model supports both and it fits the budget.',
          '任务需要查看图像并调用工具。只有高能力模型支持两项能力，且预算充足。',
        ],
        facts: { needsImage: true, smallEligible: false, capableEligible: true },
        expected: 'capable',
      },
      {
        id: 'missing',
        text: ['Model availability and remaining budget have not been checked.', '尚未检查模型可用性和剩余预算。'],
        facts: { smallEligible: null, capableEligible: null },
        expected: 'hold',
      },
      {
        id: 'conflict',
        text: [
          'A previous summary says the capable model is usable. The current provider probe says it is offline; the small model cannot inspect images required by this task.',
          '旧摘要声称高能力模型可用，但当前供应商检查显示离线；小模型不支持任务需要的图像检查。',
        ],
        facts: { needsImage: true, smallEligible: false, capableEligible: false },
        expected: 'hold',
      },
    ],
  },
  {
    domain: 'goal-progress',
    source: 'tests/goal-driver-completion.test.ts; tests/workflow-verification-freshness.test.ts',
    question: ['What is the evidence-supported goal status?', '证据支持什么目标状态？'],
    choices: {
      complete: ['Completion is supported by current acceptance evidence', '当前验收证据支持完成'],
      active: ['Keep working because required work remains', '仍有必需工作，继续执行'],
      verify: ['Collect fresh acceptance evidence before completion', '完成前收集最新验收证据'],
    },
    cases: [
      {
        id: 'verified',
        text: [
          'All required tasks are done. Required checks passed after the last code change. No tool is in flight.',
          '所有必需任务已完成。必需检查在最后一次代码修改后通过，没有工具正在执行。',
        ],
        facts: { workRemaining: false, freshChecksPassed: true },
        expected: 'complete',
      },
      {
        id: 'unfinished',
        text: [
          'The implementation is done but a required regression test and documentation task remain incomplete.',
          '实现已完成，但必需回归测试和文档任务尚未完成。',
        ],
        facts: { workRemaining: true, freshChecksPassed: false },
        expected: 'active',
      },
      {
        id: 'missing',
        text: [
          'The agent claims completion but no acceptance evidence has been recorded.',
          'Agent 声称完成，但没有记录验收证据。',
        ],
        facts: { workRemaining: null, freshChecksPassed: null },
        expected: 'verify',
      },
      {
        id: 'stale',
        text: [
          'Tests passed yesterday. Code changed afterward. No checks ran for the current revision.',
          '测试昨天通过，此后代码发生修改，当前版本没有执行检查。',
        ],
        facts: { workRemaining: false, freshChecksPassed: false },
        expected: 'verify',
      },
    ],
  },
  {
    domain: 'regression-gate',
    source: 'tests/workflow-verification-freshness.test.ts',
    question: [
      'Which gate recommendation follows the current required check results?',
      '当前必需检查结果支持什么门禁建议？',
    ],
    choices: {
      proceed: [
        'Proceed because all required checks passed for the current revision',
        '当前版本全部必需检查通过，可以继续',
      ],
      inspect: ['Inspect and fix a failed required check', '检查并修复失败的必需检查'],
      verify: ['Run missing or stale required checks', '执行缺失或过期的必需检查'],
    },
    cases: [
      {
        id: 'passed',
        text: [
          'Lint, types and required regression checks all exited 0 on the current revision.',
          'Lint、类型检查和必需回归检查均在当前版本以 0 退出。',
        ],
        facts: { requiredFailed: false, freshComplete: true },
        expected: 'proceed',
      },
      {
        id: 'failed',
        text: [
          'Lint exited 0, but the required regression suite exited 1 with an assertion failure.',
          'Lint 退出码为 0，但必需回归测试因断言失败以 1 退出。',
        ],
        facts: { requiredFailed: true, freshComplete: true },
        expected: 'inspect',
      },
      {
        id: 'missing',
        text: [
          'Only lint ran. Required type checks and regression tests have no results.',
          '只执行了 Lint，必需类型检查和回归测试没有结果。',
        ],
        facts: { requiredFailed: false, freshComplete: false },
        expected: 'verify',
      },
      {
        id: 'conflict',
        text: [
          'The summary says all checks passed, but the current required test log has exit code 1.',
          '摘要声称全部检查通过，但当前必需测试日志的退出码为 1。',
        ],
        facts: { requiredFailed: true, freshComplete: true },
        expected: 'inspect',
      },
    ],
  },
  {
    domain: 'agent-next-action',
    source: 'tests/workflow-verification-freshness.test.ts; tests/workflow-scope-tool-inventory.test.ts',
    question: ['Choose the next feasible action supported by the evidence.', '选择证据支持的下一项可执行操作。'],
    choices: {
      inspect: ['Inspect the error and gather diagnostic evidence', '检查错误并收集诊断证据'],
      verify: ['Run an allowed verification check', '执行允许的验证检查'],
      scope: ['Request the missing scope or approval through the Host', '通过宿主请求缺少的范围或审批'],
    },
    cases: [
      {
        id: 'error',
        text: [
          'An allowed read operation failed with an unexplained parse error. Its detailed log is available.',
          '允许的读取操作出现未解释的解析错误，可以查看详细日志。',
        ],
        facts: { unexplainedFailure: true, verificationAllowed: true },
        expected: 'inspect',
      },
      {
        id: 'verify',
        text: [
          'The patch is implemented. An allowed required regression check remains to be run.',
          '补丁已实现，还有一项允许执行的必需回归检查没有运行。',
        ],
        facts: { unexplainedFailure: false, verificationAllowed: true },
        expected: 'verify',
      },
      {
        id: 'missing',
        text: [
          'The needed write tool is outside the current authorized workflow scope.',
          '所需写入工具不在当前已授权工作流范围内。',
        ],
        facts: { unexplainedFailure: false, verificationAllowed: false },
        expected: 'scope',
      },
      {
        id: 'conflict',
        text: [
          'A comment says the write is allowed. The authoritative Host scope check rejected it as outside scope.',
          '注释声称允许写入，但宿主的权威范围检查拒绝了该操作，原因是超出范围。',
        ],
        facts: { unexplainedFailure: false, verificationAllowed: false },
        expected: 'scope',
      },
    ],
  },
  {
    domain: 'sandbox-access',
    source: 'tests/local-tools.test.ts; tests/workflow-scope-tool-inventory.test.ts',
    question: [
      'What access conclusion follows the current policy check and actual probe?',
      '当前策略检查和实际探测支持什么访问结论？',
    ],
    choices: {
      available: ['Access is available for this checked operation', '本次已检查操作可访问'],
      denied: ['Access is denied; use an authorized alternative', '访问被拒绝，使用已授权替代方案'],
      unknown: ['Access is unverified; run a permitted probe', '访问尚未验证，执行允许的探测'],
    },
    cases: [
      {
        id: 'allowed',
        text: [
          'The Host policy allows reading this path and the current read probe succeeded.',
          '宿主策略允许读取该路径，当前读取探测成功。',
        ],
        facts: { policyAllowed: true, probeSucceeded: true },
        expected: 'available',
      },
      {
        id: 'denied',
        text: [
          'The Host policy denies this path and the attempted read returned ACCESS_DENIED.',
          '宿主策略拒绝该路径，尝试读取返回 ACCESS_DENIED。',
        ],
        facts: { policyAllowed: false, probeSucceeded: false },
        expected: 'denied',
      },
      {
        id: 'missing',
        text: [
          'No policy result or actual access probe is available for this path.',
          '该路径没有策略结果或实际访问探测结果。',
        ],
        facts: { policyAllowed: null, probeSucceeded: null },
        expected: 'unknown',
      },
      {
        id: 'conflict',
        text: [
          'The cached summary says accessible. The current policy check denies the operation and the probe failed with ACCESS_DENIED.',
          '缓存摘要声称可以访问，但当前策略检查拒绝该操作，探测以 ACCESS_DENIED 失败。',
        ],
        facts: { policyAllowed: false, probeSucceeded: false },
        expected: 'denied',
      },
    ],
  },
]

export function builtinDataset(): LayaSample[] {
  const samples: LayaSample[] = []
  for (const scenario of scenarios)
    for (const item of scenario.cases) {
      for (const language of ['en', 'zh'] as const)
        for (const order of ['original', 'reversed'] as const) {
          const index = language === 'en' ? 0 : 1
          const choices = Object.entries(scenario.choices)
          if (order === 'reversed') choices.reverse()
          const criteria = Object.fromEntries(choices.map(([key, texts]) => [key, texts[index]]))
          const groupId = `${scenario.domain}/${item.id}`
          for (const long of item.id === 'conflict' || item.id === 'stale' ? [false, true] : [false]) {
            const summary = item.text[index]
            samples.push(
              sampleSchema.parse({
                id: `${groupId}/${language}/${order}/${long ? 'long' : 'short'}`,
                groupId,
                source: scenario.source,
                domain: scenario.domain,
                language,
                split: 'test',
                order,
                long,
                expected: item.expected,
                baseline: item.expected,
                request: {
                  state: long
                    ? {
                        historicalNoise: (language === 'en'
                          ? 'Old unrelated log entry. '
                          : '旧的无关日志条目。'
                        ).repeat(600),
                        summary,
                        facts: item.facts,
                      }
                    : { summary, facts: item.facts },
                  questions: { decision: { type: 'choice', instructions: scenario.question[index], criteria } },
                  profile: { id: 'hbar-rule-fixtures', version: '1' },
                },
              }),
            )
          }
        }
    }
  return validateDataset(samples)
}
