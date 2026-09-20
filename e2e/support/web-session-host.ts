import { HbarClient } from '@hbar/client'
import { existsSync } from 'node:fs'
import { spawn, type ChildProcess } from 'node:child_process'
import { delimiter, join } from 'node:path'
import { createInterface } from 'node:readline'

export type WebSessionHostReady = Readonly<{
  token: string
  workspaceId: string
  workspaceName: string
  sessionId: string
  sessionTitle: string
}>

export type WebSessionHost = Readonly<{
  child: ChildProcess
  client: HbarClient
  ready: WebSessionHostReady
  url: string
}>

function bunExecutable(): string {
  if (process.platform !== 'win32') return 'bun'
  const executable = (process.env.PATH ?? '')
    .split(delimiter)
    .flatMap((directory) => [join(directory, 'bun.exe'), join(directory, 'node_modules', 'bun', 'bin', 'bun.exe')])
    .find(existsSync)
  if (!executable) throw new Error('Bun executable is unavailable for the E2E Host fixture')
  return executable
}

export async function startWebSessionHost(
  options: Readonly<{
    root: string
    port?: number
    sessionCount?: number
    historyCount?: number
  }>,
): Promise<WebSessionHost> {
  const port = options.port ?? 4317
  const child = spawn(bunExecutable(), ['scripts/e2e-session-host.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HBAR_E2E_DATA_ROOT: options.root,
      HBAR_E2E_HOST_PORT: String(port),
      HBAR_E2E_SESSION_COUNT: String(options.sessionCount ?? 1),
      HBAR_E2E_HISTORY_COUNT: String(options.historyCount ?? 0),
      HBAR_E2E_WEB_ORIGIN: `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let errors = ''
  child.stderr!.on('data', (chunk) => {
    errors += String(chunk)
  })
  const output = createInterface({ input: child.stdout! })
  const ready = await new Promise<WebSessionHostReady>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`E2E Host did not start: ${errors}`)), 20_000)
    output.on('line', (line) => {
      try {
        const value = JSON.parse(line) as Partial<WebSessionHostReady>
        if (value.token && value.workspaceId && value.workspaceName && value.sessionId && value.sessionTitle) {
          clearTimeout(timer)
          resolve(value as WebSessionHostReady)
        }
      } catch {
        // Non-protocol diagnostics remain available in the startup error.
      }
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`E2E Host exited with ${code}: ${errors}`))
    })
  })
  output.close()
  const url = `http://127.0.0.1:${port}`
  const client = new HbarClient(url, ready.token)
  await client.connect()
  return { child, client, ready, url }
}

export async function stopWebSessionHost(host: WebSessionHost): Promise<void> {
  host.client.disconnect()
  if (host.child.exitCode !== null) return
  const exited = new Promise<void>((resolve) => host.child.once('exit', () => resolve()))
  host.child.kill()
  await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 5_000))])
  if (host.child.exitCode === null) host.child.kill('SIGKILL')
}
