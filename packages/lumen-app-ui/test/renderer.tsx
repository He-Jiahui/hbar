import { cloneElement, type ReactElement } from 'react'
import { act, render as renderReact, screen, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'

export { screen }

interface RendererOptions {
  readonly clock?: 'fake'
}
interface Rendered<Props extends object> extends RenderResult {
  readonly user: ReturnType<typeof userEvent.setup>
  setProps(patch: Partial<Props>): void
}

/** Test-only adapter for the small renderer API used by the vendored Lumen suites.
 * It uses public Testing Library APIs; the MUI monorepo's private helper is absent from this checkout.
 */
export function createRenderer(options: RendererOptions = {}) {
  if (options.clock === 'fake')
    beforeEach(() => {
      vi.useFakeTimers()
    })
  return {
    render<Props extends object>(element: ReactElement<Props>): Rendered<Props> {
      let current = element
      const result = renderReact(current)
      const user = userEvent.setup({
        ...(options.clock === 'fake'
          ? {
              advanceTimers: (milliseconds: number) => {
                vi.advanceTimersByTime(milliseconds)
              },
            }
          : {}),
      })
      return {
        ...result,
        user,
        setProps(patch) {
          current = cloneElement(current, patch)
          result.rerender(current)
        },
      }
    },
    clock: {
      async tickAsync(milliseconds: number): Promise<void> {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(milliseconds)
        })
      },
    },
  }
}
