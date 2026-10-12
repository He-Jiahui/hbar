import { afterEach, describe, expect, it } from 'vitest'
import { ConversationHorizontalScrollMemory } from './conversation-horizontal-scroll'

function row(text: string, adjacentText = 'message context', adjacentCode?: string) {
  const element = document.createElement('div')
  element.innerHTML = `<article data-message-id="message"><div data-lumen-part="message.body"><pre>${text}</pre><p>${adjacentText}</p>${adjacentCode === undefined ? '' : `<pre>${adjacentCode}</pre>`}</div></article>`
  const scrollables = element.querySelectorAll('pre')
  const scrollable = scrollables[0]
  if (!(scrollable instanceof HTMLElement)) throw new Error('Expected a nested scrollable block')
  for (const candidate of scrollables) {
    Object.defineProperties(candidate, {
      clientWidth: { configurable: true, value: 100 },
      scrollWidth: { configurable: true, value: 900 },
    })
  }
  return { element, scrollable }
}

describe('virtual conversation horizontal scroll memory', () => {
  const memories: ConversationHorizontalScrollMemory[] = []
  const createMemory = () => {
    const memory = new ConversationHorizontalScrollMemory()
    memories.push(memory)
    return memory
  }
  afterEach(() => {
    for (const memory of memories.splice(0)) memory.dispose()
  })

  it('restores nested public-part scroll state for a matching conversation and message', () => {
    const memory = createMemory()
    const original = row('table row with a long code block')
    original.scrollable.scrollLeft = 5548
    memory.mount('session-a', 'message', original.element)
    memory.capture('session-a', 'message', original.element, original.scrollable)
    memory.unmount('session-a', 'message', original.element)

    const replacement = row('table row with a long code block')
    memory.mount('session-a', 'message', replacement.element)

    expect(replacement.scrollable.scrollLeft).toBe(5548)
  })

  it('rejects a replacement whose content changed even when its message id and shape stayed the same', () => {
    const memory = createMemory()
    const original = row('earlier message content')
    original.scrollable.scrollLeft = 300
    memory.mount('session-a', 'message', original.element)
    memory.capture('session-a', 'message', original.element, original.scrollable)
    memory.unmount('session-a', 'message', original.element)

    const replacement = row('updated message content')
    memory.mount('session-a', 'message', replacement.element)

    expect(replacement.scrollable.scrollLeft).toBe(0)
  })

  it('retains an unchanged scrollable block when adjacent prose changes', () => {
    const memory = createMemory()
    const original = row('unchanged code', 'earlier prose')
    original.scrollable.scrollLeft = 300
    memory.mount('session-a', 'message', original.element)
    memory.capture('session-a', 'message', original.element, original.scrollable)
    memory.unmount('session-a', 'message', original.element)

    const replacement = row('unchanged code', 'updated prose')
    memory.mount('session-a', 'message', replacement.element)

    expect(replacement.scrollable.scrollLeft).toBe(300)
  })

  it('restores an unchanged table while adjacent code content changes', () => {
    const memory = createMemory()
    const original = row('table stays the same', 'same prose', 'earlier code')
    const originalCode = original.element.querySelectorAll('pre')[1]
    if (!(originalCode instanceof HTMLElement)) throw new Error('Expected the adjacent code block')
    original.scrollable.scrollLeft = 5548
    originalCode.scrollLeft = 480
    memory.mount('session-a', 'message', original.element)
    memory.capture('session-a', 'message', original.element, original.scrollable)
    memory.unmount('session-a', 'message', original.element)

    const replacement = row('table stays the same', 'same prose', 'expanded code content')
    const replacementCode = replacement.element.querySelectorAll('pre')[1]
    if (!(replacementCode instanceof HTMLElement)) throw new Error('Expected the changed code block')
    memory.mount('session-a', 'message', replacement.element)

    expect(replacement.scrollable.scrollLeft).toBe(5548)
    expect(replacementCode.scrollLeft).toBe(0)
  })

  it('isolates conversation keys and evicts the least recently used row above capacity', () => {
    const memory = createMemory()
    const original = row('same content')
    original.scrollable.scrollLeft = 200
    memory.mount('session-a', 'shared-id', original.element)
    memory.capture('session-a', 'shared-id', original.element, original.scrollable)
    memory.unmount('session-a', 'shared-id', original.element)
    memory.mount('session-b', 'shared-id', original.element)
    memory.capture('session-b', 'shared-id', original.element, original.scrollable)
    memory.unmount('session-b', 'shared-id', original.element)
    const recent = row('same content')
    memory.mount('session-a', 'shared-id', recent.element)
    memory.unmount('session-a', 'shared-id', recent.element)

    for (let index = 0; index < 127; index += 1) {
      const candidate = row(`message ${index}`)
      candidate.scrollable.scrollLeft = index + 1
      memory.mount('session-a', `message-${index}`, candidate.element)
      memory.capture('session-a', `message-${index}`, candidate.element, candidate.scrollable)
      memory.unmount('session-a', `message-${index}`, candidate.element)
    }

    const retained = row('same content')
    memory.mount('session-a', 'shared-id', retained.element)
    memory.unmount('session-a', 'shared-id', retained.element)
    expect(retained.scrollable.scrollLeft).toBe(200)

    const evicted = row('same content')
    memory.mount('session-b', 'shared-id', evicted.element)
    memory.unmount('session-b', 'shared-id', evicted.element)
    expect(evicted.scrollable.scrollLeft).toBe(0)
  })

  it('clears snapshots when the owning conversation is disposed', () => {
    const memory = createMemory()
    const original = row('same content')
    original.scrollable.scrollLeft = 200
    memory.mount('session-a', 'message', original.element)
    memory.capture('session-a', 'message', original.element, original.scrollable)
    memory.unmount('session-a', 'message', original.element)
    memory.dispose()

    const replacement = row('same content')
    memory.mount('session-a', 'message', replacement.element)
    expect(replacement.scrollable.scrollLeft).toBe(0)
  })

  it('reactivates after strict effect cleanup and ignores a late event from the detached row', () => {
    const memory = createMemory()
    const detached = row('same content')
    detached.scrollable.scrollLeft = 100
    memory.mount('session-a', 'message', detached.element)
    memory.capture('session-a', 'message', detached.element, detached.scrollable)
    memory.unmount('session-a', 'message', detached.element)
    memory.dispose()

    const current = row('same content')
    memory.mount('session-a', 'message', current.element)
    detached.scrollable.scrollLeft = 700
    memory.capture('session-a', 'message', detached.element, detached.scrollable)
    current.scrollable.scrollLeft = 250
    memory.capture('session-a', 'message', current.element, current.scrollable)
    memory.unmount('session-a', 'message', current.element)

    const remounted = row('same content')
    memory.mount('session-a', 'message', remounted.element)
    expect(remounted.scrollable.scrollLeft).toBe(250)
  })
})
