import { createHash } from 'node:crypto'
import { lstat, open, readFile, realpath, rename, rm } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { HbarClient } from '@hbar/client'
import { z } from 'zod'

const connectionSchema = z.strictObject({
  url: z.string().url(),
  token: z.string().min(1).max(512),
  instanceId: z.string().min(1),
  pid: z.number().int().positive(),
  supervisorPid: z.number().int().positive().optional(),
})
const healthSchema = z
  .object({ ready: z.boolean(), instanceId: z.string().min(1), dataRootId: z.string().min(1) })
  .passthrough()
const receiptSchema = z
  .object({
    status: z.literal('accepted'),
    commandId: z.literal('run.submit'),
    idempotencyKey: z.string().min(1),
    operationId: z.string().min(1),
    sessionId: z.string().min(1),
  })
  .passthrough()
const MAX_CONNECTION_FILE_BYTES = 16 * 1024
const IDENTITY_PROBE_TIMEOUT_MS = 10_000

export type DesktopRollbackConnection = z.infer<typeof connectionSchema>

export interface DesktopRollbackReceiptProbe {
  sessionId: string
  idempotencyKey: string
  operationId: string
}

export interface DesktopRollbackIdentityOptions {
  dataRoot: string
  rollbackBackupRoot: string
  backupConnectionPath: string
  expectedConnectionSha256: string
  expectedConnection: Pick<DesktopRollbackConnection, 'url' | 'instanceId' | 'pid'>
  expectedDataRootId: string
  receipt: DesktopRollbackReceiptProbe
  attemptId: string
}

export interface DesktopRollbackIdentityResult {
  changed: boolean
  url: string
  instanceId: string
  pid: number
  previousTokenAccepted: true
  receiptReadable: true
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function isLoopbackUrl(value: string): boolean {
  const url = new URL(value)
  return (
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]') &&
    !url.username &&
    !url.password
  )
}

function isWithin(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path.length > 0 && path !== '..' && !path.startsWith(`..\\`) && !path.startsWith(`../`) && !isAbsolute(path)
}

async function regularFile(path: string, label: string): Promise<string> {
  const info = await lstat(path)
  if (!info.isFile()) throw new Error(`${label} must be a regular file`)
  if (info.size > MAX_CONNECTION_FILE_BYTES) throw new Error(`${label} exceeds the size limit`)
  return realpath(path)
}

async function verifyPriorActor(
  connection: DesktopRollbackConnection,
  token: string,
  expectedDataRootId: string,
  receiptProbe: DesktopRollbackReceiptProbe,
): Promise<void> {
  const client = new HbarClient(connection.url, token)
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const probe = async () => {
      const host = await client.connect()
      if (host.instanceId !== connection.instanceId || host.dataRootId !== expectedDataRootId)
        throw new Error('saved actor belongs to a different Host identity')
      const response = await fetch(`${connection.url}/healthz`, { signal: AbortSignal.timeout(2_000) })
      if (!response.ok) throw new Error('Host health check failed')
      const health = healthSchema.parse(await response.json())
      if (!health.ready || health.instanceId !== connection.instanceId || health.dataRootId !== expectedDataRootId)
        throw new Error('Host is not ready with the expected identity')
      const receipt = receiptSchema.parse(
        await client.call('command.getReceipt', {
          commandId: 'run.submit',
          sessionId: receiptProbe.sessionId,
          idempotencyKey: receiptProbe.idempotencyKey,
        }),
      )
      if (
        receipt.operationId !== receiptProbe.operationId ||
        receipt.sessionId !== receiptProbe.sessionId ||
        receipt.idempotencyKey !== receiptProbe.idempotencyKey
      )
        throw new Error('saved actor did not recover the expected receipt')
    }
    await Promise.race([
      probe(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          client.disconnect()
          reject(new Error('saved desktop actor probe timed out'))
        }, IDENTITY_PROBE_TIMEOUT_MS)
      }),
    ])
  } catch {
    throw new Error('saved desktop actor did not authenticate and recover the expected receipt')
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
    client.disconnect()
  }
}

/**
 * Restore a prior desktop actor after a bundle rollback. The currently running
 * Host is the authority: the saved credential must authenticate there and read
 * an actor-scoped receipt before only the connection record's token is changed.
 */
export async function restoreDesktopRollbackIdentity(
  options: DesktopRollbackIdentityOptions,
): Promise<DesktopRollbackIdentityResult> {
  if (!/^[a-f0-9]{64}$/.test(options.expectedConnectionSha256))
    throw new Error('expectedConnectionSha256 must be a SHA-256 digest')
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/.test(options.attemptId)) throw new Error('attemptId is invalid')
  if (!/^[0-9a-fA-F-]{36}$/.test(options.expectedDataRootId)) throw new Error('expectedDataRootId is invalid')

  const dataRoot = await realpath(options.dataRoot)
  const settingsPath = resolve(dataRoot, 'settings')
  const settingsInfo = await lstat(settingsPath)
  if (!settingsInfo.isDirectory()) throw new Error('settings path must be a directory')
  if ((await realpath(settingsPath)) !== settingsPath) throw new Error('settings path must not be a symlink')
  const connectionPath = resolve(settingsPath, 'connection.json')
  const currentRealPath = await regularFile(connectionPath, 'connection.json')
  if (currentRealPath !== connectionPath) throw new Error('connection path must not resolve through a symlink')

  const backupRoot = await realpath(options.rollbackBackupRoot)
  const backupRootInfo = await lstat(options.rollbackBackupRoot)
  if (!backupRootInfo.isDirectory() || backupRoot !== resolve(options.rollbackBackupRoot))
    throw new Error('rollback backup root must be a real directory')
  const backupPath = resolve(options.backupConnectionPath)
  if (!isWithin(backupRoot, backupPath)) throw new Error('backup connection is outside the rollback backup root')
  const backupRealPath = await regularFile(backupPath, 'backup connection')
  if (backupRealPath !== backupPath) throw new Error('backup connection must not resolve through a symlink')

  const currentInfo = await lstat(connectionPath)
  if (currentInfo.size > MAX_CONNECTION_FILE_BYTES) throw new Error('connection.json exceeds the size limit')
  const backupInfo = await lstat(backupPath)
  if (backupInfo.size > MAX_CONNECTION_FILE_BYTES) throw new Error('backup connection exceeds the size limit')
  const initialBytes = await readFile(connectionPath)
  if (digest(initialBytes) !== options.expectedConnectionSha256) throw new Error('connection CAS digest mismatch')
  const current = connectionSchema.parse(JSON.parse(initialBytes.toString('utf8')) as unknown)
  if (!isLoopbackUrl(current.url)) throw new Error('current connection URL is not loopback')
  if (
    current.url !== options.expectedConnection.url ||
    current.instanceId !== options.expectedConnection.instanceId ||
    current.pid !== options.expectedConnection.pid
  )
    throw new Error('current connection identity does not match the expected Host')
  const prior = connectionSchema.parse(JSON.parse((await readFile(backupPath)).toString('utf8')) as unknown)
  if (!isLoopbackUrl(prior.url)) throw new Error('backup connection URL is not loopback')

  await verifyPriorActor(current, prior.token, options.expectedDataRootId, options.receipt)

  const restored: DesktopRollbackConnection = { ...current, token: prior.token }
  const temporaryPath = resolve(settingsPath, `.connection.${options.attemptId}.tmp`)
  let temporaryCreated = false
  let temporaryHandle: Awaited<ReturnType<typeof open>> | undefined
  try {
    temporaryHandle = await open(temporaryPath, 'wx', 0o600)
    temporaryCreated = true
    await temporaryHandle.writeFile(`${JSON.stringify(restored)}\n`)
    await temporaryHandle.sync()
    await temporaryHandle.close()
    temporaryHandle = undefined
    const compareBytes = await readFile(connectionPath)
    if (digest(compareBytes) !== options.expectedConnectionSha256)
      throw new Error('connection changed during rollback CAS')
    await rename(temporaryPath, connectionPath)
    temporaryCreated = false
  } catch (error) {
    let cleanupError: unknown
    if (temporaryHandle) {
      try {
        await temporaryHandle.close()
      } catch (closeError) {
        cleanupError = closeError
      }
    }
    if (temporaryCreated) {
      try {
        await rm(temporaryPath)
      } catch (removeError) {
        cleanupError = removeError
      }
    }
    if (cleanupError !== undefined) {
      const originalMessage = error instanceof Error ? error.message : 'unknown identity error'
      const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : 'unknown cleanup error'
      throw new Error(
        `Rollback identity failed (${originalMessage}) and its temporary file cleanup failed (${cleanupMessage})`,
        {
          cause: error,
        },
      )
    }
    throw error
  }

  return {
    changed: current.token !== restored.token,
    url: restored.url,
    instanceId: restored.instanceId,
    pid: restored.pid,
    previousTokenAccepted: true,
    receiptReadable: true,
  }
}

export { connectionSchema, isLoopbackUrl }
