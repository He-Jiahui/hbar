import { createStore } from 'zustand/vanilla'
import { HbarError } from '@hbar/contracts'
import {
  createNodeConsoleClient,
  pairNodeConsoleDevice,
  type NodeConsolePairingMaterial,
} from '@hbar/client/node-console'
import type { NodeConsoleEntryModel, NodeConsoleEntryState } from '@hbar/app-react/node-console'
import type { HbarNodeConsoleLabels } from '@hbar/app-react/node-console'
import type { ShellLocale } from './shell-copy'
import {
  createBrowserNodeConsoleCredentialStore,
  type LoadedNodeConsoleDevice,
  type NodeConsoleCredentialStore,
} from './node-console-credential-store'
import { nodeConsoleCopy } from './node-console-copy'
import { createNodeConsoleModel } from './node-console-model'

export interface NodeConsoleEntryOptions {
  /** URL from B's local control.json, ending at B's /rpc endpoint. */
  readonly url: string
  readonly locale: ShellLocale
  /** Platform-specific storage may be injected; the browser default uses origin-isolated IndexedDB. */
  readonly credentialStore?: NodeConsoleCredentialStore
  readonly fetch?: typeof fetch
  readonly crypto?: Crypto
}

export interface NodeConsoleEntry {
  readonly model: NodeConsoleEntryModel
  readonly labels: HbarNodeConsoleLabels
  readonly dispose: () => void
}

function requestErrorCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'NODE_CONSOLE_REQUEST_FAILED'
}

/** Public composition root for standalone B /node-console; it has no A Client or credential input. */
export function createNodeConsoleEntry(options: NodeConsoleEntryOptions): NodeConsoleEntry {
  const credentialStore = options.credentialStore ?? createBrowserNodeConsoleCredentialStore()
  const labels = nodeConsoleCopy(options.locale)
  const store = createStore<NodeConsoleEntryState>(() => ({
    phase: 'loading',
    deviceName: '',
    pairingCode: '',
    device: null,
    consoleModel: null,
    errorCode: null,
    errorKind: null,
  }))
  let disposed = false
  let generation = 0
  let currentModel: ReturnType<typeof createNodeConsoleModel> | null = null
  let removeRevocationWatch: (() => void) | undefined
  const current = () => store.getState()
  const replace = (patch: Partial<NodeConsoleEntryState>) => {
    if (!disposed) store.setState((state) => ({ ...state, ...patch }))
  }
  const resetModel = () => {
    removeRevocationWatch?.()
    removeRevocationWatch = undefined
    currentModel?.dispose()
    currentModel = null
  }
  const makeModel = (device: LoadedNodeConsoleDevice) => {
    resetModel()
    const client = createNodeConsoleClient({
      url: options.url,
      credentials: device.credentials,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    })
    const model = createNodeConsoleModel(client, device.deviceId, device.role)
    currentModel = model
    let removalStarted = false
    removeRevocationWatch = model.store.subscribe((state) => {
      const failure = [
        state.connectionError,
        state.policyError,
        state.actionError,
        state.auditError,
        state.observationError,
      ].find((code) => code === 'NODE_REVOKED' || code === 'UNAUTHORIZED' || code?.startsWith('NODE_AUTH'))
      if (removalStarted || !failure) return
      removalStarted = true
      void credentialStore.remove(options.url, device.deviceId).then(
        () => {
          if (disposed || current().device?.deviceId !== device.deviceId) return
          resetModel()
          replace({
            phase: 'unpaired',
            device: null,
            consoleModel: null,
            pairingCode: '',
            errorCode: 'NODE_REVOKED',
            errorKind: 'credentials',
          })
        },
        (reason: unknown) => {
          if (!disposed) replace({ errorCode: requestErrorCode(reason), errorKind: 'storage' })
        },
      )
    })
    replace({
      phase: 'ready',
      device: { deviceId: device.deviceId, role: device.role },
      consoleModel: model,
      errorCode: null,
      errorKind: null,
    })
  }
  const load = async () => {
    if (disposed) return
    const request = ++generation
    replace({ phase: 'loading', errorCode: null, errorKind: null })
    try {
      const device = await credentialStore.load(options.url)
      if (disposed || request !== generation) return
      if (!device) {
        replace({ phase: 'unpaired', device: null, consoleModel: null, errorCode: null, errorKind: null })
        return
      }
      makeModel(device)
    } catch (reason) {
      if (disposed || request !== generation) return
      replace({ phase: 'failed', errorCode: requestErrorCode(reason), errorKind: 'storage' })
    }
  }
  const pair = async () => {
    const state = current()
    const name = state.deviceName.trim()
    const code = state.pairingCode.trim()
    if (disposed || state.phase !== 'unpaired' || !name || !/^\d{8}$/u.test(code)) return
    const request = ++generation
    replace({ phase: 'pairing', errorCode: null, errorKind: null })
    try {
      const paired = await pairNodeConsoleDevice({
        url: options.url,
        code,
        name,
        ...(options.fetch ? { fetch: options.fetch } : {}),
        ...(options.crypto ? { crypto: options.crypto } : {}),
        persist: async (material: NodeConsolePairingMaterial) => {
          try {
            await credentialStore.save(options.url, name, material)
          } catch (reason) {
            throw new HbarError(
              'NODE_CONSOLE_CREDENTIAL_STORE_FAILED',
              'Could not save the B device key in browser storage',
              { cause: reason },
            )
          }
        },
      })
      if (disposed || request !== generation) return
      const device: LoadedNodeConsoleDevice = {
        name,
        deviceId: paired.device.deviceId,
        role: paired.device.role,
        credentials: paired.credentials,
      }
      makeModel(device)
      replace({ deviceName: name, pairingCode: '', errorCode: null, errorKind: null })
    } catch (reason) {
      if (disposed || request !== generation) return
      const codeValue = requestErrorCode(reason)
      const storageFailure = codeValue.startsWith('NODE_CONSOLE_CREDENTIAL_STORE') || codeValue === 'IDB_ERROR'
      replace({
        phase: 'unpaired',
        pairingCode: storageFailure ? '' : code,
        errorCode: codeValue,
        errorKind: storageFailure ? 'credentials' : 'pairing',
      })
    }
  }
  const setDeviceName = (value: string) => {
    if (!disposed && current().phase === 'unpaired')
      replace({ deviceName: value.slice(0, 160), errorCode: null, errorKind: null })
  }
  const setPairingCode = (value: string) => {
    if (!disposed && current().phase === 'unpaired')
      replace({ pairingCode: value.replace(/\D/gu, '').slice(0, 8), errorCode: null, errorKind: null })
  }
  const forgetDevice = async () => {
    const deviceId = current().device?.deviceId
    if (disposed || !deviceId) return
    const request = ++generation
    replace({ phase: 'loading', errorCode: null, errorKind: null })
    try {
      await credentialStore.remove(options.url, deviceId)
      if (disposed || request !== generation) return
      resetModel()
      replace({
        phase: 'unpaired',
        device: null,
        consoleModel: null,
        pairingCode: '',
        errorCode: null,
        errorKind: null,
      })
    } catch (reason) {
      if (!disposed && request === generation)
        replace({ phase: 'ready', errorCode: requestErrorCode(reason), errorKind: 'storage' })
    }
  }
  void load()
  const model: NodeConsoleEntryModel = {
    store,
    setDeviceName,
    setPairingCode,
    pair,
    retryLoad: load,
    forgetDevice,
    dispose() {
      if (disposed) return
      disposed = true
      generation++
      resetModel()
    },
  }
  return { model, labels, dispose: model.dispose }
}
