import { HbarError } from '@hbar/contracts'
import { readFile } from 'node:fs/promises'
import type { Device } from '@hbar/contracts'

export interface DesktopConnection {
  url: string
  token: string
  instanceId: string
  pid: number
  supervisorPid?: number
}

/**
 * Reads the only credential that is safe to reuse from a local connection
 * record.  The record is user-owned state and may be missing, truncated, or
 * from an older version, so callers must treat an absent value as a request to
 * create a fresh device and authenticate any returned token before using it.
 */
export function desktopConnectionToken(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || !('token' in value)) return undefined
  const token = value.token
  return typeof token === 'string' && token.length > 0 && token.length <= 512 ? token : undefined
}

export interface DesktopDeviceAuth {
  authenticate(token: string): Promise<Device>
  createDevice(name: string): Promise<{ token: string; device: Device }>
}

export async function loadDesktopDevice(auth: DesktopDeviceAuth, connectionFile: string) {
  let persistedToken: string | undefined
  try {
    persistedToken = desktopConnectionToken(JSON.parse(await readFile(connectionFile, 'utf8')) as unknown)
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    if (code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
  }
  return resolveDesktopDevice(auth, persistedToken)
}

/** Reuse a persisted local device only after the Host authenticates it. */
export async function resolveDesktopDevice(
  auth: DesktopDeviceAuth,
  persistedToken: string | undefined,
): Promise<{ token: string; device: Device }> {
  if (!persistedToken) return auth.createDevice('hbar desktop')
  try {
    return { token: persistedToken, device: await auth.authenticate(persistedToken) }
  } catch (error) {
    if (!(error instanceof HbarError) || error.code !== 'UNAUTHORIZED') throw error
    return auth.createDevice('hbar desktop')
  }
}

/** Keep the live Host PID separate from the process launched by the desktop. */
export function desktopConnection(
  url: string,
  token: string,
  instanceId: string,
  supervised: boolean,
): DesktopConnection {
  return {
    url,
    token,
    pid: process.pid,
    instanceId,
    ...(supervised ? { supervisorPid: process.ppid } : {}),
  }
}
