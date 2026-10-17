import { expect, test } from 'bun:test'
import { posix, win32 } from 'node:path'
import {
  evaluateSandboxCall,
  resolveSandboxProfile,
  sandboxSnapshotContent,
  verifySandboxSnapshot,
  SANDBOX_EVALUATOR_FINGERPRINT,
  type SandboxPathPort,
} from '@hbar/sandbox'
import { sandboxEvaluatorSourceFingerprint } from '../scripts/generate-sandbox-evaluator'

test('the evaluator fingerprint names the current shared source independent of line endings', async () => {
  expect(SANDBOX_EVALUATOR_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/)
  expect(await sandboxEvaluatorSourceFingerprint(process.cwd())).toBe(SANDBOX_EVALUATOR_FINGERPRINT)
})

for (const dialect of ['posix', 'win32'] as const)
  test(`remote ${dialect} paths use the owner canonicalizer for lexical and symlink checks`, async () => {
    const path = dialect === 'win32' ? win32 : posix
    const root = dialect === 'win32' ? 'C:\\remote\\project' : '/remote/project'
    const outside = dialect === 'win32' ? 'C:\\private\\secret' : '/private/secret'
    const profile = await resolveSandboxProfile(':workspace-write', async () => null)
    const visited: string[] = []
    const port: SandboxPathPort = {
      resolve: path.resolve,
      relative: path.relative,
      isAbsolute: path.isAbsolute,
      separator: dialect === 'win32' ? '\\' : '/',
      caseInsensitive: dialect === 'win32',
      canonical: async (value) => {
        visited.push(value)
        return value === path.resolve(root, 'link') ? outside : value
      },
    }
    const input = {
      workspace: root,
      tool: {
        name: 'write_file',
        effect: 'write' as const,
        workspaceAccess: { kind: 'paths' as const, arguments: [{ field: 'path', access: 'write' as const }] },
      },
      args: { path: 'src/file.ts' },
    }
    expect((await evaluateSandboxCall(profile, input, port)).decision).toBe('allow')
    const escaped = await evaluateSandboxCall(profile, { ...input, args: { path: 'link' } }, port)
    expect(escaped).toMatchObject({
      decision: 'ask',
      reason: { kind: 'path', path: outside.replaceAll('\\', '/'), granted: 'read' },
    })
    expect(visited).toContain(root)
    expect(visited).toContain(path.resolve(root, 'link'))
  })

test('a failed owner path resolution never falls back to the conversation filesystem', async () => {
  const profile = await resolveSandboxProfile(':read-only', async () => null)
  const failure = new Error('owner offline')
  const port: SandboxPathPort = {
    ...posix,
    separator: '/',
    caseInsensitive: false,
    canonical: async () => {
      throw failure
    },
  }
  let result: unknown
  try {
    await evaluateSandboxCall(profile, { workspace: '/remote', tool: { name: 'read', effect: 'read' }, args: {} }, port)
  } catch (error) {
    result = error
  }
  expect(result).toBe(failure)
})

for (const dialect of ['posix', 'win32'] as const)
  test(`nested ${dialect} command paths ignore a permitted flat decoy and check every array destination`, async () => {
    const path = dialect === 'win32' ? win32 : posix
    const root = dialect === 'win32' ? 'C:\\remote\\project' : '/remote/project'
    const port: SandboxPathPort = {
      ...path,
      separator: dialect === 'win32' ? '\\' : '/',
      caseInsensitive: dialect === 'win32',
      canonical: async (value) => value,
    }
    const base = await resolveSandboxProfile(':workspace-write', async () => null)
    const profile = {
      ...base,
      filesystem: {
        default: 'none' as const,
        grants: [
          { path: 'allowed', access: 'write' as const },
          { path: 'denied', access: 'none' as const },
        ],
      },
    }
    const input = {
      workspace: root,
      tool: {
        name: 'nested_write',
        effect: 'write' as const,
        workspaceAccess: {
          kind: 'paths' as const,
          arguments: [{ field: 'input.path', fieldPath: ['input', 'path'], access: 'write' as const }],
        },
      },
      args: { 'input.path': 'allowed/decoy.txt', input: { path: 'allowed/proof.txt' } },
    }
    expect((await evaluateSandboxCall(profile, input, port)).decision).toBe('allow')
    expect(
      await evaluateSandboxCall(
        profile,
        { ...input, args: { ...input.args, input: { path: 'denied/private.txt' } } },
        port,
      ),
    ).toMatchObject({ decision: 'deny', reason: { kind: 'path', field: 'input.path', granted: 'none' } })
    const arrayCall = {
      ...input,
      tool: {
        ...input.tool,
        workspaceAccess: {
          kind: 'paths' as const,
          arguments: [{ field: 'input.paths', fieldPath: ['input', 'paths'], access: 'write' as const }],
        },
      },
      args: { 'input.path': 'allowed/decoy.txt', input: { paths: ['allowed/first.txt', 'denied/second.txt'] } },
    }
    expect((await evaluateSandboxCall(profile, arrayCall, port)).decision).toBe('deny')
  })

for (const dialect of ['posix', 'win32'] as const)
  for (const caseInsensitive of [false, true])
    test(`the ${dialect} owner cannot widen grants or bypass exclusions with either advertised case mode (${caseInsensitive})`, async () => {
      const path = dialect === 'win32' ? win32 : posix
      const root = dialect === 'win32' ? 'C:\\remote\\project' : '/remote/project'
      const port: SandboxPathPort = {
        ...path,
        separator: dialect === 'win32' ? '\\' : '/',
        caseInsensitive,
        canonical: async (value) => value,
      }
      const profile = await resolveSandboxProfile(':workspace-write', async () => null)
      const input = {
        workspace: root,
        tool: {
          name: 'write_file',
          effect: 'write' as const,
          workspaceAccess: { kind: 'paths' as const, arguments: [{ field: 'path', access: 'write' as const }] },
        },
        args: { path: 'Source/file.ts' },
      }
      expect(
        await evaluateSandboxCall(
          { ...profile, filesystem: { default: 'none', grants: [{ path: 'source', access: 'write' }] } },
          input,
          port,
        ),
      ).toMatchObject({ decision: 'ask', reason: { kind: 'path', granted: 'none' } })
      expect(
        await evaluateSandboxCall(
          { ...profile, filesystem: { default: 'write', grants: [{ path: '.secrets', access: 'none' }] } },
          { ...input, args: { path: '.SECRETS/file' } },
          port,
        ),
      ).toMatchObject({ decision: 'deny', reason: { kind: 'path', granted: 'none' } })
      expect(
        (
          await evaluateSandboxCall(
            { ...profile, filesystem: { default: 'none', grants: [{ path: 'source', access: 'write' }] } },
            { ...input, args: { path: 'source/file.ts' } },
            port,
          )
        ).decision,
      ).toBe('allow')
    })

test('the node can verify the same canonical snapshot, while tampering and profile substitution fail', async () => {
  const profile = await resolveSandboxProfile(':workspace-write', async () => null)
  const { data, digest } = sandboxSnapshotContent(profile)
  const ref = { profileId: profile.profileId, digest }
  expect(verifySandboxSnapshot(ref, JSON.parse(data))).toEqual(profile)
  expect(() => verifySandboxSnapshot(ref, { ...profile, network: { enabled: true } })).toThrow('content address')
  expect(() => verifySandboxSnapshot({ ...ref, profileId: ':read-only' }, profile)).toThrow('content address')
  const reordered = { ...profile, ...Object.fromEntries(Object.entries(profile).reverse()) }
  expect(sandboxSnapshotContent(reordered).digest).toBe(digest)
})
