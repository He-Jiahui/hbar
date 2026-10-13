import { expect, test } from '@playwright/test'

test('B device key survives a reload in origin-isolated IndexedDB and signs with no exportable private bytes', async ({
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error('Node console browser fixture needs a local origin')
  await page.goto('/node-console')
  const rpcUrl = new URL('/rpc', baseURL).href
  const prepared = await page.evaluate(async (url) => {
    type DeviceMaterial = {
      readonly device: {
        readonly deviceId: string
        readonly name: string
        readonly role: 'operator' | 'observer'
        readonly roots: readonly string[]
        readonly createdAt: number
        readonly lastSeenAt: number | null
        readonly revokedAt: number | null
      }
      readonly publicKey: string
      readonly privateKey: CryptoKey
    }
    type Store = {
      load(rpcUrl: string): Promise<{ readonly deviceId: string } | null>
      save(rpcUrl: string, name: string, material: DeviceMaterial): Promise<void>
      remove(rpcUrl: string, deviceId?: string): Promise<void>
    }
    const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
    const isFactory = (value: unknown): value is () => unknown => typeof value === 'function'
    const isStore = (value: unknown): value is Store =>
      isRecord(value) &&
      typeof value.load === 'function' &&
      typeof value.save === 'function' &&
      typeof value.remove === 'function'
    const imported: unknown = await import(
      /* @vite-ignore */ new URL('/src/node-console-credential-store.ts', location.origin).href
    )
    if (!isRecord(imported) || !isFactory(imported.createBrowserNodeConsoleCredentialStore))
      throw new Error('Credential store module does not expose its public factory')
    const candidate: unknown = imported.createBrowserNodeConsoleCredentialStore()
    if (!isStore(candidate)) throw new Error('Credential store factory returned an invalid public store')
    const store = candidate
    await store.remove(url)
    const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
    const publicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
    let binary = ''
    for (const byte of publicBytes) binary += String.fromCharCode(byte)
    const publicKey = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
    await store.save(url, 'Reload verification', {
      device: {
        deviceId: 'browser-device',
        name: 'Reload verification',
        role: 'observer',
        roots: [],
        createdAt: Date.now(),
        lastSeenAt: null,
        revokedAt: null,
      },
      publicKey,
      privateKey: pair.privateKey,
    })
    const otherOrigin = new URL(url)
    otherOrigin.hostname = 'localhost'
    const isolated = await store.load(otherOrigin.href)
    return { extractable: pair.privateKey.extractable, isolated: isolated === null }
  }, rpcUrl)
  expect(prepared.extractable).toBe(false)
  expect(prepared.isolated).toBe(true)

  await page.reload()
  const checked = await page.evaluate(async (url) => {
    type LoadedDevice = {
      readonly name: string
      readonly role: 'operator' | 'observer'
      readonly deviceId: string
      readonly credentials: {
        readonly publicKey: string
        readonly signer: { sign(message: Uint8Array): Promise<string> }
      }
    }
    type Store = {
      load(rpcUrl: string): Promise<LoadedDevice | null>
      remove(rpcUrl: string, deviceId?: string): Promise<void>
    }
    const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
    const isFactory = (value: unknown): value is () => unknown => typeof value === 'function'
    const isStore = (value: unknown): value is Store =>
      isRecord(value) && typeof value.load === 'function' && typeof value.remove === 'function'
    const imported: unknown = await import(
      /* @vite-ignore */ new URL('/src/node-console-credential-store.ts', location.origin).href
    )
    if (!isRecord(imported) || !isFactory(imported.createBrowserNodeConsoleCredentialStore))
      throw new Error('Credential store module does not expose its public factory')
    const candidate: unknown = imported.createBrowserNodeConsoleCredentialStore()
    if (!isStore(candidate)) throw new Error('Credential store factory returned an invalid public store')
    const store = candidate
    const saved = await store.load(url)
    if (!saved) throw new Error('Persisted device key was not found after reload')
    const message = new TextEncoder().encode('B console persistent signer check')
    const signatureText = await saved.credentials.signer.sign(message)
    const bytes = Uint8Array.from(atob(signatureText.replaceAll('-', '+').replaceAll('_', '/')), (character) =>
      character.charCodeAt(0),
    )
    const publicText = saved.credentials.publicKey
    const publicBytes = Uint8Array.from(atob(publicText.replaceAll('-', '+').replaceAll('_', '/')), (character) =>
      character.charCodeAt(0),
    )
    const publicKey = await crypto.subtle.importKey('raw', publicBytes, { name: 'Ed25519' }, false, ['verify'])
    const verified = await crypto.subtle.verify({ name: 'Ed25519' }, publicKey, bytes, message)
    await store.remove(url, saved.deviceId)
    const removed = await store.load(url)
    return { name: saved.name, role: saved.role, verified, removed: removed === null }
  }, rpcUrl)
  expect(checked).toEqual({ name: 'Reload verification', role: 'observer', verified: true, removed: true })
})
