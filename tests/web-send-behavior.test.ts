import { expect, test } from 'bun:test'
import {
  createWebSendBehaviorController,
  type WebSendBehaviorPort,
  type WebSendBehaviorRead,
  type WebSendBehaviorWrite,
} from '../apps/web/src/send-behavior'

function deferred<Value>() {
  let resolve!: (value: Value) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<Value>((accept, refuse) => {
    resolve = accept
    reject = refuse
  })
  return { promise, resolve, reject }
}

function fixture() {
  let saved: WebSendBehaviorRead = { behavior: 'enter', revision: 0 }
  let readFailure: string | null = null
  let writeFailure: string | null = null
  let receiptFailure: string | null = null
  let writeWait: ReturnType<typeof deferred<WebSendBehaviorRead>> | null = null
  const writes: WebSendBehaviorWrite[] = []
  const receipts = new Map<string, WebSendBehaviorRead>()
  const port: WebSendBehaviorPort = {
    async read() {
      if (readFailure) throw { code: readFailure }
      return saved
    },
    async write(input) {
      writes.push(input)
      if (writeFailure) throw { code: writeFailure }
      if (writeWait) return writeWait.promise
      if (input.baselineRevision !== saved.revision) throw { code: 'REVISION_CONFLICT' }
      saved = { behavior: input.behavior, revision: saved.revision + 1 }
      receipts.set(input.idempotencyKey, saved)
      return saved
    },
    async receipt(input) {
      if (receiptFailure) throw { code: receiptFailure }
      return receipts.get(input.idempotencyKey) ?? null
    },
  }
  return {
    port,
    writes,
    setSaved(value: WebSendBehaviorRead) {
      saved = value
    },
    failRead(value: string | null) {
      readFailure = value
    },
    failWrite(value: string | null) {
      writeFailure = value
    },
    failReceipt(value: string | null) {
      receiptFailure = value
    },
    waitWrite() {
      writeWait = deferred<WebSendBehaviorRead>()
      return writeWait
    },
    remember(key: string, value: WebSendBehaviorRead) {
      receipts.set(key, value)
    },
  }
}

async function settle() {
  await Bun.sleep(0)
  await Bun.sleep(0)
}

test('Host-confirmed default and immediate choice persist with the exact original key and revision', async () => {
  const data = fixture()
  const owner = createWebSendBehaviorController(data.port)
  owner.bind(null, false)
  expect(owner.store.getState().behavior).toBeNull()
  owner.bind('host-a', true)
  await settle()
  expect(owner.store.getState()).toMatchObject({ behavior: 'enter', revision: 0, status: 'ready' })
  owner.select('modifierEnter')
  expect(owner.store.getState()).toMatchObject({
    behavior: 'modifierEnter',
    confirmedBehavior: 'enter',
    status: 'saving',
  })
  await settle()
  expect(data.writes).toHaveLength(1)
  expect(data.writes[0]).toMatchObject({ behavior: 'modifierEnter', baselineRevision: 0 })
  expect(data.writes[0]?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/)
  expect(owner.store.getState()).toMatchObject({ behavior: 'modifierEnter', revision: 1, status: 'saved' })
  await owner.refresh()
  expect(owner.store.getState()).toMatchObject({ behavior: 'modifierEnter', revision: 1, status: 'ready' })
})

test('unknown acknowledgement reconciles only the original receipt and retry reuses that key', async () => {
  const data = fixture()
  const owner = createWebSendBehaviorController(data.port)
  owner.bind('host-a', true)
  await settle()
  data.failWrite('RESULT_UNKNOWN')
  owner.select('modifierEnter')
  await settle()
  expect(owner.store.getState()).toMatchObject({ behavior: null, status: 'unknown' })
  const original = data.writes[0]
  if (!original) throw new Error('Original write missing')
  data.failWrite(null)
  await owner.retry()
  expect(data.writes).toHaveLength(2)
  expect(data.writes[1]).toEqual(original)
  expect(owner.store.getState()).toMatchObject({ behavior: 'modifierEnter', status: 'saved', revision: 1 })
})

test('receipt confirmation cannot be confused with a matching value from another request', async () => {
  const data = fixture()
  const owner = createWebSendBehaviorController(data.port)
  owner.bind('host-a', true)
  await settle()
  data.failWrite('RESULT_UNKNOWN')
  owner.select('modifierEnter')
  await settle()
  expect(owner.store.getState().status).toBe('unknown')
  const original = data.writes[0]
  if (!original) throw new Error('Original write missing')
  data.setSaved({ behavior: 'modifierEnter', revision: 9 })
  await owner.reconcile()
  expect(owner.store.getState().status).toBe('unknown')
  data.remember(original.idempotencyKey, { behavior: 'modifierEnter', revision: 9 })
  await owner.reconcile()
  expect(owner.store.getState()).toMatchObject({ status: 'saved', revision: 9 })
})

test('a late old-Host write cannot change a newly bound Host shortcut', async () => {
  const data = fixture()
  const owner = createWebSendBehaviorController(data.port)
  owner.bind('host-a', true)
  await settle()
  const pending = data.waitWrite()
  owner.select('modifierEnter')
  owner.bind('host-b', true)
  await settle()
  expect(owner.store.getState()).toMatchObject({ behavior: 'enter', revision: 0, status: 'ready' })
  pending.resolve({ behavior: 'modifierEnter', revision: 1 })
  await settle()
  expect(owner.store.getState()).toMatchObject({ behavior: 'enter', revision: 0, status: 'ready' })
})

test('read failure pauses keyboard sending without forgetting the last confirmed Host key', async () => {
  const data = fixture()
  data.failRead('DISCONNECTED')
  const owner = createWebSendBehaviorController(data.port)
  owner.bind('host-a', true)
  await settle()
  expect(owner.store.getState()).toMatchObject({ behavior: null, status: 'read-error', error: 'DISCONNECTED' })
  data.failRead(null)
  await owner.refresh()
  expect(owner.store.getState()).toMatchObject({ behavior: 'enter', status: 'ready' })
  data.failRead('TIMEOUT')
  await owner.refresh()
  expect(owner.store.getState()).toMatchObject({
    behavior: null,
    confirmedBehavior: 'enter',
    status: 'read-error',
    error: 'TIMEOUT',
  })
})

test('definitive save failure rolls keyboard behavior back to the confirmed choice', async () => {
  const data = fixture()
  const owner = createWebSendBehaviorController(data.port)
  owner.bind('host-a', true)
  await settle()
  data.failWrite('REVISION_CONFLICT')
  owner.select('modifierEnter')
  await settle()
  expect(owner.store.getState()).toMatchObject({
    behavior: 'enter',
    confirmedBehavior: 'enter',
    revision: 0,
    status: 'save-error',
    error: 'REVISION_CONFLICT',
  })
  data.setSaved({ behavior: 'enter', revision: 3 })
  await owner.refresh()
  expect(owner.store.getState()).toMatchObject({ behavior: 'enter', confirmedBehavior: 'enter', revision: 3 })
})

test('unsupported old Host does not expose an apparently saved setting', async () => {
  const data = fixture()
  data.failRead('UNSUPPORTED_HOST')
  const owner = createWebSendBehaviorController(data.port)
  owner.bind('host-a', true)
  await settle()
  owner.select('modifierEnter')
  expect(owner.store.getState()).toMatchObject({ behavior: null, status: 'unsupported' })
  expect(data.writes).toEqual([])
})
