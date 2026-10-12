import { expect, test } from 'bun:test'
import { posix, win32 } from 'node:path'
import type { Workspace } from '@hbar/contracts'
import { nodeWorkspaceLocator } from '@hbar/contracts/node'
import type { ExecutionProvider } from '@hbar/plugin-sdk'
import { remoteSandboxPathPort, WorkspaceExecutionScopes } from './workspace-execution-scope'

function workspace(nodePath: string, nodeId = 'builder'): Pick<Workspace, 'path' | 'location'> {
  return {
    path: nodeWorkspaceLocator(nodeId, 'engine'),
    location: { kind: 'node', nodeId, rootId: 'engine', nodePath },
  }
}

test('workspace execution scope is async-local and nested calls restore the parent scope', async () => {
  const scopes = new WorkspaceExecutionScopes()
  const local = workspace('/srv/engine')
  const signal = AbortSignal.timeout(5_000)
  const first = { workspace: local, signal }
  const second = {
    ...first,
    authority: { sessionId: 's1', runId: 'r1', callId: 'c1', sandbox: null, admission: { kind: 'allow' as const } },
  }

  expect(scopes.current()).toBeUndefined()
  await scopes.run(first, async () => {
    expect(scopes.current()).toBe(first)
    await scopes.run(second, async () => {
      await Promise.resolve()
      expect(scopes.current()).toBe(second)
    })
    expect(scopes.current()).toBe(first)
  })
  expect(scopes.current()).toBeUndefined()
})

test('remote sandbox canonicalization uses the B path dialect and reported case mode', async () => {
  const target = workspace('C:\\work\\engine')
  const calls: string[][] = []
  const execution: ExecutionProvider = {
    canonicalize: async (_workspace, paths) => {
      calls.push([...paths])
      return {
        root: 'C:\\work\\engine',
        paths: paths.map((path) => win32.resolve('C:\\work\\engine', path)),
        dialect: 'win32',
        caseInsensitive: true,
      }
    },
    list: async () => [],
    read: async () => '',
    readBytes: async () => new Uint8Array(),
    write: async () => ({ before: '', after: '', path: '', revision: '0'.repeat(64) }),
    exec: async () => ({ text: '', isError: false }),
  }
  const { root, port } = await remoteSandboxPathPort(execution, target, AbortSignal.timeout(5_000))
  expect(root).toBe('C:\\work\\engine')
  expect(port.resolve(root, 'src', 'main.ts')).toBe('C:\\work\\engine\\src\\main.ts')
  expect(await port.canonical(port.resolve(root, 'src', 'main.ts'))).toBe('C:\\work\\engine\\src\\main.ts')
  expect(port.caseInsensitive).toBe(true)
  expect(port.separator).toBe('\\')
  expect(calls).toEqual([['.'], ['src\\main.ts']])
})

test('remote canonicalization rejects a changed bound root and paths outside the shared root', async () => {
  const target = workspace('/srv/engine')
  const execution: ExecutionProvider = {
    canonicalize: async (_workspace, paths) => ({
      root: '/srv/rebound',
      paths: paths.map((path) => posix.resolve('/srv/rebound', path)),
      dialect: 'posix',
      caseInsensitive: false,
    }),
    list: async () => [],
    read: async () => '',
    readBytes: async () => new Uint8Array(),
    write: async () => ({ before: '', after: '', path: '', revision: '0'.repeat(64) }),
    exec: async () => ({ text: '', isError: false }),
  }
  await expect(remoteSandboxPathPort(execution, target, AbortSignal.timeout(5_000))).rejects.toMatchObject({
    code: 'NODE_ROOT_CHANGED',
  })

  const owner = {
    ...execution,
    canonicalize: async (_workspace: string, paths: readonly string[]) => ({
      root: '/srv/engine',
      paths: paths.map((path) => posix.resolve('/srv/engine', path)),
      dialect: 'posix' as const,
      caseInsensitive: false,
    }),
  }
  const { port } = await remoteSandboxPathPort(owner, target, AbortSignal.timeout(5_000))
  expect(() => port.resolve('/srv/engine', '..', 'secret')).not.toThrow()
  await expect(port.canonical('/srv/secret')).rejects.toMatchObject({ code: 'PATH_DENIED' })
})

test('win32 path containment rejects case-only sibling roots and malformed canonicalize batches', async () => {
  const target = workspace('C:\\Repo')
  const calls: string[][] = []
  const execution: ExecutionProvider = {
    canonicalize: async (_workspace, requested) => {
      calls.push([...requested])
      return {
        root: 'C:\\Repo',
        paths: requested.map((path) => win32.resolve('C:\\Repo', path)),
        dialect: 'win32',
        caseInsensitive: true,
      }
    },
    list: async () => [],
    read: async () => '',
    readBytes: async () => new Uint8Array(),
    write: async () => ({ before: '', after: '', path: '', revision: '0'.repeat(64) }),
    exec: async () => ({ text: '', isError: false }),
  }
  const { port } = await remoteSandboxPathPort(execution, target, AbortSignal.timeout(5_000))
  await expect(port.canonical('C:\\repo\\secret')).rejects.toMatchObject({ code: 'PATH_DENIED' })
  expect(calls).toEqual([['.']])

  const malformed: ExecutionProvider = {
    ...execution,
    canonicalize: async (_workspace, requested) => ({
      root: 'C:\\Repo',
      paths: requested.length === 1 && requested[0] === '.' ? ['C:\\Repo'] : [],
      dialect: 'win32',
      caseInsensitive: true,
    }),
  }
  const ownerPaths = await remoteSandboxPathPort(malformed, target, AbortSignal.timeout(5_000))
  await expect(ownerPaths.port.canonical(win32.resolve('C:\\Repo', 'file.txt'))).rejects.toMatchObject({
    code: 'NODE_INVALID_RESPONSE',
  })
})

test('canonicalMany sends large owner path sets in bounded sequential batches', async () => {
  const target = workspace('C:\\Repo')
  let inFlight = 0
  let peakInFlight = 0
  const batchSizes: number[] = []
  const execution: ExecutionProvider = {
    canonicalize: async (_workspace, requested) => {
      batchSizes.push(requested.length)
      inFlight++
      peakInFlight = Math.max(peakInFlight, inFlight)
      await Bun.sleep(1)
      inFlight--
      return {
        root: 'C:\\Repo',
        paths: requested.map((path) => win32.resolve('C:\\Repo', path)),
        dialect: 'win32',
        caseInsensitive: true,
      }
    },
    list: async () => [],
    read: async () => '',
    readBytes: async () => new Uint8Array(),
    write: async () => ({ before: '', after: '', path: '', revision: '0'.repeat(64) }),
    exec: async () => ({ text: '', isError: false }),
  }
  const { port } = await remoteSandboxPathPort(execution, target, AbortSignal.timeout(5_000))
  const requests = Array.from({ length: 300 }, (_value, index) => win32.resolve('C:\\Repo', `file-${index}.txt`))
  const canonical = await port.canonicalMany(requests)
  expect(canonical).toHaveLength(300)
  expect(batchSizes).toEqual([1, 256, 44])
  expect(peakInFlight).toBe(1)
})

test('canonicalMany rejects a B response whose canonical path escapes the exact bound root', async () => {
  const target = workspace('C:\\Repo')
  const execution: ExecutionProvider = {
    canonicalize: async (_workspace, requested) => ({
      root: 'C:\\Repo',
      paths: requested.map((path) => (path === '.' ? 'C:\\Repo' : 'C:\\Repo-old\\secret')),
      dialect: 'win32',
      caseInsensitive: true,
    }),
    list: async () => [],
    read: async () => '',
    readBytes: async () => new Uint8Array(),
    write: async () => ({ before: '', after: '', path: '', revision: '0'.repeat(64) }),
    exec: async () => ({ text: '', isError: false }),
  }
  const { port } = await remoteSandboxPathPort(execution, target, AbortSignal.timeout(5_000))
  await expect(port.canonicalMany(['C:\\Repo\\secret'])).rejects.toMatchObject({ code: 'NODE_INVALID_RESPONSE' })
})
