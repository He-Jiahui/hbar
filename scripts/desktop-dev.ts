import { closeSync, openSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { z } from 'zod'
import { findFreePort, parsePort } from './dev-ports'

const connectionSchema = z.object({
  url: z.url(),
  instanceId: z.string().min(1),
  pid: z.number().int().positive(),
  supervisorPid: z.number().int().positive().optional(),
})

/** Both native capabilities and the Host bind to loopback in desktop development. */
export function desktopDevWebUrl(raw: string | undefined, port: number): string {
  if (!raw) return `http://127.0.0.1:${port}`
  const url = new URL(raw)
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    !url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error('HBAR_WEB_DEV_URL must be a loopback HTTP origin with an explicit port')
  if (parsePort(url.port, 5173) !== port) throw new Error('HBAR_WEB_PORT does not match HBAR_WEB_DEV_URL')
  // Match the declared Tauri capability and the single Vite listening interface.
  return `http://127.0.0.1:${port}`
}

async function stopChild(child: Bun.Subprocess): Promise<void> {
  if (child.exitCode !== null) return
  if (process.platform === 'win32') {
    const killer = Bun.spawn(['taskkill', '/PID', String(child.pid), '/T', '/F'], {
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
      timeout: 5_000,
    })
    await killer.exited
  } else child.kill()
  await Promise.race([child.exited, Bun.sleep(5_000)])
}

async function ready(
  url: string,
  child: Bun.Subprocess,
  verify: (response: Response) => Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Development process exited before readiness (${child.exitCode})`)
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
      if (response.ok && (await verify(response))) return
    } catch {
      // Includes an incomplete connection file while the source Host is starting.
    }
    await Bun.sleep(100)
  }
  throw new Error(`Timed out waiting for the development service at ${url}`)
}

async function requireUnusedHome(home: string): Promise<void> {
  const lock = await readFile(resolve(home, 'settings/host.lock'), 'utf8').catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  })
  if (!lock) return
  const parsed: unknown = JSON.parse(lock)
  const { pid } = z.object({ pid: z.number().int().positive() }).parse(parsed)
  try {
    process.kill(pid, 0)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return
    throw error
  }
  throw new Error(`A Host already owns ${home}. Stop that development instance or choose another HBAR_HOME.`)
}

/** Source Host + Vite + Tauri share one owned development lifecycle; no release bundles are generated. */
export async function runDesktopDev(args: readonly string[] = []): Promise<number> {
  const project = resolve(import.meta.dir, '..')
  const node = Bun.which('node')
  if (!node) throw new Error('Desktop development requires Node.js for the Vite and Tauri CLIs')
  const rawUrl = process.env.HBAR_WEB_DEV_URL
  const configuredUrlPort = rawUrl ? parsePort(new URL(rawUrl).port, 5173) : undefined
  const webPort = process.env.HBAR_WEB_PORT
    ? parsePort(process.env.HBAR_WEB_PORT, 5173)
    : (configuredUrlPort ?? (await findFreePort()))
  const webUrl = desktopDevWebUrl(rawUrl, webPort)
  const hostPort = process.env.HBAR_HOST_PORT ? parsePort(process.env.HBAR_HOST_PORT, 4317) : await findFreePort()
  if (webPort === hostPort) throw new Error('HBAR_WEB_PORT and HBAR_HOST_PORT must be different')
  const hostUrl = `http://127.0.0.1:${hostPort}`
  const home = resolve(process.env.HBAR_HOME ?? resolve(project, '.dev/desktop-live'))
  await requireUnusedHome(home)
  await mkdir(resolve(home, 'diagnostics'), { recursive: true })
  const log = openSync(resolve(home, 'diagnostics/host-dev.log'), 'a')
  const env = {
    ...process.env,
    HBAR_HOME: home,
    HBAR_WORKSPACE: process.env.HBAR_WORKSPACE ?? project,
    HBAR_DEMO: process.env.HBAR_DEMO ?? '1',
    HBAR_HOST_URL: hostUrl,
    HBAR_WEB_DEV_URL: webUrl,
    HBAR_WEB_PORT: String(webPort),
    HBAR_DESKTOP_DEV: '1',
    HBAR_DEV_INSTANCE_ID: crypto.randomUUID(),
    // Source workers must not pick up an installed app's bundled worker override.
    HBAR_STORAGE_WORKER: resolve(project, 'packages/storage/src/worker.ts'),
    WEBVIEW2_USER_DATA_FOLDER: process.env.WEBVIEW2_USER_DATA_FOLDER ?? resolve(home, 'cache/webview-dev'),
  }
  const children: Bun.Subprocess[] = []
  let stopping: Promise<void> | undefined
  const stop = () => (stopping ??= Promise.all(children.map(stopChild)).then(() => undefined))
  const requestStop = () => {
    stop().catch((error: unknown) => console.error('Could not stop desktop development:', error))
  }
  process.on('SIGINT', requestStop)
  process.on('SIGTERM', requestStop)
  try {
    const host = Bun.spawn(
      [
        process.execPath,
        '--watch',
        '--no-clear-screen',
        resolve(project, 'apps/host/src/main.ts'),
        '--supervisor',
        '--desktop',
        '--home',
        home,
        '--workspace',
        env.HBAR_WORKSPACE,
        '--port',
        String(hostPort),
        '--origin',
        webUrl,
        ...(env.HBAR_DEMO === '1' ? ['--demo'] : []),
      ],
      { cwd: project, env, stdio: ['ignore', log, log], windowsHide: true },
    )
    children.push(host)
    await ready(`${hostUrl}/healthz`, host, async (response) => {
      const parsed: unknown = JSON.parse(await readFile(resolve(home, 'settings/connection.json'), 'utf8'))
      const connection = connectionSchema.parse(parsed)
      if (connection.url !== hostUrl) return false
      const health: unknown = await response.json()
      return z.object({ instanceId: z.string() }).parse(health).instanceId === connection.instanceId
    })
    const web = Bun.spawn(
      [node, resolve(project, 'node_modules/vite/bin/vite.js'), '--config', 'apps/web/vite.config.ts'],
      {
        cwd: project,
        env,
        stdio: ['ignore', 'inherit', 'inherit'],
        windowsHide: true,
      },
    )
    children.push(web)
    await ready(`${webUrl}/__hbar_dev_ready`, web, async (response) => {
      const value: unknown = await response.json()
      return z.object({ instanceId: z.string() }).parse(value).instanceId === env.HBAR_DEV_INSTANCE_ID
    })
    console.log(`Desktop development: ${webUrl} | source Host: ${hostUrl}`)
    console.log(`Host source log: ${resolve(home, 'diagnostics/host-dev.log')}`)
    const desktop = Bun.spawn(
      [
        node,
        resolve(project, 'node_modules/@tauri-apps/cli/tauri.js'),
        'dev',
        '--config',
        JSON.stringify({ build: { devUrl: webUrl } }),
        ...args,
      ],
      { cwd: resolve(project, 'apps/desktop'), env, stdio: ['inherit', 'inherit', 'inherit'], windowsHide: true },
    )
    children.push(desktop)
    return await Promise.race(children.map((child) => child.exited))
  } finally {
    await stop()
    closeSync(log)
    process.off('SIGINT', requestStop)
    process.off('SIGTERM', requestStop)
  }
}
