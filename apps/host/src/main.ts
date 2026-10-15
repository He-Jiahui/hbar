import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { runtimeDomainError, type RuntimeArtifactPackage } from '@hbar/runtime'
import { getStorageLocations, resolvePathLayout, readStartupSettingsLayer } from '@hbar/storage'
import { resolveStartupWebConfiguration } from '@hbar/kernel/controller'
import { startServer } from './server.ts'
import { createHostSupervisor, RESTART_EXIT_CODE } from './supervisor.ts'
import { desktopConnection, desktopConnectionToken, resolveDesktopDevice } from './desktop-connection.ts'
import { ensureHostDataRootId } from './host-data-identity.ts'
import { FAILURE_EXIT_CODE, installHostShutdown, registerHostProcessHandlers } from './process-shutdown'
import { sendHostSupervisorMessage } from './supervisor-protocol'
import { acquireHostProcessLock } from './process-lock'
import { ProcessHostRuntime } from './process-host-runtime'
import { embeddedRuntimePackage, hostRuntimeProcessCommand, hostMaintenanceWorkerPath } from './runtime-package'
import { createHostRuntimeDiagnostics, hostLifecycleEvent } from './runtime-diagnostics'

export async function runHost(
  args: string[] = Bun.argv.slice(2),
  supervisorCommand: readonly [string, ...string[]] = [process.execPath, import.meta.path],
  runtimeCommand: readonly [string, ...string[]] = hostRuntimeProcessCommand(),
  loadArtifactPackage: () => Promise<RuntimeArtifactPackage | undefined> = () =>
    Promise.resolve(embeddedRuntimePackage()),
): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      home: { type: 'string' },
      role: { type: 'string' },
      'data-root': { type: 'string' },
      'cache-root': { type: 'string' },
      host: { type: 'string' },
      port: { type: 'string' },
      workspace: { type: 'string' },
      origin: { type: 'string', multiple: true },
      demo: { type: 'boolean' },
      desktop: { type: 'boolean' },
      service: { type: 'boolean' },
      cert: { type: 'string' },
      key: { type: 'string' },
      'web-root': { type: 'string' },
      profile: { type: 'string' },
      'no-local-exec': { type: 'boolean' },
      supervisor: { type: 'boolean' },
      supervised: { type: 'boolean' },
    },
  })
  if (values.role !== undefined && values.role !== 'conversation') throw new Error('Host role must be conversation')
  if (Boolean(values.cert) !== Boolean(values.key)) throw new Error('Configure both TLS certificate and key')
  if (values.port !== undefined && (!/^\d+$/.test(values.port) || Number(values.port) > 65535))
    throw new Error('Invalid --port: use an integer from 0 to 65535')
  const layout = await resolvePathLayout({
    preferPointer: values.desktop === true || values.service === true,
    home: values.home ?? process.env.HBAR_HOME,
    dataRoot: values['data-root'] ?? process.env.HBAR_DATA_ROOT,
    cacheRoot: values['cache-root'] ?? process.env.HBAR_CACHE_ROOT,
  })
  const home = layout.dataRoot
  if (values.supervisor || !values.supervised) {
    const releaseSupervisorLock = await acquireHostProcessLock(`${layout.hostLock}.supervisor`)
    const diagnostics = createHostRuntimeDiagnostics({ root: layout.diagnostics, fileName: 'hbar-supervisor-diagnostics.jsonl' })
    const supervisor = createHostSupervisor({
      command: supervisorCommand,
      hostArgs: args,
      connectionFile: async () => join((await getStorageLocations(layout)).saved.settingsRoot, 'connection.json'),
      diagnostics,
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
    try {
      exitCode = await supervisor.run()
    } finally {
      await releaseSupervisorLock()
      await diagnostics.close(2_000)
    }
    process.exit(exitCode)
  }
  await mkdir(home, { recursive: true })
  const lock = layout.hostLock
  const releaseLock = await acquireHostProcessLock(lock)
  let cleanup: (() => Promise<void>) | undefined
  let runtime: ProcessHostRuntime | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  const diagnostics = createHostRuntimeDiagnostics({ root: layout.diagnostics, fileName: 'hbar-host-diagnostics.jsonl' })
  diagnostics.installFatalObserver('startup')
  hostLifecycleEvent(diagnostics, 'host.starting', { level: 'info', outcome: 'success', workerState: 'starting', processId: process.pid })
  const requestShutdown = installHostShutdown(async () => {
    clearInterval(heartbeat)
    try {
      if (cleanup) await cleanup()
      else await runtime?.close()
    } finally {
      await releaseLock()
      hostLifecycleEvent(diagnostics, 'host.stopped', { processId: process.pid, outcome: 'success' })
      await diagnostics.close(2_000)
    }
  }, 5_000, diagnostics)
  registerHostProcessHandlers(requestShutdown, diagnostics)
  try {
    const workerPath = hostMaintenanceWorkerPath()
    const web = resolveStartupWebConfiguration(
      await readStartupSettingsLayer(layout.database, workerPath ? { workerPath } : {}),
    )
    const dataRootId = await ensureHostDataRootId(layout.settings)
    const artifactPackage = await loadArtifactPackage()
    runtime = await ProcessHostRuntime.open({
      layout,
      diagnostics: diagnostics.sink,
      diagnosticFullCoverage: diagnostics.snapshot().fullCoverage,
      processCommand: runtimeCommand,
      ...(artifactPackage ? { artifactPackage } : {}),
      ...(values.demo !== undefined ? { demo: values.demo } : {}),
      ...(values.workspace ? { workspace: values.workspace } : {}),
      ...(values.profile ? { profileModule: resolve(values.profile) } : {}),
      ...(values['no-local-exec'] === true ? { noLocalExec: true } : {}),
      ...(['1', 'prepare'].includes(process.env.HBAR_RUNTIME_WATCH ?? '') ? {
        watchSource: true, autoApplySource: process.env.HBAR_RUNTIME_WATCH !== 'prepare',
      } : {}),
    })
    const host = await startServer(runtime.kernel, {
      runtime,
      controller: runtime.controller,
      nodeLink: runtime.nodeLink,
      diagnosticSink: diagnostics.sink,
      diagnosticScope: diagnostics.scope,
      diagnosticFull: diagnostics.snapshot().fullCoverage,
      diagnosticSampleRate: diagnostics.snapshot().fullCoverage ? 1 : 0.1,
      dataRootId,
      hostname: values.host ?? (web.access === 'lan' ? '0.0.0.0' : '127.0.0.1'),
      port: values.port === undefined ? web.port : Number(values.port),
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
      await runtime?.close()
    }
    diagnostics.setInstanceId(runtime.instanceId)
    diagnostics.setFatalPhase('running')
    hostLifecycleEvent(diagnostics, 'host.listener_ready', { level: 'info', outcome: 'success', processId: process.pid })
    void runtime.ready().then(() => {
      hostLifecycleEvent(diagnostics, 'host.kernel_ready', { workerState: 'ready', processId: process.pid })
    }).catch(() => { /* Runtime status retains the bounded startup failure and its recovery schedule. */ })
    console.log(`hbar ${host.info().version} | ${home}`)
    for (const address of host.info().addresses) console.log(`  ${address}`)
    if (!values.desktop) console.log(`Pairing code: ${host.pairing.code} (expires in 5 minutes)`)
    if (host.server.port !== undefined) sendHostSupervisorMessage({ type: 'host.ready', port: host.server.port })
    heartbeat = setInterval(() => sendHostSupervisorMessage({ type: 'host.heartbeat' }), 2_000)
    heartbeat.unref()
    if (values.desktop || values.service) {
      await runtime.authenticationReady()
      let persistedToken: string | undefined
      try {
        persistedToken = desktopConnectionToken(JSON.parse(await readFile(layout.connectionFile, 'utf8')) as unknown)
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
        if (code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
      }
      const device = await resolveDesktopDevice(host.auth, persistedToken)
      await writeFile(
        layout.connectionFile,
        JSON.stringify(
          desktopConnection(
            `${values.cert ? 'https' : 'http'}://127.0.0.1:${host.server.port}`,
            device.token,
            runtime.instanceId,
            values.supervised ?? false,
          ),
        ),
        { mode: 0o600 },
      )
    }
  } catch (error) {
    const listenerCode = error && typeof error === 'object' && 'code' in error &&
      (error.code === 'EADDRINUSE' || error.code === 'EACCES') ? error.code : undefined
    console.error(
      `[hbar] Host startup failed (${runtimeDomainError(error)?.code ?? listenerCode ?? 'RUNTIME_START_FAILED'}); supervisor will retry the managed owner`,
    )
    requestShutdown(FAILURE_EXIT_CODE)
  }
}

if (import.meta.main) await runHost()
