import { expect, test } from 'bun:test'
import { chatDatabaseSettingsFields } from '@hbar/contracts/commands/chat-database'
import { resolveChatDatabaseSettingCopy } from '../apps/web/src/chat-database-settings-copy'

test('each cleanup setting has Host-owned Chinese and English labels and help', () => {
  for (const locale of ['zh-CN', 'en-US'] as const) {
    expect(resolveChatDatabaseSettingCopy(locale, 'i18n:settings.groups.chatDatabase')).toBeDefined()
    for (const field of chatDatabaseSettingsFields) {
      expect(resolveChatDatabaseSettingCopy(locale, field.labelKey)).toBeTruthy()
      expect(resolveChatDatabaseSettingCopy(locale, field.helpKey ?? '')).toBeTruthy()
    }
    expect(resolveChatDatabaseSettingCopy(locale, 'i18n:settings.other.label')).toBeUndefined()
  }
  expect(resolveChatDatabaseSettingCopy('zh-CN', 'i18n:settings.chatDatabase.capacityFirst.help')).toContain('保留天数')
})
