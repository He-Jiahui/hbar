import { expect, test } from 'bun:test'
import { captureFileReviewFocus } from '../packages/app-react/src/file-review-focus'

function fixture(composer: string | null = 'composer') {
  let active: string | null = 'submit'
  let current = true
  const available = new Set(['composer', 'line'])
  const focused: string[] = []
  const finish = captureFileReviewFocus({
    composer,
    line: 'line',
    active: () => active,
    inEditor: (node) => node === 'submit' || node === 'note',
    current: () => current,
    usable: (node) => available.has(node),
    focus: (node) => {
      focused.push(node)
      active = node
    },
  })
  return {
    finish,
    available,
    focused,
    active: (node: string | null) => {
      active = node
    },
    stale: () => {
      current = false
    },
  }
}

test('a confirmed diff review continues in its visible source composer, not the line', () => {
  const f = fixture()
  f.active(null) // The committed note editor is removed during render.
  f.finish()
  expect(f.focused).toEqual(['composer'])
})

test('a hidden or absent composer retains the diff reader as the fallback, without navigation', () => {
  for (const composer of ['composer', null]) {
    const f = fixture(composer)
    f.available.delete('composer')
    f.finish()
    expect(f.focused).toEqual(['line'])
  }
})

test('another deliberate focus target, changed owner or detached reader is never overwritten', () => {
  const moved = fixture()
  moved.active('search')
  moved.finish()
  expect(moved.focused).toEqual([])
  const stale = fixture()
  stale.stale()
  stale.finish()
  expect(stale.focused).toEqual([])
  const detached = fixture()
  detached.available.clear()
  detached.finish()
  expect(detached.focused).toEqual([])
})

test('focus remaining in the same inline editor is still the original interaction', () => {
  const f = fixture()
  f.active('note')
  f.finish()
  expect(f.focused).toEqual(['composer'])
})
