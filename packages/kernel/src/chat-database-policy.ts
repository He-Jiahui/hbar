import { HbarError } from '@hbar/contracts'
import {
  chatDatabasePolicySchema,
  DEFAULT_CHAT_DATABASE_POLICY,
  type ChatDatabasePolicy,
} from '@hbar/contracts/commands/chat-database'
import { encodePath } from '@hbar/schema-core'
import type { SettingsResolution } from '@hbar/settings-core'

export function resolveChatDatabasePolicy(resolution: SettingsResolution): ChatDatabasePolicy {
  const values = Object.fromEntries(
    Object.keys(DEFAULT_CHAT_DATABASE_POLICY).map((name) => {
      const key = encodePath([{ kind: 'field', name: `chatDatabase.${name}` }])
      return [name, resolution.reports[key]?.effectiveValue]
    }),
  )
  const parsed = chatDatabasePolicySchema.safeParse(values)
  if (!parsed.success)
    throw new HbarError('INVALID_SETTING', parsed.error.issues[0]?.message ?? 'Invalid chat database policy')
  return parsed.data
}
