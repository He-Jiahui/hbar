import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import { STORAGE_RPC_FINGERPRINT, STORAGE_RPC_METHODS } from '@hbar/storage'

test('the generated Storage handshake covers the current public RPC contract', async () => {
  const path = new URL('../packages/storage/src/types.ts', import.meta.url)
  const source = ts.createSourceFile(path.pathname, await Bun.file(path).text(), ts.ScriptTarget.Latest, true)
  const definition = source.statements.find(statement => ts.isInterfaceDeclaration(statement) && statement.name.text === 'StorageMethods')
  if (!definition || !ts.isInterfaceDeclaration(definition)) throw new Error('StorageMethods is missing')
  const names = definition.members.map(member => {
    if (!member.name || !ts.isIdentifier(member.name)) throw new Error('Storage RPC identity must be static')
    return member.name.text
  })
  expect(names.sort()).toEqual([...STORAGE_RPC_METHODS])
  expect(STORAGE_RPC_FINGERPRINT).toBe(createHash('sha256').update(definition.getText(source).replaceAll(/\s+/g, ' ')).digest('hex'))
})
