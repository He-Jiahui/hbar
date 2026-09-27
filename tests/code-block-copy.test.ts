import { expect, test } from 'bun:test'
import type { MessageClipboardPort } from '../packages/app-react/src/message-copy'
import {
  copyCodeBlockText,
  MAX_CODE_BLOCK_COPY_CHARACTERS,
  type CodeBlockCopyInput,
  type CodeBlockCopyTarget,
} from '../packages/app-react/src/code-block-copy'

const target = {
  sessionId: 'session-a',
  messageId: 'message-a',
  segmentId: 'text:0',
  occurrenceId: 'code:0',
} satisfies CodeBlockCopyTarget

function input(text: string): CodeBlockCopyInput {
  return { ...target, text }
}

for (const text of ['', ' ', '\r\n\t ', '\u00a0\u2003\u2028\ufeff'])
  test(`empty code (${text.length} UTF-16 units) never writes`, async () => {
    const written: string[] = []
    expect(
      await copyCodeBlockText(input(text), {
        async writeText(value) {
          written.push(value)
        },
      }),
    ).toEqual({ ...target, status: 'empty' })
    expect(written).toEqual([])
    expect(await copyCodeBlockText(input(text), null)).toEqual({ ...target, status: 'empty' })
  })

for (const length of [1, 12_001, MAX_CODE_BLOCK_COPY_CHARACTERS - 1, MAX_CODE_BLOCK_COPY_CHARACTERS])
  test(`copies the full parsed code at ${length} UTF-16 units without a display-window cutoff`, async () => {
    const text = 'x'.repeat(length)
    const written: string[] = []
    expect(
      await copyCodeBlockText(input(text), {
        async writeText(value) {
          written.push(value)
        },
      }),
    ).toEqual({ ...target, status: 'copied' })
    expect(written).toEqual([text])
  })

test('the published capacity is exactly one million UTF-16 units', () => {
  expect(MAX_CODE_BLOCK_COPY_CHARACTERS).toBe(1_000_000)
})

test('over-budget code and whitespace reject before clipboard availability and never truncate', async () => {
  let writes = 0
  for (const text of ['x'.repeat(MAX_CODE_BLOCK_COPY_CHARACTERS + 1), ' '.repeat(MAX_CODE_BLOCK_COPY_CHARACTERS + 1)]) {
    expect(
      await copyCodeBlockText(input(text), {
        async writeText() {
          writes++
        },
      }),
    ).toEqual({ ...target, status: 'too_large' })
    expect(await copyCodeBlockText(input(text), null)).toEqual({ ...target, status: 'too_large' })
  }
  expect(writes).toBe(0)
  expect(await copyCodeBlockText(input(' '.repeat(MAX_CODE_BLOCK_COPY_CHARACTERS)), null)).toEqual({
    ...target,
    status: 'empty',
  })
})

test('the budget measures UTF-16 units, not UTF-8 bytes, code points or graphemes', async () => {
  const chinese = '中'.repeat(MAX_CODE_BLOCK_COPY_CHARACTERS)
  const astral = '😀'.repeat(MAX_CODE_BLOCK_COPY_CHARACTERS / 2)
  const written: string[] = []
  const clipboard: MessageClipboardPort = {
    async writeText(value) {
      written.push(value)
    },
  }
  expect(chinese.length).toBe(MAX_CODE_BLOCK_COPY_CHARACTERS)
  expect(astral.length).toBe(MAX_CODE_BLOCK_COPY_CHARACTERS)
  expect((await copyCodeBlockText(input(chinese), clipboard)).status).toBe('copied')
  expect((await copyCodeBlockText(input(astral), clipboard)).status).toBe('copied')
  expect((await copyCodeBlockText(input(`${astral}x`), clipboard)).status).toBe('too_large')
  expect(written).toEqual([chinese, astral])
})

for (const text of [
  '  const value = "路径 😀 e\u0301"\r\n\treturn value\r\n\r\n',
  'console.log("already parsed body")',
  '\n```literal backticks in the parsed code```\n',
])
  test(`preserves the supplied parsed body exactly (${text.length} units)`, async () => {
    const written: string[] = []
    expect(
      await copyCodeBlockText(input(text), {
        async writeText(value) {
          written.push(value)
        },
      }),
    ).toEqual({ ...target, status: 'copied' })
    expect(written).toEqual([text])
  })

test('unavailable clipboard returns only safe original identity and status', async () => {
  const result = await copyCodeBlockText(input('const privateValue = "fixture"'), null)
  expect(result).toEqual({ ...target, status: 'unavailable' })
  expect(Object.keys(result).sort()).toEqual(['messageId', 'occurrenceId', 'segmentId', 'sessionId', 'status'])
  expect(JSON.stringify(result)).not.toContain('privateValue')
})

for (const failure of ['throw', 'reject'] as const)
  test(`a platform ${failure} produces safe failed feedback and no implicit retry`, async () => {
    let attempts = 0
    const clipboard: MessageClipboardPort = {
      writeText() {
        attempts++
        if (failure === 'throw') throw new Error('private clipboard implementation detail')
        return Promise.reject(new Error('private clipboard implementation detail'))
      },
    }
    const result = await copyCodeBlockText(input('original code'), clipboard)
    expect(result).toEqual({ ...target, status: 'failed' })
    expect(JSON.stringify(result)).not.toContain('private clipboard')
    expect(attempts).toBe(1)
    const written: string[] = []
    expect(
      await copyCodeBlockText(input('original code'), {
        async writeText(text) {
          written.push(text)
        },
      }),
    ).toEqual({ ...target, status: 'copied' })
    expect(written).toEqual(['original code'])
  })

test('waits for write confirmation and captures all original fields before awaiting', async () => {
  const original = input('  original code\r\n')
  const deferred = Promise.withResolvers<void>()
  const written: string[] = []
  let settled = false
  const result = copyCodeBlockText(original, {
    writeText(text) {
      written.push(text)
      Object.assign(original, {
        sessionId: 'session-b',
        messageId: 'message-b',
        segmentId: 'proposal',
        occurrenceId: 'code:2',
        text: 'new code',
      })
      return deferred.promise
    },
  }).then((receipt) => {
    settled = true
    return receipt
  })
  await Promise.resolve()
  expect(settled).toBe(false)
  expect(written).toEqual(['  original code\r\n'])
  expect(original.messageId).toBe('message-b')
  deferred.resolve()
  expect(await result).toEqual({ ...target, status: 'copied' })
  expect(original.text).toBe('new code')
})

test('a late rejection still belongs to the original source after replacement', async () => {
  const original = input('old code')
  const deferred = Promise.withResolvers<void>()
  const result = copyCodeBlockText(original, {
    writeText() {
      return deferred.promise
    },
  })
  Object.assign(original, { ...target, occurrenceId: 'code:1', text: 'replacement code' })
  deferred.reject(new Error('safe test failure'))
  expect(await result).toEqual({ ...target, status: 'failed' })
})

test('equal code in separate segments or occurrences never shares source identity or receipts', async () => {
  const firstWrite = Promise.withResolvers<void>()
  const firstWritten: string[] = []
  const secondWritten: string[] = []
  const text = 'same code'
  const first = copyCodeBlockText(input(text), {
    writeText(value) {
      firstWritten.push(value)
      return firstWrite.promise
    },
  })
  const secondTarget = { ...target, segmentId: 'proposal', occurrenceId: 'code:0' }
  const thirdTarget = { ...target, occurrenceId: 'code:1' }
  const clipboard: MessageClipboardPort = {
    async writeText(value) {
      secondWritten.push(value)
    },
  }
  expect(await copyCodeBlockText({ ...secondTarget, text }, clipboard)).toEqual({
    ...secondTarget,
    status: 'copied',
  })
  expect(await copyCodeBlockText({ ...thirdTarget, text }, clipboard)).toEqual({
    ...thirdTarget,
    status: 'copied',
  })
  firstWrite.resolve()
  expect(await first).toEqual({ ...target, status: 'copied' })
  expect(firstWritten).toEqual([text])
  expect(secondWritten).toEqual([text, text])
})

test('separate sessions can complete out of order without rereading the active source', async () => {
  const deferred = Promise.withResolvers<void>()
  const written: string[] = []
  const first = copyCodeBlockText(input('first session code'), {
    writeText(text) {
      written.push(text)
      return deferred.promise
    },
  })
  const secondTarget = { ...target, sessionId: 'session-b', messageId: 'message-b' }
  expect(
    await copyCodeBlockText(
      { ...secondTarget, text: 'second session code' },
      {
        async writeText(text) {
          written.push(text)
        },
      },
    ),
  ).toEqual({ ...secondTarget, status: 'copied' })
  deferred.resolve()
  expect(await first).toEqual({ ...target, status: 'copied' })
  expect(written).toEqual(['first session code', 'second session code'])
})
