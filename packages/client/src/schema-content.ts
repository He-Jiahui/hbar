import { SchemaContentError, type SchemaCallbackPort } from '@hbar/schema-core'
import type { HbarClient } from './index'

export function createSchemaCallbackClient(client: HbarClient): SchemaCallbackPort {
  return {
    async query(callbackId, request, context) {
      const queryId = crypto.randomUUID()
      const cancel = () => {
        void client.call('schema.content.cancel', { queryId }).catch(() => undefined)
      }
      if (context.signal.aborted) context.signal.throwIfAborted()
      context.signal.addEventListener('abort', cancel, { once: true })
      try {
        try {
          return await client.call('schema.content.query', { queryId, callbackId, request })
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string')
            throw new SchemaContentError(error.code, error instanceof Error ? error.message : String(error))
          throw error
        }
      } finally {
        context.signal.removeEventListener('abort', cancel)
      }
    },
  }
}
