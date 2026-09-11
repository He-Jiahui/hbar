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

test('documentation link checks include security and GitHub Markdown sources', async () => {
  const root = await fixture()
  await mkdir(join(root, '.github'), { recursive: true })
  await writeFile(join(root, 'SECURITY.md'), '[security guide](docs/security.md)\n')
  await writeFile(join(root, '.github', 'pull_request_template.md'), '[contributing](../CONTRIBUTING.md)\n')
  await writeFile(join(root, 'CONTRIBUTING.md'), '# Contributing\n')
  await writeFile(join(root, 'docs', 'security.md'), '# Security\n')

  expect(await checkDocumentationLinks(root)).toEqual([])
})

test('the repository Wiki navigation exposes every page', async () => {
  const problems = await checkDocumentationLinks(join(import.meta.dir, '..'))
  expect(problems.filter((problem) => problem.message.includes('Wiki page is not linked'))).toEqual([])
})

test('Wiki navigation reports an orphaned page', async () => {
  const root = await fixture()
  const wiki = join(root, 'docs', 'wiki')
  await mkdir(wiki, { recursive: true })
  await writeFile(join(wiki, 'Home.md'), '# Home\n\n[Home](Home.md)\n')
  await writeFile(join(wiki, '_Sidebar.md'), '- [Home](Home.md)\n')
  await writeFile(join(wiki, 'Orphan.md'), '# Orphan\n')

  expect(await checkDocumentationLinks(root)).toEqual([
    {
      sourcePath: 'docs/wiki/_Sidebar.md',
      target: 'Orphan.md',
      message: 'Wiki page is not linked from Home.md or _Sidebar.md',
    },
  ])
})
