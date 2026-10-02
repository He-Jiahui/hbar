import { createCommandClient, COMMAND_PROTOCOL_VERSION, type ExecuteOptions } from '@hbar/commands'
import { notificationCommands } from '@hbar/contracts/commands/notifications'
import type { ClientTransport } from './transport'
import { notificationCreatedWireSchema, type NotificationFreshEvent } from '@hbar/contracts/commands/notifications'
import type { WireNotification } from '@hbar/contracts'

export interface NotificationClientTransport extends ClientTransport {
  onEvent(listener: (event: WireNotification) => void): () => void
}

export function createNotificationCommandClient(client: NotificationClientTransport) {
  const commands = createCommandClient(notificationCommands, {
    execute(id, input, options) {
      return client.call('command.execute', {
        protocol: COMMAND_PROTOCOL_VERSION,
        requestId: options?.requestId ?? crypto.randomUUID(),
        commandId: id,
        commandVersion: options?.version ?? 1,
        ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
        input,
      })
    },
  })
  return {
    page: (input: Parameters<typeof commands.execute<'notification.page'>>[1]) => commands.execute('notification.page', input),
    markRead: (input: Parameters<typeof commands.execute<'notification.markRead'>>[1], options?: ExecuteOptions) => commands.execute('notification.markRead', input, { ...options, idempotencyKey: options?.idempotencyKey ?? crypto.randomUUID() }),
    markAllRead: (options?: ExecuteOptions) => commands.execute('notification.markAllRead', {}, { ...options, idempotencyKey: options?.idempotencyKey ?? crypto.randomUUID() }),
    preferences: () => commands.execute('notification.preferences.get', {}),
    setPreferences: (input: Parameters<typeof commands.execute<'notification.preferences.set'>>[1], options?: ExecuteOptions) => commands.execute('notification.preferences.set', input, { ...options, idempotencyKey: options?.idempotencyKey ?? crypto.randomUUID() }),
    receipt: (input: Parameters<typeof commands.execute<'notification.receipt'>>[1], options?: ExecuteOptions) => commands.execute('notification.receipt', input, options),
    subscribeFresh(listener: (event: NotificationFreshEvent) => void) {
      return client.onEvent((raw) => {
        const parsed = notificationCreatedWireSchema.safeParse(raw)
        if (parsed.success) listener(parsed.data.params)
      })
    },
    subscribeInvalidation(listener: () => void) {
      return client.onEvent((raw) => {
        if (raw.method === 'host.changed' && raw.params.kind === 'notifications') listener()
      })
    },
  }
}
