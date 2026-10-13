import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPathLayout } from '@hbar/storage'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'
import { runNode } from '@hbar/node'
import { discoverNodeConsole } from '../apps/cli/src/node-console-attach'
import { runNodeCommand } from '../apps/node/src/cli'
import { nodeInfoSchema } from '@hbar/contracts/node-info'

type NodeConsoleFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

test('public B discovery recognizes only the strict workspace descriptor and treats 404 as A', async () => {
  const descriptor = nodeInfoSchema.parse({
    role: 'workspace',
    protocol: 1,
    nodeId: 'node-' + 'a'.repeat(40),
    fingerprint: 'SHA256:' + 'b'.repeat(43),
    rpcPath: '/rpc',
    consolePath: '/node-console',
  })
  const found = await discoverNodeConsole('http://127.0.0.1:4318/path', (async (request) => {
    expect(String(request)).toBe('http://127.0.0.1:4318/node-info')
    return Response.json(descriptor)
  }) satisfies NodeConsoleFetch)
  expect(found?.info).toEqual(descriptor)
  expect(
    await discoverNodeConsole(
      'http://127.0.0.1:4318',
      (async () => new Response(null, { status: 404 })) satisfies NodeConsoleFetch,
    ),
  ).toBeNull()
  await expect(
    discoverNodeConsole('http://127.0.0.1:4318', (async () =>
      Response.json({ ...descriptor, secret: 'must reject' })) satisfies NodeConsoleFetch),
  ).rejects.toThrow()
})

test('node pair creates a B-local eight-digit invite without requiring a conversation Host', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hbar-node-cli-pair-'))
  try {
    let result: unknown
    await runNodeCommand(['pair', '--home', directory, '--name', 'Read only CLI', '--role', 'operator'], (value) => {
      result = value
    })
    if (!result || typeof result !== 'object') throw new Error('Pair command did not return an invite')
    if (!('inviteId' in result) || !('code' in result) || !('expiresAt' in result))
      throw new Error('Pair command returned an incomplete invite')
    expect(typeof result.inviteId).toBe('string')
    expect(typeof result.code).toBe('string')
    expect(result.code).toMatch(/^\d{8}$/)
    expect(typeof result.expiresAt).toBe('number')
    await expect(runNodeCommand(['pair', '--home', directory], () => undefined)).rejects.toThrow('Use node pair --name')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('real Host attach discovery falls back on its hard 404 while real B serves its public info', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-console-discovery-'))
  const runtime = await ProcessHostRuntime.create({
    layout: createPathLayout(join(root, 'a-data'), join(root, 'a-cache'), join(root, 'pointer.json')),
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
    node = await runNode(['--home', join(root, 'b-data'), '--listen', '127.0.0.1:0'], { registerSignals: false })
    const aDiscovery = await discoverNodeConsole(`http://127.0.0.1:${host.server.port}`)
    expect(aDiscovery).toBeNull()
    const bDiscovery = await discoverNodeConsole(new URL(node.control.url).origin)
    expect(bDiscovery).toMatchObject({
      info: {
        role: 'workspace',
        protocol: 1,
        nodeId: node.node.id,
        rpcPath: '/rpc',
        consolePath: '/node-console',
      },
    })
    expect(bDiscovery?.info.fingerprint).toMatch(/^SHA256:[A-Za-z0-9_-]{43}$/)
  } finally {
    await node?.close()
    await host?.close()
    await runtime.close()
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)
