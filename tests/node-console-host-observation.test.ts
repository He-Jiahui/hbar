import { expect, test } from 'bun:test'
import { generateKeyPairSync, sign } from 'node:crypto'
import { Agent, request as httpsRequest } from 'node:https'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { createPathLayout } from '@hbar/storage'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { runNode, runNodeCommand } from '@hbar/node'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'
import {
  nodeConsoleConnectionSchema,
  nodeConsolePairSigningText,
  nodeConsoleRequestSigningText,
  nodeConsoleChallengeSchema,
  nodeConsoleInviteResultSchema,
  nodeConsolePairResultSchema,
} from '@hbar/contracts/node-console'
import { nodeObservedSessionPageSchema, nodeObservedSnapshotSchema } from '@hbar/contracts/node'

async function until(check: () => Promise<boolean>, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('A/B console observation did not converge')
    await Bun.sleep(25)
  }
}

function pairKey() {
  const pair = generateKeyPairSync('ed25519')
  const der = pair.publicKey.export({ format: 'der', type: 'spki' })
  return { privateKey: pair.privateKey, publicKey: Buffer.from(der).subarray(-32).toString('base64url') }
}

async function post(url: string, value: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(value),
  })
}

async function httpsPost(url: string, value: unknown, headers: Record<string, string> = {}) {
  const agent = new Agent({ rejectUnauthorized: false })
  try {
    return await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      const request = httpsRequest(
        new URL(url),
        { method: 'POST', agent, headers: { 'content-type': 'application/json', ...headers } },
        (response) => {
          let text = ''
          response.setEncoding('utf8')
          response.on('data', (chunk: string) => (text += chunk))
          response.on('end', () => {
            try {
              resolve({ status: response.statusCode ?? 0, body: JSON.parse(text) as unknown })
            } catch (error) {
              reject(error)
            }
          })
        },
      )
      request.on('error', reject)
      request.end(JSON.stringify(value))
    })
  } finally {
    agent.destroy()
  }
}

async function pairDevice(privateUrl: string, code: string) {
  const key = pairKey()
  const challengeResponse = await post(new URL('/challenge', privateUrl).href, { purpose: 'pair' })
  const challenge = nodeConsoleChallengeSchema.parse(await challengeResponse.json())
  const base = { nonce: challenge.nonce, code, name: 'Scoped observer', publicKey: key.publicKey }
  const signature = sign(null, Buffer.from(nodeConsolePairSigningText(base)), key.privateKey).toString('base64url')
  const response = await post(new URL('/pair', privateUrl).href, { ...base, signature })
  const payload: unknown = await response.json()
  const paired = nodeConsolePairResultSchema.parse(z.object({ result: z.unknown() }).parse(payload).result)
  return { key, deviceId: paired.device.deviceId, response }
}

async function signedRpc(
  privateUrl: string,
  deviceId: string,
  privateKey: ReturnType<typeof pairKey>['privateKey'],
  method: string,
  input: unknown,
): Promise<{ response: Response; payload: unknown }> {
  const challengeResponse = await post(new URL('/challenge', privateUrl).href, { purpose: 'request', deviceId })
  const challengePayload: unknown = await challengeResponse.json()
  if (!challengeResponse.ok) return { response: challengeResponse, payload: challengePayload }
  const challenge = nodeConsoleChallengeSchema.parse(challengePayload)
  const signingBase = { nonce: challenge.nonce, deviceId, method, input: z.json().parse(input) }
  const signature = sign(null, Buffer.from(nodeConsoleRequestSigningText(signingBase)), privateKey).toString(
    'base64url',
  )
  const response = await post(new URL('/rpc', privateUrl).href, { ...signingBase, signature })
  return { response, payload: (await response.json()) as unknown }
}

test('B console reads only its paired A root through a real Node link and isolates public TLS from private control', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-console-host-observation-'))
  const hostData = join(root, 'a-data')
  const nodeHome = join(root, 'b-home')
  const workspace = join(root, 'b-workspace')
  const docs = join(workspace, 'docs')
  await mkdir(docs, { recursive: true })
  const runtime = await ProcessHostRuntime.create({
    layout: createPathLayout(hostData, join(root, 'a-cache'), join(root, 'a-pointer.json')),
    sourceRoot: process.cwd(),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let node: Awaited<ReturnType<typeof runNode>> | undefined
  try {
    host = await startServer(runtime.kernel, {
      port: 0,
      runtime,
      controller: runtime.controller,
      nodeLink: runtime.nodeLink,
    })
    const hostUrl = `http://127.0.0.1:${host.server.port}`
    const invitation = await runtime.nodeLink.invite('console-observer-fixture')
    await runNodeCommand(['share', workspace, '--id', 'engine', '--access', 'write', '--home', nodeHome], () => {})
    await runNodeCommand(['share', docs, '--id', 'docs', '--access', 'read', '--home', nodeHome], () => {})
    const cert = fileURLToPath(new URL('./fixtures/node-tls/localhost-cert.pem', import.meta.url))
    const key = fileURLToPath(new URL('./fixtures/node-tls/localhost-key.pem', import.meta.url))
    node = await runNode(
      [
        '--home',
        nodeHome,
        '--join',
        hostUrl,
        '--code',
        invitation.code,
        '--fingerprint',
        invitation.fingerprint,
        '--listen',
        '0.0.0.0:0',
        '--cert',
        cert,
        '--key',
        key,
        '--public-host',
        'localhost',
      ],
      { registerSignals: false },
    )
    const liveNode = node
    await until(async () => liveNode.link.connection.phase === 'online')
    const publicControl = liveNode.publicControl
    if (!publicControl) throw new Error('Public TLS console was not started')
    expect(new URL(publicControl.url).protocol).toBe('https:')
    expect(new URL(liveNode.control.url).hostname).toBe('127.0.0.1')
    expect(publicControl.url).toContain('localhost:')
    const persistedControl = nodeConsoleConnectionSchema.parse(
      JSON.parse(await readFile(join(nodeHome, 'control.json'), 'utf8')),
    )
    expect(persistedControl.url).toBe(liveNode.control.url)

    const registered = (await runtime.nodeLink.list()).items.find((item) => item.nodeId === liveNode.node.id)
    if (!registered) throw new Error('B node did not register with A')
    const engineWorkspace = await runtime.storage.call('createNodeWorkspace', {
      nodeId: liveNode.node.id,
      rootId: 'engine',
      name: 'Engine session fixture',
    })
    const docsWorkspace = await runtime.storage.call('createNodeWorkspace', {
      nodeId: liveNode.node.id,
      rootId: 'docs',
      name: 'Docs session fixture',
    })
    const engineSession = await runtime.storage.call('createSession', engineWorkspace.id, 'Visible engine conversation')
    const secondEngineSession = await runtime.storage.call(
      'createSession',
      engineWorkspace.id,
      'Second visible engine conversation',
    )
    const docsSession = await runtime.storage.call('createSession', docsWorkspace.id, 'Hidden docs conversation')
    const hiddenDocsSession = await runtime.storage.call(
      'createSession',
      docsWorkspace.id,
      'Second hidden docs conversation',
    )
    await runtime.storage.call(
      'commit',
      engineSession.id,
      'run-engine',
      'assistant',
      [{ type: 'text', text: 'A-owned conversation visible to the paired B device' }],
      'message-engine',
      { providerSecret: 'never-project-this' },
    )
    await runtime.storage.call(
      'commit',
      docsSession.id,
      'run-docs',
      'assistant',
      [{ type: 'text', text: 'A docs conversation outside this B device scope' }],
      'message-docs',
      { providerSecret: 'never-project-this-either' },
    )

    const privatePairing = await post(
      liveNode.control.url,
      { method: 'node.pairing.create', input: { name: 'Engine-only observer', role: 'observer', roots: ['engine'] } },
      { authorization: 'Bearer ' + liveNode.control.token },
    )
    const inviteEnvelope: unknown = await privatePairing.json()
    const invite = nodeConsoleInviteResultSchema.parse(z.object({ result: z.unknown() }).parse(inviteEnvelope).result)
    const device = await pairDevice(liveNode.control.url, invite.code)
    expect(device.response.ok).toBe(true)

    const listed = await signedRpc(
      liveNode.control.url,
      device.deviceId,
      device.key.privateKey,
      'observe.sessions.list',
      {},
    )
    const page = nodeObservedSessionPageSchema.parse(z.object({ result: z.unknown() }).parse(listed.payload).result)
    expect(page.items.map((item) => item.id).sort()).toEqual([engineSession.id, secondEngineSession.id].sort())
    expect(page.nextCursor).toBeNull()
    let cursor: string | null = null
    const pagedIds: string[] = []
    const opaqueCursors: string[] = []
    do {
      const next = await signedRpc(
        liveNode.control.url,
        device.deviceId,
        device.key.privateKey,
        'observe.sessions.list',
        { limit: 1, ...(cursor ? { cursor } : {}) },
      )
      expect(next.response.ok).toBe(true)
      const nextPage = nodeObservedSessionPageSchema.parse(z.object({ result: z.unknown() }).parse(next.payload).result)
      pagedIds.push(...nextPage.items.map((item) => item.id))
      cursor = nextPage.nextCursor
      if (cursor) opaqueCursors.push(cursor)
    } while (cursor)
    expect(pagedIds.sort()).toEqual([engineSession.id, secondEngineSession.id].sort())
    expect(opaqueCursors.length).toBeGreaterThan(0)
    expect(opaqueCursors).not.toContain(docsSession.id)
    expect(opaqueCursors).not.toContain(hiddenDocsSession.id)
    expect(opaqueCursors).not.toContain(engineSession.id)
    expect(opaqueCursors).not.toContain(secondEngineSession.id)
    const snapshot = await signedRpc(
      liveNode.control.url,
      device.deviceId,
      device.key.privateKey,
      'observe.sessions.snapshot',
      { sessionId: engineSession.id },
    )
    const conversation = nodeObservedSnapshotSchema.parse(
      z.object({ result: z.unknown() }).parse(snapshot.payload).result,
    )
    expect(conversation.messages[0]?.content).toEqual([
      { type: 'text', text: 'A-owned conversation visible to the paired B device' },
    ])
    expect(JSON.stringify(snapshot.payload)).not.toContain('never-project-this')
    const outOfScope = await signedRpc(
      liveNode.control.url,
      device.deviceId,
      device.key.privateKey,
      'observe.sessions.snapshot',
      { sessionId: docsSession.id },
    )
    expect(outOfScope.response.status).toBe(403)
    const write = await signedRpc(liveNode.control.url, device.deviceId, device.key.privateKey, 'node.pause', {
      paused: true,
    })
    expect(write.response.status).toBe(403)
    const approval = await signedRpc(liveNode.control.url, device.deviceId, device.key.privateKey, 'approval.resolve', {
      approvalId: 'approval',
      decision: 'allowed',
    })
    expect(approval.response.status).toBe(400)

    const bootstrapOnPublic = await httpsPost(
      new URL('/rpc', publicControl.url).href,
      { method: 'node.status', input: {} },
      { authorization: 'Bearer ' + liveNode.control.token },
    )
    expect(bootstrapOnPublic.status).toBe(401)
    const wrongHost = await httpsPost(
      new URL('/challenge', publicControl.url).href,
      { purpose: 'pair' },
      { host: 'untrusted.example' },
    )
    expect(wrongHost.status).toBe(421)
    const wrongOrigin = await httpsPost(
      new URL('/challenge', publicControl.url).href,
      { purpose: 'pair' },
      { origin: 'https://untrusted.example' },
    )
    expect(wrongOrigin.status).toBe(403)
    let localStatus: unknown
    await runNodeCommand(['status', '--home', nodeHome], (value) => (localStatus = value))
    expect(localStatus).toMatchObject({ linked: true })

    const revoked = await post(
      liveNode.control.url,
      { method: 'node.device.revoke', input: { deviceId: device.deviceId } },
      { authorization: 'Bearer ' + liveNode.control.token },
    )
    expect(revoked.ok).toBe(true)
    const afterRevoke = await signedRpc(
      liveNode.control.url,
      device.deviceId,
      device.key.privateKey,
      'observe.sessions.list',
      {},
    )
    expect(afterRevoke.response.status).toBe(403)
    await liveNode.close()
    node = undefined
    expect(await Bun.file(join(nodeHome, 'control.json')).exists()).toBe(false)
  } finally {
    await node?.close()
    await host?.close()
    await runtime.close()
    await rm(root, { recursive: true, force: true })
  }
}, 90_000)
