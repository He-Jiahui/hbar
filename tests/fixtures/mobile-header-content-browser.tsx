import { useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  DEFAULT_LUMEN_APPEARANCE,
  LumenProvider,
  LumenFrame,
  LumenButton,
  LumenContentText,
  LumenFloatingSurface,
  useFloatingTrigger,
} from '@lumen/app-ui'
import { Files } from 'lucide-react'
import {
  HbarMobileHeaderMenu,
  HbarMobileHeaderMenuProvider,
  useHbarMobileHeaderMenuSection,
  type HbarMobileHeaderMenuItem,
} from '../../packages/app-react/src/mobile-header-menu'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import { mobileShellNavigationLabel } from '../../apps/web/src/mobile-shell-navigation-copy'
import '@lumen/app-ui/styles.css'

export interface MobileHeaderContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly count: number
  readonly current: string | null
  readonly reversed?: boolean
  readonly duplicate?: boolean
  readonly disabled?: boolean
}
declare global {
  interface Window {
    mountMobileHeaderContent(input: MobileHeaderContentInput): void
    updateMobileHeaderContent(input: MobileHeaderContentInput): void
    mobileHeaderContentTargets(): readonly { readonly id: string; readonly openMenus: number }[]
    disposeMobileHeaderContent?: () => void
  }
}
const targets: { id: string; openMenus: number }[] = []
let root: Root | undefined
const record = (id: string) =>
  targets.push({ id, openMenus: document.querySelectorAll('.hbar-mobile-header-menu-content').length })
function Registration({ input, second }: { readonly input: MobileHeaderContentInput; readonly second: boolean }) {
  const copy = getShellCopy(input.locale).session.tools
  let items: HbarMobileHeaderMenuItem[] = Array.from({ length: input.count }, (_, index) => ({
    id: `owned-${index}`,
    order: index,
    label: `${copy.agents.repeat(8)} ${index}`,
    icon: Files,
    disabled: input.disabled,
    current: input.current === `owned-${index}`,
    onActivate: () => record(`open:owned-${index}`),
    close: {
      label: `${copy.settings} ${index}`,
      disabled: input.disabled,
      onActivate: () => record(`close:owned-${index}`),
    },
  }))
  if (input.reversed) items = items.map((item, index) => ({ ...item, order: input.count - index })).reverse()
  if (input.duplicate && items[0]) items = [...items, items[0]]
  useHbarMobileHeaderMenuSection({
    id: 'owned-tabs',
    order: 1,
    label: copy.label.repeat(8),
    items: items.filter((_, i) => (i % 2 === 1) === second),
  })
  return null
}
function Fixture({ input }: { readonly input: MobileHeaderContentInput }) {
  const copy = getShellCopy(input.locale).session.tools
  const [other, setOther] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const otherEvents = useFloatingTrigger({ open: other, onOpen: () => setOther(true), onClose: () => setOther(false) })
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, textSize: 'l', motion: false }}>
      <HbarMobileHeaderMenuProvider>
        <Registration input={input} second={false} />
        <Registration input={input} second />
        <LumenFrame
          as="main"
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            blockSize: 'calc(100dvh / var(--owned-content-zoom, 1))',
            boxSizing: 'border-box',
            padding: '1rem',
            minInlineSize: 0,
          }}
        >
          <LumenFrame style={{ display: 'flex', justifyContent: 'flex-end', minInlineSize: 0 }}>
            <HbarMobileHeaderMenu label={mobileShellNavigationLabel(input.locale)} />
          </LumenFrame>
          <LumenFrame style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', minInlineSize: 0 }}>
            <LumenButton data-mobile-outside>{copy.files}</LumenButton>
            <LumenButton ref={anchor} {...otherEvents} data-mobile-other>
              {copy.activity}
            </LumenButton>
          </LumenFrame>
          <LumenFloatingSurface
            open={other}
            onClose={() => setOther(false)}
            anchorRef={anchor}
            mode="anchored"
            placement="above"
            responsivePresentation="anchored"
            label={copy.activity}
            role="dialog"
          >
            <LumenContentText context="popover.title">{copy.activity}</LumenContentText>
          </LumenFloatingSurface>
        </LumenFrame>
      </HbarMobileHeaderMenuProvider>
    </LumenProvider>
  )
}
function mount(input: MobileHeaderContentInput) {
  const node = document.getElementById('mobile-header-content-fixture')
  if (!node) throw new Error('Missing owned mobile fixture')
  root ??= createRoot(node)
  root.render(<Fixture input={input} />)
}
window.mountMobileHeaderContent = (input) => {
  window.disposeMobileHeaderContent?.()
  targets.length = 0
  mount(input)
}
window.updateMobileHeaderContent = mount
window.mobileHeaderContentTargets = () => targets
window.disposeMobileHeaderContent = () => {
  root?.unmount()
  root = undefined
}
