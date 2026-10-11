import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { HbarClient, createRunCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server.ts'
import { connectionSchema, restoreDesktopRollbackIdentity } from '../scripts/desktop-host-rollback-identity.ts'

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

test('rollback identity restores only a valid original actor after public receipt and Host checks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-host-rollback-identity-'))
  const dataRoot = join(root, 'data')
  const settingsRoot = join(dataRoot, 'settings')
  const backupRoot = join(root, 'rollback-backup')
  const connectionPath = join(settingsRoot, 'connection.json')
  const backupConnectionPath = join(backupRoot, 'connection.json')
  const dataRootId = crypto.randomUUID()
  const kernel = await Kernel.create({ home: dataRoot, workspace: root, demo: true, secrets: new MemorySecrets() })
  const host = await startServer(kernel, { port: 0, dataRootId })
  const originalDevice = await host.auth.createDevice('original desktop actor')
  const replacementDevice = await host.auth.createDevice('replacement desktop actor')
  const url = `http://127.0.0.1:${host.server.port}`
  const originalClient = new HbarClient(url, originalDevice.token)
  const replacementClient = new HbarClient(url, replacementDevice.token)
  try {
    await mkdir(backupRoot, { recursive: true })
    const originalHost = await originalClient.connect()
    const replacementHost = await replacementClient.connect()
    expect(originalHost.instanceId).toBe(replacementHost.instanceId)
    expect(originalHost.dataRootId).toBe(dataRootId)

    const workspace = (await kernel.storage.call('workspaces'))[0]
    if (!workspace) throw new Error('fixture workspace missing')
    const session = await kernel.createSession(workspace.id, 'rollback identity receipt')
    const runKey = 'rollback-identity-original-run'
    const accepted = await createRunCommandClient(originalClient).execute(
      'run.submit',
      { sessionId: session.id, modelId: 'local-fixture', input: { text: 'identity probe', images: [] } },
      { requestId: runKey, idempotencyKey: runKey },
    )
    await kernel.waitForIdle()
    const originalReceipt = await originalClient.call('command.getReceipt', {
      commandId: 'run.submit',
      sessionId: session.id,
      idempotencyKey: runKey,
    })
    expect(originalReceipt).toMatchObject({ status: 'accepted', operationId: accepted.operationId })
    expect(
      await replacementClient.call('command.getReceipt', {
        commandId: 'run.submit',
        sessionId: session.id,
        idempotencyKey: runKey,
      }),
    ).toBeNull()

    const current = {
      url,
      token: replacementDevice.token,
      instanceId: replacementHost.instanceId,
      pid: process.pid,
      supervisorPid: process.ppid,
    }
    const prior = { ...current, token: originalDevice.token }
    await writeFile(connectionPath, `${JSON.stringify(current)}\n`)
    await writeFile(backupConnectionPath, `${JSON.stringify(prior)}\n`)
    const currentBytes = await readFile(connectionPath)
    const expectedConnection = { url, instanceId: current.instanceId, pid: current.pid }
    const receipt = { sessionId: session.id, idempotencyKey: runKey, operationId: accepted.operationId }

    const restored = await restoreDesktopRollbackIdentity({
      dataRoot,
      rollbackBackupRoot: backupRoot,
      backupConnectionPath,
      expectedConnectionSha256: sha256(currentBytes),
      expectedConnection,
      expectedDataRootId: dataRootId,
      receipt,
      attemptId: 'rollback-success-20261011',
    })
    expect(restored).toEqual({
      changed: true,
      url,
      instanceId: current.instanceId,
      pid: current.pid,
      previousTokenAccepted: true,
      receiptReadable: true,
    })
    expect(JSON.stringify(restored)).not.toContain(originalDevice.token)
    expect(JSON.stringify(restored)).not.toContain(replacementDevice.token)
    const afterSuccess = connectionSchema.parse(JSON.parse(await readFile(connectionPath, 'utf8')) as unknown)
    expect(afterSuccess).toEqual({ ...current, token: originalDevice.token })
    const restoredClient = new HbarClient(url, afterSuccess.token)
    try {
      expect(await restoredClient.connect()).toMatchObject({ instanceId: current.instanceId, dataRootId })
      expect(
        await restoredClient.call('command.getReceipt', {
          commandId: 'run.submit',
          sessionId: session.id,
          idempotencyKey: runKey,
        }),
      ).toEqual(originalReceipt)
    } finally {
      restoredClient.disconnect()
    }

    const rejectWithoutWrite = async (backupToken: string, expectedRootId: string, expectedHash?: string) => {
      await writeFile(connectionPath, `${JSON.stringify(current)}\n`)
      await writeFile(backupConnectionPath, `${JSON.stringify({ ...prior, token: backupToken })}\n`)
      const before = await readFile(connectionPath)
      await expect(
        restoreDesktopRollbackIdentity({
          dataRoot,
          rollbackBackupRoot: backupRoot,
          backupConnectionPath,
          expectedConnectionSha256: expectedHash ?? sha256(before),
          expectedConnection,
          expectedDataRootId: expectedRootId,
          receipt,
          attemptId: `rollback-fail-${crypto.randomUUID()}`,
        }),
      ).rejects.toThrow()
      expect(await readFile(connectionPath)).toEqual(before)
    }

    await rejectWithoutWrite('invalid-revoked-credential', dataRootId)
    await rejectWithoutWrite(originalDevice.token, crypto.randomUUID())
    await rejectWithoutWrite(originalDevice.token, dataRootId, '0'.repeat(64))

    await writeFile(connectionPath, `${JSON.stringify(current)}\n`)
    await writeFile(backupConnectionPath, `${JSON.stringify(prior)}\n`)
    const collisionPath = join(settingsRoot, '.connection.rollback-preexisting.tmp')
    const collisionBytes = Buffer.from('pre-existing-owned-file')
    await writeFile(collisionPath, collisionBytes, { flag: 'wx' })
    const beforeCollision = await readFile(connectionPath)
    await expect(
      restoreDesktopRollbackIdentity({
        dataRoot,
        rollbackBackupRoot: backupRoot,
        backupConnectionPath,
        expectedConnectionSha256: sha256(beforeCollision),
        expectedConnection,
        expectedDataRootId: dataRootId,
        receipt,
        attemptId: 'rollback-preexisting',
      }),
    ).rejects.toThrow()
    expect(await readFile(connectionPath)).toEqual(beforeCollision)
    expect(await readFile(collisionPath)).toEqual(collisionBytes)
    await rm(collisionPath)

    await writeFile(connectionPath, `${JSON.stringify(current)}\n`)
    await writeFile(backupConnectionPath, 'x'.repeat(16 * 1024 + 1))
    const beforeOversizedBackup = await readFile(connectionPath)
    await expect(
      restoreDesktopRollbackIdentity({
        dataRoot,
        rollbackBackupRoot: backupRoot,
        backupConnectionPath,
        expectedConnectionSha256: sha256(beforeOversizedBackup),
        expectedConnection,
        expectedDataRootId: dataRootId,
        receipt,
        attemptId: 'rollback-oversized',
      }),
    ).rejects.toThrow()
    expect(await readFile(connectionPath)).toEqual(beforeOversizedBackup)

    await replacementClient.call('device.revoke', { id: originalDevice.device.id })
    await rejectWithoutWrite(originalDevice.token, dataRootId)
  } finally {
    originalClient.disconnect()
    replacementClient.disconnect()
    await host.close()
    await kernel.close()
    const actualRoot = await realpath(root)
    expect(dirname(actualRoot)).toBe(await realpath(tmpdir()))
    expect(basename(actualRoot).startsWith('hbar-host-rollback-identity-')).toBe(true)
    await rm(actualRoot, { recursive: true, force: true })
  }
})
