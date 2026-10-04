import { createStore } from 'zustand/vanilla'
import { canContinueLumenProviderFirst, type LumenAuthProviderChoice } from '@lumen/app-ui'

export type Authentication2PreviewMode = 'email' | 'sso'

export type Authentication2NavigationAction = 'create-account' | 'terms' | 'privacy'

export type Authentication2ProviderIcon = NonNullable<LumenAuthProviderChoice['icon']>

export interface Authentication2SocialProviderSeed {
  readonly id: string
  readonly icon: Authentication2ProviderIcon
}

export interface Authentication2PreviewStoreSeed {
  readonly email: string
  readonly domain: string
  readonly emailProviderId: string
  readonly ssoProviderId: string
  readonly initialProviderId: string
  readonly socialProviders: readonly Authentication2SocialProviderSeed[]
}

export interface Authentication2ContinuationInput {
  readonly mode: Authentication2PreviewMode
  readonly providerId: string
  readonly draft: string
}

export type Authentication2HostRequest =
  | (Authentication2ContinuationInput & {
      readonly kind: 'continue-request'
      readonly outcome: 'authentication-and-navigation-unverified'
    })
  | {
      readonly kind: 'provider-request'
      readonly providerId: string
      readonly outcome: 'authentication-and-navigation-unverified'
    }
  | {
      readonly kind: 'navigation-request'
      readonly action: Authentication2NavigationAction
      readonly outcome: 'authentication-and-navigation-unverified'
    }

export interface Authentication2PreviewStoreState extends Authentication2PreviewStoreSeed {
  readonly mode: Authentication2PreviewMode
  readonly socialProviders: readonly Authentication2SocialProviderSeed[]
  readonly updateEmail: (value: string) => void
  readonly updateDomain: (value: string) => void
  readonly setMode: (mode: Authentication2PreviewMode) => boolean
  readonly replaceSocialProviders: (providers: readonly Authentication2SocialProviderSeed[]) => void
  readonly requestContinuation: (input: Authentication2ContinuationInput) => Authentication2HostRequest | null
  readonly requestProvider: (providerId: string) => Authentication2HostRequest | null
  readonly requestNavigation: (action: Authentication2NavigationAction) => Authentication2HostRequest
}

function normalizeId(id: string): string {
  return id.trim()
}

function uniqueProviders(providers: readonly Authentication2SocialProviderSeed[]): Authentication2SocialProviderSeed[] {
  const seen = new Set<string>()
  const result: Authentication2SocialProviderSeed[] = []
  for (const provider of providers) {
    const id = normalizeId(provider.id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push({ id, icon: provider.icon })
  }
  return result
}

function initialMode(seed: Authentication2PreviewStoreSeed): Authentication2PreviewMode {
  const emailProviderId = normalizeId(seed.emailProviderId)
  const ssoProviderId = normalizeId(seed.ssoProviderId)
  const initialProviderId = normalizeId(seed.initialProviderId)
  return ssoProviderId && ssoProviderId !== emailProviderId && initialProviderId === ssoProviderId ? 'sso' : 'email'
}

function isAuthentication2Mode(value: string): value is Authentication2PreviewMode {
  return value === 'email' || value === 'sso'
}

function isNavigationAction(value: string): value is Authentication2NavigationAction {
  return value === 'create-account' || value === 'terms' || value === 'privacy'
}

export function createAuthentication2PreviewStore(seed: Authentication2PreviewStoreSeed) {
  const emailProviderId = normalizeId(seed.emailProviderId)
  const ssoProviderId = normalizeId(seed.ssoProviderId)

  return createStore<Authentication2PreviewStoreState>((set, get) => ({
    email: seed.email,
    domain: seed.domain,
    emailProviderId,
    ssoProviderId,
    initialProviderId: normalizeId(seed.initialProviderId),
    socialProviders: uniqueProviders(seed.socialProviders),
    mode: initialMode(seed),
    updateEmail: (email) => set({ email }),
    updateDomain: (domain) => set({ domain }),
    setMode: (mode) => {
      if (!isAuthentication2Mode(mode) || get().mode === mode) return false
      set({ mode })
      return true
    },
    replaceSocialProviders: (socialProviders) => set({ socialProviders: uniqueProviders(socialProviders) }),
    requestContinuation: (input) => {
      if (!isAuthentication2Mode(input.mode)) return null
      const state = get()
      const expectedProviderId = input.mode === 'email' ? state.emailProviderId : state.ssoProviderId
      if (
        !expectedProviderId ||
        state.emailProviderId === state.ssoProviderId ||
        input.providerId !== expectedProviderId
      )
        return null
      if (!canContinueLumenProviderFirst(input.draft, input.mode === 'sso')) return null
      return {
        kind: 'continue-request',
        mode: input.mode,
        providerId: input.providerId,
        draft: input.draft,
        outcome: 'authentication-and-navigation-unverified',
      }
    },
    requestProvider: (providerId) => {
      const target = get().socialProviders.find((provider) => provider.id === providerId)
      if (!target) return null
      return {
        kind: 'provider-request',
        providerId: target.id,
        outcome: 'authentication-and-navigation-unverified',
      }
    },
    requestNavigation: (action) => {
      if (!isNavigationAction(action)) throw new Error('Unsupported authentication navigation action')
      return {
        kind: 'navigation-request',
        action,
        outcome: 'authentication-and-navigation-unverified',
      }
    },
  }))
}
