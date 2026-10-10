import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { findFreePort, parsePort } from './dev-ports.ts'

const hostPort = process.env.HBAR_HOST_PORT ? parsePort(process.env.HBAR_HOST_PORT, 4317) : await findFreePort()
let webPort = process.env.HBAR_WEB_PORT ? parsePort(process.env.HBAR_WEB_PORT, 5173) : await findFreePort()
while (webPort === hostPort) webPort = await findFreePort()
const webUrl = `http://127.0.0.1:${webPort}`
const localhostWebUrl = `http://localhost:${webPort}`
const hostUrl = `http://127.0.0.1:${hostPort}`
const configuredHome = process.env.HBAR_HOME
const temporaryHome = configuredHome ? undefined : resolve('.dev', `host-${Date.now()}-${process.pid}`)
const home = configuredHome ?? temporaryHome
if (!home) throw new Error('Unable to resolve the Host data directory')
if (temporaryHome) await mkdir(temporaryHome, { recursive: true })
const host = Bun.spawn(
  [
    process.execPath,
    'apps/host/src/main.ts',
    '--supervisor',
    '--home',
    home,
    '--workspace',
    process.cwd(),
    '--port',
    String(hostPort),
    '--origin',
    webUrl,
    '--origin',
    localhostWebUrl,
    ...(Bun.argv.includes('--demo') ? ['--demo'] : []),
  ],
  { env: { ...process.env, HBAR_RUNTIME_WATCH: '1' }, stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true },
)
const web = Bun.spawn([process.execPath, 'node_modules/vite/bin/vite.js', '--config', 'apps/web/vite.config.ts'], {
  env: {
    ...process.env,
    HBAR_HOST_URL: hostUrl,
    HBAR_WEB_PORT: String(webPort),
  },
  stdio: ['ignore', 'inherit', 'inherit'],
  windowsHide: true,
})
let stopped = false
const stop = async () => {
  if (stopped) return
  stopped = true
  host.kill()
  web.kill()
  await Promise.allSettled([host.exited, web.exited])
  if (temporaryHome) await rm(temporaryHome, { recursive: true, force: true })
}
process.on('SIGINT', () => {
  void stop()
})
process.on('SIGTERM', () => {
  void stop()
})
const exitCode = await Promise.race([host.exited, web.exited])
await stop()
process.exit(exitCode ?? 1)
