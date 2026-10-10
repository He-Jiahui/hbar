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
  readonly dataRootId?: string
}

async function until<Value>(operation: () => Promise<Value>, timeoutMs = 20_000): Promise<Value> {
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

test('supervised Host accepts restart, preserves its address, and serves a new instance', async () => {
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
      '--supervisor',
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
    const first = await until(async () => JSON.parse(await readFile(connectionFile, 'utf8')) as ConnectionRecord)
    latestPid = first.pid
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
  } finally {
    firstClient?.disconnect()
    secondClient?.disconnect()
    supervisor.kill()
    await Promise.race([supervisor.exited, Bun.sleep(2_000)])
    if (latestPid) {
      try {
        process.kill(latestPid)
      } catch {
        // The supervisor normally terminates its active Host before this fallback.
      }
    }
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
