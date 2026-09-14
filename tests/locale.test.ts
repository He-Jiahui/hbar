import { afterEach, expect, test } from 'bun:test'
import { resolveLocale, setLocale, translate } from '../apps/web/src/locale'
import { useWorkbench } from '../apps/web/src/stores'

afterEach(() => {
  useWorkbench.setState({ locale: 'zh-CN' })
})

test('resolves supported locale families and keeps message keys type-safe', () => {
  expect(resolveLocale('zh-Hans-CN')).toBe('zh-CN')
  expect(resolveLocale('en-GB')).toBe('en-US')
  expect(translate('zh-CN', 'chatApprove')).toBe('批准')
  expect(translate('en-US', 'chatApprove')).toBe('Approve')
})

test('updates the persisted workbench locale through the host adapter', () => {
  expect(setLocale('en-GB')).toBe('en-US')
  expect(useWorkbench.getState().locale).toBe('en-US')
  expect(setLocale('ja-JP')).toBe('zh-CN')
  expect(useWorkbench.getState().locale).toBe('zh-CN')
})
