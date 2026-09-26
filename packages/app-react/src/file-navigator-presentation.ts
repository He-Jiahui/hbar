import { useEffect, useRef, useState } from 'react'

// Reserve usable text-reader and navigator space using this pane's width,
// not the global viewport (a dock can be narrow on a large display).
const TWO_PANE_REM = 44

export function useFileNavigatorPresentation(target: string, selection: string | null) {
  const layout = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const navigator = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState(false)
  const [preference, setPreference] = useState<{ target: string; shown: boolean } | null>(null)
  const previousSelection = useRef(selection)
  const shown = preference?.target === target ? preference.shown : wide
  useEffect(() => {
    const element = layout.current
    if (!element) return
    const update = () => {
      const rem = Number.parseFloat(getComputedStyle(element.ownerDocument.documentElement).fontSize)
      setWide(element.clientWidth >= TWO_PANE_REM * rem)
    }
    const observer = new ResizeObserver(update)
    observer.observe(element)
    update()
    return () => observer.disconnect()
  }, [target])
  useEffect(() => {
    if (previousSelection.current !== selection && !wide) {
      setPreference({ target, shown: false })
      if (navigator.current?.contains(navigator.current.ownerDocument.activeElement)) trigger.current?.focus()
    }
    previousSelection.current = selection
  }, [selection, target, wide])
  const toggle = () => {
    setPreference({ target, shown: !shown })
    requestAnimationFrame(() => {
      if (shown) trigger.current?.focus()
      else navigator.current?.querySelector<HTMLInputElement>('input')?.focus()
    })
  }
  const selected = () => {
    if (!wide) {
      setPreference({ target, shown: false })
      trigger.current?.focus()
    }
  }
  return { layout, trigger, navigator, wide, shown, toggle, selected }
}
