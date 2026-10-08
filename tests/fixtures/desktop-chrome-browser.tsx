import { createRoot, type Root } from 'react-dom/client'
import { useStore } from 'zustand'
import { DEFAULT_LUMEN_APPEARANCE, LumenFrame, LumenProvider } from '@lumen/app-ui'
import { desktopChromeCopySchema } from '@hbar/contracts'
import { WebGeneralSettings } from '../../apps/web/src/GeneralSettings'
import { generalSettingsCopy } from '../../apps/web/src/general-settings-copy'
import {
  bindDesktopChromeLanguage,
  createDesktopChromeController,
  createDesktopChromePort,
} from '../../apps/web/src/desktop-chrome'
import { createWebLanguageController } from '../../apps/web/src/language'
import '@lumen/app-ui/styles.css'

export interface DesktopChromeFixtureInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
}
let root: Root | undefined
let release: (() => void) | undefined
declare global {
  interface Window {
    mountDesktopChrome(input: DesktopChromeFixtureInput): void
    repairDesktopChrome(): void
    holdDesktopChrome(): void
    releaseDesktopChromeReply(): void
    desktopChromeSnapshot(): {
      readonly calls: readonly unknown[]
      readonly status: string
      readonly locale: string | null
      readonly appliedLocale: string | null
    }
    releaseDesktopChrome(): void
  }
}
window.mountDesktopChrome = (input) => {
  root?.unmount()
  release?.()
  const calls: unknown[] = []
  let failure = true
  let hold = false
  let reply: (() => void) | undefined
  const language = createWebLanguageController(input.locale, { getItem: () => input.locale, setItem: () => {} })
  const controller = createDesktopChromeController(
    createDesktopChromePort(
      {
        __TAURI_INTERNALS__: {
          invoke: async (_command: string, args?: Record<string, unknown>) => {
            const copy = desktopChromeCopySchema.parse(args?.copy)
            calls.push(copy)
            if (failure) throw new Error('Owned native bridge failure')
            if (hold) {
              hold = false
              await new Promise<void>((resolve) => {
                reply = resolve
              })
            }
            return copy
          },
        },
      },
      true,
    ),
  )
  const unbind = bindDesktopChromeLanguage(controller, language)
  release = () => {
    unbind()
    controller.dispose()
    reply?.()
  }
  window.repairDesktopChrome = () => {
    failure = false
  }
  window.holdDesktopChrome = () => {
    hold = true
  }
  window.releaseDesktopChromeReply = () => {
    reply?.()
    reply = undefined
  }
  window.desktopChromeSnapshot = () => ({ calls, ...controller.store.getState() })
  function Fixture() {
    const state = useStore(language.store)
    const base = generalSettingsCopy(state.locale)
    const labels = {
      ...base,
      desktopChrome: {
        pending: base.desktopChrome.pending.repeat(30),
        error: base.desktopChrome.error.repeat(30),
        retry: base.desktopChrome.retry.repeat(30),
      },
    }
    return (
      <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, textSize: 'l', motion: false }}>
        <LumenFrame
          as="main"
          style={{
            minInlineSize: 0,
            maxInlineSize: '100%',
            padding: '1rem',
            zoom: 1.25,
            backgroundColor: 'var(--lumen-canvas)',
          }}
        >
          <WebGeneralSettings labels={labels} language={language} desktopChrome={controller} />
        </LumenFrame>
      </LumenProvider>
    )
  }
  root = createRoot(document.getElementById('root') ?? document.body)
  root.render(<Fixture />)
  window.releaseDesktopChrome = () => {
    root?.unmount()
    release?.()
  }
}
