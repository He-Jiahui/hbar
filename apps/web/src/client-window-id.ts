const key = 'hbar:web:window-owner'
const inheritedKey = 'hbar:web:window-inherited'
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
/** A window namespace persists across reloads and endpoint runtime replacements. */
export function webWindowId(storage: Pick<Storage, 'getItem' | 'setItem'>): string {
  const existing = storage.getItem(key)
  if (existing && uuid.test(existing)) return existing
  const created = crypto.randomUUID()
  storage.setItem(key, created)
  return created
}
export function inheritedWebWindowId(storage: Pick<Storage, 'getItem'>): string | null {
  const value = storage.getItem(inheritedKey)
  return value && uuid.test(value) ? value : null
}
let claimed: Promise<string> | null = null
/** sessionStorage is cloned by window.open. Fence live owners before confirming a Host runtime. */
export function claimWebWindowId(storage: Pick<Storage, 'getItem' | 'setItem'>): Promise<string> {
  if (claimed) return claimed
  const task = (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const candidate = webWindowId(storage)
      const acquired = await new Promise<boolean>((resolve, reject) => {
        if (navigator.locks) {
          void navigator.locks
            .request(`hbar:web:owner:${candidate}`, { ifAvailable: true }, async (lock) => {
              resolve(Boolean(lock))
              if (lock) await new Promise<void>(() => {})
            })
            .catch(reject)
          return
        }
        const channel = new BroadcastChannel(`hbar:web:owner:${candidate}`)
        const nonce = crypto.randomUUID()
        let collision = false
        let established = false
        channel.onmessage = (event: MessageEvent<unknown>) => {
          const value = event.data
          if (!value || typeof value !== 'object' || !('nonce' in value) || typeof value.nonce !== 'string') return
          if ('probe' in value && value.probe === true) channel.postMessage({ nonce, established })
          if (('established' in value && value.established === true) || (!established && value.nonce < nonce))
            collision = true
        }
        channel.postMessage({ nonce, probe: true })
        setTimeout(() => {
          if (collision) channel.close()
          else established = true
          resolve(!collision)
        }, 100)
      })
      if (acquired) return candidate
      storage.setItem(inheritedKey, candidate)
      storage.setItem(key, crypto.randomUUID())
    }
    throw new Error('Could not establish an independent window owner')
  })()
  claimed = task
  return task
}
