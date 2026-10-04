import { expect, test } from 'bun:test'
import { createCardPreviewStore, type CardPreviewSeed } from '../apps/hbar-app-ui-preview/src/cardPreviewModel'

function makeSeed(overrides: Partial<CardPreviewSeed> = {}): CardPreviewSeed {
  return {
    ownerId: 'card-preview-a',
    variant: 1,
    fixtureId: 'default',
    slots: [
      {
        id: 'period',
        items: [{ id: 'monthly' }, { id: 'annual' }],
        initialSelectedId: 'monthly',
      },
    ],
    flags: [{ id: 'featured', value: false }],
    steps: [
      { id: 'profile', complete: false },
      { id: 'invite', complete: true },
    ],
    requestActions: [{ actionId: 'open' }, { actionId: 'choose', targetId: 'annual' }],
    ...overrides,
  }
}

test('card seed normalization is first-wins, exact for nonblank IDs, and skips disabled initial choices', () => {
  const store = createCardPreviewStore(
    makeSeed({
      slots: [
        {
          id: 'plans',
          initialSelectedId: 'disabled',
          items: [
            { id: 'disabled', disabled: true },
            { id: ' first ' },
            { id: ' first ', disabled: true },
            { id: '   ' },
          ],
        },
        { id: 'plans', items: [{ id: 'ignored' }] },
        { id: 'empty', items: [{ id: 'none', disabled: true }] },
        { id: ' ', items: [{ id: 'blank-slot' }] },
      ],
      flags: [
        { id: 'flag', value: true },
        { id: 'flag', value: false },
        { id: ' ', value: true },
      ],
      steps: [
        { id: 'step', complete: true },
        { id: 'step', complete: false },
        { id: 'locked', complete: true, disabled: true },
        { id: '', complete: true },
      ],
      requestActions: [
        { actionId: 'open', targetId: ' first ' },
        { actionId: 'open', targetId: ' first ' },
        { actionId: 'open' },
        { actionId: ' ', targetId: 'ignored' },
        { actionId: 'open', targetId: '   ' },
      ],
    }),
  )

  const state = store.getState()
  expect(state.slots.map(({ id, items }) => [id, items.map(({ id: itemId }) => itemId)])).toEqual([
    ['plans', ['disabled', ' first ']],
    ['empty', ['none']],
  ])
  expect(state.selectedBySlot).toEqual({ plans: ' first ', empty: undefined })
  expect(state.flags).toEqual([{ id: 'flag', value: true }])
  expect(state.flagsById).toEqual({ flag: true })
  expect(state.steps).toEqual([
    { id: 'step', complete: true },
    { id: 'locked', complete: true, disabled: true },
  ])
  expect(state.completedByStep).toEqual({ step: true, locked: true })
  expect(state.requestActions).toEqual([{ actionId: 'open', targetId: ' first ' }, { actionId: 'open' }])

  expect(state.select(state.ownerId, 'plans', 'disabled')).toBe(false)
  expect(state.select(state.ownerId, 'empty', 'none')).toBe(false)
  expect(state.setStepComplete(state.ownerId, 'locked', false)).toBe(false)
  expect(state.setStepComplete(state.ownerId, 'missing', true)).toBe(false)
})

test('card mutations and requests are owner-bound, local, exact, and duplicate-safe', () => {
  const first = createCardPreviewStore(makeSeed())
  const second = createCardPreviewStore(makeSeed({ ownerId: 'card-preview-b' }))
  const ownerId = first.getState().ownerId

  expect(first.getState().select('other-owner', 'period', 'annual')).toBe(false)
  expect(first.getState().setFlag('other-owner', 'featured', true)).toBe(false)
  expect(first.getState().setStepComplete('other-owner', 'profile', true)).toBe(false)
  expect(first.getState().resetSteps('other-owner')).toBe(false)
  expect(first.getState().request('other-owner', { actionId: 'open' })).toBeUndefined()

  const open = first.getState().request(ownerId, { actionId: 'open' })
  expect(open).toEqual({ ownerId, variant: 1, fixtureId: 'default', actionId: 'open' })
  expect(open && 'targetId' in open).toBe(false)
  expect(first.getState().request(ownerId, { actionId: 'open' })).toBeUndefined()
  expect(first.getState().request(ownerId, { actionId: 'choose', targetId: 'monthly' })).toBeUndefined()
  expect(first.getState().request(ownerId, { actionId: 'choose', targetId: 'annual' })).toMatchObject({
    actionId: 'choose',
    targetId: 'annual',
  })
  expect(first.getState().request(ownerId, { actionId: 'choose', targetId: 'annual' })).toBeUndefined()
  expect(first.getState().request(ownerId, { actionId: 'choose', targetId: ' annual' })).toBeUndefined()

  expect(first.getState().setFlag(ownerId, 'featured', true)).toBe(true)
  expect(first.getState().flagsById.featured).toBe(true)
  expect(first.getState().lastRequest).toBeUndefined()
  expect(first.getState().request(ownerId, { actionId: 'open' })).toBeDefined()
  expect(first.getState().setStepComplete(ownerId, 'profile', true)).toBe(true)
  expect(first.getState().completedByStep.profile).toBe(true)
  expect(first.getState().lastRequest).toBeUndefined()
  expect(first.getState().request(ownerId, { actionId: 'open' })).toBeDefined()
  expect(first.getState().select(ownerId, 'period', 'annual')).toBe(true)
  expect(first.getState().selectedBySlot.period).toBe('annual')
  expect(first.getState().lastRequest).toBeUndefined()

  expect(second.getState().selectedBySlot.period).toBe('monthly')
  expect(second.getState().flagsById.featured).toBe(false)
  expect(second.getState().completedByStep.profile).toBe(false)
  expect(second.getState().lastRequest).toBeUndefined()
})

test('card refresh preserves valid local values, falls back deterministically, and prunes stale fields and intent', () => {
  const store = createCardPreviewStore(
    makeSeed({
      variant: 7,
      slots: [
        { id: 'primary', items: [{ id: 'one' }, { id: 'two' }], initialSelectedId: 'one' },
        { id: 'secondary', items: [{ id: 'alpha' }, { id: 'beta' }], initialSelectedId: 'alpha' },
      ],
      flags: [
        { id: 'pinned', value: false },
        { id: 'removed-flag', value: true },
      ],
      steps: [
        { id: 'step-1', complete: false },
        { id: 'removed-step', complete: true },
      ],
      requestActions: [{ actionId: 'open', targetId: 'removed-item' }],
    }),
  )
  const ownerId = store.getState().ownerId

  expect(store.getState().select(ownerId, 'secondary', 'beta')).toBe(true)
  expect(store.getState().setFlag(ownerId, 'pinned', true)).toBe(true)
  expect(store.getState().setStepComplete(ownerId, 'step-1', true)).toBe(true)
  expect(store.getState().request(ownerId, { actionId: 'open', targetId: 'removed-item' })).toBeDefined()

  expect(store.getState().refresh('other-owner', makeSeed({ variant: 7 }))).toBe(false)
  expect(store.getState().refresh(ownerId, makeSeed({ variant: 8 }))).toBe(false)
  expect(store.getState().refresh(ownerId, makeSeed({ variant: 7, fixtureId: 'other' }))).toBe(false)
  expect(
    store.getState().refresh(
      ownerId,
      makeSeed({
        variant: 7,
        slots: [
          { id: 'primary', items: [{ id: 'two', disabled: true }, { id: 'three' }], initialSelectedId: 'two' },
          { id: 'secondary', items: [{ id: 'gamma' }], initialSelectedId: 'gamma' },
          { id: 'empty', items: [{ id: 'blocked', disabled: true }] },
        ],
        flags: [{ id: 'pinned', value: false }],
        steps: [{ id: 'step-1', complete: false }],
        requestActions: [{ actionId: 'open', targetId: 'new-item' }],
      }),
    ),
  ).toBe(true)

  const state = store.getState()
  expect(state.selectedBySlot).toEqual({ primary: 'three', secondary: 'gamma', empty: undefined })
  expect(state.flagsById).toEqual({ pinned: true })
  expect(state.completedByStep).toEqual({ 'step-1': true })
  expect(state.lastRequest).toBeUndefined()
  expect(state.select(ownerId, 'primary', 'two')).toBe(false)
  expect(state.setStepComplete(ownerId, 'removed-step', false)).toBe(false)
  expect(state.request(ownerId, { actionId: 'open', targetId: 'removed-item' })).toBeUndefined()
  expect(state.request(ownerId, { actionId: 'open', targetId: 'new-item' })).toBeDefined()
})

test('card reset clears enabled onboarding steps and keeps disabled steps guarded', () => {
  const store = createCardPreviewStore(
    makeSeed({
      steps: [
        { id: 'enabled', complete: true },
        { id: 'disabled', complete: true, disabled: true },
      ],
    }),
  )
  const ownerId = store.getState().ownerId

  expect(store.getState().request(ownerId, { actionId: 'open' })).toBeDefined()
  expect(store.getState().resetSteps(ownerId)).toBe(true)
  expect(store.getState().completedByStep).toEqual({ enabled: false, disabled: true })
  expect(store.getState().lastRequest).toBeUndefined()
  expect(store.getState().resetSteps(ownerId)).toBe(true)
  expect(store.getState().setStepComplete(ownerId, 'disabled', false)).toBe(false)
})
