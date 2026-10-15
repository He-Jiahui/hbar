import { spawn } from 'node:child_process'
import { createSystemCommandClient } from '@hbar/client'
import { resolvePathLayout } from '@hbar/storage'
import type { CliArgs } from './args'
import { hostProcessCommand } from './host-process'
import { hasLiveHostOwner } from './host-owner'
import { openCatalogClient } from './runtime'
import { conversationHostArguments } from './service-entry'

function connectionMissing(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error.code === 'NO_SAVED_CONNECTION' || error.code === 'HEALTH_UNAVAILABLE')
  )
}

async function attachService(layout: Awaited<ReturnType<typeof resolvePathLayout>>): Promise<boolean> {
  let attached: Awaited<ReturnType<typeof openCatalogClient>>
  try {
    attached = await openCatalogClient({
      layout,
      connectOnly: true,
      requireReady: false,
    })
  } catch (error) {
    if (connectionMissing(error)) return false
    // Identity, authentication and malformed responses must not create another Host.
    throw error
  }
  try {
    const info = attached.client.connectionHost()
    if (!info) throw new Error('Host connection disappeared before service attachment')
    console.log(`hbar ${info.version} | ${layout.dataRoot} | existing Host`)
    for (const address of info.addresses) console.log(`  ${address}`)
    console.log('Using the existing listener and configuration. Startup overrides apply after the backend restarts.')
    // Explicit service entry grants one pairing operation. Never retry an unknown write outcome.
    const pairing = await createSystemCommandClient(attached.client).execute('pairing.create', {
      role: 'operator',
      workspaceIds: null,
    })
    console.log(`Pairing code: ${pairing.code} (expires ${new Date(pairing.expiresAt).toISOString()})`)
    return true
  } finally {
    attached.client.disconnect()
  }
}

/** Foreground service owner, or a bounded attachment to the already running service. */
export async function serve(args: CliArgs): Promise<number> {
  const hostArgs = conversationHostArguments(args)
  const layout = await resolvePathLayout({
    preferPointer: true,
    home: args.home ?? process.env.HBAR_HOME,
    dataRoot: args.dataRoot ?? process.env.HBAR_DATA_ROOT,
    cacheRoot: args.cacheRoot ?? process.env.HBAR_CACHE_ROOT,
  })
  if (await attachService(layout)) return 0
  if (await hasLiveHostOwner(layout.hostLock)) {
    const deadline = Date.now() + 120_000
    do {
      await Bun.sleep(100)
      if (await attachService(layout)) return 0
    } while (Date.now() < deadline)
    throw new Error('The managed Host is recovering; inspect its diagnostics before starting another owner')
  }
  const command = hostProcessCommand(hostArgs)
  const child = spawn(command[0], command.slice(1), { stdio: 'inherit', windowsHide: true })
  return new Promise<number>((resolveExit, reject) => {
    let stopping = false
    const stop = () => {
      if (stopping || child.exitCode !== null || !child.pid) return
      stopping = true
      if (process.platform !== 'win32') {
        child.kill('SIGTERM')
        return
      }
      // Windows signal emulation kills only one PID. Stop this owned Supervisor tree.
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      const timeout = setTimeout(() => killer.kill(), 10_000)
      killer.once('exit', (code) => {
        clearTimeout(timeout)
        if (code !== 0 && child.exitCode === null) {
          stopping = false
          console.error('Unable to confirm the owned Host process tree stopped')
        }
      })
      killer.once('error', () => {
        clearTimeout(timeout)
        stopping = false
        console.error('Unable to stop the owned Host process tree')
      })
    }
    const release = () => {
      process.off('SIGINT', stop)
      process.off('SIGTERM', stop)
    }
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
    child.once('error', (error) => {
      release()
      reject(error)
    })
    child.once('exit', (code) => {
      release()
      resolveExit(code ?? 7)
    })
  })
}
