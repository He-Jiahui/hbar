import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { copyBuildArtifact } from '../scripts/copy-build-artifact'

test('build artifact copies new content but does not rewrite identical loaded binaries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-artifact-copy-'))
  try {
    const source = join(root, 'built.bin')
    const destination = join(root, 'runtime.bin')
    await writeFile(source, 'initial binary')
    expect(await copyBuildArtifact(source, destination)).toBe(true)
    const before = await stat(destination, { bigint: true })
    expect(await copyBuildArtifact(source, destination)).toBe(false)
    expect((await stat(destination, { bigint: true })).mtimeNs).toBe(before.mtimeNs)
    await writeFile(source, 'new binary')
    expect(await copyBuildArtifact(source, destination)).toBe(true)
    expect(await readFile(destination, 'utf8')).toBe('new binary')
    expect(await copyBuildArtifact(join(root, 'missing.bin'), destination).catch(() => 'failed')).toBe('failed')
    expect(await readFile(destination, 'utf8')).toBe('new binary')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
