import { createRoot } from 'react-dom/client'
import { CommandError } from '@hbar/commands'
import type { ClientPreferencesState } from '@hbar/app-runtime'
import { DEFAULT_LUMEN_APPEARANCE, LumenFrame, LumenProvider } from '@lumen/app-ui'
import { WebAppearanceSettings } from '../../apps/web/src/AppearanceSettings'
import { createWebAppearanceEditor } from '../../apps/web/src/appearance-editor'
import { resetWebAppearancePreferences, saveWebAppearancePreferences } from '../../apps/web/src/appearance'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

export interface AppearanceSettingsFixtureInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly suffix: string
  readonly failure: 'none' | 'loading' | 'restore-error' | 'save-conflict' | 'save-unknown' | 'reset-conflict'
}
interface AppearanceFixtureWrite {
  readonly operation: 'set' | 'unset'
  readonly key: string
  readonly expectedRevision: number
  readonly value: string | null
}
export function appearanceFixtureLabels(locale: AppearanceSettingsFixtureInput['locale'], suffix: string) {
  const copy = getShellCopy(locale).appearance
  return {
    ...copy,
    title: copy.title + suffix,
    description: copy.description + suffix,
    deviceScope: copy.deviceScope + suffix,
    theme: {
      ...copy.theme,
      label: copy.theme.label + suffix,
      system: copy.theme.system + suffix,
      light: copy.theme.light + suffix,
      dark: copy.theme.dark + suffix,
    },
    controlSize: { ...copy.controlSize, label: copy.controlSize.label + suffix },
    textSize: { ...copy.textSize, label: copy.textSize.label + suffix },
    cornerSize: { ...copy.cornerSize, label: copy.cornerSize.label + suffix },
    preview: { ...copy.preview, title: copy.preview.title + suffix, description: copy.preview.description + suffix },
    save: copy.save + suffix,
    reset: copy.reset + suffix,
    discard: copy.discard + suffix,
    continueDraft: copy.continueDraft + suffix,
    continueAfterReset: copy.continueAfterReset + suffix,
    acceptCurrent: copy.acceptCurrent + suffix,
  }
}
declare global {
  interface Window {
    mountAppearanceSettings(input: AppearanceSettingsFixtureInput): void
    releaseAppearanceSettings(): void
    resolveAppearanceLoading(): void
    appearanceSettingsSnapshot(): {
      readonly preferences: ClientPreferencesState
      readonly writes: readonly AppearanceFixtureWrite[]
    }
  }
}
window.mountAppearanceSettings = (input) => {
  const container = document.getElementById('appearance-settings-fixture')
  if (!container) throw new Error('Missing owned Appearance fixture root')
  let preferences: ClientPreferencesState = {
    status: input.failure === 'loading' ? 'loading' : 'ready',
    revision: 4,
    persisted: true,
    restoreError: input.failure === 'restore-error' ? 'INVALID_PERSISTED_STATE' : null,
    values: { otherModule: 'original-unrelated-value' },
  }
  const writes: AppearanceFixtureWrite[] = []
  let failed = false
  function conflict(operation: AppearanceFixtureWrite['operation'], key: string) {
    if (
      !failed &&
      key === 'appearance.controlSize' &&
      ((operation === 'set' && input.failure === 'save-conflict') ||
        (operation === 'unset' && input.failure === 'reset-conflict'))
    ) {
      failed = true
      preferences = { ...preferences, revision: preferences.revision + 1 }
      throw new CommandError('COMMAND_CONFLICT', 'Owned concurrent preference revision')
    }
  }
  const mutation = {
    async set(request: { readonly key: string; readonly value: string; readonly expectedRevision: number }) {
      if (request.expectedRevision !== preferences.revision)
        throw new CommandError('COMMAND_CONFLICT', 'Owned stale preference revision')
      conflict('set', request.key)
      writes.push({ operation: 'set', ...request })
      preferences = {
        ...preferences,
        revision: preferences.revision + 1,
        values: { ...preferences.values, [request.key]: request.value },
      }
      if (!failed && input.failure === 'save-unknown') {
        failed = true
        throw new Error('Owned response lost after applying one preference')
      }
      return { revision: preferences.revision, values: preferences.values, persisted: true }
    },
    async unset(request: { readonly key: string; readonly expectedRevision: number }) {
      if (request.expectedRevision !== preferences.revision)
        throw new CommandError('COMMAND_CONFLICT', 'Owned stale preference revision')
      conflict('unset', request.key)
      writes.push({ operation: 'unset', ...request, value: null })
      const { [request.key]: _removed, ...remaining } = preferences.values
      preferences = { ...preferences, revision: preferences.revision + 1, values: remaining }
      return { revision: preferences.revision, values: preferences.values, persisted: true }
    },
  }
  const editor = createWebAppearanceEditor(preferences, {
    save: (target, revision) => saveWebAppearancePreferences(mutation, preferences.values, target, revision),
    reset: (revision) => resetWebAppearancePreferences(mutation, preferences.values, revision),
    refresh: async () => {
      preferences = { ...preferences, status: 'ready', restoreError: null }
      return preferences
    },
  })
  window.resolveAppearanceLoading = () => {
    preferences = { ...preferences, status: 'ready', restoreError: null }
    editor.sync(preferences)
  }
  window.appearanceSettingsSnapshot = () => ({ preferences, writes })
  const root = createRoot(container)
  root.render(
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}>
      <LumenFrame as="main" className="appearance-settings-fixture">
        <WebAppearanceSettings
          labels={appearanceFixtureLabels(input.locale, input.suffix)}
          editor={editor}
          systemPrefersDark={input.mode === 'dark'}
        />
      </LumenFrame>
    </LumenProvider>,
  )
  window.releaseAppearanceSettings = () => root.unmount()
}
