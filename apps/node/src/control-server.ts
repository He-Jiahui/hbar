import { mkdir, readFile, rm, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { HbarError } from '@hbar/contracts'
import { NODE_LIMITS } from '@hbar/contracts/node'
import { nodeConsoleConnectionSchema, nodeConsoleRequestSchema } from '@hbar/contracts/node-console'
import type { NodeConsoleService } from './console-service'

async function removeTemporary(path: string): Promise<void> {
  try {
    await rm(path)
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error
  }
}

export async function startNodeControlServer(dataRoot: string, service: NodeConsoleService, listen?: string) {
  const address = listen ? new URL('http://' + listen) : new URL('http://127.0.0.1:0')
  if (
    !['127.0.0.1', '[::1]', 'localhost'].includes(address.hostname) ||
    address.pathname !== '/' ||
    address.username ||
    address.password
  )
    throw new HbarError('NODE_CONTROL_LOCAL_ONLY', 'The local operator console must listen on loopback')
  const token = randomBytes(32).toString('base64url')
  let inflight = 0
  const server = Bun.serve({
    hostname: address.hostname === '[::1]' ? '::1' : address.hostname,
    port: Number(address.port || '80'),
    maxRequestBodySize: NODE_LIMITS.frameBytes,
    async fetch(request) {
      const incoming = Buffer.from(request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '')
      const secret = Buffer.from(token)
      if (incoming.length !== secret.length || !timingSafeEqual(incoming, secret))
        return Response.json(
          { code: 'UNAUTHORIZED', message: 'Node-local operator authentication required' },
          { status: 401 },
        )
      if (request.method !== 'POST' || new URL(request.url).pathname !== '/rpc')
        return new Response(null, { status: 404 })
      if (inflight >= NODE_LIMITS.inflight)
        return Response.json({ code: 'NODE_BUSY', message: 'Node console capacity reached' }, { status: 429 })
      inflight++
      try {
        const value: unknown = await request.json()
        const input = nodeConsoleRequestSchema.parse(value)
        return Response.json({ result: await service.invoke(input.method, input.input) })
      } catch (error) {
        return Response.json(
          {
            code: error instanceof HbarError ? error.code : 'INVALID_REQUEST',
            message: error instanceof Error ? error.message.slice(0, 1_600) : 'Invalid node request',
          },
          { status: 400 },
        )
      } finally {
        inflight--
      }
    },
  })
  const path = join(dataRoot, 'control.json')
  try {
    await mkdir(dataRoot, { recursive: true, mode: 0o700 })
    const connection = nodeConsoleConnectionSchema.parse({
      url: new URL('rpc', server.url).href,
      token,
      pid: process.pid,
    })
    const temporary = join(dataRoot, '.control-' + crypto.randomUUID())
    try {
      await writeFile(temporary, JSON.stringify(connection), { mode: 0o600, flag: 'wx' })
      await rename(temporary, path)
    } finally {
      await removeTemporary(temporary)
    }
    return {
      connection,
      async close() {
        await server.stop(true)
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
