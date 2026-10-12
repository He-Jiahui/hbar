import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createManagedNodeBackend,
  ManagedProbeOutputReader,
  probeManagedNodeBackend,
  resolveContainerConfig,
} from '../apps/node/src/managed-backend'

test.skipIf(process.platform !== 'win32')(
  'Windows reports live Job cleanup without claiming OS confinement',
  async () => {
    expect(await probeManagedNodeBackend('auto')).toMatchObject({
      selected: 'none',
      available: false,
      filesystem: false,
      network: false,
      processTree: true,
    })
  },
)

test('container config comes only from B-owned options/environment and requires a pinned digest', () => {
  const dataRoot = process.platform === 'win32' ? 'C:\\hbar-node' : '/var/lib/hbar-node'
  const image = `sha256:${'a'.repeat(64)}`
  expect(resolveContainerConfig(dataRoot, undefined, {})).toBeUndefined()
  expect(
    resolveContainerConfig(dataRoot, undefined, {
      HBAR_NODE_CONTAINER_ENGINE: 'docker',
      HBAR_NODE_CONTAINER_IMAGE: 'latest',
    }),
  ).toBeUndefined()
  expect(
    resolveContainerConfig(dataRoot, undefined, {
      HBAR_NODE_CONTAINER_ENGINE: 'docker',
      HBAR_NODE_CONTAINER_IMAGE: image,
    }),
  ).toEqual({
    engine: 'docker',
    imageId: image,
    dataRoot,
  })
  expect(resolveContainerConfig(dataRoot, { engine: 'podman', imageId: image, dataRoot }, {})).toEqual({
    engine: 'podman',
    imageId: image,
    dataRoot,
  })
})

test('an explicit container selection without B image configuration probes unavailable', async () => {
  const probe = await probeManagedNodeBackend('container')
  expect(probe).toMatchObject({
    requested: 'container',
    selected: 'none',
    available: false,
    filesystem: false,
    network: false,
    processTree: false,
  })
  expect(probe.reason).toContain('no fixed local container engine')
})

test.skipIf(process.platform !== 'win32')(
  'unavailable requested confinement keeps the backend constructible and fails closed per call',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-node-unavailable-floor-'))
    let backend: Awaited<ReturnType<typeof createManagedNodeBackend>> | undefined
    try {
      backend = await createManagedNodeBackend({
        dataRoot: join(root, 'node'),
        backend: 'bwrap',
      })
      expect(backend).toMatchObject({ name: 'none', filesystem: false, network: false, processTree: true })
      await expect(
        backend.exec(root, 'echo must-not-start', AbortSignal.timeout(5_000), {
          timeoutMs: 1_000,
          environment: {},
          environmentAllowlist: [],
          protectedPaths: [],
          confinement: {
            level: 'unelevated',
            writableRoots: [],
            readableRoots: [],
            networkEnabled: false,
            envOverrides: {},
          },
        }),
      ).rejects.toMatchObject({ code: 'SANDBOX_BACKEND_UNAVAILABLE' })
    } finally {
      await backend?.dispose?.()
      await rm(root, { recursive: true, force: true })
    }
  },
  30_000,
)

test('managed probe output preserves a marker arriving after multiple polling intervals', async () => {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(new TextEncoder().encode('hbar-owner-ready\n'))
      await Bun.sleep(90)
      controller.enqueue(new TextEncoder().encode('hbar-leaf:42\n'))
      controller.close()
    },
  })
  const output = new ManagedProbeOutputReader(stream.getReader())
  try {
    expect(await output.until('hbar-owner-ready', Date.now() + 1_000)).toBe(true)
    expect(await output.until('hbar-leaf:', Date.now() + 1_000)).toBe(true)
    expect(output.text()).toBe('hbar-owner-ready\nhbar-leaf:42\n')
  } finally {
    await output.cancel()
  }
})

test.skipIf(process.platform === 'win32')(
  'managed execArgv passes arguments literally and keeps stdout separate from stderr',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-node-argv-'))
    let backend: Awaited<ReturnType<typeof createManagedNodeBackend>> | undefined
    try {
      backend = await createManagedNodeBackend({ dataRoot: join(root, 'node'), backend: 'windows-restricted' })
      const execArgv = backend.execArgv
      if (!execArgv) throw new Error('Managed backend does not provide argv execution')
      const result = await execArgv(
        root,
        [
          process.execPath,
          '-e',
          "process.stdout.write(JSON.stringify(process.argv.slice(1)));process.stderr.write('stderr-only')",
          'space arg',
          '',
          'literal; $(not-a-shell-command)',
        ],
        AbortSignal.timeout(15_000),
        {
          timeoutMs: 5_000,
          environment: {},
          environmentAllowlist: [],
          protectedPaths: [],
          confinement: null,
        },
      )
      expect(result).toEqual({
        stdout: JSON.stringify(['space arg', '', 'literal; $(not-a-shell-command)']),
        stderr: 'stderr-only',
        exitCode: 0,
        truncated: false,
      })
    } finally {
      await backend?.dispose?.()
      await rm(root, { recursive: true, force: true })
    }
  },
  30_000,
)

test('execArgv resolves a B PATH executable while leaving PATH out of the child environment', async () => {
  if (process.platform === 'win32') return
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-argv-path-'))
  let backend: Awaited<ReturnType<typeof createManagedNodeBackend>> | undefined
  try {
    backend = await createManagedNodeBackend({ dataRoot: join(root, 'node'), backend: 'windows-restricted' })
    const execArgv = backend.execArgv
    if (!execArgv) throw new Error('Managed backend does not provide argv execution')
    const result = await execArgv(root, ['printf', '%s', 'resolved-from-B'], AbortSignal.timeout(15_000), {
      timeoutMs: 5_000,
      environment: {},
      environmentAllowlist: [],
      protectedPaths: [],
      confinement: null,
    })
    expect(result).toEqual({ stdout: 'resolved-from-B', stderr: '', exitCode: 0, truncated: false })
  } finally {
    await backend?.dispose?.()
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
