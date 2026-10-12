'use client'

import * as React from 'react'

/**
 * Keeps a keyboard-initiated card move usable when the host moves the card to
 * another column or lane and React remounts its element. Pointer dragging does
 * not call `requestFocus`, so it never steals focus from the browser's drag
 * interaction.
 */
function useKanbanKeyboardGrabFocus(grabbedCardId: string | null) {
  const cardElements = React.useRef(new Map<string, HTMLElement>())
  const cardCallbacks = React.useRef(new Map<string, (element: HTMLElement | null) => void>())
  const pendingCardId = React.useRef<string | null>(null)
  const [focusRequestVersion, setFocusRequestVersion] = React.useState(0)

  const cardRef = React.useCallback((cardId: string) => {
    const callbacks = cardCallbacks.current
    const existing = callbacks.get(cardId)
    if (existing) {
      return existing
    }
    const callback = (element: HTMLElement | null) => {
      if (element) {
        cardElements.current.set(cardId, element)
      } else {
        cardElements.current.delete(cardId)
        cardCallbacks.current.delete(cardId)
      }
    }
    callbacks.set(cardId, callback)
    return callback
  }, [])

  const requestFocus = React.useCallback((cardId: string, action: () => void) => {
    pendingCardId.current = cardId
    setFocusRequestVersion((version) => version + 1)
    action()
  }, [])

  React.useLayoutEffect(() => {
    const cardId = pendingCardId.current
    if (!cardId) {
      return
    }
    if (grabbedCardId !== null && grabbedCardId !== cardId) {
      // A different card owns the next gesture. Do not move focus back to a
      // stale card after a host update.
      pendingCardId.current = null
      return
    }
    const element = cardElements.current.get(cardId)
    if (element && element !== document.activeElement) {
      element.focus()
    }
    pendingCardId.current = null
  }, [focusRequestVersion, grabbedCardId])

  React.useEffect(
    () => () => {
      cardElements.current.clear()
      cardCallbacks.current.clear()
    },
    [],
  )

  return { cardRef, requestFocus }
}

export default useKanbanKeyboardGrabFocus
