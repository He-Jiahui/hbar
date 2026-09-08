#!/usr/bin/env bun
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseCli, HELP, type CliArgs } from './args.ts'
import { runCliCommand } from './commands.ts'
import { openAttachedRuntime, openRuntime, waitForRun } from './runtime.ts'
import { runTui } from './tui.ts'

function exitCode(error: unknown, usage = false) {
  if (usage) return 2
  const message = error instanceof Error ? error.message : String(error)
  if (/approval|denied/i.test(message)) return 3
  if (/model|provider|configured/i.test(message)) return 4
  if (/plugin/i.test(message)) return 5
  if (/session|storage|Host connection/i.test(message)) return 6
  return 7
}

function completion(shell: string | undefined) {
  if (shell === 'powershell')
    return `Register-ArgumentCompleter -Native -CommandName hbar -ScriptBlock { param($wordToComplete) 'session','model','plugins','skills','config','diagnose','version' | Where-Object { $_ -like "$wordToComplete*" } }`
  if (shell === 'bash' || shell === 'zsh')
    return `complete -W "session model plugins skills config diagnose version" hbar`
  throw new Error('Usage: hbar completion <powershell|bash|zsh>')
}

async function serve(args: CliArgs) {
  const host = resolve(import.meta.dir, '../../host/src/main.ts')
  const command = [
    process.execPath,
    host,
    '--desktop',
    ...(args.dataRoot ? ['--data-root', args.dataRoot] : []),
    ...(args.cacheRoot ? ['--cache-root', args.cacheRoot] : []),
    ...(args.project ? ['--workspace', resolve(args.project)] : []),
    ...(args.demo ? ['--demo'] : []),
  ]
  const child = spawn(command[0]!, command.slice(1), { stdio: 'inherit', windowsHide: false })
  return new Promise<number>((resolveExit, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolveExit(code ?? 7))
  })
}

async function attached(args: CliArgs) {
  const url = args.commandArgs[0]
  if (!url) throw new Error('Usage: hbar attach <url>')
  let runtime
  try {
    runtime = await openAttachedRuntime(url, process.env.HBAR_TOKEN, args)
  } catch (error) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw error
    const prompt = createInterface({ input: process.stdin, output: process.stdout })
    try {
      const code = await prompt.question('Pairing code: ')
      runtime = await openAttachedRuntime(url, undefined, args, code.trim())
    } finally {
      prompt.close()
    }
  }
  await runTui(runtime, args.message)
}

let parsed: CliArgs | undefined
let usageError = false
try {
  try {
    parsed = parseCli()
  } catch (error) {
    usageError = true
    throw error
  }
  const args = parsed
  if (args.help) {
    console.log(HELP)
    process.exit(0)
  }
  if (args.command === 'version') {
    console.log('hbar 0.1.0')
    process.exit(0)
  }
  if (args.command === 'completion') {
    console.log(completion(args.commandArgs[0]))
    process.exit(0)
  }
  if (args.command === 'serve') process.exit(await serve(args))
  if (args.command === 'attach') {
    await attached(args)
    process.exit(0)
  }
  if (args.headless && !args.message && !process.stdin.isTTY) args.message = (await Bun.stdin.text()).trim()
  if (args.headless && !args.message) {
    usageError = true
    throw new Error('--message is required (or pipe one message on stdin)')
  }
  if (args.headless && args.approval === 'ask' && (!process.stdin.isTTY || !process.stdout.isTTY))
    throw new Error('--approval ask requires an interactive terminal')
  const runtime = await openRuntime(args)
  try {
    const handled = await runCliCommand(args, runtime)
    if (!handled && args.headless) {
      let activeRunId = ''
      const interrupt = () => {
        if (activeRunId) void runtime.client.call('run.cancel', { runId: activeRunId })
      }
      process.once('SIGINT', interrupt)
      try {
        const run = await runtime.client.call('run.start', {
          sessionId: runtime.session.id,
          requestId: randomUUID(),
          input: {
            text: args.message!,
            images: [],
            thinking: args.thinking,
            approval: args.approval,
          },
          modelId: runtime.modelId,
        })
        activeRunId = run.id
        await waitForRun(runtime.client, runtime.session, run, args.outputFormat, args.approval)
      } finally {
        process.off('SIGINT', interrupt)
      }
    } else if (!handled) await runTui(runtime, args.message)
  } finally {
    runtime.close()
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  if (parsed?.headless && parsed.outputFormat === 'jsonl')
    process.stdout.write(`${JSON.stringify({ type: 'error', error: message, code: exitCode(error, usageError) })}\n`)
  else {
    console.error(message)
    if (usageError) console.error('\n' + HELP)
  }
  process.exit(exitCode(error, usageError))
}
