import { createHash } from 'node:crypto'

export interface SecretStore {
  get(id: string): Promise<string | null>
  set(id: string, value: string): Promise<void>
  delete(id: string): Promise<void>
}
export class MemorySecrets implements SecretStore {
  private readonly values = new Map<string, string>()
  async get(id: string): Promise<string | null> { return this.values.get(id) ?? null }
  async set(id: string, value: string): Promise<void> { this.values.set(id, value) }
  async delete(id: string): Promise<void> { this.values.delete(id) }
}
/** Stable Host ownership keeps secrets local; executable Kernel/plugin implementations are absent from this module. */
export function createNativeSecrets(identityRoot: string): SecretStore {
  const service = `hbar.${createHash('sha256').update(identityRoot).digest('hex').slice(0, 20)}`
  return {
    get: name => Bun.secrets.get({ service, name }),
    set: (name, value) => Bun.secrets.set({ service, name, value }),
    delete: async name => { await Bun.secrets.delete({ service, name }) },
  }
}
