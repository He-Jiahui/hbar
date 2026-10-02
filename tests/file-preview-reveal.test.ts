import { expect, test } from 'bun:test'
import { fileRevealOffsets } from '../packages/app-react/src/file-preview-reveal'

test('file reveal clamps to actual text while preserving one-based line and column semantics', () => {
  expect(fileRevealOffsets('one\ntwo\n三🙂行\n', { line: 2 })).toEqual({ line: 2, start: 4, end: 7, column: 0 })
  expect(fileRevealOffsets('one\ntwo\n三🙂行\n', { line: 3, column: 3 })).toEqual({
    line: 3,
    start: 10,
    end: 10,
    column: 2,
  })
  expect(fileRevealOffsets('one\ntwo', { line: 100, column: 100 })).toEqual({ line: 2, start: 7, end: 7, column: 3 })
  expect(fileRevealOffsets('', { line: 2 })).toEqual({ line: 1, start: 0, end: 0, column: 0 })
})
