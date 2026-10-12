import { expect, test } from 'vitest'
import { act, render, cleanup } from '@testing-library/react'
import { createStore } from 'zustand/vanilla'
import { useHbarRuntimeSelector } from './runtime'

test('an unrelated session update does not render a selected session observer', () => {
  const store = createStore(() => ({ selected: 'A', other: 'B' }))
  const reader = { getSnapshot: store.getState, subscribe: (listener: () => void) => store.subscribe(listener) }
  let renders = 0
  function View() {
    renders += 1
    return <span>{useHbarRuntimeSelector(reader, (state) => state.selected)}</span>
  }
  try {
    const view = render(<View />)
    const initial = renders
    act(() => store.setState({ other: 'B changed' }))
    expect(renders).toBe(initial)
    expect(view.container.textContent).toBe('A')
    act(() => store.setState({ selected: 'A changed' }))
    expect(renders).toBe(initial + 1)
    expect(view.container.textContent).toBe('A changed')
  } finally {
    cleanup()
  }
})
