import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import type { KernelProfile } from '@hbar/kernel'
import { Kernel } from '@hbar/kernel'
import { getStorageLocations, resolvePathLayout } from '@hbar/storage'
import { startServer } from './server.ts'
import { createHostSupervisor, RESTART_EXIT_CODE, STORAGE_FAILURE_RESTART_EXIT_CODE } from './supervisor.ts'
import { desktopConnection } from './desktop-connection.ts'
import { ensureHostDataRootId } from './host-data-identity.ts'
import { createHostRuntimeDiagnostics, hostLifecycleEvent } from './runtime-diagnostics.ts'

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
    preferPointer: values.desktop === true && (values.supervised === true || values.supervisor === true),
    home: values.home ?? process.env.HBAR_HOME,
    dataRoot: values['data-root'] ?? process.env.HBAR_DATA_ROOT,
    cacheRoot: values['cache-root'] ?? process.env.HBAR_CACHE_ROOT,
  })
  const home = layout.dataRoot
  if (values.supervisor) {
    const diagnostics = createHostRuntimeDiagnostics({
      root: layout.diagnostics,
      fileName: 'hbar-supervisor-diagnostics.jsonl',
    })
    const supervisor = createHostSupervisor({
      command: supervisorCommand,
      hostArgs: args,
      connectionFile: async () => join((await getStorageLocations(layout)).saved.settingsRoot, 'connection.json'),
      diagnostics,
      onExit: (event) =>
        console.error(`[hbar supervisor] child exit code=${event.code} expected=${event.expectedRestart}`),
    })
    const stopSupervisor = (signal: NodeJS.Signals) => {
      hostLifecycleEvent(diagnostics, 'supervisor.stop_requested', { level: 'info', outcome: 'success', signal })
      supervisor.stop()
    }
    process.on('SIGINT', () => stopSupervisor('SIGINT'))
    process.on('SIGTERM', () => stopSupervisor('SIGTERM'))
    hostLifecycleEvent(diagnostics, 'supervisor.starting', {
      level: 'info',
      outcome: 'success',
      processId: process.pid,
    })
    try {
      const exitCode = await supervisor.run()
      hostLifecycleEvent(diagnostics, 'supervisor.stopped', { level: 'info', outcome: 'success' })
      process.exitCode = exitCode
      return
    } catch {
      hostLifecycleEvent(diagnostics, 'supervisor.failed', {
        level: 'error',
        outcome: 'failure',
        errorCode: 'SUPERVISOR_FAILED',
      })
      throw new Error('Host supervisor failed')
    } finally {
      await diagnostics.close(2_000)
    }
  }
  await mkdir(home, { recursive: true })
  const lock = layout.hostLock
  await mkdir(resolve(lock, '..'), { recursive: true })
  try {
    await writeFile(lock, JSON.stringify({ pid: process.pid }), { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const previous = JSON.parse(await readFile(lock, 'utf8')) as { pid: number }
    let alive = true
    try {
      process.kill(previous.pid, 0)
    } catch (check) {
      if ((check as NodeJS.ErrnoException).code === 'ESRCH') alive = false
      else throw check
    }
    if (alive) throw new Error(`A host already owns this data directory (PID ${previous.pid})`, { cause: error })
    await rm(lock)
    await writeFile(lock, JSON.stringify({ pid: process.pid }), { flag: 'wx', mode: 0o600 })
  }
  let cleanup: (() => Promise<void>) | undefined
  let kernel: Kernel | undefined
  let requestShutdown: ((exitCode: number) => void) | undefined
  let removeStorageFatalListener: (() => void) | undefined
  let boundedFatalShutdown = false
  const diagnostics = createHostRuntimeDiagnostics({
    root: layout.diagnostics,
    fileName: 'hbar-host-diagnostics.jsonl',
  })
  diagnostics.installFatalObserver('startup')
  hostLifecycleEvent(diagnostics, 'host.starting', {
    level: 'info',
    outcome: 'success',
    workerState: 'starting',
    processId: process.pid,
  })
  try {
    const dataRootId = await ensureHostDataRootId(layout.settings)
    const profile = values.profile
      ? ((await import(pathToFileURL(resolve(values.profile)).href)) as { default: KernelProfile }).default
      : undefined
    diagnostics.setFatalPhase('kernel')
    kernel = await Kernel.create({
      layout,
      diagnostics: diagnostics.sink,
      diagnosticScope: diagnostics.scope,
      diagnosticFullCoverage: diagnostics.snapshot().fullCoverage,
      ...(values.demo !== undefined ? { demo: values.demo } : {}),
      ...(values.workspace ? { workspace: values.workspace } : {}),
      ...(profile ? { profile } : {}),
    })
    diagnostics.setInstanceId(kernel.instanceId)
    hostLifecycleEvent(diagnostics, 'host.kernel_ready', {
      level: 'info',
      outcome: 'success',
      workerState: 'ready',
      processId: process.pid,
    })
    diagnostics.setFatalPhase('server')
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
        if (!values.supervised || !requestShutdown) return false
        setTimeout(() => requestShutdown?.(RESTART_EXIT_CODE), 100)
        return true
      },
      diagnosticSink: diagnostics.sink,
      diagnosticScope: diagnostics.scope,
      diagnosticFull: diagnostics.snapshot().fullCoverage,
      diagnosticSampleRate: diagnostics.snapshot().fullCoverage ? 1 : 0.1,
    })
    diagnostics.setFatalPhase('running')
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
    if (process.stdout.isTTY) console.log(`Pairing code: ${host.pairing.code} (expires in 5 minutes)`)
    cleanup = async () => {
      let failure: unknown
      try {
        await host.close()
      } catch (error) {
        failure ??= error
      }
      try {
        await kernel?.close()
      } catch (error) {
        failure ??= error
      }
      hostLifecycleEvent(diagnostics, failure === undefined ? 'host.stopped' : 'host.stop_failed', {
        level: failure === undefined ? 'info' : 'error',
        outcome: failure === undefined ? 'success' : 'failure',
        ...(failure === undefined ? {} : { errorCode: 'HOST_SHUTDOWN_FAILED' }),
        workerState: failure === undefined ? 'closed' : 'failed',
        processId: process.pid,
      })
      if (!boundedFatalShutdown) diagnostics.closeFatalObserver()
      try {
        await diagnostics.close(2_000)
      } catch (error) {
        failure ??= error
      }
      try {
        await rm(lock, { force: true })
      } catch (error) {
        failure ??= error
      }
      if (failure !== undefined) throw failure
    }
    let closing = false
    const stop = async (exitCode = 0, bounded = false) => {
      if (closing) return
      closing = true
      boundedFatalShutdown = bounded
      diagnostics.setFatalPhase('closing')
      hostLifecycleEvent(diagnostics, 'host.stop_requested', {
        level: 'info',
        outcome: 'success',
        exitCode,
        processId: process.pid,
        workerState: 'closing',
      })
      const task = cleanup?.()
      if (!bounded) {
        await task
        removeStorageFatalListener?.()
        diagnostics.closeFatalObserver()
        process.exit(exitCode)
      }
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const boundedCleanup = task?.catch(() => undefined)
        const deadline = new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 2_000)
        })
        await Promise.race([boundedCleanup ?? Promise.resolve(), deadline])
      } catch {
        // A dead Storage worker can reject normal cleanup; the supervised exit remains authoritative.
        console.error('[hbar] bounded storage recovery shutdown did not complete')
      } finally {
        if (timer !== undefined) clearTimeout(timer)
        try {
          await rm(lock, { force: true })
        } catch {
          console.error('[hbar] bounded storage recovery could not remove the Host lock')
        } finally {
          removeStorageFatalListener?.()
          process.exit(exitCode)
        }
      }
    }
    requestShutdown = (exitCode) => {
      void stop(exitCode).catch(() => {
        hostLifecycleEvent(diagnostics, 'host.shutdown_failed', {
          level: 'error',
          outcome: 'failure',
          errorCode: 'HOST_SHUTDOWN_FAILED',
        })
        process.exitCode = exitCode
      })
    }
    if (values.supervised) {
      removeStorageFatalListener = kernel.storage.onFatal?.((event) => {
        hostLifecycleEvent(diagnostics, 'storage.fatal', {
          level: 'fatal',
          outcome: 'failure',
          errorCode: event.code,
          ...(event.method === undefined ? {} : { method: event.method }),
          workerState: 'failed',
        })
        void stop(STORAGE_FAILURE_RESTART_EXIT_CODE, true).catch(() => {
          hostLifecycleEvent(diagnostics, 'host.shutdown_failed', {
            level: 'fatal',
            outcome: 'failure',
            errorCode: 'HOST_FATAL_SHUTDOWN_FAILED',
          })
          process.exitCode = STORAGE_FAILURE_RESTART_EXIT_CODE
        })
      })
    }
    process.on('SIGINT', () => {
      hostLifecycleEvent(diagnostics, 'host.signal_received', {
        level: 'info',
        signal: 'SIGINT',
        processId: process.pid,
      })
      void stop().catch(() => {
        hostLifecycleEvent(diagnostics, 'host.shutdown_failed', {
          level: 'error',
          outcome: 'failure',
          errorCode: 'HOST_SHUTDOWN_FAILED',
        })
      })
    })
    process.on('SIGTERM', () => {
      hostLifecycleEvent(diagnostics, 'host.signal_received', {
        level: 'info',
        signal: 'SIGTERM',
        processId: process.pid,
      })
      void stop().catch(() => {
        hostLifecycleEvent(diagnostics, 'host.shutdown_failed', {
          level: 'error',
          outcome: 'failure',
          errorCode: 'HOST_SHUTDOWN_FAILED',
        })
      })
    })
  } catch (error) {
    hostLifecycleEvent(diagnostics, 'host.startup_failed', {
      level: 'error',
      outcome: 'failure',
      errorCode: 'HOST_STARTUP_FAILED',
      workerState: 'failed',
    })
    diagnostics.setFatalPhase('closing')
    diagnostics.closeFatalObserver()
    if (kernel) await kernel.close().catch(() => undefined)
    await diagnostics.close(2_000).catch(() => undefined)
    await rm(lock, { force: true }).catch(() => undefined)
    throw error
  }
}

if (import.meta.main) await runHost()
