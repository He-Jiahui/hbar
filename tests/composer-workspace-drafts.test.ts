import { afterEach, expect, test } from 'bun:test'
import { getComposerDraft, moveComposerDraft, updateComposerDraft, useWorkbench } from '../apps/web/src/stores'
import { composerDraftKey } from '../apps/web/src/composer-draft'

const initial = useWorkbench.getState()
afterEach(() => useWorkbench.setState(initial))

test('unsent drafts and late attachments stay in their captured workspace', () => {
  useWorkbench.setState({ workspaceId: 'first', drafts: {} })
  updateComposerDraft(undefined, { text: 'First workspace' }, 'first')
  useWorkbench.setState({ workspaceId: 'second' })
  updateComposerDraft(undefined, { text: 'Second workspace' }, 'second')
  const file = { id: 'a'.repeat(64), name: 'late.txt', mime: 'text/plain', size: 4 }
  updateComposerDraft(undefined, { files: [file] }, 'first')
  expect(getComposerDraft(undefined, 'first')).toEqual({ text: 'First workspace', images: [], files: [file] })
  expect(getComposerDraft(undefined, 'second')).toEqual({ text: 'Second workspace', images: [], files: [] })
  moveComposerDraft(undefined, 'created-session', 'first')
  expect(getComposerDraft('created-session').files).toEqual([file])
  expect(useWorkbench.getState().drafts[composerDraftKey(undefined, 'first')]).toBeUndefined()
  expect(getComposerDraft(undefined, 'second').text).toBe('Second workspace')
})
