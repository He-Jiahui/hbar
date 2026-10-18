import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { HbarError } from '@hbar/contracts/errors'
import type { RuntimeBuildUnit } from '@hbar/runtime'
import type { RuntimeProcessTree, RuntimeProcessTreePort } from '@hbar/contracts/runtime'
import { RuntimeArtifactStore } from '@hbar/runtime'
import { createRuntimeProcessTreePort } from '@hbar/runtime-native'
import { HostRuntimeCompiler } from '../apps/host/src/runtime-compiler'
import { hostRuntimeBuildProcessCommand } from '../apps/host/src/runtime-package'
import { buildHostBundle } from '../scripts/build-host-bundle'
import { HOST_BUNDLE_ENTRIES } from '../scripts/host-bundle-entries'

const testWindows = process.platform === 'win32' ? test : test.skip
async function fixture(
  body: (root: string, store: RuntimeArtifactStore, unit: RuntimeBuildUnit) => Promise<void>,
): Promise<void> {
  const parent = await realpath(join(process.cwd(), 'artifacts'))
  const root = await mkdtemp(join(parent, 'host-compiler-'))
  const canonical = await realpath(root)
  if (dirname(canonical) !== parent || !basename(canonical).startsWith('host-compiler-'))
    throw new Error('Unowned compiler fixture')
  await writeFile(join(root, 'unit.ts'), 'export const revision = 1\n')
  const unit: RuntimeBuildUnit = {
    descriptor: {
      id: 'fixture',
      kind: 'plugin',
      isolation: 'process',
      required: true,
      reloadable: true,
      dependencies: [],
      contractFingerprint: 'a'.repeat(64),
      storageSchema: 24,
    },
    entrypoint: 'unit.ts',
  }
  try {
    await body(root, new RuntimeArtifactStore(join(root, 'artifacts'), root), unit)
  } finally {
    await rm(canonical, { recursive: true, force: true })
  }
}

testWindows(
  'trusted Worker selection and production source bootstrap produce identical immutable artifacts',
  async () => {
    await fixture(async (_root, store, unit) => {
      const worker = new HostRuntimeCompiler({ mode: 'worker' })
      const compiler = new HostRuntimeCompiler({
        mode: 'process',
        processTree: createRuntimeProcessTreePort(),
        command: hostRuntimeBuildProcessCommand(),
      })
      try {
        await compiler.prepare()
        const expected = await worker.build(store, unit, new AbortController().signal)
        const actual = await compiler.build(store, unit, new AbortController().signal)
        expect(actual).toEqual(expected)
        expect(worker.snapshot()).toBeUndefined()
        expect(compiler.snapshot()).toMatchObject({
          closed: false,
          jobs: [],
          receipts: [{ unitId: 'fixture', exitCode: 0, activeProcesses: 0, nativeClosed: true, nativeJoined: true }],
        })
        const before = compiler.snapshot()
        for (let read = 0; read < 20; read++) expect(compiler.snapshot()).toEqual(before)
      } finally {
        await compiler.close()
        await worker.close()
      }
      await expect(compiler.build(store, unit, new AbortController().signal)).rejects.toMatchObject({
        code: 'RUNTIME_CANCELLED',
      })
    })
  },
  30_000,
)

for (const closeFirst of [false, true])
  testWindows(
    `Host retains UNKNOWN through ${closeFirst ? 'shutdown' : 'preparation'} without spawning a fallback`,
    async () => {
      await fixture(async (_root, store, unit) => {
        const native = createRuntimeProcessTreePort()
        let fault = true,
          attaches = 0
        const nativeTrees: RuntimeProcessTree[] = []
        const port: RuntimeProcessTreePort = {
          environment: native.environment,
          async attach(pid, signal) {
            attaches++
            const tree = await native.attach(pid, signal)
            nativeTrees.push(tree)
            return {
              terminate: () => tree.terminate(),
              join: (timeout) => tree.join(timeout),
              close: () => tree.close(),
              active() {
                if (fault) throw new HbarError('RUNTIME_PROCESS_TREE_UNCONFIRMED', 'Owned active-count fault')
                const count = tree.active?.()
                if (count === undefined) throw new Error('Exact Windows active count required')
                return count
              },
            }
          },
        }
        const compiler = new HostRuntimeCompiler({
          mode: 'process',
          processTree: port,
          command: hostRuntimeBuildProcessCommand(),
        })
        try {
          await expect(compiler.build(store, unit, new AbortController().signal)).rejects.toMatchObject({
            code: 'RUNTIME_BUILD_EXIT_TIMEOUT',
          })
          const unknown = compiler.snapshot()
          expect(unknown?.jobs).toHaveLength(1)
          expect(unknown?.receipts).toEqual([])
          if (closeFirst) await expect(compiler.close()).rejects.toMatchObject({ code: 'RUNTIME_BUILD_EXIT_TIMEOUT' })
          else await expect(compiler.prepare()).rejects.toMatchObject({ code: 'RUNTIME_BUILD_EXIT_TIMEOUT' })
          await expect(compiler.build(store, unit, new AbortController().signal)).rejects.toMatchObject({
            code: closeFirst ? 'RUNTIME_CANCELLED' : 'RUNTIME_BUILD_EXIT_TIMEOUT',
          })
          expect(attaches).toBe(1)
          expect(compiler.snapshot()?.jobs[0]?.jobId).toBe(unknown?.jobs[0]?.jobId)
          fault = false
          if (closeFirst) await compiler.reconcile()
          else await compiler.prepare()
          expect(compiler.snapshot()?.jobs).toEqual([])
          expect(attaches).toBe(1)
          if (!closeFirst)
            expect((await compiler.build(store, unit, new AbortController().signal)).unitId).toBe('fixture')
        } finally {
          fault = false
          await compiler.close()
          expect(compiler.snapshot()?.jobs).toEqual([])
          // Exact original native handles remain owned by the compiler until its close succeeds.
          expect(nativeTrees).toHaveLength(attaches)
        }
      })
    },
    30_000,
  )

testWindows(
  'desktop emits the complete compiler bootstrap and explicit standalone commands receive no Bun flags',
  async () => {
    await fixture(async (root, store, unit) => {
      const entry = HOST_BUNDLE_ENTRIES.find(([, name]) => name === 'runtime-build-entry.js')
      if (!entry) throw new Error('Production desktop compiler entry missing')
      const output = join(root, 'relocated')
      await buildHostBundle(entry[0], entry[1], output)
      const compiler = new HostRuntimeCompiler({
        mode: 'process',
        processTree: createRuntimeProcessTreePort(),
        command: [process.execPath, '--smol', join(output, entry[1])],
      })
      let expected: string
      try {
        expected = (await compiler.build(store, unit, new AbortController().signal)).id
        expect(compiler.snapshot()?.jobs).toEqual([])
      } finally {
        await compiler.close()
      }
      const executable = join(root, 'compiler.exe')
      const built = await Bun.build({
        entrypoints: [resolve('tests/fixtures/host-compiler-standalone.ts')],
        target: 'bun',
        compile: { outfile: executable },
      })
      if (!built.success) throw new AggregateError(built.logs, 'Standalone compiler fixture build failed')
      const standalone = new HostRuntimeCompiler({
        mode: 'process',
        processTree: createRuntimeProcessTreePort(),
        command: [executable, 'compile'],
      })
      try {
        expect((await standalone.build(store, unit, new AbortController().signal)).id).toBe(expected)
      } finally {
        await standalone.close()
      }
      const check = Bun.spawn([executable, 'default-command'], {
        cwd: root,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        windowsHide: true,
        timeout: 10_000,
      })
      const [code, stdout, stderr] = await Promise.all([
        check.exited,
        new Response(check.stdout).text(),
        new Response(check.stderr).text(),
      ])
      expect({ code, stdout, stderr }).toEqual({ code: 0, stdout: '{"explicitCommandRequired":true}', stderr: '' })
    })
  },
  60_000,
)
