import {
  createNodeConsoleSigner,
  type NodeConsoleDeviceCredentials,
  type NodeConsolePairingMaterial,
} from '@hbar/client/node-console'

interface StoredDeviceRecord {
  readonly id: 'paired-device'
  readonly version: 1
  readonly origin: string
  readonly name: string
  readonly deviceId: string
  readonly role: 'operator' | 'observer'
  readonly publicKey: string
  readonly privateKey: CryptoKey
  readonly savedAt: number
}

export interface LoadedNodeConsoleDevice {
  readonly name: string
  readonly deviceId: string
  readonly role: 'operator' | 'observer'
  readonly credentials: NodeConsoleDeviceCredentials
}

/** Host injection seam for browser storage, a desktop keychain bridge, or tests. */
export interface NodeConsoleCredentialStore {
  load(rpcUrl: string): Promise<LoadedNodeConsoleDevice | null>
  save(rpcUrl: string, name: string, material: NodeConsolePairingMaterial): Promise<void>
  remove(rpcUrl: string, deviceId?: string): Promise<void>
}

function storageOrigin(rpcUrl: string): string {
  const url = new URL(rpcUrl)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new TypeError('B console URL must use HTTP or HTTPS')
  if (url.username || url.password || url.search || url.hash)
    throw new TypeError('B console URL contains unsupported components')
  return url.origin
}

function databaseName(origin: string): string {
  return `hbar-node-console:${encodeURIComponent(origin)}`
}

function openDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('devices'))
        request.result.createObjectStore('devices', { keyPath: 'id' })
    }
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
    request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked by another page'))
    request.onsuccess = () => resolve(request.result)
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function isCryptoKey(value: unknown): value is CryptoKey {
  if (!value || typeof value !== 'object') return false
  const key = value as Partial<CryptoKey>
  return (
    key.type === 'private' &&
    key.extractable === false &&
    key.algorithm?.name === 'Ed25519' &&
    key.usages?.includes('sign') === true
  )
}

function parseRecord(value: unknown, origin: string): StoredDeviceRecord | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<StoredDeviceRecord>
  if (
    candidate.id !== 'paired-device' ||
    candidate.version !== 1 ||
    candidate.origin !== origin ||
    typeof candidate.name !== 'string' ||
    typeof candidate.deviceId !== 'string' ||
    (candidate.role !== 'operator' && candidate.role !== 'observer') ||
    typeof candidate.publicKey !== 'string' ||
    !isCryptoKey(candidate.privateKey) ||
    typeof candidate.savedAt !== 'number' ||
    !Number.isSafeInteger(candidate.savedAt)
  )
    return null
  return candidate as StoredDeviceRecord
}

/** Persist one B device per origin. CryptoKey is structured-cloned as non-exportable, never stringified. */
export function createBrowserNodeConsoleCredentialStore(
  factory: IDBFactory = indexedDB,
  cryptoApi: Crypto = globalThis.crypto,
): NodeConsoleCredentialStore {
  return {
    async load(rpcUrl) {
      const origin = storageOrigin(rpcUrl)
      const database = await openDatabase(factory, databaseName(origin))
      try {
        const transaction = database.transaction('devices', 'readonly')
        const done = transactionComplete(transaction)
        const request = transaction.objectStore('devices').get('paired-device') as IDBRequest<unknown>
        const record = parseRecord(await requestResult(request), origin)
        await done
        if (!record) return null
        const signer = createNodeConsoleSigner(record.privateKey, record.publicKey, cryptoApi)
        return {
          name: record.name,
          deviceId: record.deviceId,
          role: record.role,
          credentials: { deviceId: record.deviceId, publicKey: record.publicKey, signer },
        }
      } finally {
        database.close()
      }
    },
    async save(rpcUrl, name, material) {
      const origin = storageOrigin(rpcUrl)
      if (!name.trim() || (material.device.role !== 'operator' && material.device.role !== 'observer'))
        throw new TypeError('B console pairing record is invalid')
      const database = await openDatabase(factory, databaseName(origin))
      try {
        const transaction = database.transaction('devices', 'readwrite')
        const done = transactionComplete(transaction)
        const store = transaction.objectStore('devices')
        store.clear()
        store.put({
          id: 'paired-device',
          version: 1,
          origin,
          name: name.trim(),
          deviceId: material.device.deviceId,
          role: material.device.role,
          publicKey: material.publicKey,
          privateKey: material.privateKey,
          savedAt: Date.now(),
        } satisfies StoredDeviceRecord)
        await done
      } finally {
        database.close()
      }
    },
    async remove(rpcUrl, deviceId) {
      const origin = storageOrigin(rpcUrl)
      const database = await openDatabase(factory, databaseName(origin))
      try {
        const transaction = database.transaction('devices', 'readwrite')
        const done = transactionComplete(transaction)
        const store = transaction.objectStore('devices')
        if (deviceId) {
          const request = store.get('paired-device') as IDBRequest<unknown>
          const record = parseRecord(await requestResult(request), origin)
          if (record?.deviceId === deviceId) store.delete('paired-device')
        } else store.delete('paired-device')
        await done
      } finally {
        database.close()
      }
    },
  }
}
