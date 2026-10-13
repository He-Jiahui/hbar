import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { hostname } from 'node:os'
import { createInterface } from 'node:readline/promises'
import { mkdir, open, rename, rm, lstat } from 'node:fs/promises'
import { isIP } from 'node:net'
import { join } from 'node:path'
import {
  createNodeConsoleClient,
  pairNodeConsoleDeviceWithSigner,
  type NodeConsoleDeviceCredentials,
} from '@hbar/client'
import type { NodeConsoleSigner, NodeConsoleTransport } from '@hbar/client/node-console'
import type { NodeConsoleMethod } from '@hbar/contracts/node-console'
import { nodeInfoSchema } from '@hbar/contracts/node-info'
import { resolvePathLayout } from '@hbar/storage'
import type { CliArgs } from './args'
import { z } from 'zod'

const savedCredentialSchema = z.strictObject({
  version: z.literal(1),
  origin: z.string().url(),
  nodeId: z.string().regex(/^node-[a-f0-9]{40}$/),
  fingerprint: z.string().regex(/^SHA256:[A-Za-z0-9_-]{43}$/),
  deviceId: z.string().min(1).max(160),
  role: z.enum(['operator', 'observer']),
  publicKey: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  privateKey: z.string().min(1).max(4_000),
})
type SavedCredential = z.infer<typeof savedCredentialSchema>
type NodeConsoleFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function loopback(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/gu, '')
  return (
    normalized === 'localhost' ||
    (isIP(normalized) === 6 && normalized === '::1') ||
    (isIP(normalized) === 4 && normalized.startsWith('127.'))
  )
}

function normalizeOrigin(input: string): URL {
  const url = new URL(input)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('B console URL must be an HTTP or HTTPS address without credentials')
  if (url.protocol === 'http:' && !loopback(url.hostname))
    throw new Error('B console requires HTTPS except on loopback addresses')
  return new URL(url.origin)
}

/** A 404 means this is the existing A Host attach route; invalid B metadata fails closed. */
export async function discoverNodeConsole(
  address: string,
  fetcher: NodeConsoleFetch = globalThis.fetch,
  signal: AbortSignal = AbortSignal.timeout(10_000),
): Promise<{ readonly origin: string; readonly info: z.infer<typeof nodeInfoSchema> } | null> {
  const origin = normalizeOrigin(address)
  const response = await fetcher(new URL('/node-info', origin), { method: 'GET', signal, redirect: 'error' })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`B node discovery failed with HTTP ${response.status}`)
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('B node discovery returned invalid JSON')
  }
  const info = nodeInfoSchema.parse(payload)
  return { origin: origin.origin, info }
}

function deviceSigner(saved: SavedCredential): NodeConsoleSigner {
  const privateKey = createPrivateKey({ key: Buffer.from(saved.privateKey, 'base64url'), format: 'der', type: 'pkcs8' })
  const publicDer = createPublicKey(privateKey).export({ format: 'der', type: 'spki' })
  const publicKey = Buffer.from(publicDer).subarray(-32).toString('base64url')
  if (publicKey !== saved.publicKey) throw new Error('Saved B console private key does not match its public key')
  return {
    publicKey,
    async sign(message) {
      return sign(null, message, privateKey).toString('base64url')
    },
  }
}

async function credentialsPath(dataRoot: string, origin: string, nodeId: string): Promise<string> {
  const folder = join(dataRoot, 'node-console')
  await mkdir(folder, { recursive: true, mode: 0o700 })
  const key = createHash('sha256').update(`${origin}\n${nodeId}`).digest('hex')
  return join(folder, `${key}.json`)
}

async function readCredential(path: string): Promise<SavedCredential | null> {
  try {
    const entry = await lstat(path)
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('B console credential path must be a regular file')
    if (entry.size > 8_192) throw new Error('B console credential file exceeds the 8 KiB limit')
    const file = await open(path, 'r')
    let text: string
    let mode: number
    try {
      const opened = await file.stat()
      if (!opened.isFile() || opened.dev !== entry.dev || opened.ino !== entry.ino)
        throw new Error('B console credential changed while opening it')
      text = await file.readFile('utf8')
      mode = opened.mode
    } finally {
      await file.close()
    }
    const saved = savedCredentialSchema.parse(JSON.parse(text))
    if (process.platform !== 'win32' && (mode & 0o077) !== 0)
      throw new Error('B console credential file permissions are too broad; remove it and pair again')
    return saved
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}

async function writeCredential(path: string, value: SavedCredential): Promise<void> {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    const file = await open(temporary, 'wx', 0o600)
    try {
      await file.writeFile(JSON.stringify(value))
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

function newDeviceSigner(): { readonly signer: NodeConsoleSigner; readonly privateKey: string } {
  const pair = generateKeyPairSync('ed25519')
  const publicKey = Buffer.from(pair.publicKey.export({ format: 'der', type: 'spki' }))
    .subarray(-32)
    .toString('base64url')
  const privateKey = pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url')
  const key = pair.privateKey
  return {
    privateKey,
    signer: {
      publicKey,
      async sign(message) {
        return sign(null, message, key).toString('base64url')
      },
    },
  }
}

async function pairingCode(args: CliArgs): Promise<string> {
  if (args.code) return args.code
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error(
      'This B console has no paired CLI device. Run `hbar node pair` on B, then attach with --code <8-digits>.',
    )
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await prompt.question('B console pairing code: ')).trim()
  } finally {
    prompt.close()
  }
}

async function pairCredential(
  info: z.infer<typeof nodeInfoSchema>,
  origin: string,
  path: string,
  args: CliArgs,
): Promise<SavedCredential> {
  const code = await pairingCode(args)
  if (!/^\d{8}$/.test(code)) throw new Error('B console pairing code must contain exactly eight digits')
  const { signer, privateKey } = newDeviceSigner()
  const paired = await pairNodeConsoleDeviceWithSigner({
    url: new URL(info.rpcPath, origin).href,
    code,
    name: args.name ?? `hbar CLI ${hostname()}`,
    signer,
    signal: AbortSignal.timeout(30_000),
  })
  const saved = savedCredentialSchema.parse({
    version: 1,
    origin,
    nodeId: info.nodeId,
    fingerprint: info.fingerprint,
    deviceId: paired.device.deviceId,
    role: paired.device.role,
    publicKey: signer.publicKey,
    privateKey,
  })
  await writeCredential(path, saved)
  return saved
}

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}

async function dispatchConsoleCommand(
  client: NodeConsoleTransport,
  role: 'operator' | 'observer',
  source: string,
  signal: AbortSignal,
): Promise<boolean> {
  const [command, ...parts] = source.trim().split(/\s+/u)
  if (!command) return true
  if (command === 'help') {
    console.log(
      'status | sessions [cursor] | snapshot <sessionId> [beforeSeq] | follow <sessionId> <afterSeq> | audit [after] [limit] | pause | resume | kill <operationId|--all> | policy | quit',
    )
    return true
  }
  if (command === 'quit' || command === 'exit') return false
  const call = async (method: NodeConsoleMethod, input: unknown) =>
    print(await client.call(method, input as never, { signal }))
  switch (command) {
    case 'status':
      await call('node.status', {})
      break
    case 'sessions':
      await call('observe.sessions.list', { ...(parts[0] ? { cursor: parts[0] } : {}), limit: 50 })
      break
    case 'snapshot':
      if (!parts[0]) throw new Error('Usage: snapshot <sessionId> [beforeSeq]')
      await call('observe.sessions.snapshot', {
        sessionId: parts[0],
        ...(parts[1] ? { beforeSeq: Number(parts[1]) } : {}),
        limit: 60,
      })
      break
    case 'follow':
      if (!parts[0] || !parts[1] || !Number.isSafeInteger(Number(parts[1])))
        throw new Error('Usage: follow <sessionId> <afterSeq>')
      await call('observe.sessions.follow', { sessionId: parts[0], afterSeq: Number(parts[1]) })
      break
    case 'audit':
      if (role !== 'operator') throw new Error('Observer devices cannot read the operator audit log')
      await call('node.audit', {
        after: parts[0] ? Number(parts[0]) : 0,
        limit: parts[1] ? Number(parts[1]) : 100,
      })
      break
    case 'policy':
      if (role !== 'operator') throw new Error('Observer devices cannot read operator policy')
      await call('node.policy.get', {})
      break
    case 'pause':
    case 'resume':
      if (role !== 'operator') throw new Error('Observer devices cannot pause the node')
      await call('node.pause', { paused: command === 'pause' })
      break
    case 'kill':
      if (role !== 'operator') throw new Error('Observer devices cannot stop node processes')
      if (!parts[0]) throw new Error('Usage: kill <operationId|--all>')
      await call('node.kill', parts[0] === '--all' ? { all: true } : { operationId: parts[0], all: false })
      break
    default:
      throw new Error(`Unknown B console command: ${command}; type help`)
  }
  return true
}

async function runConsole(client: NodeConsoleTransport, role: 'operator' | 'observer'): Promise<void> {
  const status = await client.call('node.status', {}, { signal: AbortSignal.timeout(30_000) })
  console.log(
    `Connected to B ${status.capabilities.nodeId} (${status.fingerprint}), paired as ${role}. Type help for commands.`,
  )
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  let active: AbortController | undefined
  let closed = false
  prompt.once('close', () => {
    closed = true
  })
  const interrupt = () => {
    if (active) active.abort(new Error('B console request cancelled'))
    else prompt.close()
  }
  prompt.on('SIGINT', interrupt)
  try {
    while (!closed) {
      let line: string
      try {
        line = await prompt.question('b> ')
      } catch {
        break
      }
      active = new AbortController()
      const timeout = AbortSignal.timeout(30_000)
      const signal = AbortSignal.any([active.signal, timeout])
      try {
        if (!(await dispatchConsoleCommand(client, role, line, signal))) break
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error))
      } finally {
        active = undefined
      }
    }
  } finally {
    active?.abort()
    prompt.close()
  }
}

/** Return false only when this address is an A Host without B's strict public discovery document. */
export async function tryAttachNodeConsole(address: string, args: CliArgs): Promise<boolean> {
  const discovery = await discoverNodeConsole(address)
  if (!discovery) return false
  const layout = await resolvePathLayout({ dataRoot: args.dataRoot, cacheRoot: args.cacheRoot })
  const path = await credentialsPath(layout.dataRoot, discovery.origin, discovery.info.nodeId)
  let saved = await readCredential(path)
  if (saved && saved.fingerprint !== discovery.info.fingerprint)
    throw new Error('B node fingerprint changed; refusing the saved CLI device key')
  if (!saved) saved = await pairCredential(discovery.info, discovery.origin, path, args)
  const signer = deviceSigner(saved)
  const credentials: NodeConsoleDeviceCredentials = {
    deviceId: saved.deviceId,
    publicKey: saved.publicKey,
    signer,
  }
  const client = createNodeConsoleClient({
    url: new URL(discovery.info.rpcPath, discovery.origin).href,
    credentials,
    requestTimeoutMs: 30_000,
    maxQueuedRequests: 8,
  })
  await runConsole(client, saved.role)
  return true
}
