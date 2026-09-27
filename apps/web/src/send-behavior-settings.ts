import type { createSettingsCommandClient } from '@hbar/client'
import { encodePath } from '@hbar/schema-core'
import {
  WEB_SEND_BEHAVIORS,
  type WebSendBehavior,
  type WebSendBehaviorPort,
  type WebSendBehaviorRead,
  type WebSendBehaviorWrite,
} from './send-behavior'

const scope = { kind: 'global' as const }
const path = [{ kind: 'field' as const, name: 'client.chatSendBehavior' }]
const field = encodePath(path)
const globalLayer = 'settings:global'

function behavior(value: unknown): WebSendBehavior {
  if (value === WEB_SEND_BEHAVIORS[0] || value === WEB_SEND_BEHAVIORS[1]) return value
  throw { code: 'INVALID_OUTPUT' }
}

function revision(value: unknown): number {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value
  throw { code: 'INVALID_OUTPUT' }
}

function confirmed(
  value: { readonly layerId: string; readonly values: Readonly<Record<string, unknown>>; readonly revision: number },
  expected: WebSendBehavior,
): WebSendBehaviorRead {
  if (value.layerId !== globalLayer || behavior(value.values[field]) !== expected) throw { code: 'INVALID_OUTPUT' }
  return { behavior: expected, revision: revision(value.revision) }
}

function input(write: WebSendBehaviorWrite) {
  return {
    schemaVersion: 1,
    scope,
    path,
    value: write.behavior,
    baselineRevisions: { [globalLayer]: write.baselineRevision },
  }
}

/** Uses the same authenticated Host-global settings layer and exact original set receipt across WebView origins. */
export function createHostSendBehaviorPort(
  settings: ReturnType<typeof createSettingsCommandClient>,
): WebSendBehaviorPort {
  return {
    async read() {
      const snapshot = await settings.execute('settings.get', { scope, path }).catch((error: unknown) => {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'COMMAND_NOT_FOUND')
          throw { code: 'UNSUPPORTED_HOST' }
        throw error
      })
      if (snapshot.schemaVersion !== 1 || !Object.hasOwn(snapshot.resolution.reports, field))
        throw { code: 'UNSUPPORTED_HOST' }
      return {
        behavior: behavior(snapshot.resolution.reports[field]?.effectiveValue),
        revision: revision(snapshot.revisions[globalLayer]),
      }
    },
    async write(write) {
      const result = await settings.execute('settings.set', input(write), { idempotencyKey: write.idempotencyKey })
      return confirmed(result, write.behavior)
    },
    async receipt(write) {
      const result = await settings.execute('settings.receipt', {
        idempotencyKey: write.idempotencyKey,
        commandId: 'settings.set',
        input: input(write),
      })
      return result ? confirmed(result, write.behavior) : null
    },
  }
}
