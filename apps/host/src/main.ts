import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import type { KernelProfile } from '@hbar/kernel'
import { Kernel } from '@hbar/kernel'
import { getStorageLocations, resolvePathLayout } from '@hbar/storage'
import { startServer } from './server.ts'
import { createHostSupervisor, RESTART_EXIT_CODE } from './supervisor.ts'
import { desktopConnection } from './desktop-connection.ts'
import { ensureHostDataRootId } from './host-data-identity.ts'
import { FAILURE_EXIT_CODE, installHostShutdown, registerHostProcessHandlers } from './process-shutdown'
import { sendHostSupervisorMessage } from './supervisor-protocol'
import { acquireHostProcessLock } from './process-lock'

export async function runHost(
  args: string[] = Bun.argv.slice(2),
  supervisorCommand: readonly [string, ...string[]] = [process.execPath, import.meta.path],
): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      home: { type: 'string' },
      'data-root': { type: 'string' },
      'cache-root': { type: 'string' },
      host: { type: 'string' },
      port: { type: 'string' },
      workspace: { type: 'string' },
      origin: { type: 'string', multiple: true },
      demo: { type: 'boolean' },
      desktop: { type: 'boolean' },
      cert: { type: 'string' },
      key: { type: 'string' },
      'web-root': { type: 'string' },
      profile: { type: 'string' },
      supervisor: { type: 'boolean' },
      supervised: { type: 'boolean' },
    },
  })
  const layout = await resolvePathLayout({
    preferPointer: values.desktop === true,
    home: values.home ?? process.env.HBAR_HOME,
    dataRoot: values['data-root'] ?? process.env.HBAR_DATA_ROOT,
    cacheRoot: values['cache-root'] ?? process.env.HBAR_CACHE_ROOT,
  })
  const home = layout.dataRoot
  if (values.supervisor || !values.supervised) {
    const releaseSupervisorLock = await acquireHostProcessLock(`${layout.hostLock}.supervisor`)
    const supervisor = createHostSupervisor({
      command: supervisorCommand,
      hostArgs: args,
      connectionFile: async () => join((await getStorageLocations(layout)).saved.settingsRoot, 'connection.json'),
      onExit: (event) => console.error(`[hbar supervisor] child exit ${JSON.stringify(event)}`),
    })
    const stopSupervisor = () => {
      void supervisor.stop().catch(() => {
        console.error('[hbar supervisor] shutdown could not confirm process exit')
        process.exit(FAILURE_EXIT_CODE)
      })
    }
    process.on('SIGINT', stopSupervisor)
    process.on('SIGTERM', stopSupervisor)
    let exitCode: number
    try { exitCode = await supervisor.run() } finally { await releaseSupervisorLock() }
    process.exit(exitCode)
  }
  await mkdir(home, { recursive: true })
  const lock = layout.hostLock
  const releaseLock = await acquireHostProcessLock(lock)
  let cleanup: (() => Promise<void>) | undefined
  let kernel: Kernel | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  const requestShutdown = installHostShutdown(async () => {
    clearInterval(heartbeat)
    try {
      if (cleanup) await cleanup()
      else await kernel?.close()
    } finally {
      await releaseLock()
    }
  })
  registerHostProcessHandlers(requestShutdown)
  try {
    const dataRootId = await ensureHostDataRootId(layout.settings)
    const profile = values.profile
      ? ((await import(pathToFileURL(resolve(values.profile)).href)) as { default: KernelProfile }).default
      : undefined
    kernel = await Kernel.create({
      layout,
      onFatal: () => requestShutdown(FAILURE_EXIT_CODE),
      ...(values.demo !== undefined ? { demo: values.demo } : {}),
      ...(values.workspace ? { workspace: values.workspace } : {}),
      ...(profile ? { profile } : {}),
    })
    const host = await startServer(kernel, {
      dataRootId,
      ...(values.host ? { hostname: values.host } : {}),
      ...(values.port ? { port: Number(values.port) } : {}),
      ...(values.desktop ? { desktop: true } : {}),
      ...(values.origin ? { origins: values.origin } : {}),
      ...(values.cert ? { cert: values.cert } : {}),
      ...(values.key ? { key: values.key } : {}),
      ...((values['web-root'] ?? process.env.HBAR_WEB_ROOT)
        ? { staticRoot: values['web-root'] ?? process.env.HBAR_WEB_ROOT! }
        : {}),
      restart() {
        if (!values.supervised) return false
        setTimeout(() => requestShutdown(RESTART_EXIT_CODE), 100)
        return true
      },
    })
    cleanup = async () => {
      await host.close()
      await kernel?.close()
    }
    if (values.desktop) {
      const device = await host.auth.createDevice('hbar desktop')
      await writeFile(
        layout.connectionFile,
        JSON.stringify(
          desktopConnection(
            `${values.cert ? 'https' : 'http'}://127.0.0.1:${host.server.port}`,
            device.token,
            kernel.instanceId,
            values.supervised ?? false,
          ),
        ),
        { mode: 0o600 },
      )
    }
    console.log(`hbar ${host.info().version} | ${home}`)
    for (const address of host.info().addresses) console.log(`  ${address}`)
    console.log(`Pairing code: ${host.pairing.code} (expires in 5 minutes)`)
    if (host.server.port !== undefined) sendHostSupervisorMessage({ type: 'host.ready', port: host.server.port })
    heartbeat = setInterval(() => sendHostSupervisorMessage({ type: 'host.heartbeat' }), 2_000)
    heartbeat.unref()
  } catch {
    console.error('[hbar] Host startup failed; supervisor will retry the managed owner')
    requestShutdown(FAILURE_EXIT_CODE)
  }
}

if (import.meta.main) await runHost()
