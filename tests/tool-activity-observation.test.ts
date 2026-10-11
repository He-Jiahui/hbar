import { describe, expect, test } from 'bun:test'
import { toolActivitySchema } from '@hbar/contracts/tool-activity'
import { createSkillReadObservation } from '../packages/kernel/src/skills/read-observation'
import { fileReadActivity, fileWriteActivity } from '../plugins/local-tools/src/file-activity'

describe('durable tool activity observations', () => {
  test('counts complete instruction coverage once per Run and revision, including out-of-order pages', () => {
    const tracker = createSkillReadObservation()
    expect(tracker.observe('run', 'skill', 'r1', 6, 4, 10)).toBe(false)
    expect(tracker.observe('run', 'skill', 'r1', 0, 3, 10)).toBe(false)
    expect(tracker.observe('run', 'skill', 'r1', 2, 4, 10)).toBe(true)
    expect(tracker.observe('run', 'skill', 'r1', 0, 10, 10)).toBe(false)
    expect(tracker.observe('run', 'skill', 'r2', 0, 10, 10)).toBe(true)
    expect(tracker.observe('other', 'skill', 'r1', 0, 10, 10)).toBe(true)
    tracker.dispose()
  })
  test('does not claim instruction use while a middle page is missing', () => {
    const tracker = createSkillReadObservation()
    expect(tracker.observe('run', 'skill', 'r', 0, 3, 9)).toBe(false)
    expect(tracker.observe('run', 'skill', 'r', 6, 3, 9)).toBe(false)
    expect(tracker.observe('run', 'skill', 'r', 3, 3, 9)).toBe(true)
  })
  test('measures actual read text and preserves unknown line counts for binary files', () => {
    expect(fileReadActivity('a', '甲\r\n乙\n').files?.[0]?.linesRead).toBe(2)
    expect(fileReadActivity('empty', '').files?.[0]?.linesRead).toBe(0)
    expect(fileReadActivity('image.png', null).files?.[0]?.linesRead).toBeNull()
  })
  test('measures changed lines once even with several changed fragments in one line', () => {
    const result = fileWriteActivity('a', 'edit', 'abc def ghi\nunchanged\n', 'abX def ghY\nunchanged\n')
    expect(result.files?.[0]).toMatchObject({ addedLines: 1, removedLines: 1 })
    expect(toolActivitySchema.safeParse(result).success).toBe(true)
    expect(fileWriteActivity('a', 'write', 'a\r\n', 'a\n').files?.[0]?.patches).toBe(0)
    expect(fileWriteActivity('new', 'write', '', 'one\ntwo\n').files?.[0]).toMatchObject({
      addedLines: 2,
      removedLines: 0,
    })
  })
  test('rejects negative measurements and unbounded resource paths', () => {
    expect(
      toolActivitySchema.safeParse({
        files: [{ path: 'a', operation: 'read', linesRead: -1, patches: null, addedLines: null, removedLines: null }],
      }).success,
    ).toBe(false)
    expect(toolActivitySchema.safeParse({ skill: { id: 'a'.repeat(4001) } }).success).toBe(false)
  })
})
