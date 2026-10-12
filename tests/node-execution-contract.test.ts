import { expect, test } from 'bun:test'
import { NODE_PROCESS_FINGERPRINT, nodeProcessInputSchema } from '../apps/node/src/execution-contract'

const base = {
  workspace: '/work/tree',
  timeoutMs: 5_000,
  environment: { LANG: 'C' },
  confinement: null,
  protectedPaths: [],
}

test('internal argv execution preserves empty arguments and rejects invalid or oversized payloads', () => {
  expect(
    nodeProcessInputSchema.parse({
      ...base,
      operation: { kind: 'argv', argv: ['git', 'status', '', 'a path with spaces'] },
    }).operation,
  ).toEqual({ kind: 'argv', argv: ['git', 'status', '', 'a path with spaces'] })

  expect(() => nodeProcessInputSchema.parse({ ...base, operation: { kind: 'argv', argv: ['', 'status'] } })).toThrow()
  expect(() =>
    nodeProcessInputSchema.parse({ ...base, operation: { kind: 'argv', argv: ['git', 'bad\0arg'] } }),
  ).toThrow()
  expect(() =>
    nodeProcessInputSchema.parse({ ...base, operation: { kind: 'argv', argv: ['git', 'x'.repeat(16_001)] } }),
  ).toThrow()
  expect(() =>
    nodeProcessInputSchema.parse({ ...base, operation: { kind: 'argv', argv: ['git', 'é'.repeat(32_768)] } }),
  ).toThrow()
  const tooManyArguments = Array.from({ length: 128 }, () => 'x')
  expect(() =>
    nodeProcessInputSchema.parse({
      ...base,
      operation: { kind: 'argv', argv: ['git', ...tooManyArguments] },
    }),
  ).toThrow()
  expect(NODE_PROCESS_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/)
})
