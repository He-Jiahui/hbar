/** A cancellable local preview resource. It never represents a backend authentication result. */
export function startAuthentication4PendingTimer(complete: () => void, delayMs: number): () => void {
  if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 2_147_483_647) return () => undefined
  let active = true
  const timer = setTimeout(() => {
    if (!active) return
    active = false
    complete()
  }, delayMs)
  return () => {
    active = false
    clearTimeout(timer)
  }
}
