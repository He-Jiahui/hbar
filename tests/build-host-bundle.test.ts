import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { buildHostBundle, writeBundleArtifacts } from '../scripts/build-host-bundle'
import { syncHostRuntimeDependencies } from '../scripts/host-runtime-dependencies'

function artifact(path: string, content: string) {
  const blob = new Blob([content])
  return { path, arrayBuffer: () => blob.arrayBuffer() }
}

test('flat memory outputs map to the explicit build directory and skip only identical bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-memory-bundle-'))
  try {
    const output = join(root, 'output')
    await writeBundleArtifacts(output, [artifact('./host.js', 'entry'), artifact('.\\native-hash.node', 'native')])
    expect((await readdir(output)).sort()).toEqual(['host.js', 'native-hash.node'])
    expect(await readFile(join(output, 'native-hash.node'), 'utf8')).toBe('native')
    const before = await stat(join(output, 'native-hash.node'), { bigint: true })
    await writeBundleArtifacts(output, [artifact('.\\native-hash.node', 'native')])
    expect((await stat(join(output, 'native-hash.node'), { bigint: true })).mtimeNs).toBe(before.mtimeNs)
    await writeBundleArtifacts(output, [artifact('./host.js', 'changed entry')])
    expect(await readFile(join(output, 'host.js'), 'utf8')).toBe('changed entry')
    for (const path of [
      '../escape.node',
      '..\\escape.node',
      '/absolute.node',
      'C:\\escape.node',
      'C:escape.node',
      './nested/asset.node',
      './host.js:stream',
      './',
      '.',
      './host.js.',
    ]) {
      await expect(
        writeBundleArtifacts(output, [artifact('./before.js', 'must not write'), artifact(path, 'invalid')]),
      ).rejects.toThrow('Invalid bundle artifact path')
      expect(await Bun.file(join(output, 'before.js')).exists()).toBe(false)
    }
    await expect(
      writeBundleArtifacts(output, [artifact('./host.js', 'one'), artifact('host.js', 'two')]),
    ).rejects.toThrow('Duplicate bundle artifact output')
    expect(await readFile(join(output, 'host.js'), 'utf8')).toBe('changed entry')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test.skipIf(process.platform !== 'win32')(
  'a loaded output native module survives a repeated Host bundle and rejects changed bytes',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-loaded-bundle-'))
    try {
      const child = Bun.spawn([process.execPath, resolve('tests/fixtures/build-host-native-lock.ts'), root], {
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 10_000,
        windowsHide: true,
      })
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      if (exitCode !== 0) throw new Error(`Native bundle fixture failed (${exitCode}): ${stderr}\n${stdout}`)
      const result: unknown = JSON.parse(stdout)
      expect(result).toMatchObject({
        version: '0.1.0',
        unchangedMtime: true,
        unchangedContent: true,
        changedWriteFailed: true,
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
  15_000,
)

test('a relocated Host loads Playwright assets without access to the build workspace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-portable-host-'))
  if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith('hbar-portable-host-'))
    throw new Error('Portable Host cleanup is outside its owned fixture directory')
  try {
    const project = resolve(import.meta.dir, '..')
    const source = join(root, 'source.mjs')
    const output = join(root, 'runtime')
    const unrelated = join(root, 'unrelated-working-directory')
    const guard = join(root, 'block-workspace.mjs')
    await mkdir(unrelated)
    await writeFile(
      source,
      `
      import { chromium } from 'playwright'
      import { createRequire } from 'node:module'
      const require = createRequire(import.meta.url)
      console.log(JSON.stringify({ packageFile: require.resolve('playwright-core/package.json'), executable: chromium.executablePath() }))
    `,
    )
    await writeFile(
      guard,
      `
      import fs from 'node:fs'
      import { resolve, sep } from 'node:path'
      import { fileURLToPath } from 'node:url'
      const blocked = resolve(process.env.HBAR_TEST_BLOCKED_WORKSPACE).toLowerCase() + sep
      const read = fs.readFileSync
      fs.readFileSync = function(path, ...options) {
        const candidate = typeof path === 'number' ? '' : resolve(path instanceof URL ? fileURLToPath(path) : String(path)).toLowerCase()
        if (candidate.startsWith(blocked)) throw new Error('Build workspace is unavailable: ' + candidate)
        return Reflect.apply(read, fs, [path, ...options])
      }
    `,
    )
    await buildHostBundle(source, 'host.js', output)
    await syncHostRuntimeDependencies(project, output)
    const run = async () => {
      const child = Bun.spawn([process.execPath, '--no-install', '--preload', guard, join(output, 'host.js')], {
        cwd: unrelated,
        env: { ...process.env, NODE_PATH: '', HBAR_TEST_BLOCKED_WORKSPACE: project },
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 10000,
        windowsHide: true,
      })
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      return { code, stdout, stderr }
    }
    const relocated = await run()
    if (relocated.code !== 0) throw new Error(`Relocated Host failed: ${relocated.stderr}`)
    const result = z
      .object({ packageFile: z.string(), executable: z.string().min(1) })
      .parse(JSON.parse(relocated.stdout))
    expect(resolve(result.packageFile)).toBe(join(output, 'node_modules', 'playwright-core', 'package.json'))
    await rm(join(output, 'node_modules', 'playwright-core', 'browsers.json'))
    const missingAsset = await run()
    expect(missingAsset.code).not.toBe(0)
    expect(missingAsset.stderr).toContain('browsers.json')
    const bundleBefore = await readFile(join(output, 'host.js'))
    await syncHostRuntimeDependencies(project, output)
    expect((await run()).code).toBe(0)
    expect(await readFile(join(output, 'host.js'))).toEqual(bundleBefore)
    await expect(syncHostRuntimeDependencies(join(root, 'missing-project'), output)).rejects.toThrow()
    expect((await run()).code).toBe(0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 20000)
