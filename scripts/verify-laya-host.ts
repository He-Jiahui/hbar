import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { DecisionService } from '@hbar/plugin-sdk'
import { decisionResultSchema } from '@hbar/contracts/decision'
import { packageLaya } from './package-laya'

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    'runtime-directory': { type: 'string' },
    output: { type: 'string', default: 'artifacts/laya/host-smoke.json' },
  },
})
if (!values['runtime-directory']) throw new Error('--runtime-directory is required')
const root = await mkdtemp(join(tmpdir(), 'hbar-real-laya-'))
let kernel: Kernel | undefined
try {
  const project = join(root, 'project')
  await mkdir(project)
  kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: project,
    demo: true,
    secrets: new MemorySecrets(),
  })
  await kernel.installPlugin(await packageLaya(join(root, 'plugin')))
  await kernel.changePlugin('@hbar/decision-laya', true, { runtimeDirectory: resolve(values['runtime-directory']) })
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Missing temporary workspace')
  const host = kernel
  const sessions = await Promise.all(['Agent A', 'Agent B'].map((title) => host.createSession(workspace.id, title)))
  const first = sessions[0]
  const second = sessions[1]
  if (!first || !second) throw new Error('Missing temporary sessions')
  const service = kernel.plugins.get<DecisionService>('decision')
  const request = {
    state: 'A required regression check exited 1 on the current revision.',
    questions: {
      action: {
        type: 'choice' as const,
        instructions: 'Choose the next evidence-supported action.',
        criteria: { inspect: 'Inspect the failed required test', complete: 'Mark the work complete' },
      },
    },
  }
  const results = await Promise.all(
    [first, second].map((session) =>
      service.evaluate(request, new AbortController().signal, { sessionId: session.id }),
    ),
  )
  if (results.some((result) => result.status !== 'evaluated'))
    throw new Error('Real multi-Session service evaluation failed: ' + JSON.stringify(results))
  const run = await kernel.submit(
    first.id,
    'real-decision-tool',
    { text: '/tool decision_evaluate ' + JSON.stringify(request), images: [] },
    'local-fixture',
  )
  await kernel.waitForIdle()
  const events = await kernel.storage.call('events', first.id, 0)
  const audit = events.find((event) => event.type === 'decision.evaluated' && event.runId === run.id)
  if (!audit) throw new Error('Agent evaluation was not correlated to its Run')
  const toolResult = decisionResultSchema.parse(audit.data)
  if (toolResult.status !== 'evaluated')
    throw new Error('Real Agent tool inference failed: ' + JSON.stringify(toolResult))
  const blocks = (await kernel.snapshot(first.id)).messages.flatMap((message) => message.content)
  if (!blocks.some((block) => block.type === 'tool_result' && block.name === 'decision_evaluate' && !block.isError))
    throw new Error('Agent did not receive a successful decision tool result')
  await kernel.changePlugin('@hbar/decision-laya', false)
  if (kernel.tools.get('decision_evaluate')) throw new Error('Plugin disable left its tool registered')
  let released = false
  try {
    kernel.plugins.get<DecisionService>('decision')
  } catch {
    released = true
  }
  if (!released) throw new Error('Plugin disable left its service registered')
  const report = {
    createdAt: new Date().toISOString(),
    temporaryHost: true,
    serviceEvaluations: results,
    agentEvaluation: toolResult,
    correlatedRun: true,
    toolResultReceived: true,
    serviceAndToolReleased: released,
  }
  const output = resolve(values.output ?? 'artifacts/laya/host-smoke.json')
  await mkdir(resolve(output, '..'), { recursive: true })
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  console.log('Real Laya service, two Sessions, Agent tool, durable audit and plugin disable passed: ' + output)
} finally {
  await kernel?.close()
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
