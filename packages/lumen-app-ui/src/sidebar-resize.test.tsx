import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createRenderer, screen } from '@mui/internal-test-utils'
import { resolveLumenSidebarLayout } from './sidebar-layout'
import type { LumenSidebarLayout } from './sidebar-layout'
import { LumenToolPaneResizer } from './tool-pane-resize'
import { LUMEN_TOOL_SEPARATOR_WIDTH_REM } from './tool-pane-layout'

const bounds: LumenSidebarLayout = {
  minWidthRem: 12,
  maxWidthRem: 24,
  mainMinWidthRem: 20,
  defaultWidthRem: 17,
}
const geometry = { availableInlineSizePx: 1440, rootFontSizePx: 16 }
const base = {
  sidebarPresent: true,
  sidebarOpen: true,
  viewportNarrow: false,
  preferredWidthRem: 17,
  layout: bounds,
  geometry,
}
const label = '调整工程与会话侧栏宽度'
const resetLabel = '双击或按 Enter 恢复默认侧栏宽度，保留原会话和文件草稿'
const valueText = (value: number) => `侧栏宽度 ${value} rem`

function deferred() {
  let resolve = () => {}
  let reject = (_reason: Error) => {}
  const promise = new Promise<void>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

// jsdom has real DOM/events but no pointer-capture implementation. Only this
// per-element capture book-keeping is supplied; actual geometry/drag is browser-tested.
function pointerFixture(element: HTMLElement | null) {
  if (!element || typeof element.setPointerCapture === 'function') return
  const captures = new Set<number>()
  element.setPointerCapture = (id) => {
    captures.add(id)
  }
  element.hasPointerCapture = (id) => captures.has(id)
  element.releasePointerCapture = (id) => {
    captures.delete(id)
  }
}

describe('bounded whole-workspace sidebar geometry', () => {
  it('measures the entire workspace and reserves main width plus the flow separator', () => {
    for (const rootFontSizePx of [12, 16, 20, 24]) {
      const availableRem = 40
      const result = resolveLumenSidebarLayout({
        ...base,
        preferredWidthRem: 24,
        geometry: { availableInlineSizePx: availableRem * rootFontSizePx, rootFontSizePx },
      })
      expect(result.presentation).to.equal('split')
      expect(result.widthRem).to.equal(availableRem - 20 - LUMEN_TOOL_SEPARATOR_WIDTH_REM)
      expect(result.maxWidthRem).to.equal(result.widthRem)
      expect(result.minWidthRem).to.equal(12)
    }
  })

  it('clamps visual width without changing the descriptor or stored preference', () => {
    const input = { ...base, preferredWidthRem: 40 }
    expect(resolveLumenSidebarLayout(input).widthRem).to.equal(24)
    expect(input.preferredWidthRem).to.equal(40)
    expect(resolveLumenSidebarLayout({ ...base, preferredWidthRem: 1 }).widthRem).to.equal(12)
    expect(resolveLumenSidebarLayout({ ...base, preferredWidthRem: Number.NaN }).widthRem).to.equal(17)
  })

  it('hides resizing for closed, missing and CSS-narrow sidebars', () => {
    expect(resolveLumenSidebarLayout({ ...base, sidebarOpen: false }).presentation).to.equal('none')
    expect(resolveLumenSidebarLayout({ ...base, sidebarPresent: false }).presentation).to.equal('none')
    const narrow = resolveLumenSidebarLayout({ ...base, viewportNarrow: true })
    expect(narrow.presentation).to.equal('page')
    expect(narrow.widthRem).to.equal(null)
    expect(narrow.minWidthRem).to.equal(null)
    expect(narrow.maxWidthRem).to.equal(null)
  })

  it('does not invent a non-CSS navigation page for unmeasured or small embedded geometry', () => {
    for (const size of [0, 300, 517.99, Number.NaN]) {
      const result = resolveLumenSidebarLayout({
        ...base,
        geometry: { ...geometry, availableInlineSizePx: size },
      })
      expect(result.presentation).to.equal('none')
      expect(result.widthRem).to.equal(null)
    }
    expect(resolveLumenSidebarLayout({ ...base, geometry: null }).presentation).to.equal('none')
    expect(resolveLumenSidebarLayout({ ...base, geometry: { ...geometry, rootFontSizePx: 0 } }).presentation).to.equal(
      'none',
    )
    expect(resolveLumenSidebarLayout({ ...base, layout: { ...bounds, maxWidthRem: 10 } }).presentation).to.equal('none')
    expect(
      resolveLumenSidebarLayout({
        ...base,
        geometry: { availableInlineSizePx: 900, rootFontSizePx: 32 },
      }).presentation,
    ).to.equal('none')
    const boundary = resolveLumenSidebarLayout({
      ...base,
      geometry: { ...geometry, availableInlineSizePx: 518 },
    })
    expect(boundary.presentation).to.equal('split')
    expect(boundary.widthRem).to.equal(12)
  })
})

describe('shared sidebar separator interaction contract', () => {
  const { render } = createRenderer()
  const layout = resolveLumenSidebarLayout(base)
  const props = {
    geometry,
    layout,
    edge: 'start' as const,
    className: 'lumen-app-sidebar-separator',
    reset: { widthRem: 17, label: resetLabel },
    resizeRef: pointerFixture,
  }

  it('exposes Host labels, rem values, long reset help and a focusable native separator', () => {
    render(
      <LumenToolPaneResizer {...props} resize={{ label, valueText, onCommit: async () => {} }} onPreview={() => {}} />,
    )
    const separator = screen.getByRole('separator', { name: label })
    expect(separator.getAttribute('aria-orientation')).to.equal('vertical')
    expect(separator.getAttribute('aria-valuemin')).to.equal('12')
    expect(separator.getAttribute('aria-valuemax')).to.equal('24')
    expect(separator.getAttribute('aria-valuenow')).to.equal('17')
    expect(separator.getAttribute('aria-valuetext')).to.equal(valueText(17))
    expect(separator.getAttribute('title')).to.equal(resetLabel)
    expect(separator.getAttribute('tabindex')).to.equal('0')
  })

  it('uses Left to decrease and Right to increase the start pane by 32 CSS pixels', async () => {
    const onCommit = vi.fn(async (_width: number) => {})
    const { user } = render(
      <LumenToolPaneResizer {...props} resize={{ label, valueText, onCommit }} onPreview={() => {}} />,
    )
    screen.getByRole('separator').focus()
    await user.keyboard('{ArrowLeft}')
    await user.keyboard('{ArrowRight}')
    await user.keyboard('{Home}')
    await user.keyboard('{End}')
    expect(onCommit.mock.calls.map((call) => call[0])).to.deep.equal([15, 19, 12, 24])
  })

  it('keeps the end-edge tool keyboard direction unchanged', async () => {
    const onCommit = vi.fn(async (_width: number) => {})
    const { user } = render(
      <LumenToolPaneResizer
        geometry={geometry}
        layout={layout}
        resize={{ label, valueText, onCommit }}
        onPreview={() => {}}
      />,
    )
    screen.getByRole('separator').focus()
    await user.keyboard('{ArrowLeft}')
    await user.keyboard('{ArrowRight}')
    expect(onCommit.mock.calls.map((call) => call[0])).to.deep.equal([19, 15])
    expect(screen.getByRole('separator').className).to.equal('lumen-app-tool-separator')
  })

  it('leaves modifier shortcuts and composition keys to their existing owners', async () => {
    const onCommit = vi.fn(async (_width: number) => {})
    const bubbled: boolean[] = []
    const { user } = render(
      <div
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') bubbled.push(event.defaultPrevented)
        }}
      >
        <LumenToolPaneResizer {...props} resize={{ label, valueText, onCommit }} onPreview={() => {}} />
      </div>,
    )
    const separator = screen.getByRole('separator')
    separator.focus()
    await user.keyboard(
      '{Control>}{ArrowRight}{/Control}{Meta>}{ArrowRight}{/Meta}{Alt>}{ArrowRight}{/Alt}{Shift>}{ArrowRight}{/Shift}',
    )
    for (const init of [{ isComposing: true }, { keyCode: 229 }]) {
      await React.act(async () => {
        const event = new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          bubbles: true,
          cancelable: true,
          ...init,
        })
        expect(separator.dispatchEvent(event)).to.equal(true)
      })
    }
    expect(onCommit).toHaveBeenCalledTimes(0)
    expect(bubbled).to.deep.equal([false, false, false, false, false, false])
  })

  it.each(['escape', 'geometry', 'page', 'disabled'] as const)(
    'cancels a preview on %s without dispatching its captured write',
    async (change) => {
      const onCommit = vi.fn(async (_width: number) => {})
      const onPreview = vi.fn()
      const resize = { label, valueText, onCommit }
      const { user, rerender } = render(<LumenToolPaneResizer {...props} resize={resize} onPreview={onPreview} />)
      const separator = screen.getByRole('separator')
      await user.pointer([
        { target: separator, coords: { clientX: 200 }, keys: '[MouseLeft>]' },
        { coords: { clientX: 232 } },
      ])
      expect(onPreview).toHaveBeenLastCalledWith(19)
      if (change === 'escape') await user.keyboard('{Escape}')
      else
        rerender(
          <LumenToolPaneResizer
            {...props}
            geometry={change === 'geometry' ? { ...geometry, availableInlineSizePx: 1200 } : geometry}
            layout={change === 'page' ? resolveLumenSidebarLayout({ ...base, viewportNarrow: true }) : layout}
            resize={change === 'disabled' ? { ...resize, disabled: true } : resize}
            onPreview={onPreview}
          />,
        )
      await user.pointer({ keys: '[/MouseLeft]' })
      expect(onCommit).toHaveBeenCalledTimes(0)
      expect(onPreview).toHaveBeenLastCalledWith(null)
    },
  )

  it('resets via Enter and double click, clamps defaults, and does not write an unchanged default', async () => {
    const onCommit = vi.fn(async (_width: number) => {})
    const { user, rerender } = render(
      <LumenToolPaneResizer
        {...props}
        layout={{ ...layout, widthRem: 20 }}
        resize={{ label, valueText, onCommit }}
        onPreview={() => {}}
      />,
    )
    screen.getByRole('separator').focus()
    await user.keyboard('{Enter}')
    await user.dblClick(screen.getByRole('separator'))
    expect(onCommit.mock.calls.map((call) => call[0])).to.deep.equal([17, 17])
    rerender(<LumenToolPaneResizer {...props} resize={{ label, valueText, onCommit }} onPreview={() => {}} />)
    await user.keyboard('{Enter}')
    expect(onCommit).toHaveBeenCalledTimes(2)
    rerender(
      <LumenToolPaneResizer
        {...props}
        reset={{ widthRem: 99, label: resetLabel }}
        resize={{ label, valueText, onCommit }}
        onPreview={() => {}}
      />,
    )
    await user.keyboard('{Enter}')
    expect(onCommit).toHaveBeenLastCalledWith(24)
  })

  it('does not commit repeated inputs while saving and releases preview after rejection without claiming success', async () => {
    const pending = deferred()
    const onCommit = vi.fn((_width: number) => pending.promise)
    const onPreview = vi.fn()
    const { user } = render(
      <LumenToolPaneResizer {...props} resize={{ label, valueText, onCommit }} onPreview={onPreview} />,
    )
    const separator = screen.getByRole('separator')
    separator.focus()
    await user.keyboard('{ArrowRight}{ArrowRight}{Enter}')
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(separator.getAttribute('aria-busy')).to.equal('true')
    expect(separator.getAttribute('data-resize-status')).to.equal('saving')
    await React.act(async () => {
      pending.reject(new Error('Host reports the localized persistence failure'))
    })
    await vi.waitFor(() => expect(separator.getAttribute('data-resize-status')).to.equal('failed'))
    expect(separator.hasAttribute('aria-busy')).to.equal(false)
    expect(onPreview).toHaveBeenLastCalledWith(null)
  })

  it('leaves unknown/disabled and unavailable geometry inert for new keyboard writes', async () => {
    const onCommit = vi.fn(async (_width: number) => {})
    const { user, rerender } = render(
      <LumenToolPaneResizer {...props} resize={{ label, valueText, disabled: true, onCommit }} onPreview={() => {}} />,
    )
    const separator = screen.getByRole('separator')
    separator.focus()
    await user.keyboard('{ArrowRight}{Home}{End}{Enter}')
    expect(onCommit).toHaveBeenCalledTimes(0)
    expect(separator.getAttribute('tabindex')).to.equal('-1')
    rerender(
      <LumenToolPaneResizer
        {...props}
        layout={resolveLumenSidebarLayout({ ...base, viewportNarrow: true })}
        resize={{ label, valueText, onCommit }}
        onPreview={() => {}}
      />,
    )
    await user.keyboard('{ArrowRight}{Enter}')
    expect(onCommit).toHaveBeenCalledTimes(0)
    expect(separator.getAttribute('aria-valuenow')).to.equal(null)
  })

  it('reflects external retry feedback at the same width without dispatching another write', async () => {
    const onCommit = vi.fn(async (_width: number) => {
      throw new Error('Host reports the localized persistence failure')
    })
    const resize = { label, valueText, onCommit }
    const onPreview = vi.fn()
    const content = (status?: 'idle' | 'saving' | 'failed') => (
      <LumenToolPaneResizer {...props} resize={{ ...resize, status }} onPreview={onPreview} />
    )
    const { user, rerender } = render(content())
    const separator = screen.getByRole('separator')
    separator.focus()
    await user.keyboard('{ArrowRight}')
    expect(separator.getAttribute('data-resize-status')).to.equal('failed')
    rerender(content('failed'))
    expect(separator.getAttribute('data-resize-status')).to.equal('failed')
    rerender(content('saving'))
    expect(separator.getAttribute('data-resize-status')).to.equal('saving')
    expect(separator.getAttribute('aria-busy')).to.equal('true')
    await user.keyboard('{ArrowRight}{Enter}')
    expect(onCommit).toHaveBeenCalledTimes(1)
    rerender(content('idle'))
    expect(screen.getByRole('separator')).to.equal(separator)
    expect(separator.getAttribute('aria-valuenow')).to.equal('17')
    expect(separator.getAttribute('data-resize-status')).to.equal('idle')
    expect(separator.hasAttribute('aria-busy')).to.equal(false)
    expect(separator.hasAttribute('aria-disabled')).to.equal(false)
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('keeps the private single-flight lock while authoritative feedback is idle', async () => {
    const pending = deferred()
    const onCommit = vi.fn((_width: number) => pending.promise)
    const { user } = render(
      <LumenToolPaneResizer {...props} resize={{ label, valueText, status: 'idle', onCommit }} onPreview={() => {}} />,
    )
    const separator = screen.getByRole('separator')
    separator.focus()
    await user.keyboard('{ArrowRight}{ArrowRight}{Enter}')
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(separator.getAttribute('data-resize-status')).to.equal('idle')
    expect(separator.getAttribute('aria-disabled')).to.equal('true')
    await React.act(async () => {
      pending.resolve()
      await pending.promise
    })
    expect(separator.hasAttribute('aria-disabled')).to.equal(false)
  })

  it('captures the original commit and ignores its completion after its component is unmounted', async () => {
    const pending = deferred()
    const oldCommit = vi.fn((_width: number) => pending.promise)
    const newCommit = vi.fn(async (_width: number) => {})
    const oldPreview = vi.fn()
    const newPreview = vi.fn()
    const { user, rerender } = render(
      <LumenToolPaneResizer
        key="owner-a"
        {...props}
        resize={{ label, valueText, onCommit: oldCommit }}
        onPreview={oldPreview}
      />,
    )
    screen.getByRole('separator').focus()
    await user.keyboard('{ArrowRight}')
    rerender(
      <LumenToolPaneResizer
        key="owner-b"
        {...props}
        resize={{ label, valueText, onCommit: newCommit }}
        onPreview={newPreview}
      />,
    )
    const oldCount = oldPreview.mock.calls.length
    const newCount = newPreview.mock.calls.length
    await React.act(async () => {
      pending.resolve()
      await pending.promise
    })
    expect(oldPreview).toHaveBeenCalledTimes(oldCount)
    expect(newPreview).toHaveBeenCalledTimes(newCount)
    expect(newCommit).toHaveBeenCalledTimes(0)
    expect(screen.getByRole('separator').getAttribute('data-resize-status')).to.equal('idle')
  })

  it('captures the pointer-down callback across ordinary re-renders with the same owner', async () => {
    const original = vi.fn(async (_width: number) => {})
    const later = vi.fn(async (_width: number) => {})
    const onPreview = vi.fn()
    const { user, rerender } = render(
      <LumenToolPaneResizer
        {...props}
        resize={{ label, valueText, ownerKey: 'host-a', onCommit: original }}
        onPreview={onPreview}
      />,
    )
    const separator = screen.getByRole('separator')
    await user.pointer({ target: separator, coords: { clientX: 200 }, keys: '[MouseLeft>]' })
    rerender(
      <LumenToolPaneResizer
        {...props}
        resize={{ label, valueText, ownerKey: 'host-a', onCommit: later }}
        onPreview={onPreview}
      />,
    )
    await user.pointer([{ target: separator, coords: { clientX: 232 } }, { keys: '[/MouseLeft]' }])
    expect(original).toHaveBeenCalledExactlyOnceWith(19)
    expect(later).toHaveBeenCalledTimes(0)
  })

  it('cancels a pointer gesture when the same mounted component changes owner', async () => {
    const original = vi.fn(async (_width: number) => {})
    const later = vi.fn(async (_width: number) => {})
    const onPreview = vi.fn()
    const { user, rerender } = render(
      <LumenToolPaneResizer
        {...props}
        resize={{ label, valueText, ownerKey: 'host-a', onCommit: original }}
        onPreview={onPreview}
      />,
    )
    const separator = screen.getByRole('separator')
    await user.pointer([
      { target: separator, coords: { clientX: 200 }, keys: '[MouseLeft>]' },
      { coords: { clientX: 232 } },
    ])
    rerender(
      <LumenToolPaneResizer
        {...props}
        resize={{ label, valueText, ownerKey: 'host-b', onCommit: later }}
        onPreview={onPreview}
      />,
    )
    await user.pointer({ keys: '[/MouseLeft]' })
    expect(original).toHaveBeenCalledTimes(0)
    expect(later).toHaveBeenCalledTimes(0)
    expect(onPreview).toHaveBeenLastCalledWith(null)
  })

  it('fences an old owner promise without unlocking or clearing the next owner pending operation', async () => {
    const old = deferred()
    const next = deferred()
    const oldCommit = vi.fn((_width: number) => old.promise)
    const nextCommit = vi.fn((_width: number) => next.promise)
    const onPreview = vi.fn()
    const { user, rerender } = render(
      <LumenToolPaneResizer
        {...props}
        resize={{ label, valueText, ownerKey: 'host-a', onCommit: oldCommit }}
        onPreview={onPreview}
      />,
    )
    const separator = screen.getByRole('separator')
    separator.focus()
    await user.keyboard('{ArrowRight}')
    rerender(
      <LumenToolPaneResizer
        {...props}
        resize={{ label, valueText, ownerKey: 'host-b', onCommit: nextCommit }}
        onPreview={onPreview}
      />,
    )
    await user.keyboard('{ArrowLeft}')
    const previewCount = onPreview.mock.calls.length
    await React.act(async () => {
      old.resolve()
      await old.promise
    })
    expect(separator.getAttribute('data-resize-status')).to.equal('saving')
    expect(onPreview).toHaveBeenCalledTimes(previewCount)
    await user.keyboard('{End}')
    expect(nextCommit).toHaveBeenCalledTimes(1)
    await React.act(async () => {
      next.resolve()
      await next.promise
    })
    expect(separator.getAttribute('data-resize-status')).to.equal('idle')
    expect(onPreview).toHaveBeenLastCalledWith(null)
  })

  it('notifies the host once when its focused separator becomes a non-split presentation', () => {
    const unavailable = vi.fn()
    const resize = { label, valueText, ownerKey: 'host-a', onCommit: async () => {} }
    const { rerender } = render(
      <LumenToolPaneResizer {...props} resize={resize} onPreview={() => {}} onFocusUnavailable={unavailable} />,
    )
    screen.getByRole('separator').focus()
    const page = resolveLumenSidebarLayout({ ...base, viewportNarrow: true })
    rerender(
      <LumenToolPaneResizer
        {...props}
        layout={page}
        resize={resize}
        onPreview={() => {}}
        onFocusUnavailable={unavailable}
      />,
    )
    expect(unavailable).toHaveBeenCalledTimes(1)
    rerender(
      <LumenToolPaneResizer
        {...props}
        layout={page}
        resize={resize}
        onPreview={() => {}}
        onFocusUnavailable={unavailable}
      />,
    )
    expect(unavailable).toHaveBeenCalledTimes(1)
  })

  it('remembers focus ownership when the browser blurs a hidden control to BODY before layout notification', () => {
    const unavailable = vi.fn()
    const resize = { label, valueText, onCommit: async () => {} }
    const { rerender } = render(
      <LumenToolPaneResizer {...props} resize={resize} onPreview={() => {}} onFocusUnavailable={unavailable} />,
    )
    const separator = screen.getByRole('separator')
    separator.focus()
    separator.blur()
    expect(document.activeElement).to.equal(document.body)
    rerender(
      <LumenToolPaneResizer
        {...props}
        layout={resolveLumenSidebarLayout({ ...base, viewportNarrow: true })}
        resize={resize}
        onPreview={() => {}}
        onFocusUnavailable={unavailable}
      />,
    )
    expect(unavailable).toHaveBeenCalledTimes(1)
  })

  it('notifies only the host-owned callback when a focused separator unmounts', () => {
    const unavailable = vi.fn()
    const { unmount } = render(
      <LumenToolPaneResizer
        {...props}
        resize={{ label, valueText, onCommit: async () => {} }}
        onPreview={() => {}}
        onFocusUnavailable={unavailable}
      />,
    )
    screen.getByRole('separator').focus()
    unmount()
    expect(unavailable).toHaveBeenCalledTimes(1)
  })

  it.each(['tab', 'pointer', 'focus'] as const)(
    'does not request fallback after deliberate outside %s',
    async (action) => {
      const unavailable = vi.fn()
      const resize = { label, valueText, onCommit: async () => {} }
      const content = (narrow: boolean) => (
        <React.Fragment>
          <LumenToolPaneResizer
            {...props}
            layout={narrow ? resolveLumenSidebarLayout({ ...base, viewportNarrow: true }) : layout}
            resize={resize}
            onPreview={() => {}}
            onFocusUnavailable={unavailable}
          />
          <button type="button">Other control</button>
        </React.Fragment>
      )
      const { user, rerender } = render(content(false))
      screen.getByRole('separator').focus()
      if (action === 'tab') await user.tab()
      else if (action === 'pointer') await user.click(document.body)
      else screen.getByRole('button', { name: 'Other control' }).focus()
      rerender(content(true))
      expect(unavailable).toHaveBeenCalledTimes(0)
    },
  )

  it('never forwards old focus ownership into a new owner callback', () => {
    const oldUnavailable = vi.fn()
    const newUnavailable = vi.fn()
    const resize = { label, valueText, onCommit: async () => {} }
    const { rerender } = render(
      <LumenToolPaneResizer
        {...props}
        resize={{ ...resize, ownerKey: 'old' }}
        onPreview={() => {}}
        onFocusUnavailable={oldUnavailable}
      />,
    )
    screen.getByRole('separator').focus()
    rerender(
      <LumenToolPaneResizer
        {...props}
        layout={resolveLumenSidebarLayout({ ...base, viewportNarrow: true })}
        resize={{ ...resize, ownerKey: 'new' }}
        onPreview={() => {}}
        onFocusUnavailable={newUnavailable}
      />,
    )
    expect(oldUnavailable).toHaveBeenCalledTimes(0)
    expect(newUnavailable).toHaveBeenCalledTimes(0)
  })

  it('records a still-focused new split owner before its later narrow transition', () => {
    const oldUnavailable = vi.fn()
    const newUnavailable = vi.fn()
    const resize = { label, valueText, onCommit: async () => {} }
    const content = (key: string, narrow: boolean, unavailable: () => void) => (
      <LumenToolPaneResizer
        {...props}
        layout={narrow ? resolveLumenSidebarLayout({ ...base, viewportNarrow: true }) : layout}
        resize={{ ...resize, ownerKey: key }}
        onPreview={() => {}}
        onFocusUnavailable={unavailable}
      />
    )
    const { rerender } = render(content('old', false, oldUnavailable))
    screen.getByRole('separator').focus()
    rerender(content('new', false, newUnavailable))
    expect(oldUnavailable).toHaveBeenCalledTimes(0)
    expect(newUnavailable).toHaveBeenCalledTimes(0)
    rerender(content('new', true, newUnavailable))
    expect(oldUnavailable).toHaveBeenCalledTimes(0)
    expect(newUnavailable).toHaveBeenCalledTimes(1)
  })
})
