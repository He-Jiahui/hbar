import type { ClientJsonValue, ClientPersistencePort } from '@hbar/app-runtime'

export function createBrowserClientPersistence(storage: Storage, namespace: string): ClientPersistencePort {
  const key = (name: string) => `${namespace}:${name}`
  return {
    read(name) {
      const value = storage.getItem(key(name))
      if (value === null) return Promise.resolve(null)
      return Promise.resolve(JSON.parse(value) as unknown)
    },
    write(name, value: ClientJsonValue) {
      storage.setItem(key(name), JSON.stringify(value))
      return Promise.resolve()
    },
    remove(name) {
      storage.removeItem(key(name))
      return Promise.resolve()
    },
  }
}
