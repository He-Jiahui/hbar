import { expect, test } from 'bun:test'
import { toolArgumentValue, toolPathArgumentSchema } from '@hbar/contracts/tool-arguments'

test('explicit nested JSON paths preserve literal flat keys and complete path arrays', () => {
  const args = { 'input.path': 'literal.txt', input: { path: 'nested.txt', paths: ['first.txt', 'second.txt'] } }
  expect(toolArgumentValue(args, { field: 'input.path', access: 'write' })).toBe('literal.txt')
  expect(toolArgumentValue(args, { field: 'input.path', fieldPath: ['input', 'path'], access: 'write' })).toBe(
    'nested.txt',
  )
  expect(toolArgumentValue(args, { field: 'paths', fieldPath: ['input', 'paths'], access: 'read' })).toEqual([
    'first.txt',
    'second.txt',
  ])
  expect(
    toolArgumentValue(args, { field: 'missing', fieldPath: ['input', 'missing'], access: 'write' }),
  ).toBeUndefined()
})

test('path metadata is bounded and cannot execute getters or follow inherited input', () => {
  let getters = 0
  const args: Record<string, unknown> = {}
  Object.defineProperty(args, 'input', {
    get() {
      getters++
      return { path: 'hidden.txt' }
    },
  })
  const declaration = { field: 'input.path', fieldPath: ['input', 'path'], access: 'write' as const }
  expect(toolArgumentValue(args, declaration)).toBeUndefined()
  expect(getters).toBe(0)
  const inherited: unknown = Object.create({ path: 'inherited.txt' })
  expect(toolArgumentValue({ input: inherited }, declaration)).toBeUndefined()
  expect(toolPathArgumentSchema.safeParse({ ...declaration, fieldPath: [] }).success).toBe(false)
  expect(toolArgumentValue({ input: 'unbounded' }, { ...declaration, fieldPath: [] })).toBeUndefined()
  expect(
    toolPathArgumentSchema.safeParse({ ...declaration, fieldPath: Array.from({ length: 17 }, () => 'key') }).success,
  ).toBe(false)
  expect(
    toolArgumentValue({}, { field: 'input.path', fieldPath: ['__proto__', 'path'], access: 'write' }),
  ).toBeUndefined()
})
