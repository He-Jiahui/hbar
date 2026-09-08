import { parseCli, HELP } from './args.ts'
import { openRuntime, waitForRun } from './runtime.ts'
import { runTui } from './tui.ts'
import { randomUUID } from 'node:crypto'

function exitCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/approval|denied/i.test(message)) return 3
  if (/model|provider|configured/i.test(message)) return 4
  if (/plugin/i.test(message)) return 5
  if (/session|storage|Host connection/i.test(message)) return 6
  return 7
}

try {
  const args = parseCli()
  if (args.help) { console.log(HELP); process.exit(0) }
  if (args.command === 'version') { console.log('hbar 0.1.0'); process.exit(0) }
  if (args.command === 'completion') { console.log(args.commandArgs[0] === 'powershell' ? 'Register-ArgumentCompleter -Native -CommandName hbar -ScriptBlock { param($wordToComplete) }' : '# hbar completion'); process.exit(0) }
  const runtime = await openRuntime(args)
  if (args.command === 'config' && args.commandArgs[0] === 'paths') { console.log(await runtime.client.call('system.paths.get', {})); runtime.close(); process.exit(0) }
  if (args.command === 'diagnose') { console.log(JSON.stringify(await runtime.client.call('system.diagnose', {}), null, 2)); runtime.close(); process.exit(0) }
  if (args.headless) {
    if (!args.message) throw new Error('--message is required (or pipe one message on stdin)')
    const run = await runtime.client.call('run.start', { sessionId: runtime.session.id, requestId: randomUUID(), input: { text: args.message, images: [], thinking: args.thinking, approval: args.approval }, modelId: runtime.modelId })
    await waitForRun(runtime.client, runtime.session, run, args.outputFormat, args.approval)
    runtime.close()
  } else {
    await runTui(runtime, args.message)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(exitCode(error))
}
