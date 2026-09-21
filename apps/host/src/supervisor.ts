import { readFile } from 'node:fs/promises'

export const RESTART_EXIT_CODE = 75

export interface HostSupervisorOptions {
  readonly command: readonly [string, ...string[]]
  readonly hostArgs: readonly string[]
  readonly connectionFile: string
  readonly stdio?: 'inherit' | 'ignore'
}

function supervisedArguments(input: readonly string[], port?: number): string[] {
  const args: string[] = []
  let replacedPort = false
  for (let index = 0; index < input.length; index++) {
    const value = input[index]!
    if (value === '--supervisor' || value === '--supervised') continue
    if (value === '--port') {
      const current = input[index + 1]
      if (current !== undefined) index++
      args.push('--port', port === undefined ? (current ?? '0') : String(port))
      replacedPort = port !== undefined
      continue
    }
    if (value.startsWith('--port=')) {
      args.push(port === undefined ? value : `--port=${port}`)
      replacedPort = port !== undefined
      continue
    }
    args.push(value)
  }
  if (port !== undefined && !replacedPort) args.push('--port', String(port))
  args.push('--supervised')
  return args
}

async function connectionPort(path: string): Promise<number> {
  const value = JSON.parse(await readFile(path, 'utf8')) as { url?: unknown }
  if (typeof value.url !== 'string') throw new Error('Host connection file does not contain a URL')
  const port = Number(new URL(value.url).port)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535)
    throw new Error('Host connection file does not contain a valid port')
  return port
}

export function createHostSupervisor(options: HostSupervisorOptions) {
  let child: ReturnType<typeof Bun.spawn> | null = null
  let stopped = false
  let running = false
  return {
    async run(): Promise<number> {
      if (running) throw new Error('Host supervisor is already running')
      running = true
      let port: number | undefined
      while (!stopped) {
        const output = options.stdio ?? 'inherit'
        child = Bun.spawn([...options.command, ...supervisedArguments(options.hostArgs, port)], {
          stdin: 'ignore',
          stdout: output,
          stderr: output,
          windowsHide: true,
        })
        const code = await child.exited
        child = null
        if (stopped) return 0
        if (code !== RESTART_EXIT_CODE) return code
        port = await connectionPort(options.connectionFile)
        await Bun.sleep(100)
      }
      return 0
    },
    stop(): void {
      stopped = true
      child?.kill()
    },
  }
}
