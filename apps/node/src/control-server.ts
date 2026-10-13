import { mkdir, readFile, rm, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'
import { HbarError } from '@hbar/contracts'
import { NODE_LIMITS } from '@hbar/contracts/node'
import { nodeInfoSchema } from '@hbar/contracts/node-info'
import { nodeConsoleStaticResponse } from './console-static'
import {
  nodeConsoleAuthenticatedRequestSchema,
  nodeConsoleChallengeRequestSchema,
  nodeConsoleChallengeSchema,
  nodeConsoleConnectionSchema,
  nodeConsolePairRequestSchema,
  nodeConsoleRequestSchema,
  nodeConsoleMethods,
  type NodeConsoleMethod,
} from '@hbar/contracts/node-console'
import type { NodeConsolePrincipal, NodeConsoleService } from './console-service'
import {
  NodeConsoleAuthenticator,
  nodeConsoleSourceKey,
  verifyNodeConsolePairProof,
  verifyNodeConsoleRequestProof,
} from './console-auth'

export interface NodeConsoleServerSecurity {
  readonly tls?: { readonly certPath: string; readonly keyPath: string }
  /** Required when binding a non-loopback socket so Host and Origin validation use the public DNS name. */
  readonly publicHost?: string
  readonly allowedOrigins?: readonly string[]
  readonly writeControlFile?: boolean
  readonly allowBootstrapBearer?: boolean
  readonly staticRoot?: string
}
const requestDeadlineMs = 30_000

function withAbortSignal<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason)
  let abort: (() => void) | undefined
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
  })
  return Promise.race([work, cancelled]).finally(() => {
    if (abort) signal.removeEventListener('abort', abort)
  })
}

async function removeTemporary(path: string): Promise<void> {
  try {
    await rm(path)
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error
  }
}

function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/gu, '')
  return host === 'localhost' || host === '::1' || (isIP(host) === 4 && host.startsWith('127.'))
}

function publicAuthority(
  host: string | undefined,
  port: number | undefined,
  tls: boolean,
  fallbackHost: string,
): string {
  if (port === undefined) throw new HbarError('NODE_CONTROL_OFFLINE', 'Node console has no live listener port')
  const parsed = new URL(`${tls ? 'https' : 'http'}://${host ?? fallbackHost}`)
  const defaultPort = tls ? 443 : 80
  return parsed.port || port === defaultPort ? parsed.host.toLowerCase() : `${parsed.hostname.toLowerCase()}:${port}`
}

function isMethod(value: string): value is NodeConsoleMethod {
  return Object.hasOwn(nodeConsoleMethods, value)
}

function statusFor(error: unknown): number {
  if (!(error instanceof HbarError)) return 400
  if (error.code === 'UNAUTHORIZED' || error.code.startsWith('NODE_AUTH')) return 401
  if (error.code === 'FORBIDDEN' || error.code === 'NODE_REVOKED') return 403
  if (error.code === 'RATE_LIMIT') return 429
  if (error.code === 'NODE_BUSY') return 503
  return 400
}

export async function startNodeControlServer(
  dataRoot: string,
  service: NodeConsoleService,
  listen?: string,
  security: NodeConsoleServerSecurity = {},
) {
  const address = listen ? new URL('http://' + listen) : new URL('http://127.0.0.1:0')
  if (address.pathname !== '/' || address.search || address.hash || address.username || address.password)
    throw new HbarError('NODE_CONTROL_ADDRESS_INVALID', 'Node console listen address is invalid')
  const loopback = isLoopback(address.hostname)
  if (!loopback && (!security.tls || !security.publicHost))
    throw new HbarError(
      'NODE_CONTROL_TLS_REQUIRED',
      'Non-loopback B console listeners require TLS and a public hostname',
    )
  const configuredHost = security.publicHost?.toLowerCase()
  if (
    security.publicHost &&
    (!/^[A-Za-z0-9.:[\]-]+(?::\d+)?$/.test(security.publicHost) || security.publicHost.includes('@'))
  )
    throw new HbarError('NODE_CONTROL_HOST_INVALID', 'B console public hostname is invalid')
  const configuredOrigins = new Set<string>()
  for (const origin of security.allowedOrigins ?? []) {
    const parsed = new URL(origin)
    if (parsed.origin !== origin || (parsed.protocol !== 'https:' && !isLoopback(parsed.hostname)))
      throw new HbarError('NODE_CONTROL_ORIGIN_INVALID', 'B console browser origins must be exact HTTPS origins')
    configuredOrigins.add(origin)
  }
  const token = randomBytes(32).toString('base64url')
  const bootstrap = Buffer.from(token)
  const authenticator = new NodeConsoleAuthenticator()
  let inflight = 0
  const server = Bun.serve({
    hostname: address.hostname === '[::1]' ? '::1' : address.hostname,
    port: Number(address.port || '80'),
    maxRequestBodySize: NODE_LIMITS.frameBytes,
    ...(security.tls
      ? { tls: { cert: await readFile(security.tls.certPath), key: await readFile(security.tls.keyPath) } }
      : {}),
    async fetch(request, server) {
      const requestUrl = new URL(request.url)
      const publicHost = publicAuthority(configuredHost, server.port, !!security.tls, address.hostname)
      if (request.headers.get('host')?.toLowerCase() !== publicHost)
        return Response.json({ code: 'NODE_CONTROL_HOST_INVALID', message: 'Unexpected Host header' }, { status: 421 })
      const expectedOrigin = `${security.tls ? 'https' : 'http'}://${publicHost}`
      const origin = request.headers.get('origin')
      if (origin && origin !== expectedOrigin && !configuredOrigins.has(origin))
        return Response.json(
          { code: 'NODE_CONTROL_ORIGIN_INVALID', message: 'Browser origin is not allowed' },
          { status: 403 },
        )
      const cors = origin
        ? {
            'access-control-allow-origin': origin,
            'access-control-allow-methods': 'POST, OPTIONS',
            'access-control-allow-headers': 'content-type, authorization',
            vary: 'Origin',
          }
        : {}
      if (request.method === 'OPTIONS')
        return new Response(null, {
          status: 204,
          headers: { ...cors, 'access-control-max-age': '600' },
        })
      if (request.method === 'GET' && requestUrl.pathname === '/node-info')
        return Response.json(nodeInfoSchema.parse(service.info()), {
          headers: { ...cors, 'cache-control': 'no-store' },
        })
      if ((request.method === 'GET' || request.method === 'HEAD') && security.staticRoot)
        return nodeConsoleStaticResponse(request, security.staticRoot)
      if (request.method !== 'POST' || !['/challenge', '/pair', '/rpc'].includes(requestUrl.pathname))
        return new Response(null, { status: 404 })
      if (inflight >= NODE_LIMITS.inflight)
        return Response.json(
          { code: 'NODE_BUSY', message: 'Node console capacity reached' },
          { status: 429, headers: cors },
        )
      inflight++
      try {
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(requestDeadlineMs)])
        const value: unknown = await withAbortSignal(request.json(), signal)
        const sourceAddress = server.requestIP(request)?.address ?? 'unknown'
        const sourceKey = nodeConsoleSourceKey(sourceAddress)
        if (requestUrl.pathname === '/challenge') {
          const input = nodeConsoleChallengeRequestSchema.parse(value)
          const challenge = authenticator.issue(input, sourceKey)
          if (
            input.purpose === 'request' &&
            !(await withAbortSignal(service.deviceForAuthentication(input.deviceId), signal))
          ) {
            authenticator.consume(challenge.nonce, 'request', sourceKey, input.deviceId)
            throw new HbarError('NODE_REVOKED', 'B console device is absent or revoked')
          }
          return Response.json(nodeConsoleChallengeSchema.parse(challenge), {
            headers: cors,
          })
        }
        if (requestUrl.pathname === '/pair') {
          const input = nodeConsolePairRequestSchema.parse(value)
          if (!authenticator.consume(input.nonce, 'pair', sourceKey, null))
            throw new HbarError('NODE_AUTH_EXPIRED', 'B console pairing challenge expired or was already used')
          if (!verifyNodeConsolePairProof(input))
            throw new HbarError('NODE_AUTH_INVALID', 'B console device did not prove possession of its private key')
          const result = await withAbortSignal(
            service.completePairing({
              code: input.code,
              name: input.name,
              publicKey: input.publicKey,
              sourceKey,
            }),
            signal,
          )
          return Response.json({ result }, { headers: cors })
        }
        const authorization = request.headers.get('authorization')
        const incoming = Buffer.from(/^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization ?? '')?.[1] ?? '')
        if (
          loopback &&
          security.allowBootstrapBearer !== false &&
          incoming.length === bootstrap.length &&
          timingSafeEqual(incoming, bootstrap)
        ) {
          const admin = nodeConsoleRequestSchema.parse(value)
          return Response.json(
            { result: await withAbortSignal(service.invoke(admin.method, admin.input, undefined, signal), signal) },
            { headers: cors },
          )
        }
        const parsed = nodeConsoleAuthenticatedRequestSchema.safeParse(value)
        if (!parsed.success) throw new HbarError('UNAUTHORIZED', 'B console device authentication is required')
        const input = parsed.data
        if (!authenticator.consume(input.nonce, 'request', sourceKey, input.deviceId))
          throw new HbarError('NODE_AUTH_EXPIRED', 'B console request challenge expired or was already used')
        const device = await withAbortSignal(service.deviceForAuthentication(input.deviceId), signal)
        if (!device) throw new HbarError('NODE_REVOKED', 'B console device is absent or revoked')
        if (
          !verifyNodeConsoleRequestProof({
            nonce: input.nonce,
            deviceId: input.deviceId,
            method: input.method,
            input: input.input,
            signature: input.signature,
            publicKey: device.publicKey,
          })
        )
          throw new HbarError('NODE_AUTH_INVALID', 'B console request signature is invalid')
        if (!isMethod(input.method)) throw new HbarError('METHOD_NOT_FOUND', 'Unknown B console method')
        await withAbortSignal(service.touchDevice(device.deviceId), signal)
        const principal: NodeConsolePrincipal = {
          kind: 'device',
          deviceId: device.deviceId,
          role: device.role,
          roots: device.roots,
        }
        return Response.json(
          { result: await withAbortSignal(service.invoke(input.method, input.input, principal, signal), signal) },
          { headers: cors },
        )
      } catch (error) {
        return Response.json(
          {
            code: error instanceof HbarError ? error.code : 'INVALID_REQUEST',
            message: error instanceof Error ? error.message.slice(0, 1_600) : 'Invalid node request',
          },
          { status: statusFor(error), headers: cors },
        )
      } finally {
        inflight--
      }
    },
  })
  const path = join(dataRoot, 'control.json')
  try {
    const connection = nodeConsoleConnectionSchema.parse({
      url: new URL(
        'rpc',
        `${security.tls ? 'https' : 'http'}://${publicAuthority(configuredHost, server.port, !!security.tls, address.hostname)}/`,
      ).href,
      token,
      pid: process.pid,
    })
    if (security.writeControlFile !== false) {
      await mkdir(dataRoot, { recursive: true, mode: 0o700 })
      const temporary = join(dataRoot, '.control-' + crypto.randomUUID())
      try {
        await writeFile(temporary, JSON.stringify(connection), { mode: 0o600, flag: 'wx' })
        await rename(temporary, path)
      } finally {
        await removeTemporary(temporary)
      }
    }
    return {
      connection,
      async close() {
        await server.stop(true)
        if (security.writeControlFile === false) return
        try {
          const current = nodeConsoleConnectionSchema.parse(JSON.parse(await readFile(path, 'utf8')))
          if (current.token === token) await rm(path)
        } catch (error) {
          if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error
        }
      },
    }
  } catch (error) {
    await server.stop(true)
    throw error
  }
}
