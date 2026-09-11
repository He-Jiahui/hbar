import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkDocumentationLinks } from '../scripts/check-doc-links'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })))
})

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'hbar-doc-links-'))
  roots.push(root)
  await mkdir(join(root, 'docs'), { recursive: true })
  return root
}

test('documentation link checks accept existing files, anchors, and external URLs', async () => {
  const root = await fixture()
  await writeFile(join(root, 'README.md'), '[guide](docs/guide.md)\n[project](https://example.com/project)\n')
  await writeFile(join(root, 'docs', 'guide.md'), '[asset](asset.png)\n[section](#details)\n')
  await writeFile(join(root, 'docs', 'asset.png'), '')

  expect(await checkDocumentationLinks(root)).toEqual([])
})

test('documentation link checks identify missing, escaped, and malformed local targets', async () => {
  const root = await fixture()
  await writeFile(
    join(root, 'docs', 'guide.md'),
    '[missing](missing.md)\n[outside](../../outside.md)\n[malformed](bad%ZZ.md)\n',
  )

  expect(await checkDocumentationLinks(root)).toEqual([
    { sourcePath: 'docs/guide.md', target: 'missing.md', message: 'target does not exist' },
    { sourcePath: 'docs/guide.md', target: '../../outside.md', message: 'link resolves outside the repository' },
    { sourcePath: 'docs/guide.md', target: 'bad%ZZ.md', message: 'link contains invalid percent encoding' },
  ])
})
