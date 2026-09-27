import { createSessionSearchCommandClient } from '@hbar/client'
import type { HbarChatSearchRow } from '@hbar/app-react'
import type { WebChatSearchPage, WebChatSearchPort } from './chat-search-controller'

type SearchCommands = ReturnType<typeof createSessionSearchCommandClient>

/** Adapts the Host's bounded, typed search DTO without parsing transcript content in the browser. */
export function createHostChatSearchPort(commands: SearchCommands): WebChatSearchPort {
  return {
    async recent(signal) {
      const result = await commands.execute('session.recent', {}, { signal })
      const rows: HbarChatSearchRow[] = result.items.map((item) => ({
        ...item,
        matchCount: 0,
        snippets: [],
      }))
      return { rows, truncated: false, incompleteReason: null }
    },
    async search(query, signal): Promise<WebChatSearchPage> {
      const result = await commands.execute('session.search', { query }, { signal })
      return {
        rows: result.items.map((item) => ({
          sessionId: item.sessionId,
          workspaceId: item.workspaceId,
          title: item.title,
          workspaceName: item.workspaceName,
          updatedAt: item.updatedAt,
          matchCount: item.matchCount,
          matchCountCapped: item.matchCountCapped,
          snippets: item.matches.map((match) => ({
            messageId: match.messageId,
            role: match.role,
            text: match.snippet.before + match.snippet.hit + match.snippet.after,
            highlights: [
              {
                start: match.snippet.before.length,
                end: match.snippet.before.length + match.snippet.hit.length,
              },
            ],
          })),
        })),
        truncated: result.truncated,
        incompleteReason: result.incompleteReason,
      }
    },
  }
}
