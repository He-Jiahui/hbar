import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, screen } from '@mui/internal-test-utils'
import {
  LumenConversation,
  type LumenConversationProps,
  type LumenConversationScrollTarget,
  type LumenConversationScrollTargetResult,
} from './session-components'

const target = (requestId = 'one', scrollKey = 'A', messageId = 'b'): LumenConversationScrollTarget => ({
  requestId,
  scrollKey,
  messageId,
})
const defaults: LumenConversationProps = {
  title: '包含很长本地化名称的对话区域',
  empty: '尚无消息',
  composer: null,
  scrollKey: 'A',
  messages: ['a', 'b'].map((id) => ({
    id,
    role: 'assistant',
    author: '助手',
    avatar: '助',
    copyLabel: '复制',
    children: `正文 ${id}`,
  })),
}
function viewport() {
  const element = screen.getByRole('region', { name: defaults.title }).querySelector('.lumen-conversation-messages')
  if (!(element instanceof HTMLDivElement)) {
    throw new Error('Fixture viewport is absent')
  }
  return element
}
describe('controlled conversation scroll targets', () => {
  const { render, clock } = createRenderer({ clock: 'fake' })
  const settle = (ms = 80) => clock.tickAsync(ms)
  beforeEach(() => {
    document.documentElement.style.fontSize = '16px'
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function mockElementMeasure(
      this: HTMLElement,
    ) {
      return this.classList.contains('lumen-conversation-messages') ? 200 : 100
    })
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mockElementRect(
      this: HTMLElement,
    ) {
      const parent = this.closest('.lumen-conversation-messages')
      if (this.dataset.messageId) {
        return new DOMRect(0, (this.dataset.messageId === 'a' ? 50 : 500) - (parent?.scrollTop ?? 0), 400, 100)
      }
      return new DOMRect(0, 0, 400, 200)
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.documentElement.style.fontSize = ''
  })

  it('keeps the no-target API compatible and has no search-owned callback', async () => {
    const onScrollTargetResult = vi.fn<(result: LumenConversationScrollTargetResult) => void>()
    render(<LumenConversation {...defaults} onScrollTargetResult={onScrollTargetResult} />)
    await settle()
    expect(onScrollTargetResult).not.toHaveBeenCalled()
    expect(screen.getByText('正文 a')).not.to.equal(null)
  })
  it('bounds late end measurements on first load, stream and a new source, then yields to input', async () => {
    let measuredHeight = 800
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => measuredHeight)
    const { setProps } = render(<LumenConversation {...defaults} />)
    await settle(32)
    measuredHeight = 1000
    await settle(32)
    expect(viewport().scrollTop).to.equal(1000)
    measuredHeight = 1200
    setProps({ messages: [...defaults.messages], contentRevision: 'stream' })
    await settle(32)
    expect(viewport().scrollTop).to.equal(1200)
    setProps({ scrollKey: 'B' })
    measuredHeight = 1400
    await settle(32)
    expect(viewport().scrollTop).to.equal(1400)
    await React.act(() => viewport().dispatchEvent(new Event('wheel', { bubbles: true })))
    viewport().scrollTop = 200
    await React.act(() => viewport().dispatchEvent(new Event('scroll', { bubbles: true })))
    measuredHeight = 1600
    await settle(300)
    expect(viewport().scrollTop).to.equal(200)
    setProps({ scrollKey: 'C' })
    await settle(300)
    expect(viewport().scrollTop).to.equal(1600)
    measuredHeight = 1800
    await settle(1000)
    expect(viewport().scrollTop).to.equal(1600)
  })
  it('never converts an explicit non-following reading anchor into a late end intent', async () => {
    let measuredHeight = 800
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => measuredHeight)
    const { setProps } = render(<LumenConversation {...defaults} followLatest={false} />)
    const initialTop = viewport().scrollTop
    measuredHeight = 1000
    await settle(80)
    expect(viewport().scrollTop).to.equal(initialTop)
    setProps({ messages: [...defaults.messages], contentRevision: 'stream' })
    await settle(80)
    expect(viewport().scrollTop).to.equal(initialTop)
    setProps({ followLatest: true })
    measuredHeight = 1200
    await settle(300)
    expect(viewport().scrollTop).to.equal(initialTop)
  })
  it('explicit Latest cancels a pending reading correction outside the scroll viewport', async () => {
    const { setProps } = render(<LumenConversation {...defaults} latestLabel="显示最新内容" followLatest={false} />)
    viewport().scrollTop = 200
    await React.act(() => viewport().dispatchEvent(new Event('scroll', { bubbles: true })))
    setProps({ messages: [...defaults.messages], contentRevision: 'new-content' })
    expect(viewport().scrollTop).to.equal(200)
    await React.act(() => screen.getByRole('button', { name: '显示最新内容' }).click())
    expect(viewport().scrollTop).to.equal(800)
    await settle(500)
    expect(viewport().scrollTop).to.equal(800)
  })
  it('resolves the exact row and returns only scoped DOM after bounded alignment', async () => {
    const result = vi.fn<(result: LumenConversationScrollTargetResult) => void>()
    render(
      <LumenConversation {...defaults} scrollTarget={target()} onScrollTargetResult={result} followLatest={false} />,
    )
    await settle()
    expect(result).toHaveBeenCalledTimes(1)
    const value = result.mock.calls[0]?.[0]
    if (value?.status !== 'ready') {
      throw new Error('Expected a ready row result')
    }
    expect(value.status).to.equal('ready')
    expect(value.row.getAttribute('data-message-id')).to.equal('b')
    expect(value.viewport).to.equal(viewport())
    expect(viewport().scrollTop).to.equal(500)
    expect(Object.isFrozen(value.target)).to.equal(true)
  })
  it('does not repeat a settled request on stream, callback or target object recreation', async () => {
    const original = vi.fn<(result: LumenConversationScrollTargetResult) => void>()
    const changed = vi.fn<(result: LumenConversationScrollTargetResult) => void>()
    const { setProps } = render(
      <LumenConversation {...defaults} scrollTarget={target()} onScrollTargetResult={original} followLatest={false} />,
    )
    await settle()
    viewport().scrollTop = 120
    await React.act(() => viewport().dispatchEvent(new Event('scroll', { bubbles: true })))
    setProps({
      messages: [...defaults.messages],
      contentRevision: 'stream-2',
      scrollTarget: target(),
      onScrollTargetResult: changed,
    })
    await settle(300)
    expect(original).toHaveBeenCalledTimes(1)
    expect(changed).not.toHaveBeenCalled()
    expect(viewport().scrollTop).to.equal(120)
  })
  it('waits for deferred row geometry to settle before publishing ready', async () => {
    let rowHeight = 100
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function changingRowGeometry(
      this: HTMLElement,
    ) {
      const parent = this.closest('.lumen-conversation-messages')
      if (this.dataset.messageId) {
        return new DOMRect(0, (this.dataset.messageId === 'a' ? 50 : 500) - (parent?.scrollTop ?? 0), 400, rowHeight)
      }
      return new DOMRect(0, 0, 400, 200)
    })
    const result = vi.fn<(result: LumenConversationScrollTargetResult) => void>()
    render(<LumenConversation {...defaults} scrollTarget={target()} onScrollTargetResult={result} />)
    await settle(48)
    expect(result).not.toHaveBeenCalled()
    rowHeight = 140
    await settle(32)
    expect(result).not.toHaveBeenCalled()
    await settle(48)
    expect(result).toHaveBeenCalledTimes(1)
    expect(result.mock.calls[0]?.[0].status).to.equal('ready')
  })
  it('a new explicit request can navigate the same message again', async () => {
    const result = vi.fn<(result: LumenConversationScrollTargetResult) => void>()
    const { setProps } = render(
      <LumenConversation {...defaults} scrollTarget={target()} onScrollTargetResult={result} followLatest={false} />,
    )
    await settle()
    setProps({ scrollTarget: target('two') })
    await settle()
    expect(result.mock.calls.map((call) => call[0].target.requestId)).to.deep.equal(['one', 'two'])
  })
  it('a target from another source is never applied or reported', async () => {
    const result = vi.fn<(result: LumenConversationScrollTargetResult) => void>()
    render(<LumenConversation {...defaults} scrollTarget={target('one', 'B')} onScrollTargetResult={result} />)
    await settle(500)
    expect(result).not.toHaveBeenCalled()
  })
  it('A-B-A invalidates both old pending requests and only publishes the new A intent', async () => {
    const result = vi.fn<(result: LumenConversationScrollTargetResult) => void>()
    const { setProps } = render(
      <LumenConversation {...defaults} scrollTarget={target('old-A')} onScrollTargetResult={result} />,
    )
    setProps({ scrollKey: 'B', scrollTarget: target('B', 'B', 'a') })
    setProps({ scrollKey: 'A', scrollTarget: target('new-A', 'A', 'a') })
    await settle(500)
    expect(result.mock.calls.map((call) => call[0].target.requestId)).to.deep.equal(['new-A'])
  })
  for (const event of ['wheel', 'touchstart', 'pointerdown']) {
    it(`user ${event} cancels pending positioning without republishing on content changes`, async () => {
      const result = vi.fn<(result: LumenConversationScrollTargetResult) => void>()
      const { setProps } = render(
        <LumenConversation {...defaults} scrollTarget={target()} onScrollTargetResult={result} followLatest={false} />,
      )
      await React.act(() => viewport().dispatchEvent(new Event(event, { bubbles: true })))
      viewport().scrollTop = 120
      await React.act(() => viewport().dispatchEvent(new Event('scroll', { bubbles: true })))
      setProps({ contentRevision: 'new-frame', messages: [...defaults.messages] })
      await settle(500)
      expect(result).not.toHaveBeenCalled()
      expect(viewport().scrollTop).to.equal(120)
    })
  }
  it('scroll navigation keys cancel but unrelated typing does not', async () => {
    const result = vi.fn<(result: LumenConversationScrollTargetResult) => void>()
    const { setProps } = render(
      <LumenConversation {...defaults} scrollTarget={target()} onScrollTargetResult={result} />,
    )
    await React.act(() => viewport().dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true })))
    await settle()
    expect(result).not.toHaveBeenCalled()
    setProps({ scrollTarget: target('next') })
    await React.act(() => viewport().dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true })))
    await settle()
    expect(result).toHaveBeenCalledTimes(1)
  })
  it('missing or removed IDs report unavailable, never a neighboring row', async () => {
    const result = vi.fn<(result: LumenConversationScrollTargetResult) => void>()
    const { setProps } = render(
      <LumenConversation {...defaults} scrollTarget={target('missing', 'A', 'absent')} onScrollTargetResult={result} />,
    )
    await settle()
    expect(result).toHaveBeenLastCalledWith({
      status: 'unavailable',
      target: { ...target('missing', 'A', 'absent'), align: 'start' },
    })
    setProps({ scrollTarget: target('removed') })
    setProps({ messages: defaults.messages.filter((message) => message.id !== 'b') })
    await settle()
    expect(result.mock.calls.map((call) => call[0].status)).to.deep.equal(['unavailable', 'unavailable'])
  })
  it('null and unmount cancel all pending publication', async () => {
    const result = vi.fn<(result: LumenConversationScrollTargetResult) => void>()
    const { setProps, unmount } = render(
      <LumenConversation {...defaults} scrollTarget={target()} onScrollTargetResult={result} />,
    )
    setProps({ scrollTarget: null })
    await settle(500)
    expect(result).not.toHaveBeenCalled()
    setProps({ scrollTarget: target('next') })
    unmount()
    await settle(500)
    expect(result).not.toHaveBeenCalled()
  })
  it('unmeasurable viewports time out once rather than polling without a bound', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(0)
    const result = vi.fn<(result: LumenConversationScrollTargetResult) => void>()
    render(<LumenConversation {...defaults} scrollTarget={target()} onScrollTargetResult={result} />)
    await settle(500)
    expect(result).toHaveBeenCalledTimes(1)
    expect(result.mock.calls[0]?.[0].status).to.equal('unavailable')
    await settle(5000)
    expect(result).toHaveBeenCalledTimes(1)
  })
})
