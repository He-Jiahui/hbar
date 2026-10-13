import type { ServerWebSocket } from 'bun'
import { sendSocketTextFrame } from './socket-sender'
import type { RuntimeNodeLinkPort } from './runtime-node-link-contract'

export function nodeRequestAllowed(request: Request, source: string, secure: boolean): boolean {
  const url = new URL(request.url)
  const loopback = source === '::1' || source === '127.0.0.1' || source === '::ffff:127.0.0.1'
  return (
    request.method === 'GET' &&
    (secure || loopback) &&
    !url.search &&
    !url.hash &&
    !url.username &&
    !url.password &&
    !request.headers.has('origin') &&
    !request.headers.has('authorization') &&
    !request.headers.has('cookie')
  )
}
interface NodeSocketData {
  connectionId: string
  nodeSource?: string
}
/** Owns native socket lifetime only. Network frames remain opaque until the managed link owner validates them. */
export class NodeSocketSurface {
  private readonly sockets = new Map<string, () => void>()
  private closed = false
  constructor(private readonly port: RuntimeNodeLinkPort) {}
  open<Data extends NodeSocketData>(socket: ServerWebSocket<Data>): void {
    const id = socket.data.connectionId,
      source = socket.data.nodeSource
    if (this.closed || !source) {
      socket.close(4000, 'Node listener is unavailable')
      return
    }
    this.sockets.set(id, () => {
      socket.close(4000, 'Conversation Host is closing')
    })
    void this.port
      .open(id, source, {
        send: (text) => sendSocketTextFrame(socket, text) > 0,
        close: (code, reason) => socket.close(code, reason),
      })
      .catch(() => {
        this.close(id)
        socket.close(4000, 'Node link owner is unavailable')
      })
  }
  message<Data extends NodeSocketData>(socket: ServerWebSocket<Data>, payload: string | Buffer): void {
    if (this.closed || typeof payload !== 'string') {
      this.close(socket.data.connectionId)
      socket.close(4002, 'Node frames must be JSON text')
      return
    }
    void this.port.receive(socket.data.connectionId, payload).catch(() => {
      this.close(socket.data.connectionId)
      socket.close(4002, 'Node frame rejected')
    })
  }
  close(id: string): void {
    this.sockets.delete(id)
    this.port.closeConnection(id)
  }
  closeAll(): void {
    this.closed = true
    for (const [id, close] of this.sockets) {
      this.port.closeConnection(id)
      try {
        close()
      } catch {
        /* Continue releasing other owned sockets. */
      }
    }
    this.sockets.clear()
  }
}
