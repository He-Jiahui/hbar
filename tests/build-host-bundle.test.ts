import { expect, test } from 'bun:test'
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { writeBundleArtifacts } from '../scripts/build-host-bundle'

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
