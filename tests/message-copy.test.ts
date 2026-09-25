import { expect, test } from 'bun:test'
import { copyMessageText, messageCopyText, type MessageCopyInput } from '../packages/app-react/src/message-copy'

function input(text = '**原文**\n\n```ts\nconst 中文 = 1\n```'): MessageCopyInput {
  return {
    sessionId: 'original-session',
    messageId: 'original-message',
    content: [{ type: 'text', text }],
  }
}

test('message copy preserves authored markdown and joins only nonempty visible text blocks', () => {
  expect(
    messageCopyText([
      { type: 'thinking', text: 'private reasoning' },
      { type: 'text', text: '  第一段 **原文**\n' },
      { type: 'tool_call', callId: 'call', name: 'shell', args: { secret: 'not for clipboard' } },
      { type: 'tool_result', callId: 'call', name: 'shell', text: 'raw result', isError: false },
      {
        type: 'file',
        artifact: { id: 'a'.repeat(64), name: 'private-config.json', mime: 'application/json', size: 1 },
      },
      { type: 'image', artifact: { id: 'b'.repeat(64), name: 'private-image.png', mime: 'image/png', size: 1 } },
      { type: 'text', text: ' \n ' },
      { type: 'text', text: '```ts\nconst value = 1\n```' },
    ]),
  ).toBe('  第一段 **原文**\n\n\n```ts\nconst value = 1\n```')
})

test('empty content never changes the clipboard, including reasoning-only messages', async () => {
  let writes = 0
  const clipboard = {
    async writeText() {
      writes += 1
    },
  }
  expect((await copyMessageText(input(' \n '), clipboard)).status).toBe('empty')
  expect((await copyMessageText({ ...input(), content: [] }, clipboard)).status).toBe('empty')
  expect(
    (await copyMessageText({ ...input(), content: [{ type: 'thinking', text: 'hidden' }] }, clipboard)).status,
  ).toBe('empty')
  expect(writes).toBe(0)
})

test('copy reports unavailable without pretending success when platform clipboard is absent', async () => {
  expect(await copyMessageText(input(), null)).toEqual({
    sessionId: 'original-session',
    messageId: 'original-message',
    status: 'unavailable',
  })
})

test('copy awaits clipboard confirmation and retains original target through a selection switch', async () => {
  let resolveWrite: (() => void) | undefined
  let written = ''
  const write = new Promise<void>((resolve) => {
    resolveWrite = resolve
  })
  let current = input()
  let completed = false
  const request = copyMessageText(current, {
    writeText(text) {
      written = text
      return write
    },
  }).then((result) => {
    completed = true
    return result
  })
  current = { ...input('new draft'), sessionId: 'next-session', messageId: 'next-message' }
  await Promise.resolve()
  expect(completed).toBe(false)
  expect(written).toBe('**原文**\n\n```ts\nconst 中文 = 1\n```')
  resolveWrite?.()
  expect(await request).toEqual({
    sessionId: 'original-session',
    messageId: 'original-message',
    status: 'copied',
  })
  expect(current.sessionId).toBe('next-session')
})

test('clipboard rejection is an explicit local failure and a later attempt can succeed', async () => {
  const denied = await copyMessageText(input(), {
    writeText() {
      return Promise.reject(new Error('Permission denied with private browser detail'))
    },
  })
  expect(denied).toEqual({ sessionId: 'original-session', messageId: 'original-message', status: 'failed' })
  let written = ''
  const retried = await copyMessageText(input(), {
    async writeText(text) {
      written = text
    },
  })
  expect(retried.status).toBe('copied')
  expect(written).toContain('const 中文 = 1')
})

test('out-of-order independent copies return feedback for their own messages', async () => {
  let finishFirst: (() => void) | undefined
  const firstWrite = new Promise<void>((resolve) => {
    finishFirst = resolve
  })
  const first = copyMessageText(input('first'), { writeText: () => firstWrite })
  const second = await copyMessageText({ ...input('second'), messageId: 'second-message' }, { async writeText() {} })
  expect(second).toEqual({ sessionId: 'original-session', messageId: 'second-message', status: 'copied' })
  finishFirst?.()
  expect((await first).messageId).toBe('original-message')
})
