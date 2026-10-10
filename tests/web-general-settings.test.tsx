import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createStore } from 'zustand/vanilla'
import { WebGeneralSettings, type WebGeneralSettingsLabels } from '../apps/web/src/GeneralSettings'
import { generalSettingsCopy } from '../apps/web/src/general-settings-copy'
import {
  createWebLanguageController,
  WEB_LANGUAGE_STORAGE_KEY,
  type WebLanguageController,
} from '../apps/web/src/language'
import {
  createWebSendBehaviorController,
  type WebSendBehaviorController,
  type WebSendBehaviorPort,
} from '../apps/web/src/send-behavior'
import { createWebZoomController, type WebZoomController } from '../apps/web/src/app-zoom'

function htmlButtonWithText(markup: string, text: string, openingPattern?: RegExp) {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const buttonPattern = /<button\b[^>]*>[\s\S]*?<\/button>/g
  return [...markup.matchAll(buttonPattern)].some(([button]) => {
    const parts = button.match(/^(<button\b[^>]*>)([\s\S]*)<\/button>$/)
    if (!parts) return false
    const [, opening, inner] = parts
    if (typeof opening !== 'string' || typeof inner !== 'string') return false
    const visible = inner.replace(/<[^>]*>/g, '')
    return (!openingPattern || openingPattern.test(opening)) && new RegExp(escaped).test(visible)
  })
}

function html(
  language: WebLanguageController,
  labels = generalSettingsCopy(language.store.getState().locale),
  sendBehavior?: WebSendBehaviorController,
  zoom?: WebZoomController,
) {
  // Zustand SSR uses getInitialState, not the post-action client snapshot. Seed
  // this render-only store from the actual owner's action result, never invented
  // business state; browser verification separately drives the real live store.
  const rendered = { ...language, store: createStore(() => language.store.getState()) }
  const renderedSend = sendBehavior
    ? { ...sendBehavior, store: createStore(() => sendBehavior.store.getState()) }
    : undefined
  const renderedZoom = zoom ? { ...zoom, store: createStore(() => zoom.store.getState()) } : undefined
  return renderToStaticMarkup(
    <WebGeneralSettings labels={labels} language={rendered} sendBehavior={renderedSend} zoom={renderedZoom} />,
  )
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`General places device zoom after sending with a labeled bounded range and reset: ${locale}`, async () => {
    const controller = createWebZoomController({
      read: async () => 1.25,
      write: async () => {},
      apply: async () => 'native',
    })
    await controller.initialize()
    const labels = generalSettingsCopy(locale)
    const rendered = html(createWebLanguageController(locale, storage().port), labels, undefined, controller)
    expect(rendered.indexOf('class="hbar-web-general-language"')).toBeLessThan(
      rendered.indexOf('class="hbar-web-general-zoom"'),
    )
    expect(rendered).toContain(labels.zoom.description)
    expect(rendered).toContain(labels.zoom.shortcut)
    expect(rendered).toContain('type="range"')
    expect(rendered).toContain('aria-labelledby="hbar-general-zoom-label"')
    expect(rendered).toContain('aria-valuetext="125%"')
    expect(rendered).toContain('min="0.5"')
    expect(rendered).toContain('max="2"')
    expect(rendered).toContain(labels.zoom.reset)
    expect(rendered).not.toContain(labels.zoom.nativeFallback)
  })
}
function storage(initial: string | null = null) {
  let saved = initial
  let readFails = false
  let saveFails = false
  const writes: { key: string; value: string }[] = []
  return {
    failRead: (value: boolean) => {
      readFails = value
    },
    failSave: (value: boolean) => {
      saveFails = value
    },
    saved: () => saved,
    writes,
    port: {
      getItem: () => {
        if (readFails) throw new Error('Read failed')
        return saved
      },
      setItem: (key: string, value: string) => {
        if (saveFails) throw new Error('Write failed')
        writes.push({ key, value })
        saved = value
      },
    },
  }
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`General language uses host-owned copy, a named bounded radio group and real device scope: ${locale}`, () => {
    const language = createWebLanguageController(locale, storage().port)
    const labels = generalSettingsCopy(locale)
    const rendered = html(language, labels)
    expect(rendered).toContain(labels.title)
    expect(rendered).toContain(labels.deviceScope)
    expect(rendered).toContain(labels.languageDescription)
    expect(rendered).toContain(labels.currentLanguage(locale))
    expect(rendered).toContain('role="radiogroup" aria-labelledby="hbar-general-language-label"')
    expect(rendered).toContain('aria-describedby="hbar-general-language-help"')
    expect(rendered.match(/role="radio"/g)).toHaveLength(3)
    expect(rendered.match(/aria-checked="true"/g)).toHaveLength(1)
    expect(rendered.match(/tabindex="0"/g)).toHaveLength(1)
    expect(rendered.match(/tabindex="-1"/g)).toHaveLength(2)
    for (const label of Object.values(labels.options)) expect(rendered).toContain(label)
    expect(rendered).not.toContain('日本語')
    expect(rendered).not.toContain('繁體中文')
    expect(rendered).not.toContain('한국어')
    expect(rendered).not.toContain('role="alert"')
    expect(rendered).not.toContain(labels.saved)
    expect(rendered).not.toContain('type="submit"')
  })
}

test('General renders the selected applied choice after an actual owner action without inventing a Save form', () => {
  const data = storage()
  const language = createWebLanguageController('en-US', data.port)
  language.select('zh-CN')
  const rendered = html(language)
  const labels = generalSettingsCopy('zh-CN')
  expect(rendered).toMatch(/<button(?=[^>]*role="radio")(?=[^>]*aria-checked="true")(?=[^>]*tabindex="0")[^>]*>/)
  expect(
    htmlButtonWithText(
      rendered,
      '简体中文',
      /(?=[^>]*\brole="radio")(?=[^>]*\baria-checked="true")(?=[^>]*\btabindex="0")/,
    ),
  ).toBe(true)
  expect(rendered).toContain(labels.currentLanguage('zh-CN'))
  expect(rendered).toContain(labels.saved)
  expect(rendered).not.toContain(labels.systemPolicy)
  expect(data.writes).toEqual([{ key: WEB_LANGUAGE_STORAGE_KEY, value: 'zh-CN' }])
})

test('General read failure keeps its three choices usable and exposes only the local read retry until confirmed', () => {
  const data = storage('zh-CN')
  data.failRead(true)
  const language = createWebLanguageController('en-US', data.port)
  const labels = generalSettingsCopy('en-US')
  const failed = html(language, labels)
  expect(failed).toContain('role="alert"')
  expect(failed).toContain(labels.readError('STORAGE_UNAVAILABLE'))
  expect(failed).toContain(labels.retryRead)
  expect(failed).not.toContain(labels.retrySave)
  expect(failed).not.toContain(labels.saved)
  expect(failed).not.toContain('disabled=""')
  expect(data.writes).toEqual([])
  data.failRead(false)
  language.refresh()
  const confirmed = html(language)
  expect(language.store.getState()).toMatchObject({ locale: 'zh-CN', preference: 'zh-CN', status: 'ready' })
  expect(confirmed).toContain(generalSettingsCopy('zh-CN').currentLanguage('zh-CN'))
  expect(confirmed).not.toContain('role="alert"')
  expect(confirmed).not.toContain(generalSettingsCopy('zh-CN').saved)
  expect(data.writes).toEqual([])
})

test('General corrupt saved preference is not labelled saved and choosing a real option repairs only its own key', () => {
  const data = storage('ja-JP')
  const language = createWebLanguageController('zh-CN', data.port)
  const labels = generalSettingsCopy('zh-CN')
  expect(html(language)).toContain(labels.readError('INVALID_PREFERENCE'))
  expect(html(language)).not.toContain(labels.saved)
  language.select('en-US')
  expect(data.writes).toEqual([{ key: WEB_LANGUAGE_STORAGE_KEY, value: 'en-US' }])
  expect(html(language)).toContain(generalSettingsCopy('en-US').saved)
  expect(html(language)).not.toContain('role="alert"')
})

test('General save failure preserves the applied locale, reports non-persistence and retries the same choice explicitly', () => {
  const data = storage('en-US')
  const language = createWebLanguageController('en-US', data.port)
  data.failSave(true)
  language.select('zh-CN')
  const labels = generalSettingsCopy('zh-CN')
  const failed = html(language)
  expect(language.store.getState()).toMatchObject({ locale: 'zh-CN', preference: 'zh-CN', status: 'save-error' })
  expect(failed).toContain(labels.saveError)
  expect(failed).toContain(labels.retrySave)
  expect(failed).not.toContain(labels.retryRead)
  expect(failed).not.toContain(labels.saved)
  expect(data.saved()).toBe('en-US')
  data.failSave(false)
  language.persist()
  expect(language.store.getState()).toMatchObject({ locale: 'zh-CN', status: 'saved' })
  expect(data.saved()).toBe('zh-CN')
  expect(html(language)).toContain(labels.saved)
  expect(html(language)).not.toContain('role="alert"')
})

test('General preserves deliberately long host labels and escapes content rather than inferring extra locale choices', () => {
  const language = createWebLanguageController('zh-CN', storage().port)
  const base = generalSettingsCopy('zh-CN')
  const long = '环境语言选择及此设备界面偏好说明'.repeat(20)
  const labels: WebGeneralSettingsLabels = {
    ...base,
    title: long,
    deviceScope: long,
    options: { system: `<${long}>`, 'en-US': long, 'zh-CN': `${long}简体中文` },
  }
  const rendered = html(language, labels)
  expect(rendered).toContain(long)
  expect(rendered).toContain(`&lt;${long}&gt;`)
  expect(rendered.match(/role="radio"/g)).toHaveLength(3)
  expect(rendered.match(/tabindex="0"/g)).toHaveLength(1)
})

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`General exposes the two Host-global send choices as bounded, named pressed buttons: ${locale}`, async () => {
    const port: WebSendBehaviorPort = {
      read: async () => ({ behavior: 'modifierEnter', revision: 4 }),
      write: async () => ({ behavior: 'enter', revision: 5 }),
      receipt: async () => null,
    }
    const send = createWebSendBehaviorController(port)
    send.bind('host-a', true)
    await send.refresh()
    const labels = generalSettingsCopy(locale)
    const rendered = html(createWebLanguageController(locale, storage().port), labels, send)
    expect(rendered).toContain(labels.sending.title)
    expect(rendered).toContain(labels.sending.description)
    expect(rendered).toContain(labels.sending.hostScope)
    expect(rendered).toContain('role="group" aria-labelledby="hbar-general-sending-label"')
    expect(rendered).toContain('aria-describedby="hbar-general-sending-help"')
    expect(rendered.match(/hbar-web-general-send-choice"/g)).toHaveLength(2)
    expect(rendered.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(rendered).toMatch(/aria-pressed="true"[^>]*>.*?<span[^>]*>.*?<\/span>/)
    for (const option of Object.values(labels.sending.options)) {
      expect(rendered).toContain(option.label)
      expect(rendered).toContain(option.description)
    }
    expect(rendered).not.toContain('type="submit"')
  })
}
