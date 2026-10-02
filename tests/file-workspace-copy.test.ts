import { expect, test } from 'bun:test'
import { getShellCopy } from '../apps/web/src/shell-copy'

test('Files target and Host errors have localized copy without raw codes or false size claims', () => {
  const cases = [
    {
      locale: 'en-US' as const,
      unresolved: 'Run this session first, then refresh Files.',
      changed: 'The session file target changed. Refresh Files before continuing.',
      invalid: 'Host returned an invalid Files response. Refresh Files or reconnect.',
      capability: 'A required Host capability is unavailable. Reconnect, then refresh Files.',
    },
    {
      locale: 'zh-CN' as const,
      unresolved: '请先运行此会话，再刷新“文件”面板。',
      changed: '会话文件目标已变化；请先刷新“文件”面板。',
      invalid: 'Host 返回的文件响应无效；请刷新“文件”面板或重新连接。',
      capability: '所需的 Host 能力不可用；请重新连接后刷新“文件”面板。',
    },
  ]
  for (const expected of cases) {
    const files = getShellCopy(expected.locale).files
    expect(files.error('SESSION_LAUNCH_TARGET_UNRESOLVED')).toBe(expected.unresolved)
    expect(files.tree.error('SESSION_LAUNCH_TARGET_UNRESOLVED')).toBe(expected.unresolved)
    expect(files.tree.searchError('SESSION_LAUNCH_TARGET_UNRESOLVED')).toBe(expected.unresolved)
    expect(files.changes.error('SESSION_LAUNCH_TARGET_UNRESOLVED')).toBe(expected.unresolved)
    expect(files.error('COMMAND_CONFLICT')).toBe(expected.changed)
    expect(files.error('TARGET_CHANGED')).toBe(expected.changed)
    expect(files.error('INVALID_OUTPUT')).toBe(expected.invalid)
    expect(files.changes.error('CAPABILITY_UNAVAILABLE')).toBe(expected.capability)
    expect(files.changes.error('CAPABILITY_UNAVAILABLE')).not.toContain('browse all files')
    expect(files.error('INPUT_TOO_LARGE').toLowerCase()).toContain(expected.locale === 'en-US' ? 'too large' : '过大')
    for (const code of ['SESSION_LAUNCH_TARGET_UNRESOLVED', 'COMMAND_CONFLICT', 'TARGET_CHANGED', 'INVALID_OUTPUT']) {
      expect(files.error(code)).not.toContain(code)
      expect(files.error(code).toLowerCase()).not.toContain('too large')
    }
  }
})
