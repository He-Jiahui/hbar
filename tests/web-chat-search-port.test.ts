import { expect, test } from 'bun:test'
import type { createSessionSearchCommandClient } from '@hbar/client'
import { chatSearchCopy, chatSearchErrorCopy } from '../apps/web/src/chat-search-copy'
import { createHostChatSearchPort } from '../apps/web/src/chat-search-port'

type Commands = ReturnType<typeof createSessionSearchCommandClient>

test('Host recent identities remain canonical and are rendered without synthetic matches', async () => {
  const calls: unknown[] = []
  const commands = {
    execute: async (id: string, input: unknown, options: unknown) => {
      calls.push({ id, input, options })
      return {
        items: [
          {
            sessionId: 'session-a',
            workspaceId: 'workspace-hidden',
            title: 'Title',
            workspaceName: 'Hidden',
            updatedAt: 42,
          },
        ],
      }
    },
  } as unknown as Commands
  const signal = new AbortController().signal
  const page = await createHostChatSearchPort(commands).recent(signal)
  expect(calls).toEqual([{ id: 'session.recent', input: {}, options: { signal } }])
  expect(page).toEqual({
    rows: [
      {
        sessionId: 'session-a',
        workspaceId: 'workspace-hidden',
        title: 'Title',
        workspaceName: 'Hidden',
        updatedAt: 42,
        matchCount: 0,
        snippets: [],
      },
    ],
    truncated: false,
    incompleteReason: null,
  })
})

test('Host snippet parts become exact UTF-16 highlight offsets without losing result limits', async () => {
  const calls: unknown[] = []
  const commands = {
    execute: async (id: string, input: unknown, options: unknown) => {
      calls.push({ id, input, options })
      return {
        items: [
          {
            sessionId: 'session-b',
            workspaceId: 'workspace-b',
            title: 'Different title',
            workspaceName: 'Workspace',
            updatedAt: 100,
            matchCount: 4,
            matchCountCapped: true,
            matches: [
              { messageId: 'message-a', role: 'assistant', snippet: { before: '😀', hit: 'needle', after: ' tail' } },
            ],
          },
        ],
        truncated: true,
        incompleteReason: 'scan_cap',
      }
    },
  } as unknown as Commands
  const signal = new AbortController().signal
  const page = await createHostChatSearchPort(commands).search('needle', signal)
  expect(calls).toEqual([{ id: 'session.search', input: { query: 'needle' }, options: { signal } }])
  expect(page.rows[0]).toMatchObject({
    sessionId: 'session-b',
    workspaceId: 'workspace-b',
    matchCount: 4,
    matchCountCapped: true,
    snippets: [{ text: '😀needle tail', highlights: [{ start: 2, end: 8 }] }],
  })
  expect(page).toMatchObject({ truncated: true, incompleteReason: 'scan_cap' })
})

test('search labels and stable public errors stay localized and omit private transport details', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = chatSearchCopy(locale)
    expect(labels.search.length).toBeGreaterThan(0)
    expect(labels.recent.length).toBeGreaterThan(0)
    expect(labels.matches(50).length).toBeGreaterThan(0)
    expect(labels.time(0).length).toBeGreaterThan(0)
    expect(chatSearchErrorCopy(locale, 'private-details')).not.toContain('private-details')
  }
  expect(chatSearchCopy('en-US').matches(1)).toBe('1 match')
  expect(chatSearchCopy('en-US').matches(2)).toBe('2 matches')
  expect(chatSearchCopy('en-US').matches(999, true)).toBe('999+ matches')
  expect(chatSearchCopy('zh-CN').matches(999, true)).toBe('999+ 处匹配')
})
