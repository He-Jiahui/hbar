import { expect, test } from 'bun:test'
import { EditorState } from '@codemirror/state'
import { mapMentionSpans } from '../packages/app-react/src/composer-mention-model'

const mention = { start: 7, end: 15, label: 'file.ts', path: 'src/file.ts', workspaceId: 'w1', directory: false }
const state = EditorState.create({ doc: 'Review @file.ts' })

test('prefix typing and paste move true mention ranges using UTF-16 offsets', () => {
  const before = state.update({ changes: { from: 0, insert: '😀 pasted ' } })
  expect(mapMentionSpans([mention], before.changes)).toEqual([{ ...mention, start: 17, end: 25 }])
  const after = state.update({ changes: { from: 15, insert: ' suffix' } })
  expect(mapMentionSpans([mention], after.changes)).toEqual([mention])
})

test('editing within or across a pill removes authority; equivalent plain text does not restore it', () => {
  for (const changes of [
    { from: 8, to: 10, insert: '' },
    { from: 7, to: 15, insert: '@file.ts' },
    { from: 10, insert: 'x' },
    { from: 0, to: 15, insert: 'Review @file.ts' },
  ]) {
    const transaction = state.update({ changes })
    expect(mapMentionSpans([mention], transaction.changes)).toEqual([])
  }
})
