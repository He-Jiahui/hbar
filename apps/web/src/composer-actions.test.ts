import { describe, expect, test } from 'bun:test'
import type { ComposerAction } from '@hbar/ui-sdk'
import { BUILTIN_COMPOSER_ACTIONS, buildComposerActions } from './composer-actions'
import { filterComposerActions } from './ComposerMenu'

const available = {
  hasSession: true,
  canAttachImages: true,
  hasGoalPlugin: true,
  hasPlanPlugin: true,
  hasBudgetPlugin: true,
}

describe('composer capability actions', () => {
  test('keeps the mode and attachment actions in a stable order', () => {
    const actions = buildComposerActions([], available)
    expect(actions.map((action) => action.id)).toEqual(['goal', 'plan', 'budget', 'add-image', 'add-file'])
    expect(actions.find((action) => action.id === 'add-image')?.disabled).toBeUndefined()
    expect(actions.find((action) => action.id === 'add-file')?.disabled).toBeUndefined()
    expect(actions.find((action) => action.id === 'goal')?.disabled).toBeUndefined()
    expect(actions.find((action) => action.id === 'plan')?.disabled).toBeUndefined()
    expect(actions.find((action) => action.id === 'budget')?.disabled).toBeUndefined()
  })

  test('keeps a missing host plugin visible but unavailable', () => {
    const actions = buildComposerActions([], {
      ...available,
      hasBudgetPlugin: false,
    })
    const budget = actions.find((action) => action.id === 'budget')
    expect(budget?.disabled).toBe(true)
    expect(budget?.disabledReason).toBe('Budget 插件未启用')
  })

  test('disables session modes in a draft without hiding them', () => {
    const actions = buildComposerActions([], { hasSession: false, canAttachImages: true })
    const byId = Object.fromEntries(actions.map((action) => [action.id, action]))
    expect(byId.goal?.disabled).toBe(true)
    expect(byId.plan?.disabledReason).toBe('请先打开一个会话')
    expect(byId['add-image']?.disabled).toBeUndefined()
    expect(byId['add-file']?.disabled).toBeUndefined()
  })

  test('opens image and generic file pickers with the matching filters', async () => {
    const opened: { accept?: string; multiple?: boolean }[] = []
    const context = {
      openFilePicker: (options?: { accept?: string; multiple?: boolean }) => opened.push(options ?? {}),
    }
    for (const id of ['add-image', 'add-file']) {
      const action = BUILTIN_COMPOSER_ACTIONS.find((item) => item.id === id)
      await action?.execute?.(context)
    }
    expect(opened).toEqual([
      { accept: 'image/png,image/jpeg,image/webp,image/gif', multiple: true },
      { accept: '*/*', multiple: true },
    ])
  })

  test('searches labels, descriptions and plugin keywords', () => {
    const pluginAction: ComposerAction = {
      id: 'review',
      label: 'Review changes',
      description: 'Inspect the current diff',
      group: 'extensions',
      icon: 'puzzle',
      keywords: ['审核', 'diff'],
    }
    expect(filterComposerActions([...BUILTIN_COMPOSER_ACTIONS, pluginAction], 'diff')).toEqual([pluginAction])
    expect(filterComposerActions(BUILTIN_COMPOSER_ACTIONS, '目标')).toHaveLength(1)
  })
})
