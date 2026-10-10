import { expect, test } from 'bun:test'
import { sessionContextCopy } from '../apps/web/src/session-context-copy'

test('generated isolated branches preserve their full bilingual identity while context labels stay localized', () => {
  const branch = `hbar/session-launch/${'a'.repeat(64)}`
  // The visual caption keeps the complete branch identity. The surrounding
  // context chip exposes the localized label and title separately.
  expect(sessionContextCopy('zh-CN').branchCaption(branch)).toBe(branch)
  expect(sessionContextCopy('en-US').branchCaption(branch)).toBe(branch)
  expect(sessionContextCopy('zh-CN').branch(branch)).toBe(`目标分支：${branch}`)
  expect(sessionContextCopy('en-US').branch(branch)).toBe(`Target branch: ${branch}`)
})

test('named, long and noncanonical branches are displayed unchanged rather than guessed to be isolated', () => {
  for (const branch of ['main', 'feature/中文项目迁移', 'feature/' + 'long-'.repeat(50), 'hbar/session-launch/custom'])
    for (const locale of ['en-US', 'zh-CN'] as const)
      expect(sessionContextCopy(locale).branchCaption(branch)).toBe(branch)
})
