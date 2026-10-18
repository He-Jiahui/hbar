import { expect, test } from 'bun:test'
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { HbarError } from '@hbar/contracts/errors'
import { z } from 'zod'
import type { RuntimeProcessTreePort } from '@hbar/contracts/runtime'
import type { RuntimeArtifact } from '@hbar/runtime'
import { createRuntimeProcessTreePort } from '@hbar/runtime-native'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { hostRuntimeBuildUnits } from '../apps/host/src/runtime-build'
import { hostRuntimeBuildProcessCommand } from '../apps/host/src/runtime-package'

const testWindows = process.platform === 'win32' ? test : test.skip
async function until(check: () => boolean | Promise<boolean>): Promise<void> {
  const end = Date.now() + 30_000
  while (!(await check())) {
    if (Date.now() >= end) throw new Error('Host compiler fixture did not settle')
    await Bun.sleep(10)
  }
}
async function fixture(body: (root: string) => Promise<void>): Promise<void> {
  const parent = await realpath(resolve('artifacts'))
  const root = await mkdtemp(join(parent, 'process-host-compiler-'))
  const canonical = await realpath(root)
  if (dirname(canonical) !== parent || !basename(canonical).startsWith('process-host-compiler-'))
    throw new Error('Unowned Host compiler fixture')
  try {
    await body(root)
  } finally {
    await rm(canonical, { recursive: true, force: true })
  }
}

testWindows(
  'one Host owner covers initial, base ownership and changed units; UNKNOWN prevents another dispatch',
  async () => {
    await fixture(async (root) => {
      const source = join(root, 'browser.ts')
      const original = resolve('apps/host/src/runtime-browser-process.ts').replaceAll('\\', '/')
      const revision = (value: number) =>
        `export { create } from '${original}'\nexport const compilerRevision = ${value}\n`
      await writeFile(source, revision(1))
      const units = hostRuntimeBuildUnits().map((unit) =>
        unit.descriptor.id === 'plugin.browser' ? { ...unit, entrypoint: source } : unit,
      )
      const native = createRuntimeProcessTreePort()
      let fault = false,
        attaches = 0
      const port: RuntimeProcessTreePort = {
        environment: native.environment,
        async attach(pid, signal) {
          attaches++
          const tree = await native.attach(pid, signal)
          return {
            terminate: () => tree.terminate(),
            join: (timeout) => tree.join(timeout),
            active() {
              const count = tree.active?.()
              if (count === undefined) throw new Error('Exact active count required')
              return count
            },
            close() {
              if (fault) throw new HbarError('RUNTIME_PROCESS_TREE_UNCONFIRMED', 'Owned close fault')
              tree.close()
            },
          }
        },
      }
      const runtime = await ProcessHostRuntime.create({
        layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
        sourceRoot: process.cwd(),
        workspace: root,
        demo: true,
        noLocalExec: true,
        secrets: new MemorySecrets(),
        buildUnits: units,
        watchSource: true,
        autoApplySource: false,
        compiler: { mode: 'process', processTree: port, command: hostRuntimeBuildProcessCommand() },
      })
      try {
        const initial = runtime.compilerSnapshot()
        expect(initial?.jobs).toEqual([])
        expect(initial?.receipts).toHaveLength(16)
        expect(initial?.receipts.map((receipt) => receipt.unitId).sort()).toEqual(
          [...units.map((unit) => unit.descriptor.id), 'base'].sort(),
        )
        expect(
          initial?.receipts.every(
            (receipt) =>
              receipt.exitCode === 0 && receipt.nativeJoined && receipt.activeProcesses === 0 && receipt.nativeClosed,
          ),
        ).toBe(true)
        const base = initial?.receipts.find((receipt) => receipt.unitId === 'base')
        expect(base?.childPid).toBeGreaterThan(0)
        const initialIds = new Set(
          runtime.artifacts
            .preparedSets()
            .flatMap((id) => runtime.artifacts.artifactSet(id).artifacts.map((artifact) => artifact.id)),
        )
        let baseArtifact: RuntimeArtifact | undefined
        const directories = (await readdir(runtime.artifacts.root, { withFileTypes: true })).filter(
          (entry) => entry.isDirectory() && /^[a-f0-9]{64}$/.test(entry.name),
        )
        expect(directories.length).toBeLessThanOrEqual(32)
        for (const directory of directories) {
          const raw: unknown = JSON.parse(
            await readFile(join(runtime.artifacts.root, directory.name, 'manifest.json'), 'utf8'),
          )
          if (z.object({ unitId: z.string() }).parse(raw).unitId === 'base')
            baseArtifact = await runtime.artifacts.get(directory.name)
        }
        if (!baseArtifact) throw new Error('Base compiler ownership artifact missing')
        expect(baseArtifact.files.some((file) => file.name === 'runtime-build-entry.js')).toBe(true)
        expect(runtime.artifacts.affected(['apps/host/src/runtime-build-entry.ts'], [baseArtifact])).toEqual(['base'])
        expect(runtime.artifacts.affected(['packages/runtime/src/build-process-service.ts'], [baseArtifact])).toEqual([
          'base',
        ])
        const before = JSON.stringify(runtime.compilerSnapshot())
        for (let read = 0; read < 20; read++) {
          runtime.snapshot()
          runtime.compilerSnapshot()
        }
        expect(JSON.stringify(runtime.compilerSnapshot())).toBe(before)
        expect(attaches).toBe(16)
        const changedPath = relative(process.cwd(), source).replaceAll('\\', '/')
        await writeFile(source, revision(2))
        await runtime.applySourceChanges([changedPath])
        expect(runtime.compilerSnapshot()?.receipts).toHaveLength(17)
        const changed = runtime.artifacts
          .preparedSets()
          .flatMap((id) => runtime.artifacts.artifactSet(id).artifacts)
          .find((artifact) => artifact.unitId === 'plugin.browser' && !initialIds.has(artifact.id))
        if (!changed) throw new Error('Changed source was not prepared')
        const immutable = await readFile(await runtime.artifacts.modulePath(changed.id))
        fault = true
        await writeFile(source, revision(3))
        await runtime.applySourceChanges([changedPath])
        const unresolved = runtime.compilerSnapshot()
        expect(unresolved?.jobs).toHaveLength(1)
        expect(attaches).toBe(18)
        await runtime.applySourceChanges([changedPath])
        expect(attaches).toBe(18)
        expect(runtime.compilerSnapshot()?.jobs[0]?.jobId).toBe(unresolved?.jobs[0]?.jobId)
        expect(await readFile(await runtime.artifacts.modulePath(changed.id))).toEqual(immutable)
        fault = false
        await runtime.reconcileCompiler()
        expect(runtime.compilerSnapshot()?.jobs).toEqual([])
        expect(attaches).toBe(18)
        await writeFile(source, revision(4))
        await runtime.applySourceChanges([changedPath])
        expect(attaches).toBe(19)
        expect(runtime.compilerSnapshot()?.jobs).toEqual([])
        expect(await readFile(await runtime.artifacts.modulePath(changed.id))).toEqual(immutable)
      } finally {
        fault = false
        await runtime.reconcileCompiler()
        await runtime.close()
        expect(runtime.compilerSnapshot()).toMatchObject({ closed: true, jobs: [] })
      }
    })
  },
  90_000,
)

testWindows(
  'Host shutdown aborts actually dispatched initial compilers and closes their native ownership',
  async () => {
    await fixture(async (root) => {
      const runtime = await ProcessHostRuntime.open({
        layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
        sourceRoot: process.cwd(),
        secrets: new MemorySecrets(),
        noLocalExec: true,
        compiler: {
          mode: 'process',
          processTree: createRuntimeProcessTreePort(),
          command: [process.execPath, '--smol', resolve('tests/fixtures/host-compiler-pending.ts'), root],
        },
      })
      try {
        await until(
          async () =>
            (await Bun.file(join(root, 'dispatched-node-link')).exists()) &&
            (await Bun.file(join(root, 'dispatched-storage')).exists()),
        )
        expect(runtime.compilerSnapshot()?.jobs).toHaveLength(2)
        expect(runtime.compilerSnapshot()?.receipts).toEqual([])
      } finally {
        await runtime.close()
      }
      expect(runtime.compilerSnapshot()).toMatchObject({ closed: true, jobs: [] })
      expect(runtime.compilerSnapshot()?.receipts).toHaveLength(2)
      expect(
        runtime
          .compilerSnapshot()
          ?.receipts.every((receipt) => receipt.nativeJoined && receipt.activeProcesses === 0 && receipt.nativeClosed),
      ).toBe(true)
      expect(runtime.artifacts.preparedSets()).toEqual([])
    })
  },
  30_000,
)
