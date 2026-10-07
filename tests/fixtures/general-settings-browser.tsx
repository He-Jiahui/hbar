import { createRoot } from 'react-dom/client'
import { useStore } from 'zustand'
import { WebGeneralSettings } from '../../apps/web/src/GeneralSettings'
import { generalSettingsCopy } from '../../apps/web/src/general-settings-copy'
import { createWebLanguageController } from '../../apps/web/src/language'
import { createWebSendBehaviorController, type WebSendBehaviorWrite } from '../../apps/web/src/send-behavior'
import { createWebZoomController } from '../../apps/web/src/app-zoom'
import { DEFAULT_LUMEN_APPEARANCE, LumenFrame, LumenProvider } from '@lumen/app-ui'
import { CommandError } from '@hbar/commands'
import '@lumen/app-ui/styles.css'

export interface GeneralSettingsFixtureInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly suffix: string
  readonly failure: 'none' | 'language-save' | 'send-unknown' | 'zoom-save'
}
declare global {
  interface Window {
    mountGeneralSettings(input: GeneralSettingsFixtureInput): Promise<void>
    releaseGeneralSettings(): void
    generalLanguageWrites: { readonly key: string; readonly value: string }[]
    generalSendWrites: WebSendBehaviorWrite[]
    generalZoomWrites: number[]
    clearGeneralFailure(): void
  }
}
window.mountGeneralSettings = async (input) => {
  const container = document.getElementById('general-settings-fixture')
  if (!container) throw new Error('Missing General settings fixture root')
  let failing = input.failure !== 'none'
  window.clearGeneralFailure = () => {
    failing = false
  }
  window.generalLanguageWrites = []
  window.generalSendWrites = []
  window.generalZoomWrites = []
  let savedLanguage = input.locale
  const language = createWebLanguageController(input.locale, {
    getItem: () => savedLanguage,
    setItem: (key, value) => {
      if (failing && input.failure === 'language-save') throw new Error('Isolated device save failure')
      window.generalLanguageWrites.push({ key, value })
      if (value === 'en-US' || value === 'zh-CN') savedLanguage = value
    },
  })
  const send = createWebSendBehaviorController({
    read: async () => ({ behavior: 'enter', revision: 4 }),
    write: async (request) => {
      window.generalSendWrites.push(request)
      if (failing && input.failure === 'send-unknown')
        throw new CommandError('RESULT_UNKNOWN', 'Isolated lost response')
      return { behavior: request.behavior, revision: 5 }
    },
    receipt: async () => null,
  })
  send.bind('original-host', true)
  await send.refresh()
  const zoom = createWebZoomController({
    read: async () => 1,
    write: async (level) => {
      if (failing && input.failure === 'zoom-save') throw new Error('Isolated device zoom save failure')
      window.generalZoomWrites.push(level)
    },
    apply: async () => 'css',
  })
  await zoom.initialize()
  function Fixture() {
    const state = useStore(language.store)
    const copy = generalSettingsCopy(state.locale)
    const labels = {
      ...copy,
      title: copy.title + input.suffix,
      language: copy.language + input.suffix,
      options: {
        system: copy.options.system + input.suffix,
        'en-US': copy.options['en-US'] + input.suffix,
        'zh-CN': copy.options['zh-CN'] + input.suffix,
      },
      sending: {
        ...copy.sending,
        title: copy.sending.title + input.suffix,
        options: {
          enter: { ...copy.sending.options.enter, label: copy.sending.options.enter.label + input.suffix },
          modifierEnter: {
            ...copy.sending.options.modifierEnter,
            label: copy.sending.options.modifierEnter.label + input.suffix,
          },
        },
      },
      zoom: { ...copy.zoom, title: copy.zoom.title + input.suffix },
    }
    return (
      <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}>
        <LumenFrame as="main" className="general-settings-fixture">
          <WebGeneralSettings labels={labels} language={language} sendBehavior={send} zoom={zoom} nativeZoom />
        </LumenFrame>
      </LumenProvider>
    )
  }
  const root = createRoot(container)
  root.render(<Fixture />)
  window.releaseGeneralSettings = () => {
    root.unmount()
    send.bind(null, false)
  }
}
