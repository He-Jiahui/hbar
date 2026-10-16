import type { FetchFunction } from '@earendil-works/pi-ai'
import type { ProviderConfig } from '@hbar/contracts'

const TURN_STATE_HEADER = 'x-codex-turn-state'
const MAX_TURN_STATE_CHARACTERS = 8192
type ProviderRoute = Pick<ProviderConfig, 'id' | 'model' | 'baseUrl' | 'protocol'>

/** One instance per Run. The first server token is replayed only within its route and auth owner. */
export class ProviderTurnState {
  private route: string | undefined
  private requestOwner: string | undefined
  private token: string | undefined
  private generation = 0
  private routeRevision = 0

  forProvider(config: ProviderRoute, fetchImpl: FetchFunction): FetchFunction {
    const route =
      config.protocol === 'openai-responses' ? JSON.stringify([config.id, config.model, config.baseUrl]) : undefined
    if (route !== this.route) {
      this.route = route
      this.requestOwner = undefined
      this.token = undefined
      this.generation++
      this.routeRevision++
    }
    if (!route) return fetchImpl
    const routeRevision = this.routeRevision
    return Object.assign(
      async (...args: Parameters<FetchFunction>) => {
        // An old request callback cannot reactivate a route retired by a provider switch.
        if (this.route !== route || this.routeRevision !== routeRevision) return fetchImpl(...args)
        const url = args[0] instanceof Request ? args[0].url : String(args[0])
        const headers = new Headers(args[1]?.headers ?? (args[0] instanceof Request ? args[0].headers : undefined))
        const owner = JSON.stringify([
          url,
          headers.get('authorization'),
          headers.get('session_id'),
          headers.get('x-session-id'),
        ])
        if (owner !== this.requestOwner) {
          this.requestOwner = owner
          this.token = undefined
          this.generation++
        }
        const generation = this.generation
        if (this.token) headers.set(TURN_STATE_HEADER, this.token)
        const response = await fetchImpl(args[0], { ...args[1], headers })
        if (this.generation === generation && this.token === undefined && response.ok) {
          const token = response.headers.get(TURN_STATE_HEADER)
          if (token && token.length <= MAX_TURN_STATE_CHARACTERS && /^[\x20-\x7e]+$/.test(token)) this.token = token
        }
        return response
      },
      { preconnect: fetchImpl.preconnect },
    )
  }
}
