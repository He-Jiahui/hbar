import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createSystemCommandClient, HbarClient } from '@hbar/client'

interface ConnectionRecord {
  readonly url: string
  readonly token: string
  readonly pid: number
  readonly instanceId: string
  readonly supervisorPid?: number
  readonly dataRootId?: string
}

async function until<Value>(operation: () => Promise<Value>, timeoutMs = 120_000): Promise<Value> {
  const started = Date.now()
  for (;;) {
    try {
      return await operation()
    } catch (error) {
      if (Date.now() - started >= timeoutMs) throw error
      await Bun.sleep(50)
    }
  }
}

test('supervised Host accepts restart and recovers an abrupt crash at its preserved address', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-host-restart-'))
  const dataRoot = join(root, 'data')
  const cacheRoot = join(root, 'cache')
  const workspace = join(root, 'workspace')
  await mkdir(workspace, { recursive: true })
  const connectionFile = join(dataRoot, 'settings', 'connection.json')
  const supervisor = Bun.spawn(
    [
      process.execPath,
      resolve('apps/host/src/main.ts'),
      '--desktop',
      '--port',
      '0',
      '--data-root',
      dataRoot,
      '--cache-root',
      cacheRoot,
      '--workspace',
      workspace,
      '--demo',
    ],
    { stdin: 'ignore', stdout: 'ignore', stderr: 'pipe', windowsHide: true },
  )
  let firstClient: HbarClient | undefined
  let secondClient: HbarClient | undefined
  let latestPid: number | undefined
  try {
    const first = await until(async () => {
      const connection = JSON.parse(await readFile(connectionFile, 'utf8')) as ConnectionRecord
      if (!(await fetch(`${connection.url}/healthz`)).ok) throw new Error('Host is not ready')
      return connection
    })
    latestPid = first.pid
    expect(first.supervisorPid).toBe(supervisor.pid)
    const duplicate = Bun.spawn([
      process.execPath, resolve('apps/host/src/main.ts'), '--supervisor', '--data-root', dataRoot, '--cache-root', cacheRoot,
    ], { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore', windowsHide: true, timeout: 5_000, killSignal: 'SIGKILL' })
    expect(await duplicate.exited).toBe(1)
    expect(supervisor.exitCode).toBeNull()
    firstClient = new HbarClient(first.url, first.token)
    const initialHost = await firstClient.connect()
    expect(initialHost.instanceId).toBe(first.instanceId)
    expect(initialHost.dataRootId).toBeString()
    expect(await createSystemCommandClient(firstClient).execute('system.restart', {})).toEqual({
      accepted: true,
      restartRequired: false,
    })
    firstClient.disconnect()

    const second = await until(async () => {
      const value = JSON.parse(await readFile(connectionFile, 'utf8')) as ConnectionRecord
      if (value.pid === first.pid) throw new Error('Host has not restarted')
      const health = await fetch(`${value.url}/healthz`)
      if (!health.ok) throw new Error('Restarted Host is not ready')
      return value
    })
    latestPid = second.pid
    expect(second.url).toBe(first.url)
    expect(second.instanceId).not.toBe(first.instanceId)
    secondClient = new HbarClient(second.url, first.token)
    const restartedHost = await secondClient.connect()
    expect(restartedHost.instanceId).toBe(second.instanceId)
    expect(restartedHost.dataRootId).toBe(initialHost.dataRootId)
    process.kill(second.pid, 'SIGKILL')
    const recovered = await until(async () => {
      const value = JSON.parse(await readFile(connectionFile, 'utf8')) as ConnectionRecord
      if (value.pid === second.pid) throw new Error('Crashed Host has not recovered')
      if (!(await fetch(`${value.url}/healthz`)).ok) throw new Error('Recovered Host is not ready')
      return value
    })
    latestPid = recovered.pid
    expect(recovered.url).toBe(first.url)
    await until(async () => {
      if (secondClient?.connectionHost()?.instanceId !== recovered.instanceId)
        throw new Error('The SDK has not reconnected to the recovered Host')
    })
    expect(supervisor.exitCode).toBeNull()
  } finally {
    firstClient?.disconnect()
    secondClient?.disconnect()
    supervisor.kill()
    await Promise.race([supervisor.exited, Bun.sleep(6_000)])
    if (latestPid) {
      try {
        process.kill(latestPid)
      } catch {
        // The supervisor normally terminates its active Host before this fallback.
      }
    }
    if (latestPid) await until(async () => {
      try { process.kill(latestPid!, 0) } catch { return }
      throw new Error('Owned Host has not exited')
    }, 5_000)
    await rm(root, { recursive: true, force: true, maxRetries: 40, retryDelay: 250 })
  }
}, 420_000)
