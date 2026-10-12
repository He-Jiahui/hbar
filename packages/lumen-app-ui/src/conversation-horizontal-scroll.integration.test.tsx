import * as React from 'react'
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ConversationHorizontalScrollMemory } from './conversation-horizontal-scroll'
import { ConversationVirtualMessageRow } from './conversation-virtual-message-row'

function Harness({ visible }: { readonly visible: boolean }) {
  const memory = React.useMemo(() => new ConversationHorizontalScrollMemory(), [])
  React.useEffect(() => () => memory.dispose(), [memory])
  return (
    <React.StrictMode>
      {visible ? (
        <ConversationVirtualMessageRow
          messageId="stable-message"
          index={0}
          count={80}
          measureElement={() => undefined}
          scrollKey="stable-session"
          horizontalScrollMemory={memory}
        >
          <article data-message-id="stable-message" data-lumen-part="conversation.message">
            <div data-lumen-part="message.body">
              <pre>wide table and code content</pre>
            </div>
          </article>
        </ConversationVirtualMessageRow>
      ) : null}
    </React.StrictMode>
  )
}

describe('virtual row horizontal scroll React lifecycle', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('captures and restores across StrictMode effect replay and row unmount/remount', () => {
    const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    const originalScrollWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth')
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get(this: HTMLElement) {
        return this.tagName === 'PRE' ? 100 : 400
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get(this: HTMLElement) {
        return this.tagName === 'PRE' ? 900 : 400
      },
    })
    try {
      const rendered = render(<Harness visible />)
      const original = rendered.container.querySelector('[data-message-id="stable-message"] pre')
      if (!(original instanceof HTMLElement)) throw new Error('Expected the mounted message row')
      original.scrollLeft = 5548

      rendered.rerender(<Harness visible={false} />)
      // Browsers may deliver a queued native scroll event after virtualization
      // detached the row, so it can no longer reach the row capture handler.
      original.dispatchEvent(new Event('scroll', { bubbles: true }))
      rendered.rerender(<Harness visible />)
      const replacement = rendered.container.querySelector('[data-message-id="stable-message"] pre')
      if (!(replacement instanceof HTMLElement)) throw new Error('Expected the remounted message row')
      expect(replacement.scrollLeft).toBe(5548)
    } finally {
      if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth)
      else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
      if (originalScrollWidth) Object.defineProperty(HTMLElement.prototype, 'scrollWidth', originalScrollWidth)
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollWidth')
    }
  })
})
