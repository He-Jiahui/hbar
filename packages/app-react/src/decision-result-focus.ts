import { useCallback, useEffect, useRef, type RefObject } from 'react'

interface DecisionResultFocus {
  readonly region: RefObject<HTMLElement | null>
  readonly rememberActionFocus: (button: HTMLButtonElement) => void
}

/** Ephemeral focus ownership; Host confirmation alone must never steal another control's focus. */
export function useDecisionResultFocus(complete: boolean): DecisionResultFocus {
  const region = useRef<HTMLElement | null>(null)
  const actionFocus = useRef<HTMLButtonElement | null>(null)
  const rememberActionFocus = useCallback((button: HTMLButtonElement) => {
    actionFocus.current = button
  }, [])

  useEffect(() => {
    const owner = region.current?.ownerDocument
    if (!owner) return
    const cancel = () => {
      actionFocus.current = null
    }
    const moved = (event: FocusEvent) => {
      if (event.target !== actionFocus.current && event.target !== owner.body) cancel()
    }
    const interacted = (event: Event) => {
      // A disabled action can blur to BODY before repeated activation; that is not a new focus owner.
      if (
        event instanceof KeyboardEvent &&
        event.target === owner.body &&
        actionFocus.current?.disabled &&
        (event.key === 'Enter' || event.key === ' ')
      )
        return
      if (!(event.target instanceof Node) || !actionFocus.current?.contains(event.target)) cancel()
    }
    owner.addEventListener('pointerdown', interacted, true)
    owner.addEventListener('keydown', interacted, true)
    owner.addEventListener('focusin', moved, true)
    return () => {
      cancel()
      owner.removeEventListener('pointerdown', interacted, true)
      owner.removeEventListener('keydown', interacted, true)
      owner.removeEventListener('focusin', moved, true)
    }
  }, [])

  useEffect(() => {
    if (!complete) return
    const source = actionFocus.current
    actionFocus.current = null
    const target = region.current
    const owner = target?.ownerDocument
    if (!source || !owner?.hasFocus() || owner.querySelector('dialog:modal, :popover-open')) return
    if (owner.activeElement !== owner.body && owner.activeElement !== source) return
    if (!target?.isConnected || target.getClientRects().length === 0) return
    target.focus({ preventScroll: true })
  }, [complete])

  return { region, rememberActionFocus }
}
