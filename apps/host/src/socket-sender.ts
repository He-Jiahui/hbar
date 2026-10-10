/** The transport-owned part of a socket. Failures never escape into a publisher. */
export interface SocketWritePort {
  readonly readyState: number
  getBufferedAmount(): number
  send(data: string): unknown
  close(code: number, reason: string): void
}

export function sendSocketFrame(socket: SocketWritePort, value: unknown): number {
  try { return sendSocketTextFrame(socket, JSON.stringify(value)) }
  catch {
    try { socket.close(1011, 'Publication failed; reconnect to reconcile') } catch { /* The transport already failed. */ }
    console.error('[hbar] socket serialization failed')
    return 0
  }
}

/** A Controller already validated and serialized the response in its owning process. */
export function sendSocketTextFrame(socket: SocketWritePort, data: string): number {
  try {
    if (socket.readyState !== 1) return 0
    if (socket.getBufferedAmount() > 4 * 1024 * 1024) {
      socket.close(1013, 'Reconnect to resynchronize')
      return 0
    }
    socket.send(data)
    return new TextEncoder().encode(data).byteLength
  } catch {
    try {
      socket.close(1011, 'Publication failed; reconnect to reconcile')
    } catch {
      // A broken transport can also reject closing. Other clients remain independent.
    }
    console.error('[hbar] socket publication failed')
    return 0
  }
}
