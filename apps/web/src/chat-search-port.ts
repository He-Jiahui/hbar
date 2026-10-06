import { createSessionSearchCommandClient } from '@hbar/client'
import type { HbarChatSearchRow } from '@hbar/app-react'
import type { WebChatSearchPage, WebChatSearchPort } from './chat-search-controller'
import type { SessionSearchScope } from '@hbar/contracts/commands/session-search'

type SearchCommands = ReturnType<typeof createSessionSearchCommandClient>

/** Adapts the Host's bounded, typed search DTO without parsing transcript content in the browser. */
export function createHostChatSearchPort(commands: SearchCommands): WebChatSearchPort {
  return {
    async recent(signal) {
      const result = await commands.execute('session.recent', {}, { signal })
      const rows: HbarChatSearchRow[] = result.items.map((item) => ({
        ...item,
        source: 'title',
        matchCount: 0,
        snippets: [],
      }))
      return { rows, truncated: false, incompleteReason: null }
    },
    async search(query, signal, source: SessionSearchScope = 'all'): Promise<WebChatSearchPage> {
      const result = await commands.execute('session.search', { query, source, matchesPerSession: 10 }, { signal })
      const rows: HbarChatSearchRow[] = result.items.flatMap((item) =>
        item.matches.map((match) => ({
          resultId: JSON.stringify([
            item.sessionId,
            match.source ?? 'conversation',
            match.messageId,
            match.blockIndex ?? null,
          ]),
          source: match.source ?? 'conversation',
          target: {
            messageId: match.targetMessageId ?? match.messageId,
            blockIndex: match.blockIndex ?? null,
            callId: match.callId ?? null,
          },
          sessionId: item.sessionId,
          workspaceId: item.workspaceId,
          title: item.title,
          workspaceName: item.workspaceName,
          updatedAt: item.updatedAt,
          matchCount: item.matchCount,
          matchCountCapped: item.matchCountCapped,
          snippets: [
            {
              messageId: match.messageId,
              role: match.role,
              text: match.snippet.before + match.snippet.hit + match.snippet.after,
              highlights: [
                {
                  start: match.snippet.before.length,
                  end: match.snippet.before.length + match.snippet.hit.length,
                },
              ],
            },
          ],
        })),
      )
      return {
        rows: rows.slice(0, 50),
        truncated:
          result.truncated || rows.length > 50 || result.items.some((item) => item.matchCount > item.matches.length),
        incompleteReason: result.incompleteReason,
      }
    },
  }
}
