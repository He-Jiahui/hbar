export async function awaitComposerWrites(
  writesBySession: ReadonlyMap<string, ReadonlySet<Promise<unknown>>>,
  sessionId: string | null,
): Promise<void> {
  const writes = sessionId ? writesBySession.get(sessionId) : undefined
  if (!writes || writes.size === 0) return
  await Promise.all([...writes])
}
