import { HbarError } from '@hbar/contracts/errors'
import { sessionScanPageSchema, type SessionScanInput, type SessionScanPage } from '@hbar/contracts/session-scan'

export interface SessionScanPort {
  scanPage?(input: SessionScanInput): Promise<SessionScanPage>
}

/** Restore every Session in bounded pages; reject old adapters rather than silently truncating their list. */
export async function* readSessionPages(port: SessionScanPort, signal?: AbortSignal): AsyncGenerator<SessionScanPage> {
  if (!port.scanPage) throw new HbarError('SESSION_SCAN_UNAVAILABLE', 'Session restoration requires paged discovery')
  let after: string | undefined
  let through: string | undefined
  while (true) {
    signal?.throwIfAborted()
    const page = sessionScanPageSchema.parse(
      await port.scanPage({
        ...(after ? { after } : {}),
        ...(through ? { through } : {}),
        limit: 64,
      }),
    )
    signal?.throwIfAborted()
    if (
      page.items.length > 64 ||
      (through !== undefined && page.through !== through) ||
      (page.through === null && page.items.length > 0) ||
      page.items.some(
        (session, index) =>
          session.id <= (page.items[index - 1]?.id ?? after ?? '') ||
          (page.through !== null && session.id > page.through),
      ) ||
      (page.nextCursor !== null && (page.nextCursor !== page.items.at(-1)?.id || page.nextCursor <= (after ?? '')))
    )
      throw new HbarError('SESSION_SCAN_CURSOR', 'Session restoration returned an invalid identity range')
    yield page
    if (page.nextCursor === null) return
    through = page.through ?? undefined
    after = page.nextCursor
  }
}
