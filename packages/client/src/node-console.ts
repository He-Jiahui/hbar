import { HbarError } from '@hbar/contracts'
import {
  nodeConsoleChallengeSchema,
  nodeConsolePairResultSchema,
  nodeConsolePairSigningText,
  nodeConsoleRequestSigningText,
  nodeConsoleMethods,
  nodeConsoleRequestSchema,
  type NodeConsoleMethod,
} from '@hbar/contracts/node-console'
import type { z } from 'zod'

export type NodeConsoleFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface NodeConsoleDeviceCredentials {
  readonly deviceId: string
  readonly signer: NodeConsoleSigner
  readonly publicKey: string
}

export interface NodeConsoleSigner {
  readonly publicKey: string
  sign(message: Uint8Array): Promise<string>
}

export interface NodeConsolePairingMaterial {
  readonly device: z.output<typeof nodeConsolePairResultSchema>['device']
  readonly publicKey: string
  readonly privateKey: CryptoKey
}

export interface NodeConsolePairingResult {
  readonly device: z.output<typeof nodeConsolePairResultSchema>['device']
  readonly credentials: NodeConsoleDeviceCredentials
}

export interface NodeConsoleClientOptions {
  /** B's `/rpc` URL. This client has no Hbar `/rpc` or A-node authority. */
  readonly url: string
  readonly credentials: NodeConsoleDeviceCredentials
  readonly fetch?: NodeConsoleFetch
  /** Maximum time in the FIFO queue and in transport requests. */
  readonly requestTimeoutMs?: number
  readonly maxQueuedRequests?: number
}

export interface NodeConsoleCallOptions {
  readonly signal?: AbortSignal
}

export interface NodeConsoleTransport {
  call<M extends NodeConsoleMethod>(
    method: M,
    input: z.input<(typeof nodeConsoleMethods)[M]['input']>,
    options?: NodeConsoleCallOptions,
  ): Promise<z.output<(typeof nodeConsoleMethods)[M]['output']>>
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function errorFrom(payload: unknown, status: number): HbarError {
  if (payload && typeof payload === 'object' && 'code' in payload && typeof payload.code === 'string') {
    const message =
      'message' in payload && typeof payload.message === 'string' ? payload.message : 'B console request failed'
    return new HbarError(payload.code, message)
  }
  return new HbarError('NODE_CONSOLE_HTTP', `B console request failed with HTTP ${status}`)
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new HbarError('NODE_CONSOLE_RESPONSE_INVALID', 'B console returned an invalid response')
  }
}

async function postJson(fetcher: NodeConsoleFetch, url: URL, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const response = await fetcher(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  })
  const payload = await readJson(response)
  if (!response.ok) throw errorFrom(payload, response.status)
  return payload
}

function endpoint(rpcUrl: string, path: 'challenge' | 'pair' | 'rpc'): URL {
  const url = new URL(rpcUrl)
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new HbarError('NODE_CONSOLE_URL_INVALID', 'B console URL must use HTTP or HTTPS')
  url.pathname = `/${path}`
  url.search = ''
  url.hash = ''
  return url
}

interface QueuedCall {
  readonly work: () => Promise<void>
  readonly reject: (reason: unknown) => void
  readonly signal: AbortSignal | undefined
  abortListener?: (() => void) | undefined
  timer?: ReturnType<typeof setTimeout> | undefined
  started: boolean
}

function createCallQueue(capacity: number) {
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 128)
    throw new HbarError('INVALID_INPUT', 'B console request queue limits are invalid')
  const pending: QueuedCall[] = []
  let active = false
  const pump = () => {
    if (active) return
    const next = pending[0]
    if (!next) return
    if (next.signal?.aborted) {
      pending.shift()
      if (next.abortListener) next.signal.removeEventListener('abort', next.abortListener)
      next.reject(next.signal.reason)
      pump()
      return
    }
    pending.shift()
    next.started = true
    if (next.abortListener && next.signal) next.signal.removeEventListener('abort', next.abortListener)
    active = true
    void next.work().finally(() => {
      active = false
      pump()
    })
  }
  return function enqueue<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason)
    if (pending.length >= capacity) return Promise.reject(new HbarError('NODE_BUSY', 'B console request queue is full'))
    return new Promise<T>((resolve, reject) => {
      const entry: QueuedCall = {
        work: () => work().then(resolve, reject),
        reject,
        signal,
        started: false,
      }
      entry.abortListener = () => {
        if (entry.started) return
        const index = pending.indexOf(entry)
        if (index < 0) return
        pending.splice(index, 1)
        if (entry.timer) clearTimeout(entry.timer)
        reject(signal?.reason)
        pump()
      }
      signal?.addEventListener('abort', entry.abortListener, { once: true })
      pending.push(entry)
      pump()
    })
  }
}

async function generateDeviceKey(
  cryptoApi: Crypto,
): Promise<{ readonly signer: NodeConsoleSigner; readonly privateKey: CryptoKey }> {
  const pair = await cryptoApi.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
  const publicBytes = new Uint8Array(await cryptoApi.subtle.exportKey('raw', pair.publicKey))
  const publicKey = encodeBase64Url(publicBytes)
  return { signer: createNodeConsoleSigner(pair.privateKey, publicKey, cryptoApi), privateKey: pair.privateKey }
}

/** Create a device keypair with WebCrypto; callers receive only the opaque signer. */
export async function createNodeConsoleDeviceKey(cryptoApi: Crypto = globalThis.crypto): Promise<{
  readonly signer: NodeConsoleSigner
}> {
  const generated = await generateDeviceKey(cryptoApi)
  return { signer: generated.signer }
}

/** Adapt a stored, non-exportable WebCrypto key into the SDK's opaque signing port. */
export function createNodeConsoleSigner(
  privateKey: CryptoKey,
  publicKey: string,
  cryptoApi: Crypto = globalThis.crypto,
): NodeConsoleSigner {
  if (
    privateKey.type !== 'private' ||
    privateKey.extractable ||
    privateKey.algorithm.name !== 'Ed25519' ||
    !privateKey.usages.includes('sign')
  )
    throw new HbarError('NODE_CONSOLE_KEY_INVALID', 'B console signing key must be non-exportable Ed25519')
  return {
    publicKey,
    async sign(message) {
      const ownedMessage = new ArrayBuffer(message.byteLength)
      new Uint8Array(ownedMessage).set(message)
      const signature = await cryptoApi.subtle.sign({ name: 'Ed25519' }, privateKey, ownedMessage)
      return encodeBase64Url(new Uint8Array(signature))
    },
  }
}

/** Pair one local B-console device. The returned private CryptoKey remains in memory for its owner to persist securely. */
export async function pairNodeConsoleDevice(input: {
  readonly url: string
  readonly code: string
  readonly name: string
  readonly fetch?: NodeConsoleFetch
  readonly crypto?: Crypto
  readonly signal?: AbortSignal
  /** Persist the non-exportable key only after B confirms pairing. */
  readonly persist?: (material: NodeConsolePairingMaterial) => Promise<void>
}): Promise<NodeConsolePairingResult> {
  const cryptoApi = input.crypto ?? globalThis.crypto
  const key = await generateDeviceKey(cryptoApi)
  const paired = await pairNodeConsoleDeviceWithSigner({
    ...input,
    signer: key.signer,
  })
  await input.persist?.({ device: paired.device, publicKey: key.signer.publicKey, privateKey: key.privateKey })
  return {
    device: paired.device,
    credentials: { deviceId: paired.device.deviceId, signer: key.signer, publicKey: key.signer.publicKey },
  }
}

/** Pair using a caller-owned signer, for native/CLI key storage owned outside the SDK. */
export async function pairNodeConsoleDeviceWithSigner(input: {
  readonly url: string
  readonly code: string
  readonly name: string
  readonly signer: NodeConsoleSigner
  readonly fetch?: NodeConsoleFetch
  readonly signal?: AbortSignal
}): Promise<{ readonly device: z.output<typeof nodeConsolePairResultSchema>['device'] }> {
  const fetcher = input.fetch ?? globalThis.fetch
  const challengePayload = await postJson(fetcher, endpoint(input.url, 'challenge'), { purpose: 'pair' }, input.signal)
  const challenge = nodeConsoleChallengeSchema.parse(challengePayload)
  const signingInput = {
    nonce: challenge.nonce,
    code: input.code,
    name: input.name,
    publicKey: input.signer.publicKey,
  }
  const signature = await input.signer.sign(new TextEncoder().encode(nodeConsolePairSigningText(signingInput)))
  const payload = await postJson(fetcher, endpoint(input.url, 'pair'), { ...signingInput, signature }, input.signal)
  const envelope = payload && typeof payload === 'object' && 'result' in payload ? payload.result : payload
  const paired = nodeConsolePairResultSchema.parse(envelope)
  return { device: paired.device }
}

/** Create a narrow B-local JSON client. Every method fetches and consumes a fresh signed challenge. */
export function createNodeConsoleClient(options: NodeConsoleClientOptions): NodeConsoleTransport {
  const fetcher = options.fetch ?? globalThis.fetch
  const rpcUrl = endpoint(options.url, 'rpc')
  const credentials = options.credentials
  const enqueue = createCallQueue(options.maxQueuedRequests ?? 16)
  return {
    async call<M extends NodeConsoleMethod>(
      method: M,
      input: z.input<(typeof nodeConsoleMethods)[M]['input']>,
      callOptions?: NodeConsoleCallOptions,
    ): Promise<z.output<(typeof nodeConsoleMethods)[M]['output']>> {
      const timeout = options.requestTimeoutMs ?? 30_000
      if (!Number.isSafeInteger(timeout) || timeout < 1_000 || timeout > 120_000)
        throw new HbarError('INVALID_INPUT', 'B console request timeout is invalid')
      const deadlineSignal = AbortSignal.timeout(timeout)
      const abortSignal = callOptions?.signal ? AbortSignal.any([deadlineSignal, callOptions.signal]) : deadlineSignal
      return enqueue(async () => {
        abortSignal?.throwIfAborted()
        const parsedInput = nodeConsoleMethods[method].input.parse(input)
        const challengePayload = await postJson(
          fetcher,
          endpoint(options.url, 'challenge'),
          { purpose: 'request', deviceId: credentials.deviceId },
          abortSignal,
        )
        const challenge = nodeConsoleChallengeSchema.parse(challengePayload)
        const serializedInput = JSON.stringify(parsedInput)
        if (serializedInput === undefined)
          throw new HbarError('NODE_CONSOLE_REQUEST_INVALID', 'B console request input is not JSON serializable')
        const jsonInput = JSON.parse(serializedInput) as unknown
        const request = nodeConsoleRequestSchema.parse({ method, input: jsonInput })
        const signingInput = {
          nonce: challenge.nonce,
          deviceId: credentials.deviceId,
          method: request.method,
          input: request.input,
        }
        const signature = await credentials.signer.sign(
          new TextEncoder().encode(nodeConsoleRequestSigningText(signingInput)),
        )
        abortSignal?.throwIfAborted()
        const response = await postJson(fetcher, rpcUrl, { ...signingInput, signature }, abortSignal)
        const envelope = response && typeof response === 'object' && 'result' in response ? response.result : response
        const output = nodeConsoleMethods[method].output.parse(envelope)
        return output as z.output<(typeof nodeConsoleMethods)[M]['output']>
      }, abortSignal)
    },
  }
}
