import { createStore } from 'zustand/vanilla'

export interface StateReader<State> {
  getSnapshot(): State
  subscribe(listener: () => void): () => void
}

function freezeData<Value>(value: Value): Value {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freezeData(item)
    Object.freeze(value)
  }
  return value
}

/** Private writer; only StateReader leaves the package. State DTOs declare nested readonly fields. */
export function createState<State>(initial: State, onSubscriberError: (error: unknown) => void) {
  const store = createStore<State>(() => freezeData(initial))
  const subscriptions = new Set<() => void>()
  let disposed = false
  const reader: StateReader<State> = Object.freeze({
    getSnapshot: () => store.getState(),
    subscribe(listener: () => void) {
      if (disposed) return () => undefined
      const unsubscribe = store.subscribe(() => {
        try {
          listener()
        } catch (error) {
          onSubscriberError(error)
        }
      })
      subscriptions.add(unsubscribe)
      return () => {
        subscriptions.delete(unsubscribe)
        unsubscribe()
      }
    },
  })
  return {
    reader,
    replace(next: State) {
      if (!disposed) store.setState(freezeData(next), true)
    },
    dispose() {
      disposed = true
      for (const unsubscribe of subscriptions) unsubscribe()
      subscriptions.clear()
    },
  }
}
