import { resolve } from 'node:path'
import { findFreePort, parsePort } from './dev-ports.ts'

const mode = Bun.argv[2] === 'build' ? 'build' : 'dev'

for (const command of [
  ['bun', 'run', 'build'],
  ['bun', 'scripts/build-host.ts'],
]) {
  const child = Bun.spawn(command, { stdio: ['inherit', 'inherit', 'inherit'] })
  if ((await child.exited) !== 0) process.exit(child.exitCode ?? 1)
}

const configuredWebDevUrl = process.env.HBAR_WEB_DEV_URL
const configuredWebPort = process.env.HBAR_WEB_PORT
function portFromWebUrl(raw: string): number {
  const url = new URL(raw)
  if (!url.port) throw new Error('HBAR_WEB_DEV_URL must include an explicit port')
  return parsePort(url.port, 5173)
}
const configuredUrlPort = configuredWebDevUrl ? portFromWebUrl(configuredWebDevUrl) : undefined
const webPort = configuredWebPort
  ? parsePort(configuredWebPort, 5173)
  : configuredUrlPort ?? (await findFreePort())
if (configuredUrlPort !== undefined && configuredWebPort !== undefined && webPort !== configuredUrlPort)
  throw new Error(`HBAR_WEB_PORT (${webPort}) does not match HBAR_WEB_DEV_URL (${configuredUrlPort})`)
const webDevUrl = configuredWebDevUrl ?? `http://127.0.0.1:${webPort}`
let web: Bun.Subprocess | undefined
if (mode === 'dev') {
  web = Bun.spawn([process.execPath, 'node_modules/vite/bin/vite.js', '--config', 'apps/web/vite.config.ts'], {
    env: {
      ...process.env,
      HBAR_WEB_DEV_URL: webDevUrl,
      HBAR_WEB_PORT: String(webPort),
    },
    stdio: ['inherit', 'inherit', 'inherit'],
    windowsHide: true,
  })
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(webDevUrl)
      if (response.ok) break
    } catch {
      // Vite is still starting.
    }
    if (web.exitCode !== null) {
      throw new Error(`Vite exited before becoming ready (code ${web.exitCode})`)
    }
    await Bun.sleep(100)
  }
  if (Date.now() >= deadline) {
    web.kill()
    throw new Error(`Timed out waiting for Vite at ${webDevUrl}`)
  }
}

const child = Bun.spawn(
  ['bunx', '--no-install', 'tauri', mode, ...(mode === 'build' ? [] : ['--no-watch']), ...Bun.argv.slice(3)],
  {
    cwd: resolve('apps/desktop'),
    stdio: ['inherit', 'inherit', 'inherit'],
    env: {
      ...process.env,
      ...(mode === 'dev'
        ? {
            HBAR_HOME: process.env.HBAR_HOME ?? resolve('.dev/desktop'),
            HBAR_WORKSPACE: process.cwd(),
            HBAR_DEMO: process.env.HBAR_DEMO ?? '1',
            HBAR_WEB_DEV_URL: webDevUrl,
            HBAR_WEB_PORT: String(webPort),
          }
        : {}),
    },
  },
)
function terminateProcessTree(subprocess: Bun.Subprocess | undefined): void {
  if (!subprocess) return
  if (process.platform === 'win32') {
    const killer = Bun.spawn(['taskkill', '/PID', String(subprocess.pid), '/T', '/F'], {
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
    })
    void killer.exited
    return
  }
  subprocess.kill()
}

const stop = () => {
  child.kill()
  terminateProcessTree(web)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
const exitCode = await Promise.race([child.exited, ...(web ? [web.exited.then((code) => code ?? 1)] : [])])
stop()
process.exit(exitCode)
