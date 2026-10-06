import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createSkillImportService } from '@hbar/kernel/skill-import'
async function cleanup(root: string) {
  const path = await realpath(root)
  if (
    dirname(path).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(path).startsWith('hbar-skill-assets-')
  )
    throw new Error('Invalid asset test root')
  await rm(path, { recursive: true, force: true })
}
test('preview refuses linked assets and bounds each skill before publication', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-skill-assets-'))
  const source = join(root, 'source'),
    destination = join(root, 'destination')
  const service = createSkillImportService({ destination, journalRoot: join(root, 'journal') })
  try {
    await mkdir(join(source, 'linked'), { recursive: true })
    await mkdir(join(source, 'too-many'), { recursive: true })
    await mkdir(join(root, 'outside'))
    await writeFile(join(source, 'linked', 'SKILL.md'), '# Linked skill')
    await writeFile(join(source, 'too-many', 'SKILL.md'), '# Large skill')
    await symlink(join(root, 'outside'), join(source, 'linked', 'assets'), 'junction')
    for (let i = 0; i < 256; i++) await writeFile(join(source, 'too-many', `file-${i}.txt`), 'asset')
    const preview = await service.preview({ source: 'claude', sourceRoot: source })
    expect(preview.candidates.find((candidate) => candidate.id === 'linked')).toMatchObject({
      status: 'invalid',
      warnings: ['unsafe_file'],
    })
    expect(preview.candidates.find((candidate) => candidate.id === 'too-many')).toMatchObject({
      status: 'invalid',
      warnings: ['file_limit'],
    })
    expect(preview.candidates.some((candidate) => candidate.status === 'ready')).toBe(false)
  } finally {
    await service.dispose()
    await cleanup(root)
  }
})
