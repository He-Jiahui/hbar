import { describe, expect, it } from 'bun:test'
import { HbarError } from '@hbar/contracts'
import { renderSeatbeltProfile, validateUnixConfinementRoots } from '../apps/node/src/unix-confinement'
import type { OsConfinementOptions } from '@hbar/plugin-sdk'

const confinement = (overrides: Partial<OsConfinementOptions> = {}): OsConfinementOptions => ({
  level: 'elevated',
  readableRoots: ['/srv/build'],
  writableRoots: ['/srv/build/out'],
  networkEnabled: false,
  envOverrides: {},
  ...overrides,
})

describe('workspace node Unix confinement plans', () => {
  it('accepts only a cwd and writable roots inside the admitted readable roots', () => {
    const plan = validateUnixConfinementRoots({
      cwd: '/srv/build/src',
      confinement: confinement(),
      protectedPaths: ['/srv/build/.git/hooks'],
    })
    expect(plan.readableRoots).toEqual(['/srv/build'])
    expect(plan.writableRoots).toEqual(['/srv/build/out'])
    expect(plan.protectedPaths).toEqual(['/srv/build/.git/hooks'])
    expect(plan.readOnlyPaths).toEqual([])
  })

  it('rejects sibling writes, protected working directories, and writes through protected paths', () => {
    expect(() =>
      validateUnixConfinementRoots({
        cwd: '/srv/build',
        confinement: confinement({ writableRoots: ['/srv/other'] }),
        protectedPaths: [],
      }),
    ).toThrow(HbarError)
    expect(() =>
      validateUnixConfinementRoots({
        cwd: '/srv/build/.git/hooks',
        confinement: confinement({ writableRoots: [] }),
        protectedPaths: ['/srv/build/.git/hooks'],
      }),
    ).toThrow(HbarError)
    expect(() =>
      validateUnixConfinementRoots({
        cwd: '/srv/build',
        confinement: confinement({ writableRoots: ['/srv/build/.git/hooks'] }),
        protectedPaths: ['/srv/build/.git/hooks'],
      }),
    ).toThrow(HbarError)
    expect(() =>
      validateUnixConfinementRoots({
        cwd: '/srv/build',
        confinement: confinement({ readableRoots: ['/'] }),
        protectedPaths: [],
      }),
    ).toThrow(HbarError)
  })

  it('accepts read-only snapshot paths under a broader writable root but rejects paths outside readable roots', () => {
    const plan = validateUnixConfinementRoots({
      cwd: '/srv/build',
      confinement: confinement({ writableRoots: ['/srv/build'] }),
      protectedPaths: [],
      readOnlyPaths: ['/srv/build/src'],
    })
    expect(plan.readOnlyPaths).toEqual(['/srv/build/src'])
    expect(() =>
      validateUnixConfinementRoots({
        cwd: '/srv/build',
        confinement: confinement(),
        protectedPaths: [],
        readOnlyPaths: ['/srv/private'],
      }),
    ).toThrow(HbarError)
  })

  it('renders protected path denials after allowed roots and denies network by default', () => {
    const profile = renderSeatbeltProfile({
      readableRoots: ['/srv/build', '/usr'],
      writableRoots: ['/srv/build/out'],
      protectedPaths: ['/srv/build/.git/hooks'],
      networkEnabled: false,
      tempRoot: '/tmp/hbar-exec',
    })
    expect(profile).toContain('(deny default)')
    expect(profile).toContain('(allow file-write* (subpath "/srv/build/out"))')
    expect(profile).toContain('(deny file-read* (subpath "/srv/build/.git/hooks"))')
    expect(profile).toContain('(deny file-write* (subpath "/srv/build/.git/hooks"))')
    expect(profile).not.toContain('(allow network*)')
  })

  it('quotes policy paths as one literal and adds network access only when explicitly enabled', () => {
    const profile = renderSeatbeltProfile({
      readableRoots: ['/srv/quoted"; (allow network*)'],
      writableRoots: [],
      protectedPaths: [],
      networkEnabled: true,
      tempRoot: '/tmp/hbar-exec',
    })
    expect(profile).toContain('"/srv/quoted\\"; (allow network*)"')
    expect(profile.split('\n').filter((line) => line === '(allow network*)')).toHaveLength(1)
  })

  it('maps each B-owned root into a private alias view with the stricter folder access', () => {
    const plan = validateUnixConfinementRoots({
      cwd: '/workspace/src',
      confinement: confinement({
        readableRoots: ['/srv/build', '/srv/docs'],
        writableRoots: ['/srv/build'],
      }),
      protectedPaths: ['/srv/docs/.git/hooks'],
      readOnlyPaths: ['/srv/build/locked'],
      workspaceMounts: [
        { rootId: 'engine', sourceRoot: '/srv/build', alias: 'src', target: '/workspace/src', access: 'write' },
        { rootId: 'docs', sourceRoot: '/srv/docs', alias: 'docs', target: '/workspace/docs', access: 'read' },
      ],
    })
    expect(plan.readableRoots).toEqual(['/workspace/src', '/workspace/docs'])
    expect(plan.writableRoots).toEqual(['/workspace/src'])
    expect(plan.protectedPaths).toEqual(['/workspace/docs/.git/hooks'])
    expect(plan.readOnlyPaths).toEqual(['/workspace/src/locked'])
    expect(() =>
      validateUnixConfinementRoots({
        backend: 'seatbelt',
        cwd: '/workspace/src',
        confinement: confinement({ readableRoots: ['/srv/build'], writableRoots: ['/srv/build'] }),
        protectedPaths: [],
        workspaceMounts: [
          { rootId: 'engine', sourceRoot: '/srv/build', alias: 'src', target: '/workspace/src', access: 'write' },
        ],
      }),
    ).toThrow('Seatbelt cannot provide the required mounted workspace view')
  })
})
