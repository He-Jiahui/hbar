export interface WorkspaceDisplayNameValidationTarget {
  readonly owner: object | undefined
  readonly generation: number
  readonly workspaceId: string
  readonly revision: number
  readonly draft: string
}

export function sameWorkspaceDisplayNameValidationTarget(
  captured: WorkspaceDisplayNameValidationTarget,
  current: WorkspaceDisplayNameValidationTarget | null,
): boolean {
  return Boolean(
    current &&
    captured.owner === current.owner &&
    captured.generation === current.generation &&
    captured.workspaceId === current.workspaceId &&
    captured.revision === current.revision &&
    captured.draft === current.draft,
  )
}

/** A single explicit Save owns validation focus only until the user's next interaction. */
export function captureWorkspaceDisplayNameValidationFocus(
  input: HTMLInputElement,
  target: WorkspaceDisplayNameValidationTarget,
) {
  const document = input.ownerDocument
  const source = document.activeElement
  const dialog = input.closest('dialog')
  let live = true
  const cancel = () => {
    live = false
    document.removeEventListener('pointerdown', cancel, true)
    document.removeEventListener('keydown', cancel, true)
    document.removeEventListener('focusin', cancel, true)
    document.defaultView?.removeEventListener('blur', cancel)
  }
  document.addEventListener('pointerdown', cancel, true)
  document.addEventListener('keydown', cancel, true)
  document.addEventListener('focusin', cancel, true)
  document.defaultView?.addEventListener('blur', cancel)
  return {
    cancel,
    finish(current: WorkspaceDisplayNameValidationTarget | null, invalid: boolean, settled: boolean): boolean {
      if (!live) return true
      if (!sameWorkspaceDisplayNameValidationTarget(target, current)) {
        cancel()
        return true
      }
      if (!invalid) {
        if (settled) cancel()
        return settled
      }
      cancel()
      if (!input.isConnected || input.closest('dialog') !== dialog || !dialog?.open) return true
      if ([...document.querySelectorAll('dialog:modal')].some((element) => element !== dialog)) return true
      const active = document.activeElement
      if (active === input) return true
      if (
        active === document.body ||
        (active === source && source?.matches(':disabled')) ||
        (active instanceof HTMLElement && !active.isConnected)
      )
        input.focus()
      return true
    },
  }
}
