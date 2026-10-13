import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'bun:test'
import { HbarError } from '@hbar/contracts'
import type { OsConfinementOptions } from '@hbar/plugin-sdk'
import { createJournalWriter, readContainerJournal, reapContainerAfterOwner } from '../apps/node/src/container-backend'
import {
  prepareContainerConfinement,
  probeContainerConfinement,
  renderContainerLaunchArgv,
  validateContainerRequest,
  type ContainerConfinementConfig,
  type ContainerRequest,
} from '../apps/node/src/container-confinement'

const floor = (overrides: Partial<OsConfinementOptions> = {}): OsConfinementOptions => ({
  level: 'elevated',
  readableRoots: ['/workspace'],
  writableRoots: ['/workspace/out'],
  networkEnabled: false,
  envOverrides: {},
  ...overrides,
})
const config = (dataRoot: string): ContainerConfinementConfig => ({
  engine: 'docker',
  imageId: `sha256:${'a'.repeat(64)}`,
  dataRoot,
})

describe('workspace node container confinement', () => {
  it('keeps paths within admitted roots and rejects mount syntax the engine cannot encode losslessly', () => {
    expect(
      validateContainerRequest({
        operation: { kind: 'argv', argv: ['node', '-e', 'process.exit(0)'] },
        cwd: '/workspace',
        environment: {},
        confinement: floor(),
        protectedPaths: ['/workspace/.git'],
      }),
    ).toMatchObject({ cwd: '/workspace', readableRoots: ['/workspace'], writableRoots: ['/workspace/out'] })
    expect(() =>
      validateContainerRequest({
        operation: { kind: 'command', command: 'true' },
        cwd: '/workspace/../host',
        environment: {},
        confinement: floor(),
        protectedPaths: [],
      }),
    ).toThrow(HbarError)
    expect(() =>
      validateContainerRequest({
        operation: { kind: 'command', command: 'true' },
        cwd: '/run',
        environment: {},
        confinement: floor({ readableRoots: ['/run'], writableRoots: [] }),
        protectedPaths: [],
      }),
    ).toThrow(HbarError)
    expect(() =>
      validateContainerRequest({
        operation: { kind: 'command', command: 'true' },
        cwd: '/workspace',
        environment: {},
        confinement: floor({ readableRoots: ['/workspace,secret'] }),
        protectedPaths: [],
      }),
    ).toThrow(HbarError)
  })

  it('renders an offline immutable job plan with readonly grants, nested writer and protected mask', () => {
    const argv = renderContainerLaunchArgv(
      config('/var/lib/hbar/node'),
      {
        operation: { kind: 'argv', argv: ['/usr/bin/node', '-e', 'console.log("a;b")'] },
        cwd: '/workspace',
        environment: { SAFE_VALUE: 'one two' },
        confinement: floor(),
        protectedPaths: ['/workspace/.git'],
      },
      'job-render',
      { '/workspace/.git': { path: '/var/lib/hbar/masks/git', kind: 'directory' } },
    )
    expect(argv).toContain('--pull=never')
    expect(argv).toContain('--read-only')
    expect(argv).toContain('--network')
    expect(argv).toContain('none')
    expect(argv).toContain('type=bind,src=/workspace,dst=/workspace,ro')
    expect(argv).toContain('type=bind,src=/workspace/out,dst=/workspace/out,rw')
    expect(argv).toContain('type=bind,src=/var/lib/hbar/masks/git,dst=/workspace/.git,ro')
    expect(argv.slice(-4)).toEqual(['sha256:' + 'a'.repeat(64), '/usr/bin/node', '-e', 'console.log("a;b")'])
    expect(argv).toContain('SAFE_VALUE=one two')
    const withNetwork = renderContainerLaunchArgv(
      config('/var/lib/hbar/node'),
      {
        operation: { kind: 'command', command: 'node -v' },
        cwd: '/workspace',
        environment: {},
        confinement: floor({ networkEnabled: true }),
        protectedPaths: [],
      },
      'job-network',
      {},
    )
    expect(withNetwork.slice(withNetwork.indexOf('--network'), withNetwork.indexOf('--network') + 2)).toEqual([
      '--network',
      'bridge',
    ])
  })

  it.skipIf(process.platform !== 'linux')(
    'uses an immutable image, readonly broad mounts, nested writers, private home/tmp, and literal argv',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'hbar-container-plan-'))
      const workspace = join(root, 'workspace')
      const out = join(workspace, 'out')
      const privatePath = join(workspace, '.secrets')
      const dataRoot = join(root, 'node-data')
      await mkdir(out, { recursive: true })
      await mkdir(privatePath)
      await mkdir(dataRoot)
      try {
        const input: ContainerRequest = {
          operation: { kind: 'argv', argv: ['/usr/bin/node', '-e', 'console.log("a;b")'] },
          cwd: workspace,
          environment: { SAFE_VALUE: 'one two' },
          confinement: floor({ readableRoots: [workspace], writableRoots: [out] }),
          protectedPaths: [privatePath],
        }
        const plan = await prepareContainerConfinement(config(dataRoot), input, 'job-1')
        try {
          expect(plan.argv).toContain('--pull=never')
          expect(plan.argv).toContain('--read-only')
          expect(plan.argv).toContain('--network')
          expect(plan.argv).toContain('none')
          expect(plan.argv).toContain(`type=bind,src=${workspace},dst=${workspace},ro`)
          expect(plan.argv).toContain(`type=bind,src=${out},dst=${out},rw`)
          const protectedMount = plan.argv.find((argument) => argument.includes(`,dst=${privatePath},ro`))
          expect(protectedMount).toBeDefined()
          const protectedSource = protectedMount?.slice('type=bind,src='.length).split(',dst=')[0]
          expect(protectedSource && dirname(protectedSource)).toBe(plan.cleanupRoot)
          expect(plan.argv.slice(-4)).toEqual(['sha256:' + 'a'.repeat(64), '/usr/bin/node', '-e', 'console.log("a;b")'])
          expect(plan.argv).toContain('SAFE_VALUE=one two')
          expect(plan.name).toBe('hbar-node-job-1')
        } finally {
          await plan.cleanup()
        }
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
  )

  it.skipIf(process.platform !== 'linux')(
    'refuses a missing protected path under an admitted writer without creating it',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'hbar-container-protected-'))
      const workspace = join(root, 'workspace')
      const out = join(workspace, 'out')
      const missing = join(out, 'protected-missing')
      const dataRoot = join(root, 'node-data')
      await mkdir(out, { recursive: true })
      await mkdir(dataRoot)
      try {
        await expect(
          prepareContainerConfinement(
            config(dataRoot),
            {
              operation: { kind: 'command', command: 'true' },
              cwd: workspace,
              environment: {},
              confinement: floor({ readableRoots: [workspace], writableRoots: [out] }),
              protectedPaths: [missing],
            },
            'job-2',
          ),
        ).rejects.toThrow('Refusing to create a missing protected path under a writable root')
        expect(await Bun.file(missing).exists()).toBe(false)
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
  )

  it('does not claim live confinement when no Linux engine and pinned image have been proven', async () => {
    const capabilities = await probeContainerConfinement(config('/var/lib/hbar-node'))
    expect(capabilities.backend).toBe('container')
    if (process.platform !== 'linux') expect(capabilities.available).toBe(false)
    if (process.platform === 'linux' && !Bun.which('docker')) expect(capabilities.available).toBe(false)
  })

  it('compacts durable recovery records to a bounded latest-job journal while retaining active owners', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-container-journal-'))
    const path = join(root, 'jobs.jsonl')
    try {
      const records = new Map<string, { jobId: string; name: string; active: boolean }>()
      const append = createJournalWriter(path, records)
      await append({ jobId: 'active-job', name: 'hbar-node-active-job', active: true })
      for (let index = 0; index < 80; index++) {
        const jobId = `finished-${index}`
        await append({ jobId, name: `hbar-node-${jobId}`, active: false })
      }
      const recovered = await readContainerJournal(path)
      expect(recovered.get('active-job')?.active).toBe(true)
      expect(recovered.size).toBeLessThanOrEqual(48)
      expect(await Bun.file(path).size).toBeLessThan(64 * 1024)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it.skipIf(process.platform !== 'linux')('rejects a symlinked durable container journal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-container-journal-link-'))
    const target = join(root, 'target.jsonl')
    const path = join(root, 'jobs.jsonl')
    await Bun.write(target, '')
    await (await import('node:fs/promises')).symlink(target, path)
    try {
      await expect(readContainerJournal(path)).rejects.toThrow('bounded regular file')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('waits for the engine CLI owner before inspecting a job and confirms repeated absence', async () => {
    let ownerSettled = false
    let exists = false
    const order: string[] = []
    await reapContainerAfterOwner({
      async stopOwner() {
        order.push('stop-start')
        await Bun.sleep(5)
        exists = true
        ownerSettled = true
        order.push('stop-settled')
      },
      async inspect() {
        expect(ownerSettled).toBe(true)
        order.push(exists ? 'owned' : 'absent')
        return exists ? 'owned' : 'absent'
      },
      async remove() {
        exists = false
        order.push('remove')
      },
      async delay() {},
    })
    expect(order).toEqual(['stop-start', 'stop-settled', 'owned', 'remove', 'absent'])
  })

  it('keeps checking after an initially absent name so an accepted daemon create is reaped', async () => {
    let exists = false
    let inspections = 0
    await reapContainerAfterOwner({
      async stopOwner() {},
      async inspect() {
        inspections++
        if (inspections === 3) exists = true
        return exists ? 'owned' : 'absent'
      },
      async remove() {
        exists = false
      },
      async delay() {},
    })
    expect(inspections).toBe(4)
    expect(exists).toBe(false)
  })

  it('does not declare an interrupted, never-observed create absent just because polling stayed empty', async () => {
    let inspections = 0
    let removals = 0
    await expect(
      reapContainerAfterOwner(
        {
          async stopOwner() {},
          async inspect() {
            inspections++
            return 'absent'
          },
          async remove() {
            removals++
          },
          async delay() {},
        },
        5_000,
      ),
    ).rejects.toThrow('creation request may still settle')
    expect(inspections).toBe(10)
    expect(removals).toBe(0)
  })

  it('accepts absence when the engine owner proved the create lifecycle closed', async () => {
    let inspections = 0
    await reapContainerAfterOwner({
      async stopOwner() {},
      async inspect() {
        inspections++
        return 'absent'
      },
      async remove() {},
      async delay() {},
      creationKnownAbsent: true,
    })
    expect(inspections).toBe(10)
  })

  it('renders registered roots under private aliases and maps protected paths to the alias target', () => {
    const argv = renderContainerLaunchArgv(
      config('/var/lib/hbar/node'),
      {
        operation: { kind: 'command', command: 'cat /workspace/docs/readme.md' },
        cwd: '/workspace/src',
        environment: {},
        confinement: floor({
          readableRoots: ['/srv/build', '/srv/docs'],
          writableRoots: ['/srv/build'],
        }),
        protectedPaths: ['/workspace/docs/.git/hooks'],
        workspaceMounts: [
          {
            rootId: 'engine',
            sourceRoot: '/srv/build',
            alias: 'src',
            target: '/workspace/src',
            access: 'read',
            writePaths: [{ sourcePath: '/srv/build/cache', targetPath: '/workspace/src/cache' }],
          },
          { rootId: 'docs', sourceRoot: '/srv/docs', alias: 'docs', target: '/workspace/docs', access: 'read' },
        ],
      },
      'job-mounts',
      { '/workspace/docs/.git/hooks': { path: '/var/lib/hbar/masks/hooks', kind: 'directory' } },
    )
    expect(argv).toContain('type=bind,src=/srv/build,dst=/workspace/src,ro')
    expect(argv).toContain('type=bind,src=/srv/docs,dst=/workspace/docs,ro')
    expect(argv).toContain('type=bind,src=/var/lib/hbar/masks/hooks,dst=/workspace/docs/.git/hooks,ro')
    expect(argv).toContain('type=bind,src=/srv/build/cache,dst=/workspace/src/cache,rw')
    expect(argv).not.toContain('type=bind,src=/srv/docs,dst=/srv/docs,ro')
  })

  it('rejects alias traversal and a writable alias without an effective write grant', () => {
    const base: ContainerRequest = {
      operation: { kind: 'command', command: 'true' },
      cwd: '/workspace/src',
      environment: {},
      confinement: floor({ readableRoots: ['/srv/build'], writableRoots: [] }),
      protectedPaths: [],
      workspaceMounts: [
        {
          rootId: 'engine',
          sourceRoot: '/srv/build',
          alias: 'src',
          target: '/workspace/src/../escape',
          access: 'write',
        },
      ],
    }
    expect(() => validateContainerRequest(base)).toThrow()
    expect(() =>
      validateContainerRequest({
        ...base,
        workspaceMounts: [
          { rootId: 'engine', sourceRoot: '/srv/build', alias: 'src', target: '/workspace/src', access: 'write' },
        ],
      }),
    ).toThrow('Writable workspace mount is outside its effective write permission')
  })
})
