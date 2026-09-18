import { createCommandClient } from '@hbar/commands'
import { settingsCommands } from '@hbar/contracts/commands/settings'
import type { HbarClient } from './index'

export function createSettingsCommandClient(client: HbarClient) {
  return createCommandClient(settingsCommands, {
    execute(commandId, input, options) {
      return client.call('command.execute', {
        protocol: 1,
        requestId: options?.requestId ?? crypto.randomUUID(),
        commandId,
        commandVersion: options?.version ?? 1,
        ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
        input,
      })
    },
  })
}
