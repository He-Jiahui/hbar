import { expect, test } from 'bun:test'
import {
  localSlashCanSubmit,
  localSlashCommand,
  localAgentSlash,
  localGoalSlash,
  slashMatches,
  slashTokenAt,
  shouldSubmitExactSlashOnSend,
} from '../packages/app-react/src/composer-slash'

test('only entire supported local command is intercepted, preserving ordinary Run text', () => {
  const available = ['model', 'settings', 'goal', 'agents', 'cost', 'help'] as const
  expect(localSlashCommand('/model', available)).toBe('model')
  expect(localSlashCommand(' \n/settings ', available)).toBe('settings')
  expect(localSlashCommand('/cost', available)).toBe('cost')
  expect(localSlashCommand('/agents', available)).toBe('agents')
  expect(localSlashCommand('/help', available)).toBe('help')
  expect(localSlashCommand('/goal Review the navigation', available)).toBe('goal')
  expect(localSlashCommand('/goal clear', available)).toBe('goal')
  expect(localSlashCommand('/goal', available)).toBe('goal')
  for (const text of [
    '/compact',
    '/skills',
    '/MODEL',
    'Review /model',
    '/model then review',
    '/settings more',
    '/agents create one',
    '/agent debugger investigate',
    '/cost now',
    '/help me',
  ])
    expect(localSlashCommand(text, available)).toBeNull()
  expect(localSlashCommand('/model', [])).toBeNull()
  expect(localSlashCommand('/agent explore Review this', [...available, 'agent'])).toBe('agent')
  expect(localSlashCommand('/agent debugger investigate', [...available, 'agent'])).toBe('agent')
  expect(localSlashCommand('/agent', [...available, 'agent'])).toBe('agent')
  expect(localSlashCommand('Explain /agent explore', [...available, 'agent'])).toBeNull()
})

test('only an exact selected allowlisted slash uses the configured send shortcut', () => {
  const exact = {
    text: '/model',
    activeTerm: 'model',
    selectedCommand: 'model',
    availableCommands: ['model', 'settings'],
    submitCommands: ['model', 'settings'],
    sendShortcut: true,
  } as const
  expect(shouldSubmitExactSlashOnSend(exact)).toBe(true)
  expect(shouldSubmitExactSlashOnSend({ ...exact, sendShortcut: false })).toBe(false)
  expect(shouldSubmitExactSlashOnSend({ ...exact, text: '/mo', activeTerm: 'mo' })).toBe(false)
  expect(shouldSubmitExactSlashOnSend({ ...exact, text: 'Review /model' })).toBe(false)
  expect(shouldSubmitExactSlashOnSend({ ...exact, activeTerm: 'mo' })).toBe(false)
  expect(shouldSubmitExactSlashOnSend({ ...exact, availableCommands: ['settings'] })).toBe(false)
  expect(shouldSubmitExactSlashOnSend({ ...exact, submitCommands: ['settings'] })).toBe(false)
  expect(shouldSubmitExactSlashOnSend({ ...exact, selectedCommand: undefined })).toBe(false)
})

test('Agent slash requires a type and a nonempty exact objective', () => {
  expect(localAgentSlash('/agent explore Review the navigation')).toEqual({
    profileId: 'explore',
    objective: 'Review the navigation',
  })
  expect(localAgentSlash('/agent explore Review\nall panes')).toEqual({
    profileId: 'explore',
    objective: 'Review\nall panes',
  })
  for (const text of ['/agent', '/agent explore', '/agent explore  ', '/agents explore task', '/agentexplore task'])
    expect(localAgentSlash(text)).toBeNull()
})

test('Goal slash arguments are explicit and never mistaken for ordinary text', () => {
  expect(localGoalSlash('/goal Verify navigation')).toEqual({ action: 'set', objective: 'Verify navigation' })
  expect(localGoalSlash(' /goal clear ')).toEqual({ action: 'clear' })
  for (const text of [
    '/goal',
    '/goal ',
    '/goalclear',
    'Explain /goal clear',
    '/goal status',
    '/goal pause',
    '/goal resume',
    '/goal complete',
    '/goal --tokens 1000',
  ])
    expect(localGoalSlash(text)).toBeNull()
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
  const available = ['model', 'settings', 'goal', 'agents', 'cost', 'help', 'model'] as const
  expect(slashMatches('', available)).toEqual(['model', 'settings', 'goal', 'agents', 'cost', 'help'])
  expect(slashMatches('a', available)).toEqual(['agents'])
  expect(slashMatches('s', available)).toEqual(['settings'])
  expect(slashMatches('c', available)).toEqual(['cost'])
  expect(slashMatches('h', available)).toEqual(['help'])
  expect(slashMatches('unknown', available)).toEqual([])
  expect(slashMatches('', [])).toEqual([])
  expect(slashMatches('ag', ['agent', 'agent explore', 'agents'])).toEqual(['agent', 'agent explore', 'agents'])
  expect(slashTokenAt('Review /mo', 10)).toEqual({ from: 7, to: 10, term: 'mo' })
  expect(slashTokenAt('https://example.test', 8)).toBeNull()
  expect(slashTokenAt('words/model', 11)).toBeNull()
  expect(slashTokenAt('Review /model now', 17)).toBeNull()
})
