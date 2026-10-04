import { createInterface } from 'node:readline/promises'
import type { CliArgs } from './args.ts'
import { executeCommandLine } from './command-line.ts'
import type { CliRuntime } from './runtime.ts'

export async function runRepl(runtime: CliRuntime, defaults: CliArgs): Promise<void> {
  const terminal = Boolean(process.stdin.isTTY && process.stdout.isTTY)
  const lines = createInterface({ input: process.stdin, output: process.stdout, terminal })
  if (terminal) process.stdout.write('hbar command REPL · type quit to exit\n')
  try {
    for await (const raw of lines) {
      const source = raw.trim()
      if (!source) continue
      if (source === 'quit' || source === 'exit') break
      try {
        await executeCommandLine(source, runtime, defaults, (value) => {
          process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`)
        })
      } catch (error) {
        if (!terminal) throw error
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      }
      if (terminal) process.stdout.write('hbar> ')
    }
  } finally {
    lines.close()
  }
}
