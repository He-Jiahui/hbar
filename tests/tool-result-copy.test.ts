import { expect, test } from 'bun:test'
import type { MessageClipboardPort } from '../packages/app-react/src/message-copy'
import {
  copyToolResultText,
  MAX_TOOL_RESULT_COPY_CHARACTERS,
  type ToolResultCopyInput,
} from '../packages/app-react/src/tool-result-copy'

function input(text: string) {
  return {
    sessionId: 'original-session',
    messageId: 'original-message',
    callId: 'original-call',
    toolName: 'exec',
    text,
  } satisfies ToolResultCopyInput
}

const target = {
  sessionId: 'original-session',
  messageId: 'original-message',
  callId: 'original-call',
  toolName: 'exec',
}

for (const text of ['', ' ', '\r\n\t ', '\u00a0\u2003\u2028\ufeff'])
  test(`empty or whitespace-only output (${text.length} code units) never writes`, async () => {
    let writes = 0
    expect(
      await copyToolResultText(input(text), {
        async writeText() {
          writes++
        },
      }),
    ).toEqual({ ...target, status: 'empty' })
    expect(writes).toBe(0)
    expect((await copyToolResultText(input(text), null)).status).toBe('empty')
  })

for (const length of [1, 11_999, 12_000, 12_001, MAX_TOOL_RESULT_COPY_CHARACTERS - 1, MAX_TOOL_RESULT_COPY_CHARACTERS])
  test(`copies all ${length} loaded code units, independently of the 12k display preview`, async () => {
    const text = 'x'.repeat(length)
    const written: string[] = []
    expect(
      await copyToolResultText(input(text), {
        async writeText(value) {
          written.push(value)
        },
      }),
    ).toEqual({ ...target, status: 'copied' })
    expect(written).toEqual([text])
    expect(written[0]?.length).toBe(length)
  })

test('over-budget output is explicitly too_large and never truncated or sent to the clipboard', async () => {
  let writes = 0
  for (const text of [
    'x'.repeat(MAX_TOOL_RESULT_COPY_CHARACTERS + 1),
    ' '.repeat(MAX_TOOL_RESULT_COPY_CHARACTERS + 1),
  ]) {
    expect(
      await copyToolResultText(input(text), {
        async writeText() {
          writes++
        },
      }),
    ).toEqual({ ...target, status: 'too_large' })
    expect((await copyToolResultText(input(text), null)).status).toBe('too_large')
  }
  expect(writes).toBe(0)
})

test('budget counts UTF-16 units rather than UTF-8 bytes or graphemes', async () => {
  const written: string[] = []
  const clipboard: MessageClipboardPort = {
    async writeText(text) {
      written.push(text)
    },
  }
  const chinese = '中'.repeat(MAX_TOOL_RESULT_COPY_CHARACTERS)
  const astral = '😀'.repeat(MAX_TOOL_RESULT_COPY_CHARACTERS / 2)
  expect(chinese.length).toBe(MAX_TOOL_RESULT_COPY_CHARACTERS)
  expect(astral.length).toBe(MAX_TOOL_RESULT_COPY_CHARACTERS)
  expect((await copyToolResultText(input(chinese), clipboard)).status).toBe('copied')
  expect((await copyToolResultText(input(astral), clipboard)).status).toBe('copied')
  expect((await copyToolResultText(input(`${astral}x`), clipboard)).status).toBe('too_large')
  expect(written).toEqual([chinese, astral])
})

test('copies failed-tool output exactly, including leading/trailing whitespace and CRLF', async () => {
  const text = '  Error: local test failed\r\n\t路径：src/example.ts\r\n\r\n'
  const written: string[] = []
  expect(
    await copyToolResultText(input(text), {
      async writeText(value) {
        written.push(value)
      },
    }),
  ).toEqual({ ...target, status: 'copied' })
  expect(written).toEqual([text])
})

test('missing clipboard is unavailable, with only the captured identity and status', async () => {
  const result = await copyToolResultText(input('result'), null)
  expect(result).toEqual({ ...target, status: 'unavailable' })
  expect(Object.keys(result).sort()).toEqual(['callId', 'messageId', 'sessionId', 'status', 'toolName'])
})

for (const failure of ['throw', 'reject'] as const)
  test(`clipboard ${failure} is a local failure without exposing details and permits a later manual attempt`, async () => {
    let attempts = 0
    const clipboard: MessageClipboardPort = {
      writeText() {
        attempts++
        if (failure === 'throw') throw new Error('private platform permission detail')
        return Promise.reject(new Error('private platform permission detail'))
      },
    }
    const result = await copyToolResultText(input('failed result'), clipboard)
    expect(result).toEqual({ ...target, status: 'failed' })
    expect(JSON.stringify(result)).not.toContain('private platform')
    expect(attempts).toBe(1)
    const written: string[] = []
    expect(
      await copyToolResultText(input('failed result'), {
        async writeText(text) {
          written.push(text)
        },
      }),
    ).toEqual({ ...target, status: 'copied' })
    expect(written).toEqual(['failed result'])
  })

test('awaits clipboard confirmation and captures identity and text before original-object mutation', async () => {
  const original = input('  original result\r\n')
  const write = Promise.withResolvers<void>()
  const written: string[] = []
  let completed = false
  const request = copyToolResultText(original, {
    writeText(text) {
      written.push(text)
      Object.assign(original, {
        sessionId: 'next-session',
        messageId: 'next-message',
        callId: 'next-call',
        toolName: 'next-tool',
        text: 'next output',
      })
      return write.promise
    },
  }).then((result) => {
    completed = true
    return result
  })
  await Promise.resolve()
  expect(completed).toBe(false)
  expect(written).toEqual(['  original result\r\n'])
  expect(original.sessionId).toBe('next-session')
  write.resolve()
  expect(await request).toEqual({ ...target, status: 'copied' })
  expect(original.text).toBe('next output')
})

test('out-of-order independent copies keep their original call/session/tool identities and payloads', async () => {
  const firstWrite = Promise.withResolvers<void>()
  const firstWritten: string[] = []
  const secondWritten: string[] = []
  const first = copyToolResultText(input('first output'), {
    writeText(text) {
      firstWritten.push(text)
      return firstWrite.promise
    },
  })
  const secondTarget = {
    sessionId: 'second-session',
    messageId: 'second-message',
    callId: 'original-call',
    toolName: 'read_file',
  }
  const second = await copyToolResultText(
    { ...secondTarget, text: 'second output' },
    {
      async writeText(text) {
        secondWritten.push(text)
      },
    },
  )
  expect(second).toEqual({ ...secondTarget, status: 'copied' })
  expect(secondWritten).toEqual(['second output'])
  firstWrite.resolve()
  expect(await first).toEqual({ ...target, status: 'copied' })
  expect(firstWritten).toEqual(['first output'])
})
