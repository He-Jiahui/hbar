const key = 'hbar:web:window-owner'
/** A window namespace persists across reloads and endpoint runtime replacements. */
export function webWindowId(storage: Pick<Storage, 'getItem' | 'setItem'>): string {
  const existing = storage.getItem(key)
  if (existing && /^[a-zA-Z0-9_-]{1,80}$/.test(existing)) return existing
  const created = crypto.randomUUID()
  storage.setItem(key, created)
  return created
}
