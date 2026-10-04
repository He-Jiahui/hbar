import { describe, expect, test } from 'bun:test'
import { createNotificationCommandClient, type NotificationClientTransport } from '../packages/client/src/notifications'
import type { RpcMethod, RpcParams, RpcResults, WireNotification } from '../packages/contracts/src/index'

describe('notification client fresh transport', () => {
  test('accepts the plural Host notifications.created event and ignores other methods', () => {
    const listeners = new Set<(event: WireNotification) => void>()
    const transport: NotificationClientTransport = {
      call<M extends RpcMethod>(_method: M, _params: RpcParams<M>): Promise<RpcResults[M]> {
        return Promise.resolve(undefined as RpcResults[M])
      },
      onEvent(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }
    const client = createNotificationCommandClient(transport)
    const received: string[] = []
    const unsubscribe = client.subscribeFresh((event) => received.push(event.sourceEventId))
    const record = {
      id: 'notification-1', sourceEventId: 'source-1', kind: 'run.completed' as const,
      title: 'Run completed', detail: 'done', createdAt: 10, readAt: null,
      target: { kind: 'session' as const, workspaceId: 'workspace', sessionId: 'session' },
    }
    for (const listener of listeners) {
      listener({ method: 'notifications.created', params: { record, sourceEventId: 'source-1' } })
      listener({ method: 'notifications.created', params: { record, sourceEventId: 'different-source' } })
      listener({ method: 'host.changed', params: { kind: 'notifications' } })
    }
    expect(received).toEqual(['source-1'])
    unsubscribe()
    expect(listeners.size).toBe(0)
  })
  test('exposes notification invalidation events', () => {
    const listeners = new Set<(event: WireNotification) => void>()
    const transport: NotificationClientTransport = {
      call<M extends RpcMethod>(_method: M, _params: RpcParams<M>): Promise<RpcResults[M]> { return Promise.resolve(undefined as RpcResults[M]) },
      onEvent(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    }
    const client = createNotificationCommandClient(transport)
    let count = 0
    const unsubscribe = client.subscribeInvalidation(() => count++)
    for (const listener of listeners) {
      listener({ method: 'host.changed', params: { kind: 'notifications' } })
      listener({ method: 'host.changed', params: { kind: 'sessions' } })
    }
    expect(count).toBe(1)
    unsubscribe()
  })
})
