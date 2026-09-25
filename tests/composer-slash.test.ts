import { expect, test } from 'bun:test'
import {
  localSlashCanSubmit,
  localSlashCommand,
  slashMatches,
  slashTokenAt,
} from '../packages/app-react/src/composer-slash'

test('only entire supported local command is intercepted, preserving ordinary Run text', () => {
  const available = ['model', 'settings'] as const
  expect(localSlashCommand('/model', available)).toBe('model')
  expect(localSlashCommand(' \n/settings ', available)).toBe('settings')
  for (const text of ['/compact', '/skills', '/MODEL', 'Review /model', '/model then review', '/settings more'])
    expect(localSlashCommand(text, available)).toBeNull()
  expect(localSlashCommand('/model', [])).toBeNull()
})

test('local entry is unavailable while draft, intent, model or approval is pending or unknown', () => {
  const ready = { draftStatus: 'idle', modelPending: false, intentPending: false, permissionLocked: false } as const
  expect(localSlashCanSubmit(ready)).toBe(true)
  expect(localSlashCanSubmit({ ...ready, draftStatus: 'failed' })).toBe(true)
  for (const draftStatus of ['submitting', 'unknown'] as const)
    expect(localSlashCanSubmit({ ...ready, draftStatus })).toBe(false)
  expect(localSlashCanSubmit({ ...ready, draftStatus: undefined })).toBe(false)
  expect(localSlashCanSubmit({ ...ready, modelPending: true })).toBe(false)
  expect(localSlashCanSubmit({ ...ready, intentPending: true })).toBe(false)
  expect(localSlashCanSubmit({ ...ready, permissionLocked: true })).toBe(false)
})

test('slash suggestions are bounded to real local destinations and only token positions', () => {
  const available = ['model', 'settings', 'model'] as const
  expect(slashMatches('', available)).toEqual(['model', 'settings'])
  expect(slashMatches('s', available)).toEqual(['settings'])
  expect(slashMatches('unknown', available)).toEqual([])
  expect(slashMatches('', [])).toEqual([])
  expect(slashTokenAt('Review /mo', 10)).toEqual({ from: 7, to: 10, term: 'mo' })
  expect(slashTokenAt('https://example.test', 8)).toBeNull()
  expect(slashTokenAt('words/model', 11)).toBeNull()
  expect(slashTokenAt('Review /model now', 17)).toBeNull()
})
