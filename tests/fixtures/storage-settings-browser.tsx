import { createRoot } from 'react-dom/client'
import { HbarStorageLocationSettings } from '@hbar/app-react/storage-locations'
import { createStorageLocationController, type StorageLocationState } from '@hbar/app-runtime/storage-locations'
import type { StorageLocationApply, StorageLocationSnapshot } from '@hbar/contracts/commands/storage-locations'
import { CommandError } from '@hbar/commands'
import { DEFAULT_LUMEN_APPEARANCE, LumenFrame, LumenProvider } from '@lumen/app-ui'
import { storageLocationCopy } from '../../apps/web/src/storage-location-copy'
import '@lumen/app-ui/styles.css'

export interface StorageSettingsFixtureInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly suffix: string
  readonly snapshot: StorageLocationSnapshot
  readonly failure: 'none' | 'conflict' | 'unknown'
  readonly readState?: 'loading' | 'error'
}
declare global {
  interface Window {
    mountStorageSettings(input: StorageSettingsFixtureInput): Promise<void>
    releaseStorageSettings(): void
    storageSettingsWrites: StorageLocationApply[]
    readStorageSettingsState(): StorageLocationState
  }
}
window.mountStorageSettings = async (input) => {
  const container = document.getElementById('storage-settings-fixture')
  if (!container) throw new Error('Missing Storage settings fixture root')
  const original = storageLocationCopy(input.locale)
  const labels = {
    ...original,
    title: original.title + input.suffix,
    pointer: original.pointer + input.suffix,
    description: original.description.repeat(4),
    save: original.save + input.suffix,
    discard: original.discard + input.suffix,
    reload: original.reload + input.suffix,
    retryOriginal: original.retryOriginal + input.suffix,
    form: { ...original.form, resolve: (key: string) => original.form.resolve(key) + input.suffix },
  }
  let snapshot = input.snapshot
  window.storageSettingsWrites = []
  let reads = 0
  const controller = createStorageLocationController({
    read: async (signal) => {
      reads++
      if (input.readState === 'loading')
        return new Promise<StorageLocationSnapshot>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Fixture disposed', 'AbortError')), {
            once: true,
          })
        })
      if (input.readState === 'error' && reads === 1)
        throw new CommandError('STORAGE_READ_FAILED', 'Isolated fixture read failure')
      return snapshot
    },
    save: async (request) => {
      window.storageSettingsWrites.push(request)
      if (window.storageSettingsWrites.length === 1 && input.failure !== 'none')
        throw new CommandError(
          input.failure === 'conflict' ? 'STORAGE_CONFLICT' : 'TIMEOUT',
          'Isolated fixture failure',
        )
      snapshot = {
        ...snapshot,
        saved: request.roots,
        revision: 'confirmed',
        restartRequired: true,
        lastWrite: { operationId: request.operationId, fingerprint: 'confirmed-original-input' },
      }
      return snapshot
    },
    restart: async () => ({ accepted: false, restartRequired: true }),
  })
  if (input.readState === undefined) await controller.read()
  window.readStorageSettingsState = () => controller.store.getState()
  const root = createRoot(container)
  window.releaseStorageSettings = () => {
    root.unmount()
    controller.dispose()
  }
  root.render(
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}>
      <LumenFrame as="main" className="storage-settings-fixture">
        <HbarStorageLocationSettings controller={controller} labels={labels} connected />
      </LumenFrame>
    </LumenProvider>,
  )
}
