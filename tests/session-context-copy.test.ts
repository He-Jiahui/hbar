import { expect, test } from 'bun:test'
import { sessionContextCopy } from '../apps/web/src/session-context-copy'

test('generated isolated branches have a readable bilingual caption while their full identity remains available', () => {
  const branch = `hbar/session-launch/${'a'.repeat(64)}`
  expect(sessionContextCopy('zh-CN').branchCaption(branch)).toBe('隔离 · aaaaaaaa')
  expect(sessionContextCopy('en-US').branchCaption(branch)).toBe('Isolated · aaaaaaaa')
  expect(sessionContextCopy('zh-CN').branch(branch)).toBe(`当前分支：${branch}`)
  expect(sessionContextCopy('en-US').branch(branch)).toBe(`Current branch: ${branch}`)
})

test('named, long and noncanonical branches are displayed unchanged rather than guessed to be isolated', () => {
  for (const branch of ['main', 'feature/中文项目迁移', 'feature/' + 'long-'.repeat(50), 'hbar/session-launch/custom'])
    for (const locale of ['en-US', 'zh-CN'] as const)
      expect(sessionContextCopy(locale).branchCaption(branch)).toBe(branch)
})
