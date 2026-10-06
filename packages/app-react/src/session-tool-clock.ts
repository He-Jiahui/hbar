import { useSyncExternalStore } from 'react'

const subscribers = new Set<() => void>()
let value = 0
let timer: ReturnType<typeof setInterval> | undefined
function tick() {
  value = Date.now()
  for (const notify of subscribers) notify()
}
function visibilityChanged() {
  if (timer) clearInterval(timer)
  timer = undefined
  if (document.visibilityState === 'hidden' || subscribers.size === 0) return
  tick()
  timer = setInterval(tick, 500)
}
function subscribe(notify: () => void): () => void {
  subscribers.add(notify)
  if (subscribers.size === 1) {
    document.addEventListener('visibilitychange', visibilityChanged)
    visibilityChanged()
  }
  return () => {
    subscribers.delete(notify)
    if (subscribers.size) return
    if (timer) clearInterval(timer)
    timer = undefined
    document.removeEventListener('visibilitychange', visibilityChanged)
  }
}
const idleSubscribe = () => () => {}
const snapshot = () => value
const serverSnapshot = () => 0
/** Shared visual clock, no per-row timers and no ticks for terminal history or hidden windows. */
export function useToolClock(active: boolean): number {
  return useSyncExternalStore(active ? subscribe : idleSubscribe, active ? snapshot : serverSnapshot, serverSnapshot)
}
