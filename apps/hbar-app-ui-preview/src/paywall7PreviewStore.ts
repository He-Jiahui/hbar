import { createStore } from 'zustand/vanilla'

export interface Paywall7PreviewRecipient {
  readonly id: string
  readonly initials: string
  readonly name: string
  readonly role: string
}

export interface Paywall7PreviewStoreSeed {
  readonly recipients: readonly Paywall7PreviewRecipient[]
  readonly initialDraft: string
}

export type Paywall7HostRequest =
  | {
      readonly kind: 'compare-plans-request'
      readonly resultBehavior: 'comparison-navigation-unverified'
    }
  | {
      readonly kind: 'admin-upgrade-request'
      readonly recipientIds: readonly string[]
      readonly message: string
      readonly resultBehavior: 'delivery-and-upgrade-unverified'
    }

export interface Paywall7PreviewStoreState {
  readonly recipients: readonly Paywall7PreviewRecipient[]
  readonly draft: string
  readonly setDraft: (value: string) => void
  readonly requestComparePlans: () => Paywall7HostRequest
  readonly requestSend: () => Paywall7HostRequest
}

function normalizeRecipients(recipients: readonly Paywall7PreviewRecipient[]) {
  const seen = new Set<string>()
  return recipients
    .filter((recipient) => {
      const id = recipient.id.trim()
      if (!id || seen.has(id)) return false
      if (!recipient.initials.trim() || !recipient.name.trim() || !recipient.role.trim()) return false
      seen.add(id)
      return true
    })
    .map((recipient) => ({ ...recipient }))
}

export function createPaywall7PreviewStore(seed: Paywall7PreviewStoreSeed) {
  const recipients = normalizeRecipients(seed.recipients)
  const recipientIds = recipients.map((recipient) => recipient.id)

  return createStore<Paywall7PreviewStoreState>((set, get) => ({
    recipients,
    draft: seed.initialDraft,
    setDraft: (value) => set({ draft: value }),
    requestComparePlans: () => ({
      kind: 'compare-plans-request',
      resultBehavior: 'comparison-navigation-unverified',
    }),
    requestSend: () => ({
      kind: 'admin-upgrade-request',
      recipientIds: [...recipientIds],
      message: get().draft,
      resultBehavior: 'delivery-and-upgrade-unverified',
    }),
  }))
}
