import { describe, expect, test } from 'bun:test'
import {
  acknowledgeComposerDraftValue,
  normalizeComposerDraft,
  normalizeComposerDrafts,
  type ComposerDraft,
} from './composer-draft'

function artifact(seed: string) {
  return { id: seed.padEnd(64, '0'), name: `${seed}.txt`, mime: 'text/plain', size: 1 }
}

describe('composer drafts', () => {
  test('migrates legacy text drafts and drops malformed persisted attachments', () => {
    const drafts = normalizeComposerDrafts({
      legacy: 'Keep this note',
      current: {
        text: 'With context',
        images: [artifact('a'), { id: 'invalid' }],
        files: [artifact('b')],
      },
      invalid: 42,
    })

    expect(drafts.legacy).toEqual({ text: 'Keep this note', images: [], files: [] })
    expect(drafts.current).toEqual({ text: 'With context', images: [artifact('a')], files: [artifact('b')] })
    expect(drafts.invalid).toEqual({ text: '', images: [], files: [] })
  })

  test('keeps the total attachment count bounded while normalizing a draft', () => {
    const attachments = Array.from({ length: 12 }, (_, index) => artifact(index.toString(16)))
    const draft = normalizeComposerDraft({ text: 'bounded', images: attachments.slice(0, 8), files: attachments.slice(8) })
    expect(draft.images).toHaveLength(8)
    expect(draft.files).toHaveLength(4)
  })

  test('acknowledges only the submitted copy and keeps a newer draft', () => {
    const sent: ComposerDraft = { text: 'submitted', images: [artifact('a')], files: [artifact('b')] }
    const current: ComposerDraft = {
      text: 'new text while the request was pending',
      images: [artifact('a'), artifact('c')],
      files: [artifact('b'), artifact('d')],
    }

    expect(acknowledgeComposerDraftValue(current, sent)).toEqual({
      text: 'new text while the request was pending',
      images: [artifact('c')],
      files: [artifact('d')],
    })
    expect(acknowledgeComposerDraftValue(sent, sent)).toBeNull()
  })
})
