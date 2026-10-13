import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path/posix'
import { resolveSandboxProfile } from '@hbar/sandbox'
import type { ResolvedSandboxProfile, SandboxPathAccess } from '@hbar/contracts/sandbox'
import {
  createProcessPermissionManifest,
  type ProcessPermissionPathPort,
} from '../packages/node-core/src/process-permissions'

const paths: ProcessPermissionPathPort = {
  canonical: async (path) => resolve(path),
  exists: async () => true,
  resolve,
  relative: (from, to) => {
    const fromParts = from.split('/').filter(Boolean)
    const toParts = to.split('/').filter(Boolean)
    let common = 0
    while (common < fromParts.length && fromParts[common] === toParts[common]) common++
    return [...fromParts.slice(common).map(() => '..'), ...toParts.slice(common)].join('/') || '.'
  },
  isAbsolute: (path) => path.startsWith('/'),
  separator: '/',
  caseInsensitive: false,
}

async function profile(
  defaultAccess: SandboxPathAccess,
  grants: readonly { readonly path: string; readonly access: SandboxPathAccess }[],
): Promise<ResolvedSandboxProfile> {
  const base = await resolveSandboxProfile(':read-only', async () => null)
  return { ...base, filesystem: { default: defaultAccess, grants: [...grants] } }
}

describe('Node process permission manifest', () => {
  test('maps read default and a write exception to separated roots', async () => {
    const result = await createProcessPermissionManifest({
      root: '/work/project',
      cwd: '/work/project',
      registrationAccess: 'write',
      profile: await profile('read', [{ path: 'out', access: 'write' }]),
      floorProtectedPaths: [],
      paths,
    })
    expect(result).toEqual({
      readableRoots: ['/work/project'],
      writableRoots: ['/work/project/out'],
      protectedPaths: [],
      readOnlyPaths: [],
    })
  })

  test('maps a write default with explicit read and deny exceptions distinctly', async () => {
    const result = await createProcessPermissionManifest({
      root: '/work/project',
      cwd: '/work/project',
      registrationAccess: 'write',
      profile: await profile('write', [
        { path: 'docs', access: 'read' },
        { path: 'private', access: 'none' },
      ]),
      floorProtectedPaths: [],
      paths,
    })
    expect(result).toEqual({
      readableRoots: ['/work/project'],
      writableRoots: ['/work/project'],
      protectedPaths: ['/work/project/private'],
      readOnlyPaths: ['/work/project/docs'],
    })
  })

  test('registration read access floors default and explicit write grants', async () => {
    const result = await createProcessPermissionManifest({
      root: '/work/project',
      cwd: '/work/project',
      registrationAccess: 'read',
      profile: await profile('write', [{ path: 'out', access: 'write' }]),
      floorProtectedPaths: [],
      paths,
    })
    expect(result.writableRoots).toEqual([])
    expect(result.readableRoots).toEqual(['/work/project'])
  })

  test('protected floor overrides a broad writable profile and readonly floor remains deny-write', async () => {
    const result = await createProcessPermissionManifest({
      root: '/work/project',
      cwd: '/work/project',
      registrationAccess: 'write',
      profile: await profile('write', []),
      floorProtectedPaths: ['/work/project/.hbar'],
      floorReadOnlyPaths: ['/work/project/vendor'],
      paths,
    })
    expect(result.protectedPaths).toEqual(['/work/project/.hbar'])
    expect(result.readOnlyPaths).toEqual(['/work/project/vendor'])
  })

  test('rejects globs and nested grants that would widen an ancestor restriction', async () => {
    const input = {
      root: '/work/project',
      cwd: '/work/project',
      registrationAccess: 'write' as const,
      floorProtectedPaths: [],
      paths,
    }
    await expect(
      createProcessPermissionManifest({
        ...input,
        profile: await profile('read', [{ path: 'src/**', access: 'write' }]),
      }),
    ).rejects.toMatchObject({ code: 'NODE_PERMISSION_UNSUPPORTED' })
    await expect(
      createProcessPermissionManifest({
        ...input,
        profile: await profile('read', [
          { path: 'src', access: 'read' },
          { path: 'src/out', access: 'write' },
        ]),
      }),
    ).rejects.toMatchObject({ code: 'NODE_PERMISSION_UNSUPPORTED' })
  })

  test('default deny cannot start a process whose cwd has no read grant', async () => {
    await expect(
      createProcessPermissionManifest({
        root: '/work/project',
        cwd: '/work/project',
        registrationAccess: 'write',
        profile: await profile('none', [{ path: 'out', access: 'write' }]),
        floorProtectedPaths: [],
        paths,
      }),
    ).rejects.toMatchObject({ code: 'NODE_PERMISSION_UNSUPPORTED' })
  })

  test('ignores absolute grants outside the registered root', async () => {
    const result = await createProcessPermissionManifest({
      root: '/work/project',
      cwd: '/work/project',
      registrationAccess: 'write',
      profile: await profile('none', [
        { path: '/home/user/private', access: 'read' },
        { path: '.', access: 'read' },
      ]),
      floorProtectedPaths: [],
      paths,
    })
    expect(result.readableRoots).toEqual(['/work/project'])
    expect(result.writableRoots).toEqual([])
  })

  test('applies an absolute ancestor grant to the registered root', async () => {
    const result = await createProcessPermissionManifest({
      root: '/work/project',
      cwd: '/work/project',
      registrationAccess: 'write',
      profile: await profile('write', [{ path: '/work', access: 'read' }]),
      floorProtectedPaths: [],
      paths,
    })
    expect(result.readableRoots).toEqual(['/work/project'])
    expect(result.writableRoots).toEqual([])
  })

  test('uses evaluator specificity and restrictive ties for absolute ancestor grants', async () => {
    const result = await createProcessPermissionManifest({
      root: '/work/project',
      cwd: '/work/project',
      registrationAccess: 'write',
      profile: {
        ...(await profile('write', [
          { path: '/work', access: 'read' },
          { path: 'out', access: 'write' },
        ])),
      },
      floorProtectedPaths: [],
      paths,
    })
    expect(result.readableRoots).toEqual(['/work/project'])
    expect(result.writableRoots).toEqual([])
    expect(result.readOnlyPaths).toEqual([])
  })

  test('supports nested exceptions and refuses a cwd with an effective deny', async () => {
    const result = await createProcessPermissionManifest({
      root: '/work/project',
      cwd: '/work/project',
      registrationAccess: 'write',
      profile: await profile('read', [
        { path: 'src', access: 'write' },
        { path: 'src/private', access: 'none' },
      ]),
      floorProtectedPaths: [],
      paths,
    })
    expect(result.writableRoots).toEqual(['/work/project/src'])
    expect(result.protectedPaths).toEqual(['/work/project/src/private'])

    await expect(
      createProcessPermissionManifest({
        root: '/work/project',
        cwd: '/work/project/src/private',
        registrationAccess: 'write',
        profile: await profile('write', [{ path: 'src/private', access: 'none' }]),
        floorProtectedPaths: [],
        paths,
      }),
    ).rejects.toMatchObject({ code: 'NODE_PERMISSION_UNSUPPORTED' })
  })

  test('uses registration access as the default when no sandbox snapshot is attached', async () => {
    const result = await createProcessPermissionManifest({
      root: '/work/project',
      cwd: '/work/project',
      registrationAccess: 'read',
      profile: null,
      floorProtectedPaths: [],
      paths,
    })
    expect(result.readableRoots).toEqual(['/work/project'])
    expect(result.writableRoots).toEqual([])
  })

  test('refuses missing exact grants before a backend can start', async () => {
    await expect(
      createProcessPermissionManifest({
        root: '/work/project',
        cwd: '/work/project',
        registrationAccess: 'write',
        profile: await profile('read', [{ path: 'new-output', access: 'write' }]),
        floorProtectedPaths: [],
        paths: { ...paths, exists: async () => false },
      }),
    ).rejects.toMatchObject({ code: 'NODE_PERMISSION_UNSUPPORTED' })
  })
})
