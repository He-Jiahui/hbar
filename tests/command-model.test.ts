import { expect, test } from 'bun:test'
import { createCommandModel, type PaletteCommand } from '../apps/web/src/command-model'

test('command selection survives reordering by ID and removed IDs cannot silently invoke another command', async () => {
  const model = createCommandModel(),
    source = {},
    executed: string[] = []
  const command = (id: string, label = id): PaletteCommand => ({
    id,
    label,
    execute() {
      executed.push(id)
    },
  })
  model.sync([command('a'), command('b'), command('a', 'Updated A')], source, 'workspace')
  model.open()
  model.select('b')
  model.sync([command('b'), command('c')], source, 'workspace')
  expect(model.store.getState().selectedId).toBe('b')
  model.sync([command('c')], source, 'workspace')
  expect(model.store.getState()).toMatchObject({ selectedId: undefined, selectionLost: true })
  await model.execute('b')
  expect(executed).toEqual([])
  model.move(1)
  await model.execute('c')
  expect(executed).toEqual(['c'])
})
test('failure, duplicate execution and an old result after switching workspaces preserve current state', async () => {
  const model = createCommandModel(),
    source = {}
  let finish!: () => void,
    calls = 0
  model.sync(
    [
      {
        id: 'slow',
        label: 'Slow',
        execute: () => {
          calls++
          return new Promise<void>((resolve) => {
            finish = resolve
          })
        },
      },
    ],
    source,
    'one',
  )
  model.open()
  const pending = model.execute('slow')
  await model.execute('slow')
  expect(calls).toBe(1)
  model.sync(
    [
      {
        id: 'next',
        label: 'Next',
        execute() {
          throw new Error('Failed to open')
        },
      },
    ],
    source,
    'two',
  )
  model.select('next')
  finish()
  await pending
  expect(model.store.getState()).toMatchObject({ open: true, selectedId: 'next', busyId: undefined })
  await model.execute('next')
  expect(model.store.getState()).toMatchObject({ open: true, error: 'Failed to open', busyId: undefined })
})
test('queries include contributed keywords and keyboard navigation skips disabled entries', () => {
  const model = createCommandModel(),
    source = {}
  model.sync(
    [
      { id: 'a', label: '中文命令', keywords: ['workspace'], execute() {} },
      { id: 'b', label: 'Disabled', disabled: true, execute() {} },
      { id: 'c', label: 'Last', execute() {} },
    ],
    source,
    'one',
  )
  model.open()
  model.move(1)
  expect(model.store.getState().selectedId).toBe('c')
  model.query('WORKSPACE')
  expect(model.store.getState().items.map((item) => item.id)).toEqual(['a'])
})
