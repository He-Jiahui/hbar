import type { ConnectionStatus } from '@hbar/client'
import type { HbarNativeConnection } from './native-connection'

export interface NativeConnectionRecoveryPort {
  readonly baseUrl: string
  connectionStatus(): ConnectionStatus
  onStatus(listener: (status: ConnectionStatus) => void): () => void
  provideAuthentication(token: string): boolean
  connect(): Promise<unknown>
}

/** Refresh only disconnected native clients; one bounded read/reconnect runs at a time. */
export function startNativeConnectionRecovery(
  client: NativeConnectionRecoveryPort,
  read: () => Promise<HbarNativeConnection | null>,
) {
  let active = true
  let busy = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const disconnected = () => ['disconnected', 'pairing'].includes(client.connectionStatus())
  const schedule = (delay = 250) => {
    if (!active || !disconnected()) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      void refresh()
    }, delay)
  }
  const refresh = async () => {
    if (!active || busy || !disconnected()) return
    busy = true
    try {
      const connection = await read()
      if (!active || !connection || !disconnected()) return
      if (new URL(connection.url).origin !== new URL(client.baseUrl).origin) return
      client.provideAuthentication(connection.token)
      // Let any rejected connection attempt settle before opening the replacement socket.
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      if (active && disconnected()) await client.connect()
    } catch {
      // A managed source Host briefly removes its connection record during restart.
    } finally {
      busy = false
      if (active && disconnected()) schedule(2000)
    }
  }
  const off = client.onStatus(() => {
    if (disconnected()) schedule()
    else clearTimeout(timer)
  })
  schedule()
  return () => {
    active = false
    clearTimeout(timer)
    off()
  }
}
