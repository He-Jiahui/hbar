import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalExecution } from '../plugins/local-tools/src'
import { nodeWorkspaceLocator } from '@hbar/contracts/node-address'

test('safe public read errors preserve raw missing-file mutation semantics, creation, CAS and restore', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-read-write-compat-'))
  const execution = new LocalExecution()
  try {
    await expect(execution.read(root, 'new.txt')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const created = await execution.write(root, 'new.txt', 'first')
    expect(created).toMatchObject({ created: true, before: '', after: 'first' })
    expect(await readFile(join(root, 'new.txt'), 'utf8')).toBe('first')
    await expect(execution.write(root, 'new.txt', 'bad', { expectedRevision: '0'.repeat(64) })).rejects.toMatchObject({
      code: 'FILE_CONFLICT',
    })
    expect(await execution.read(root, 'new.txt')).toBe('first')
    const edited = await execution.write(root, 'new.txt', 'second', { expectedRevision: created.revision })
    expect(edited).toMatchObject({ created: false, before: 'first', after: 'second' })
    expect(await execution.read(root, 'new.txt')).toBe('second')
    await expect(
      execution.write(root, 'never.txt', 'bad', { expectedRevision: created.revision }),
    ).rejects.toMatchObject({ code: 'FILE_CONFLICT' })
    await expect(readFile(join(root, 'never.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    const nested = await execution.write(root, 'nested/new.txt', 'nested')
    expect(nested.created).toBe(true)
    await execution.restoreFiles(
      root,
      [{ path: 'restored.txt', before: 'original', after: null }],
      new AbortController().signal,
    )
    expect(await readFile(join(root, 'restored.txt'), 'utf8')).toBe('original')
    await execution.restoreFiles(
      root,
      [{ path: 'new.txt', before: 'first', after: 'second' }],
      new AbortController().signal,
    )
    expect(await execution.read(root, 'new.txt')).toBe('first')
    await expect(execution.write(root, '../outside.txt', 'forbidden')).rejects.toMatchObject({ code: 'PATH_DENIED' })
    await expect(
      execution.write(nodeWorkspaceLocator('node-fixture', 'root-fixture'), 'new.txt', 'forbidden'),
    ).rejects.toMatchObject({ code: 'WORKSPACE_REMOTE' })
    await writeFile(join(root, 'parent-file'), 'file')
    await expect(execution.write(root, 'parent-file/child', 'bad')).rejects.toMatchObject({ code: 'EEXIST' })
    expect(await readFile(join(root, 'parent-file'), 'utf8')).toBe('file')
  } finally {
    await execution.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
